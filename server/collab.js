/**
 * Yjs websocket backend.
 *
 * Implements the y-websocket wire protocol (sync + awareness) directly so
 * that authorization and persistence can be woven into the connection
 * lifecycle:
 *
 *   - the session cookie identifies the user on upgrade, so no token ever
 *     appears in a URL or a proxy log
 *   - viewers and commenters connect read-only: their document updates are
 *     dropped rather than merged, no matter what the client sends
 *   - document state is debounced to Postgres as one binary snapshot
 */
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { config } from './config.js';
import { docRole, atLeast } from './access.js';
import { userFromCookies } from './auth.js';
import { parseCookies } from './cookies.js';
import { one, query } from './db.js';
import { saveVersion } from './versions.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

const WS_OPEN = 1;

/** documentId -> Room */
const rooms = new Map();

class Room {
  constructor(id) {
    this.id = id;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    /** @type {Set<import('ws').WebSocket>} */
    this.conns = new Set();

    this.loaded = false;
    this.loadPromise = null;

    this.dirty = false;
    this.lastEditedBy = null;
    /** Everyone who has typed since the last version was written. */
    this.contributors = new Set();
    this.lastVersionAt = Date.now();
    this.savingVersion = null;
    this.persistTimer = null;
    this.maxWaitTimer = null;
    this.idleTimer = null;
    this.persisting = null;

    this.doc.on('update', (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      for (const conn of this.conns) {
        if (conn !== origin) send(conn, message);
      }
      if (origin !== 'persistence') {
        if (origin?.userId) {
          this.lastEditedBy = origin.userId;
          this.contributors.add(origin.userId);
        }
        this.markDirty();
      }
    });

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      );
      const message = encoding.toUint8Array(encoder);
      for (const conn of this.conns) {
        if (conn !== origin) send(conn, message);
      }
    });
  }

  /** Load the persisted snapshot exactly once per room. */
  load() {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          const row = await one('select ydoc from document_state where document_id = $1', [this.id]);
          if (row?.ydoc) Y.applyUpdate(this.doc, new Uint8Array(row.ydoc), 'persistence');
        } catch (err) {
          console.error(`[collab] load ${this.id}:`, err.message);
        }
        this.loaded = true;
      })();
    }
    return this.loadPromise;
  }

  markDirty() {
    this.dirty = true;

    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), config.persistDebounceMs);

    // Guarantee a write during sustained typing.
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => void this.persist(), config.persistMaxWaitMs);
    }
  }

  async persist() {
    clearTimeout(this.persistTimer);
    clearTimeout(this.maxWaitTimer);
    this.persistTimer = null;
    this.maxWaitTimer = null;

    if (!this.dirty) return;
    // Serialise writes so two flushes cannot interleave.
    if (this.persisting) return this.persisting;

    this.dirty = false;
    const editor = this.lastEditedBy;

    this.persisting = (async () => {
      try {
        const snapshot = Buffer.from(Y.encodeStateAsUpdate(this.doc));
        await query(
          `insert into document_state (document_id, ydoc, updated_at)
           values ($1, $2, now())
           on conflict (document_id)
           do update set ydoc = excluded.ydoc, updated_at = excluded.updated_at`,
          [this.id, snapshot]
        );
        await query(
          `update documents
           set updated_at = now(), last_edited_by = coalesce($2, last_edited_by)
           where id = $1`,
          [this.id, editor]
        );
        await this.maybeSaveVersion();
      } catch (err) {
        console.error(`[collab] persist ${this.id}:`, err.message);
        this.dirty = true; // retry on the next change or at teardown
      } finally {
        this.persisting = null;
      }
    })();

    return this.persisting;
  }

  /**
   * Write a version if enough time has passed since the last one.
   *
   * Versions mark editing sessions, not keystrokes: snapshotting on every
   * save would bury the useful marks in noise and fill the table.
   */
  async maybeSaveVersion(force = false) {
    if (!force && Date.now() - this.lastVersionAt < config.versionIntervalMs) return null;
    if (this.contributors.size === 0 && !force) return null;
    if (this.savingVersion) return this.savingVersion;

    const authors = [...this.contributors];
    this.contributors.clear();
    this.lastVersionAt = Date.now();

    this.savingVersion = (async () => {
      try {
        const saved = await saveVersion(this.id, this.doc, {
          createdBy: authors[authors.length - 1] || null,
          authors,
        });
        // A null means the text was unchanged and nothing was written, so
        // these people still have a version owing to them.
        if (!saved) for (const id of authors) this.contributors.add(id);
        return saved;
      } catch (err) {
        console.error(`[collab] version ${this.id}:`, err.message);
        for (const id of authors) this.contributors.add(id);
        return null;
      } finally {
        this.savingVersion = null;
      }
    })();

    return this.savingVersion;
  }

  scheduleIdleTeardown() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(async () => {
      if (this.conns.size > 0) return;
      await this.persist();
      // The end of a session is the most useful place for a mark, so
      // take one even if the interval has not elapsed.
      await this.maybeSaveVersion(this.contributors.size > 0);
      this.doc.destroy();
      rooms.delete(this.id);
    }, config.roomIdleMs);
  }
}

