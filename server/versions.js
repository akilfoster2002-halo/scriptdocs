import crypto from 'node:crypto';
import * as Y from 'yjs';
import { one, query } from './db.js';

/** Automatic versions kept per document; named ones are never pruned. */
export const AUTO_VERSION_LIMIT = Number(process.env.AUTO_VERSION_LIMIT || 40);

/**
 * A fingerprint of what the script actually says.
 *
 * Hashing the CRDT bytes would be wrong: the same text can encode
 * differently depending on how it was arrived at, so two consecutive
 * snapshots of an untouched document would look like a change.
 */
export function contentHash(ydoc) {
  const fragment = ydoc.getXmlFragment('default');
  return crypto.createHash('sha256').update(fragment.toString()).digest('hex');
}

/**
 * Write a version, unless the content is identical to the newest one.
 * Returns the row, or null when nothing changed.
 */
export async function saveVersion(documentId, ydoc, { label = null, createdBy = null, authors = [] } = {}) {
  const hash = contentHash(ydoc);

  const latest = await one(
    'select content_hash from document_versions where document_id = $1 order by created_at desc limit 1',
    [documentId]
  );

  // A named version is always worth keeping, even if the text is the
  // same — the point of naming it is the marker, not the diff.
  if (!label && latest?.content_hash === hash) return null;

  const snapshot = Buffer.from(Y.encodeStateAsUpdate(ydoc));

  const row = await one(
    `insert into document_versions (document_id, ydoc, content_hash, label, created_by, authors, bytes)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, label, created_at, created_by, authors, bytes`,
    [documentId, snapshot, hash, label, createdBy, authors, snapshot.length]
  );

  await pruneVersions(documentId);
  return row;
}

/** Keep every named version and the most recent automatic ones. */
export async function pruneVersions(documentId) {
  await query(
    `delete from document_versions
     where document_id = $1
       and label is null
       and id not in (
         select id from document_versions
         where document_id = $1 and label is null
         order by created_at desc
         limit $2
       )`,
    [documentId, AUTO_VERSION_LIMIT]
  );
}
