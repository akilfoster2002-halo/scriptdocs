import { readScript, wrapText } from './script.js';

/**
 * Screenplay PDF.
 *
 * The geometry is the standard: US Letter, a 6" text column inside a 1.5"
 * left and 1" right margin, 12pt Courier at 10 characters per inch and 6
 * lines per inch, giving 54 lines of body text per page.
 *
 * Pagination is the part that matters, so it lives in `paginate` as a pure
 * function over plain objects — no PDF engine involved. A script is not a
 * document that happens to break every so often: a cue must never be
 * stranded at the foot of a page, a heading must not dangle with nothing
 * under it, and a speech split across pages carries (MORE) and (CONT'D).
 */

export const PAGE = { width: 8.5, height: 11 };
export const MARGIN = { top: 1, bottom: 1, left: 1.5, right: 1 };
export const LINE = 1 / 6;
export const BODY_LINES = 54;

// Indents from the page's left edge, and column widths in characters.
export const LAYOUT = {
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

function bareName(text) {
  return text.replace(/\([^)]*\)\s*$/, '').trim();
}

/** Wrap each block to its column and work out the gaps between them. */
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

/**
 * Lay the script out into pages of draw operations.
 * Returns [[{ text, element, row, bold, align, indent }, ...], ...].
 */
export function paginate(blocks) {
  const laid = layout(blocks);
  const pages = [[]];
  let row = 0;
  let speaker = null;

  const page = () => pages[pages.length - 1];
  const breakPage = () => {
    pages.push([]);
    row = 0;
  };
  const put = (text, config, element) =>
    page().push({
      text,
      element,
      row,
      bold: Boolean(config.bold),
      align: config.align || 'left',
      indent: config.indent,
    });

  for (const block of laid) {
    const { config, lines, element } = block;
    if (element === 'character') speaker = bareName(lines.join(' '));

    let spacing = row === 0 ? 0 : block.spacing;
    const remaining = BODY_LINES - row - spacing;

    // A heading with nothing under it belongs on the next page.
    if (element === 'scene' && remaining < lines.length + 2) {
      breakPage();
      spacing = 0;
    }
    // A cue must keep at least one line of its speech company.
    else if (element === 'character' && remaining < lines.length + 1) {
      breakPage();
      spacing = 0;
    }
    // Anything else short enough to travel whole, moves whole.
    else if (remaining < lines.length && element !== 'dialogue' && element !== 'action') {
      breakPage();
      spacing = 0;
    }

    row += spacing;

    let drawn = 0;
    while (drawn < lines.length) {
      const room = BODY_LINES - row;
      if (room <= 0) {
        breakPage();
        continue;
      }

      const canDraw = Math.min(room, lines.length - drawn);
      const willSplit = drawn + canDraw < lines.length;

      // Splitting a speech needs a line spare for the (MORE) beneath it.
      if (willSplit && element === 'dialogue') {
        const usable = Math.min(canDraw, room - 1);
        // Two lines is the least worth leaving behind.
        if (usable < 2) {
          breakPage();
          continue;
        }
        for (let n = 0; n < usable; n += 1) {
          put(lines[drawn + n], config, element);
          row += 1;
        }
        drawn += usable;

        put('(MORE)', LAYOUT.character, 'more');
        breakPage();
        if (speaker) {
          put(`${speaker} (CONT'D)`, LAYOUT.character, 'character');
          row += 1;
        }
        continue;
      }

      for (let n = 0; n < canDraw; n += 1) {
        put(lines[drawn + n], config, element);
        row += 1;
      }
      drawn += canDraw;

      if (drawn < lines.length) breakPage();
    }
  }

  return pages;
}

export async function toPdf(doc, { title, author } = {}) {
  // Loaded on demand: no reason for everyone who opens a script to
  // download a PDF engine they may never use.
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(12);

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
  const pages = paginate(readScript(doc));

  pages.forEach((ops, index) => {
    if (index > 0) pdf.addPage();

    // The first page of the script proper is not numbered.
    if (index > 0) {
      pdf.setFont('courier', 'normal');
      pdf.text(`${index + 1}.`, PAGE.width - MARGIN.right, MARGIN.top - 0.5 + LINE, {
        align: 'right',
      });
    }

    for (const op of ops) {
      const y = MARGIN.top + (op.row + 1) * LINE;
      pdf.setFont('courier', op.bold ? 'bold' : 'normal');
      if (op.align === 'right') {
        pdf.text(op.text, PAGE.width - MARGIN.right, y, { align: 'right' });
      } else {
        pdf.text(op.text, op.indent, y);
      }
    }
  });

  return pdf.output('blob');
}
