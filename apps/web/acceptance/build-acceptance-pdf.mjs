/**
 * Build the golden acceptance PDF.
 *
 * Run: node apps/web/acceptance/build-acceptance-pdf.mjs [revision]
 *
 * 🔴 WHY NOT HEADLESS CHROME (which the first version used). Chrome embeds a subset of every font
 * it draws with, so the same one-page document came out at 95 KB. `pdf-lib` with the PDF standard
 * fonts embeds nothing, and the same page is a few kilobytes. That is not tidiness: it is what
 * makes the file small enough to hand to the page directly when a sandbox refuses to share it
 * with the browser, which is the only way an agent can drive the real upload here.
 *
 * 🔴 THE TABLE IS DRAWN WITH REAL RULES. Row and column lines are vector strokes, not spaces
 * between words, because whether a table survives parsing AS A TABLE is one of the two things
 * this document exists to prove. A "table" made of aligned text would quietly pass a test it was
 * never actually running.
 *
 * 🔴 HEADINGS ARE BOLD AND LARGER. Structural readers infer headings from size and weight, so a
 * document whose headings differ only by wording would not exercise heading detection at all.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const HERE = dirname(fileURLToPath(import.meta.url));
const REVISION = process.argv[2] ?? new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);

const PAGE = { height: 792, width: 612 };
const MARGIN = 64;
const RIGHT = PAGE.width - MARGIN;
const INK = rgb(0.07, 0.07, 0.07);
const RULE = rgb(0.25, 0.25, 0.25);

const doc = await PDFDocument.create();
const body = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

let page = doc.addPage([PAGE.width, PAGE.height]);
let y = PAGE.height - MARGIN;

function newPageIfNeeded(need) {
  if (y - need >= MARGIN) return;
  page = doc.addPage([PAGE.width, PAGE.height]);
  y = PAGE.height - MARGIN;
}

/** One run of text, wrapped to the column. Returns nothing; advances the cursor. */
function text(content, { size = 11, font = body, gap = 6, indent = 0 } = {}) {
  const width = RIGHT - MARGIN - indent;
  const words = content.split(/\s+/);
  let line = "";
  const lines = [];
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  for (const entry of lines) {
    newPageIfNeeded(size * 1.4);
    y -= size * 1.25;
    page.drawText(entry, { color: INK, font, size, x: MARGIN + indent, y });
  }
  y -= gap;
}

function heading(content, level = 2) {
  const size = level === 1 ? 19 : level === 2 ? 14 : 12;
  newPageIfNeeded(size * 3);
  y -= level === 1 ? 4 : 16;
  text(content, { font: bold, gap: level === 2 ? 2 : 4, size });
  if (level === 2) {
    // A rule under each section heading, the way a real course document looks.
    y -= 2;
    page.drawLine({ color: RULE, end: { x: RIGHT, y }, start: { x: MARGIN, y }, thickness: 0.6 });
    y -= 8;
  }
}

/** 🔴 A REAL RULED TABLE — every cell boundary is a stroked line. */
function table(header, rows) {
  const colX = [MARGIN, MARGIN + 150, RIGHT];
  const padding = 6;
  const rowHeight = 22;
  newPageIfNeeded(rowHeight * (rows.length + 1) + 20);

  const top = y;
  let rowTop = top;
  const draw = (cells, font) => {
    const bottom = rowTop - rowHeight;
    cells.forEach((cell, index) => {
      // Wrap inside the cell so a long definition does not run past its column.
      const width = colX[index + 1] - colX[index] - padding * 2;
      let line = "";
      const lines = [];
      for (const word of cell.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, 9.5) > width && line) { lines.push(line); line = word; }
        else line = next;
      }
      if (line) lines.push(line);
      lines.slice(0, 2).forEach((entry, lineIndex) => {
        page.drawText(entry, {
          color: INK, font, size: 9.5,
          x: colX[index] + padding,
          y: rowTop - 14 - lineIndex * 11,
        });
      });
    });
    // Cell rules.
    page.drawLine({ color: RULE, end: { x: colX[2], y: bottom }, start: { x: colX[0], y: bottom }, thickness: 0.6 });
    for (const x of colX) {
      page.drawLine({ color: RULE, end: { x, y: bottom }, start: { x, y: rowTop }, thickness: 0.6 });
    }
    rowTop = bottom;
  };

  page.drawLine({ color: RULE, end: { x: colX[2], y: top }, start: { x: colX[0], y: top }, thickness: 0.6 });
  draw(header, bold);
  for (const row of rows) draw(row, body);
  y = rowTop - 12;
}

// ── the document ─────────────────────────────────────────────────────────────

heading("Nemesis Acceptance Course", 1);
text(`BIOL 100 - Autumn 2026 - Acceptance revision ${REVISION}`, { size: 9.5 });

heading("Course Schedule");
text("The following dates are fixed and will not move.");
text("Exam 1: September 12, 2026 at 9:00 AM");
text("Assignment 1 due September 18, 2026 at 11:59 PM");
// 🔴 DELIBERATE NEGATIVES. A system that turns either of these into a calendar entry is
// inventing obligations, which is worse than missing one. Zero events here is part of the
// expected result, not the absence of one.
text("A makeup session may be rescheduled if enough students ask.");
text("The departmental colloquium is usually held in spring.");

heading("Key Terms");
text("Learn these three terms and what each one does.");
table(["Term", "Definition"], [
  ["Photosynthesis", "Conversion of light energy into chemical energy stored as sugar."],
  ["Chlorophyll", "Pigment that absorbs light, mostly in the blue and red wavelengths."],
  ["Stomata", "Pores in a leaf surface that let carbon dioxide in and water vapour out."],
]);

heading("Cause and Effect");
heading("Light intensity", 3);
text("Increasing light intensity increases the rate of photosynthesis until another factor becomes limiting. Once carbon dioxide or temperature becomes the constraint, adding more light produces no further increase.");

heading("Laboratory Notes");
text("Bring the following to every session:");
for (const item of ["A bound notebook", "Safety goggles", "The pre-lab worksheet, completed"]) {
  text(`- ${item}`, { gap: 2, indent: 14 });
}

y -= 10;
newPageIfNeeded(120);
page.drawRectangle({
  borderColor: RULE, borderWidth: 0.6, height: 90,
  width: RIGHT - MARGIN, x: MARGIN, y: y - 90,
});
page.drawText("Figure 1 - rate of photosynthesis against light intensity", {
  color: INK, font: body, size: 10, x: MARGIN + 12, y: y - 48,
});
y -= 98;
text("Figure 1. The curve rises steeply, then flattens once another factor limits it.", { size: 9.5 });

const bytes = await doc.save();
const out = join(HERE, `acceptance-course-${REVISION}.pdf`);
writeFileSync(out, bytes);
console.log(`${out}\n${bytes.length} bytes, revision ${REVISION}`);
