import * as Y from 'yjs';
import { yDocToProsemirrorJSON } from '@tiptap/y-tiptap';

/**
 * Decode a stored snapshot into editor content.
 *
 * A version is a complete CRDT state, so it reconstitutes into a document
 * on its own — no replaying of earlier versions, and no dependence on
 * what the live document happens to contain right now.
 */
export function versionToContent(bytes) {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, bytes, 'version');
    return yDocToProsemirrorJSON(ydoc, 'default');
  } finally {
    ydoc.destroy();
  }
}

/** Plain-text lines, for a quick look at what a version says. */
export function contentToBlocks(json) {
  const blocks = [];
  for (const node of json?.content ?? []) {
    if (node.type !== 'paragraph') continue;
    blocks.push({
      element: node.attrs?.element || 'action',
      spans: (node.content ?? [])
        .filter((child) => child.type === 'text')
        .map((child) => ({
          text: child.text || '',
          marks: (child.marks ?? []).map((m) => m.type),
        })),
    });
  }
  return blocks;
}
