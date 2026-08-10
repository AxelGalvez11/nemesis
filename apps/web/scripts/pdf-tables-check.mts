/**
 * TEMPORARY — end-to-end: does the ONNX layout lane produce REAL tables?
 *
 * raster -> layout model -> ruled grid -> pdf.js text -> DocTable, on a real
 * file, printed as a grid so the cells can be read against the page.
 */
import { readFileSync } from "node:fs";

import { detectLayout, layoutSession } from "../lib/pdf/layout-onnx.ts";
import { pageToModelRgb } from "../lib/pdf/rasterize.ts";
import { readRulings, tableFromRegion, type PlacedText } from "../lib/pdf/table-grid.ts";

const pdfPath = process.argv[2]!;
const modelPath = process.argv[3]!;
const showPage = Number(process.argv[4] ?? "2");

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const bytes = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;

const t0 = Date.now();
const session = await layoutSession(modelPath);
console.log(`model load: ${Date.now() - t0} ms`);

const rss = () => Math.round(process.memoryUsage.rss() / 1048576);
let peak = rss();
let tables = 0, cells = 0, gridless = 0, detectMs = 0, rasterMs = 0;
const wall = Date.now();

for (let n = 1; n <= doc.numPages; n += 1) {
  const page = await doc.getPage(n);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const r0 = Date.now();
    const { rgb, width, height } = await pageToModelRgb(page as never);
    rasterMs += Date.now() - r0;

    const { regions, ms } = await detectLayout(session, rgb, width, height);
    detectMs += ms;

    const content = await page.getTextContent();
    const items: PlacedText[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const t = pdfjs.Util.transform(viewport.transform, item.transform);
      const h = Math.hypot(t[2], t[3]) || item.height || 0;
      items.push({ height: h, text: item.str, width: item.width || 0, x: t[4], y: t[5] - h });
    }
    const rulings = await readRulings(pdfjs as never, page as never, viewport);

    const pageTables = [];
    for (const region of regions.filter((x) => x.label === "table")) {
      const [x0, y0, x1, y1] = region.box;
      const table = tableFromRegion({ x0, x1, y0, y1 }, rulings, items);
      if (!table) { gridless += 1; continue; }
      pageTables.push(table);
      tables += 1;
      cells += table.rows.reduce((s, row) => s + row.filter((c) => c).length, 0);
    }
    peak = Math.max(peak, rss());

    const labels: Record<string, number> = {};
    for (const x of regions) labels[x.label] = (labels[x.label] ?? 0) + 1;
    console.log(
      `  p${String(n).padStart(2)}  ${String(ms).padStart(4)}ms  ${JSON.stringify(labels)}  ` +
      `tables=${pageTables.length}${pageTables.map((t) => ` ${t.rows.length}x${t.rows[0]?.length ?? 0}`).join("")}`,
    );

    if (n === showPage && pageTables[0]) {
      const t = pageTables[0];
      console.log(`\n--- page ${n}: ${t.rows.length} rows x ${t.rows[0]?.length} cols, headerRows=${t.headerRows} ---`);
      t.rows.forEach((row, ri) => {
        console.log(` row ${ri}:`);
        row.forEach((cell, ci) => {
          if (cell) console.log(`   c${ci}: ${JSON.stringify(cell.slice(0, 110))}`);
        });
      });
      console.log("---\n");
    }
  } finally {
    page.cleanup();
  }
}

console.log(`\n=== ${doc.numPages} pages ===`);
console.log(`tables: ${tables}   filled cells: ${cells}   regions with no recoverable grid: ${gridless}`);
console.log(`raster ${rasterMs}ms  detect ${detectMs}ms  wall ${Date.now() - wall}ms  peak RSS ${peak} MB`);
