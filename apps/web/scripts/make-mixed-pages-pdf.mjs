/**
 * Build the mixed-pages PDF fixture: text, then a blank page, then text.
 *
 * 🔴 WHAT THIS FIXTURE IS FOR, AND WHY A ONE-PAGE ONE CANNOT DO IT. PARSER-003
 * records WHICH unit a loss happened on, and the failure that costs the most is
 * an off-by-one: coverage counts pages 0-based while the extraction boundary
 * carries `page: block.unit + 1`, so a locality field that is one out passes
 * every count-based check and points at the wrong page for ever. A single-page
 * document cannot catch that — index 0 is right under every convention. This
 * document loses its MIDDLE page, so the only correct answer is `unit: 1`, and
 * both an off-by-one and a "first page" default are wrong.
 *
 * Generated rather than copied for the same licensing reason as
 * `make-image-only-pdf.mjs`: the documents that exposed these bugs are
 * third-party benchmarks and the owner's own records. What the parser reacts to
 * is structural — a page whose content stream shows no glyphs — and the bytes
 * below are a genuine PDF read by the real pdf.js.
 *
 *   node scripts/make-mixed-pages-pdf.mjs lib/notebooks/fixtures/mixed-pages.pdf
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2] ?? "lib/notebooks/fixtures/mixed-pages.pdf";

const PAGE_W = 612;
const PAGE_H = 792;

/** Enough glyphs that the page clears the "thin page" threshold and counts as
 *  read natively — a page with three words would be classified unread and the
 *  fixture would lose the contrast it exists to create. */
function textStream(line) {
  const rows = [];
  for (let i = 0; i < 24; i += 1) {
    rows.push(`BT /F1 12 Tf 54 ${720 - i * 22} Td (${line} line ${i + 1} of body text for coverage) Tj ET`);
  }
  return Buffer.from(`${rows.join("\n")}\n`, "latin1");
}

// 🔴 THE MIDDLE PAGE HAS NO TEXT-SHOWING OPERATOR AT ALL. No BT/ET, no Tj. It is
// the one page pdf.js will report zero text items for.
const pages = [
  { content: textStream("Alpha"), text: true },
  { content: Buffer.from("\n", "latin1"), text: false },
  { content: textStream("Gamma"), text: true },
];

// 1 catalog, 2 pages tree, 3 font, then per page: a page object and its stream.
const FIRST_PAGE_OBJ = 4;
const kids = pages.map((_, index) => `${FIRST_PAGE_OBJ + index * 2} 0 R`).join(" ");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
pages.forEach((page, index) => {
  const streamObj = FIRST_PAGE_OBJ + index * 2 + 1;
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamObj} 0 R >>`,
    { dict: `<< /Length ${page.content.length} >>`, stream: page.content },
  );
});

const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
const offsets = [];
let at = chunks[0].length;

objects.forEach((object, index) => {
  const number = index + 1;
  const parts = [Buffer.from(`${number} 0 obj\n`, "latin1")];
  if (typeof object === "string") {
    parts.push(Buffer.from(`${object}\nendobj\n`, "latin1"));
  } else {
    parts.push(Buffer.from(`${object.dict}\nstream\n`, "latin1"), object.stream, Buffer.from("\nendstream\nendobj\n", "latin1"));
  }
  const body = Buffer.concat(parts);
  offsets.push(at);
  chunks.push(body);
  at += body.length;
});

const xrefAt = at;
let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
chunks.push(Buffer.from(xref, "latin1"));

const bytes = Buffer.concat(chunks);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`wrote ${out} — ${bytes.length} bytes, ${pages.length} pages, page 2 has 0 text operators`);
