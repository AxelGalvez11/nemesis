/**
 * The false-positive side of the lattice experiment, which is the side that
 * decides whether the lane is safe to build.
 *
 * 🔴 A FALSE POSITIVE HERE IS CONTENT LOSS, NOT A PRECISION STATISTIC. When a
 * region is claimed, `readPage` REMOVES the text it covers from the paragraph
 * flow (`items.length = 0; items.push(...kept)`) so the same words are not
 * emitted twice. A lattice lane that fires on a page of prose therefore deletes
 * that page's paragraphs and re-emits them as a mangled grid, which is then what
 * gets chunked, indexed and cited.
 *
 * So for every page that claims a table this prints the claim beside the page's
 * own prose, and judges by SHAPE — a real table's rows have several non-empty
 * cells; a page of prose forced into a grid has one long cell per row.
 *
 * Run from apps/web:
 *   npx tsx scripts/table-lattice-fp.mts <file.pdf> [more.pdf …]
 */

import { basename } from "node:path";
import { readFileSync } from "node:fs";

import { readRulings, tableFromRegion, type PlacedText } from "../lib/pdf/table-grid.ts";
import { bandBox, columnBands, trimEmptyColumns } from "./table-lattice-lib.mts";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (files.length === 0) { console.error("usage: table-lattice-fp.mts <file.pdf> …"); process.exit(2); }

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

let totalPages = 0;
let claimed = 0;
let suspect = 0;

for (const file of files) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)).slice(), disableFontFace: true }).promise;
  console.log(`\n${"═".repeat(96)}\n${basename(file).slice(0, 70)}  —  ${doc.numPages} pages\n${"═".repeat(96)}`);
  totalPages += doc.numPages;

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PlacedText[] = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str.length === 0) continue;
      const t = pdfjs.Util.transform(viewport.transform, item.transform);
      const height = Math.hypot(t[2], t[3]) || item.height || 0;
      items.push({ height, text: item.str, width: item.width || Math.abs(t[0]) * item.str.length * 0.5, x: t[4], y: t[5] - height });
    }
    const rulings = await readRulings(pdfjs as never, page as never, viewport);
    for (const band of columnBands(rulings)) {
      const box = bandBox(rulings, band);
      if (!box) continue;
      const table = tableFromRegion(box, rulings, items);
      if (!table) continue;
      const rows = trimEmptyColumns(table.rows);
      const cols = rows[0]?.length ?? 0;
      if (cols < 2) continue;
      claimed += 1;

      // A grid over prose has one long cell per row; a table has several short ones.
      const filled = rows.map((r) => r.filter((c) => c.trim()).length);
      const meanFilled = filled.reduce((s, n2) => s + n2, 0) / Math.max(filled.length, 1);
      const longest = Math.max(...rows.flat().map((c) => c.length), 0);
      const prosey = meanFilled < 2 || longest > 240;
      if (prosey) suspect += 1;

      console.log(
        `\n  p${String(n).padStart(2)}  ${rows.length}r × ${cols}c   cells-filled/row ${meanFilled.toFixed(1)}   longest cell ${longest}   ` +
        `${prosey ? "🔴 LOOKS LIKE PROSE" : "table-shaped"}`,
      );
      for (const row of rows.slice(0, 3)) {
        console.log("       | " + row.map((c) => c.replace(/\s+/g, " ").slice(0, 30)).join(" | ").slice(0, 150));
      }
    }
    page.cleanup();
  }
  await doc.cleanup();
}

console.log(`\n${"═".repeat(96)}`);
console.log(`pages examined: ${totalPages}   regions claimed: ${claimed}   prose-shaped claims: ${suspect}`);
console.log(suspect === 0 ? "✅ no claimed region looks like prose" : "🔴 review every prose-shaped claim above — each one DELETES that page's paragraphs");
process.exit(0);
