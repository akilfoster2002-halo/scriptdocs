/**
 * Screenplay element model.
 *
 * Industry format is a fixed set of element types, each with its own
 * indent, width and casing. Everything else here — what Enter does, what
 * Tab cycles through, what gets auto-detected — derives from this table.
 *
 * Measurements follow the US Letter standard: a 6" text column inside a
 * 1.5" left and 1" right margin, set in 12pt Courier (10 characters per
 * inch), which is what makes one page ≈ one minute of screen time.
 */

export const ELEMENTS = {
  scene: {
    label: 'Scene Heading',
    hint: 'INT. / EXT.',
    uppercase: true,
    next: 'action',
    key: '1',
  },
  action: {
    label: 'Action',
    hint: 'What we see',
    uppercase: false,
    next: 'action',
    key: '2',
  },
  character: {
    label: 'Character',
    hint: 'Who speaks',
    uppercase: true,
    next: 'dialogue',
    key: '3',
  },
  paren: {
    label: 'Parenthetical',
    hint: '(how they say it)',
    uppercase: false,
    next: 'dialogue',
    key: '4',
  },
  dialogue: {
    label: 'Dialogue',
    hint: 'What they say',
    uppercase: false,
    next: 'action',
    key: '5',
  },
  transition: {
    label: 'Transition',
    hint: 'CUT TO:',
    uppercase: true,
    next: 'scene',
    key: '6',
  },
  shot: {
    label: 'Shot',
    hint: 'ANGLE ON —',
    uppercase: true,
    next: 'action',
    key: '7',
  },
};

export const ELEMENT_ORDER = [
  'scene',
  'action',
  'character',
  'paren',
  'dialogue',
  'transition',
  'shot',
];

export const DEFAULT_ELEMENT = 'action';

export function elementOf(node) {
  const value = node?.attrs?.element;
  return ELEMENTS[value] ? value : DEFAULT_ELEMENT;
}

export function cycleElement(current, direction = 1) {
  const index = ELEMENT_ORDER.indexOf(current);
  const base = index === -1 ? ELEMENT_ORDER.indexOf(DEFAULT_ELEMENT) : index;
  const next = (base + direction + ELEMENT_ORDER.length) % ELEMENT_ORDER.length;
  return ELEMENT_ORDER[next];
}

// ---------------------------------------------------------------- detection

const SCENE_RE = /^\s*(INT|EXT|EST|INT\.?\/EXT|I\/E)\b[.\s]/i;
const TRANSITION_RE = /^[A-Z0-9 '’\-]{2,}TO:$/;
const FADE_RE = /^(FADE IN[:.]?|FADE OUT[:.]?|FADE TO BLACK\.?|THE END\.?)$/i;

/** Character cues are short, all caps, and not sentences. */
export function looksLikeCharacter(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (!/^[A-Z0-9]/.test(trimmed)) return false;
  // Letters must already be uppercase; allow the usual extras.
  if (!/^[A-Z0-9 .'’\-()#&]+$/.test(trimmed)) return false;

  const withoutExtension = trimmed.replace(/\([^)]*\)\s*$/, '').trim();
  if (!withoutExtension) return false;
  if (/[.!?]$/.test(withoutExtension)) return false;
  // Names are a few words, not a sentence shouted in caps.
  return withoutExtension.split(/\s+/).length <= 4;
}

/**
 * What does this line look like, given what the writer already marked it as?
 * Returns null when there is no reason to change anything.
 */
export function detectElement(text, current) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (SCENE_RE.test(trimmed)) return 'scene';
  if (FADE_RE.test(trimmed)) return 'transition';
  if (TRANSITION_RE.test(trimmed)) return 'transition';

  if (trimmed.startsWith('(') && (current === 'dialogue' || current === 'character')) {
    return 'paren';
  }

  // Only promote plain action lines, so an explicit choice is never
  // second-guessed.
  if (current === 'action' && looksLikeCharacter(trimmed)) return 'character';

  return null;
}

// ------------------------------------------------------------- suggestions

export const TIME_OF_DAY = [
  'DAY',
  'NIGHT',
  'CONTINUOUS',
  'LATER',
  'MOMENTS LATER',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'DAWN',
  'DUSK',
];

export const SCENE_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. '];

export const TRANSITIONS = [
  'CUT TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'DISSOLVE TO:',
  'FADE TO:',
  'FADE OUT.',
  'INTERCUT WITH:',
];

// ------------------------------------------------------------------- stats

// 12pt Courier on a 6" column: 60 characters per line, 55 lines per page.
const CHARS_PER_LINE = { scene: 60, action: 60, character: 33, paren: 20, dialogue: 35, transition: 60, shot: 60 };
const LINES_PER_PAGE = 55;

/** Rough page count, the unit screenplays are actually measured in. */
export function screenplayStats(doc) {
  let lines = 0;
  let scenes = 0;

  doc?.descendants((node) => {
    if (!node.isTextblock) return;
    const element = elementOf(node);
    if (element === 'scene') scenes += 1;

    const width = CHARS_PER_LINE[element] || 60;
    const length = node.textContent.length;
    lines += Math.max(1, Math.ceil(length / width));
    // Most elements sit under a blank line.
    if (element !== 'dialogue' && element !== 'paren') lines += 1;
  });

  return {
    scenes,
    pages: lines === 0 ? 0 : Math.max(1, Math.round((lines / LINES_PER_PAGE) * 10) / 10),
  };
}
