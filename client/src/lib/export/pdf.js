import { readScript, wrapText } from './script.js';

/**
 * Screenplay PDF.
 *
 * The geometry is the standard: US Letter, a 6" text column inside a 1.5"
 * left and 1" right margin, 12pt Courier at 10 characters per inch and 6
 * lines per inch, giving 55 lines of body text per page.
 *
 * The work that matters is pagination. A script is not a document that
 * happens to break every so often — a cue must never be stranded at the
 * foot of a page, a heading must not dangle with nothing under it, and a
 * speech split across pages carries (MORE) and (CONT'D). Readers notice,
 * and so do the people who time scripts by the page.
 */

const PAGE = { width: 8.5, height: 11 };
const MARGIN = { top: 1, bottom: 1, left: 1.5, right: 1 };
const LINE = 1 / 6;
const BODY_LINES = 54;

// Indents from the page's left edge, and column widths in characters.
const LAYOUT = {
  scene: { indent: 1.5, width: 60, bold: true },
  action: { indent: 1.5, width: 60 },
  character: { indent: 3.7, width: 33 },
  paren: { indent: 3.1, width: 20 },
  dialogue: { indent: 2.5, width: 35 },
  transition: { indent: 1.5, width: 60, align: 'right' },
  shot: { indent: 1.5, width: 60 },
};

/** Blank lines before an element, given what came before it. */
function spacingBefore(previous, current) {
  if (!previous) return 0;
  if (current === 'dialogue' && (previous === 'character' || previous === 'paren')) return 0;
  if (current === 'paren' && (previous === 'character' || previous === 'dialogue')) return 0;
  if (current === 'scene') return 2;
  return 1;
}

/** Turn the script into laid-out blocks of wrapped lines. */
function layout(blocks) {
  const out = [];
  let previous = null;

  for (const block of blocks) {
    if (!block.text) continue;
    const config = LAYOUT[block.element] || LAYOUT.action;
    out.push({
      element: block.element,
      config,
      lines: wrapText(block.text, config.width),
      spacing: spacingBefore(previous, block.element),
    });
    previous = block.element;
  }
  return out;
}

function bareName(text) {
  return text.replace(/\([^)]*\)\s*$/, '').trim();
}

export async function toPdf(doc, { title, author } = {}) {
  // Loaded on demand: no reason for everyone who opens a script to
  // download a PDF engine they may never use.
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(12);

  const blocks = layout(readScript(doc));

  // ------------------------------------------------------------ title page
  if (title) {
    const centre = PAGE.width / 2;
    let y = 4;
    pdf.setFont('courier', 'bold');
    for (const l of wrapText(title.toUpperCase(), 55)) {
      pdf.text(l, centre, y, { align: 'center' });
      y += LINE;
    }
    pdf.setFont('courier', 'normal');
    y += LINE * 3;
    pdf.text('Written by', centre, y, { align: 'center' });
    y += LINE * 3;
    if (author) pdf.text(author, centre, y, { align: 'center' });
    pdf.addPage();
  }

  // ----------------------------------------------------------------- body
  let pageNumber = 1;
  let row = 0; // lines used on the current page
  let currentCharacter = null;

  const newPage = () => {
    pdf.addPage();
    pageNumber += 1;
    row = 0;
  };

  const draw = (text, config, lineIndex) => {
    const y = MARGIN.top + (lineIndex + 1) * LINE;
    pdf.setFont('courier', config.bold ? 'bold' : 'normal');
    if (config.align === 'right') {
      pdf.text(text, PAGE.width - MARGIN.right, y, { align: 'right' });
    } else {
      pdf.text(text, config.indent, y);
    }
  };

  const pageNumberFor = (n) => {
    if (n === 1) return; // the first page is not numbered
    pdf.setFont('courier', 'normal');
    pdf.text(`${n}.`, PAGE.width - MARGIN.right, MARGIN.top - 0.5 + LINE, { align: 'right' });
  };

  const stampedPages = new Set();
  const stamp = () => {
    if (stampedPages.has(pageNumber)) return;
    stampedPages.add(pageNumber);
    pageNumberFor(pageNumber);
  };
  stamp();

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const { config, lines, element } = block;

    if (element === 'character') currentCharacter = bareName(block.lines.join(' '));

    let spacing = row === 0 ? 0 : block.spacing;

    // --- keep rules -------------------------------------------------
    const remaining = BODY_LINES - row - spacing;

    // A heading with nothing under it belongs on the next page.
    if (element === 'scene' && remaining < lines.length + 2) {
      newPage();
      stamp();
      spacing = 0;
    }
    // A cue must keep at least one line of its speech company.
    else if (element === 'character' && remaining < lines.length + 1) {
      newPage();
      stamp();
      spacing = 0;
    }
    // Everything else: move it whole if it fits on a fresh page.
    else if (remaining < lines.length && element !== 'dialogue' && element !== 'action') {
      newPage();
      stamp();
      spacing = 0;
    }

    row += spacing;

    // --- draw, splitting speeches properly --------------------------
    let drawn = 0;
    while (drawn < lines.length) {
      const room = BODY_LINES - row;

      if (room <= 0) {
        newPage();
        stamp();
        continue;
      }

      const canDraw = Math.min(room, lines.length - drawn);
      const willSplit = drawn + canDraw < lines.length;

      // Splitting a speech needs room for the (MORE) that goes under it.
      if (willSplit && element === 'dialogue') {
        const usable = Math.min(canDraw, room - 1);
        if (usable < 2) {
          // Not worth a two-line orphan; move the rest to the next page.
          newPage();
          stamp();
          continue;
        }
        for (let n = 0; n < usable; n += 1) draw(lines[drawn + n], config, row + n);
        row += usable;
        drawn += usable;

        draw('(MORE)', LAYOUT.character, row);
        newPage();
        stamp();
        if (currentCharacter) {
          draw(`${currentCharacter} (CONT'D)`, LAYOUT.character, row);
          row += 1;
        }
        continue;
      }

      for (let n = 0; n < canDraw; n += 1) draw(lines[drawn + n], config, row + n);
      row += canDraw;
      drawn += canDraw;

      if (drawn < lines.length) {
        newPage();
        stamp();
      }
    }
  }

  return pdf.output('blob');
}
