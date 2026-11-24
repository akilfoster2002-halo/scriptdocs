import { readScript } from './script.js';

/**
 * Fountain: the plain-text screenplay format that Final Draft, Highland,
 * Slugline and WriterDuet all import.
 *
 * Fountain infers element types from how a line looks, which is ambiguous
 * for anything that does not follow the convention — a scene heading not
 * starting INT./EXT., a character cue that is not uppercase. Where the
 * writer's intent would be lost, emit the forcing character so the file
 * round-trips as written rather than as guessed.
 */
const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const TRANSITION_RE = /TO:$/;

function line(block) {
  const { element, text } = block;
  if (!text) return '';

  switch (element) {
    case 'scene':
      return SCENE_RE.test(text) ? text : `.${text}`;

    case 'character':
      // An uppercase line is read as a cue; anything else needs forcing.
      return text === text.toUpperCase() && /[A-Z]/.test(text) ? text : `@${text}`;

    case 'transition':
      return TRANSITION_RE.test(text) ? text : `> ${text}`;

    case 'paren':
      return text.startsWith('(') ? text : `(${text})`;

    case 'shot':
      // Fountain has no Shot element; uppercase action is the convention.
      return text.toUpperCase();

    case 'dialogue':
    case 'action':
    default:
      return text;
  }
}

/** Dialogue must follow its cue with no blank line between. */
function needsBlankLineBefore(previous, current) {
  if (!previous) return false;
  if (current === 'dialogue' && (previous === 'character' || previous === 'paren')) return false;
  if (current === 'paren' && (previous === 'character' || previous === 'dialogue')) return false;
  return true;
}

export function toFountain(doc, { title, author } = {}) {
  const blocks = readScript(doc);
  const out = [];

  if (title) {
    out.push(`Title: ${title}`);
    if (author) out.push(`Credit: Written by`, `Author: ${author}`);
    out.push('');
  }

  let previous = null;
  for (const block of blocks) {
    if (!block.text) {
      previous = null;
      continue;
    }
    if (needsBlankLineBefore(previous, block.element)) out.push('');
    out.push(line(block));
    previous = block.element;
  }

  return `${out.join('\n')}\n`;
}
