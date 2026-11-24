import { elementOf } from '../screenplay.js';

/**
 * Flatten the editor document into the only thing an exporter needs: an
 * ordered list of elements and their text.
 */
export function readScript(doc) {
  const blocks = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return;
    blocks.push({ element: elementOf(node), text: node.textContent.trim() });
  });

  // Trailing empty lines are an artefact of editing, not content.
  while (blocks.length && !blocks[blocks.length - 1].text) blocks.pop();
  return blocks;
}

/** A filename stem that is safe on every platform. */
export function safeFilename(title) {
  const base = String(title || 'Untitled script')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || 'Untitled script';
}

/**
 * Wrap to a character count. Screenplay columns are measured in characters
 * because the typeface is monospaced — 10 per inch, by definition.
 */
export function wrapText(text, width) {
  if (!text) return [''];
  const lines = [];
  let line = '';

  for (let word of text.split(/\s+/).filter(Boolean)) {
    // A single word longer than the column has to be broken somewhere.
    while (word.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