function send(conn, message) {
  if (conn.readyState !== WS_OPEN) return;
  try {
    conn.send(message, (err) => {
      if (err) conn.close();
    });
  } catch {
    conn.close();
  }
}

function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = new Room(id);
    rooms.set(id, room);
  }
  clearTimeout(room.idleTimer);
  return room;
}

export function createCollabServer() {
  return new WebSocketServer({ noServer: true });
}

export function handleCollabUpgrade(wss, request, socket, head, url) {
  const abort = (code, reason) => {
    socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  (async () => {
    const documentId = url.searchParams.get('doc');
    if (!documentId) return abort(400, 'Bad Request');

    const user = await userFromCookies(parseCookies(request.headers.cookie));
    if (!user) return abort(401, 'Unauthorized');

    const role = await docRole(documentId, user.id);
    if (!role) return abort(403, 'Forbidden');

    wss.handleUpgrade(request, socket, head, (ws) => {
      void setupConnection(ws, { documentId, role, user });
    });
  })().catch((err) => {
    console.error('[collab] upgrade:', err.message);
    abort(500, 'Internal Server Error');
  });
}

async function setupConnection(ws, { documentId, role, user }) {
  ws.binaryType = 'arraybuffer';

  const room = getRoom(documentId);
  const canWrite = atLeast(role, 'editor');

  // Tag updates with their author so last_edited_by is accurate.
  const origin = Object.assign(ws, { userId: user.id });

  await room.load();

  room.conns.add(ws);
  clearTimeout(room.idleTimer);

  // Step 1 of the sync handshake: ask the client for its state vector.
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    send(ws, encoding.toUint8Array(encoder));
  }

  // Seed the newcomer with everyone's presence.
  {
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys()))
      );
      send(ws, encoding.toUint8Array(encoder));
    }
  }

  const controlledIds = new Set();

  ws.on('message', (data) => {
    let bytes;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (Buffer.isBuffer(data)) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else return;

    try {
      const decoder = decoding.createDecoder(bytes);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);

        if (canWrite) {
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, origin);
        } else {
          // Read-only: serve state requests, ignore attempts to write.
          const syncType = decoding.readVarUint(decoder);
          if (syncType === syncProtocol.messageYjsSyncStep1) {
            syncProtocol.readSyncStep1(decoder, encoder, room.doc);
          }
        }

        if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
      } else if (messageType === MESSAGE_QUERY_AWARENESS) {
        const states = room.awareness.getStates();
        if (states.size > 0) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys()))
          );
          send(ws, encoding.toUint8Array(encoder));
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        const before = new Set(room.awareness.getStates().keys());
        awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws);
        for (const id of room.awareness.getStates().keys()) {
          if (!before.has(id)) controlledIds.add(id);
        }
      }
    } catch (err) {
      console.error('[collab] message:', err.message);
      ws.close();
    }
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    room.conns.delete(ws);
    awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(controlledIds), null);

    // Flush straight away rather than waiting out the debounce, so the
    // last keystrokes before a tab closes are not lost.
    void Promise.resolve(room.dirty ? room.persist() : null).finally(() => {
      if (room.conns.size === 0) room.scheduleIdleTeardown();
    });
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

/**
 * The live document for a room, when one is open.
 *
 * A version named from the UI should capture what the writer is looking
 * at, which may be a second or two ahead of what has been persisted.
 */
export function liveDoc(documentId) {
  const room = rooms.get(documentId);
  return room?.loaded ? room.doc : null;
}

/** Contributors since the last version, for crediting a named version. */
export function liveContributors(documentId) {
  const room = rooms.get(documentId);
  return room ? [...room.contributors] : [];
}

/** Flush every room before the process exits. */
export async function flushAllRooms() {
  await Promise.all([...rooms.values()].map((room) => room.persist()));
}
