/**
 * A small JSON notification channel, separate from the Yjs socket.
 *
 * The CRDT socket carries document content; this one carries everything
 * around it — a title change, a new comment, a permission change — so the
 * UI stays live without polling.
 *
 * Clients connect to /events and subscribe to a document, or to their own
 * document list.
 */
import { WebSocketServer } from 'ws';
import { docRole } from './access.js';
import { userFromCookies } from './auth.js';
import { parseCookies } from './cookies.js';

const WS_OPEN = 1;

/** documentId -> Set<ws> */
const docSubscribers = new Map();
/** userId -> Set<ws> */
const userSubscribers = new Map();

function addTo(map, key, ws) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(ws);
}

function removeFrom(map, key, ws) {
  const set = map.get(key);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) map.delete(key);
}

function push(ws, payload) {
  if (ws.readyState !== WS_OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* the close handler will clean up */
  }
}

/** Tell everyone watching a document that something about it changed. */
export function notifyDocument(documentId, payload) {
  const subscribers = docSubscribers.get(documentId);
  if (!subscribers) return;
  for (const ws of subscribers) push(ws, payload);
}

/** Tell specific people to refresh their document list. */
export function notifyUsers(userIds, payload) {
  for (const userId of userIds || []) {
    const subscribers = userSubscribers.get(userId);
    if (!subscribers) continue;
    for (const ws of subscribers) push(ws, payload);
  }
}

export function handleEventsUpgrade(wss, request, socket, head, url) {
  const abort = (code, reason) => {
    socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  (async () => {
    const user = await userFromCookies(parseCookies(request.headers.cookie));
    if (!user) return abort(401, 'Unauthorized');

    const documentId = url.searchParams.get('doc') || null;
    if (documentId) {
      const role = await docRole(documentId, user.id);
      if (!role) return abort(403, 'Forbidden');
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      addTo(userSubscribers, user.id, ws);
      if (documentId) addTo(docSubscribers, documentId, ws);

      push(ws, { type: 'ready' });

      // Answer the client's keepalive so idle proxies do not drop us.
      ws.on('message', (data) => {
        if (String(data) === 'ping') push(ws, { type: 'pong' });
      });

      const cleanup = () => {
        removeFrom(userSubscribers, user.id, ws);
        if (documentId) removeFrom(docSubscribers, documentId, ws);
      };
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    });
  })().catch((err) => {
    console.error('[events] upgrade:', err.message);
    abort(500, 'Internal Server Error');
  });
}

export function createEventsServer() {
  return new WebSocketServer({ noServer: true });
}
