/**
 * Across a real corpus, how many detected tables can the ruled-line reader
 * actually reconstruct — and for the ones it cannot, WHY?
 *
 * 🔴 THE "WHY" IS THE ENTIRE POINT, because the two failure modes have
 * completely different answers:
 *
 *   NO RULINGS AT ALL   the table's columns are implied by whitespace, or the
 *                       page is a scan. Geometry can never recover these. This
 *                       is the number that justifies TableFormer (a second
 *                       213 MB model) or a vision pass — or, if it is small,
 *                       justifies NOT paying for either.
 *   RULES BUT NO GRID   the lines are there and the builder rejected them. That
 *                       is a threshold to tune, not a model to buy.
 *
 * Reporting only "N% recovered" would conflate a capability gap with a
 * configuration bug and could buy an entire model to fix a constant.
 *
 * Writes one JSONL row per detected table region so every number is
 * re-derivable without re-running the corpus.
 *
 * Run from apps/web:
 *   DOCLING_LAYOUT_ONNX=/path/model.onnx npx tsx scripts/pdf-table-coverage.mts <corpus.jsonl> <out.jsonl> [maxFiles]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import { detectLayout, layoutModelPath, layoutSession } from "../lib/pdf/layout-onnx.ts";
import { pageToModelRgb } from "../lib/pdf/rasterize.ts";
import { gridWithin, readRulings, tableFromRegion, type PlacedText } from "../lib/pdf/table-grid.ts";
import { pageTextLength, THIN_PAGE_CHARS } from "../lib/pdf/pages.ts";

/** Bounds the tail so one 2,000-page file cannot own the whole run. */
const MAX_PAGES_PER_FILE = 40;

const [listPath, outPath, maxFilesArg] = process.argv.slice(2);
const maxFiles = Number(maxFilesArg ?? "9999");
const modelPath = layoutModelPath();
if (!modelPath) throw new Error("set DOCLING_LAYOUT_ONNX to the layout weights");

const rows = readFileSync(listPath!, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const pdfs = rows
  .filter((r) => (r.ext === "pdf" || String(r.name ?? "").toLowerCase().endsWith(".pdf")) && r.file && existsSync(r.file))
  .slice(0, maxFiles);

writeFileSync(outPath!, "");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const session = await layoutSession(modelPath);

let files = 0, regions = 0, recovered = 0, noRulings = 0, rulesNoGrid = 0, emptyGrid = 0, scanned = 0;
const started = Date.now();

for (const row of pdfs) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(row.file)), disableFontFace: true }).promise;
  } catch { continue; }

  let fileRegions = 0, fileRecovered = 0;
  try {
    const limit = Math.min(doc.numPages, MAX_PAGES_PER_FILE);
    for (let n = 1; n <= limit; n += 1) {
      const page = await doc.getPage(n);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: PlacedText[] = [];
        let raw = "";
        for (const item of content.items) {
          if (!("str" in item) || !item.str) continue;
          raw += item.str + ((item as { hasEOL?: boolean }).hasEOL ? "\n" : "");
          const t = pdfjs.Util.transform(viewport.transform, item.transform);
          const h = Math.hypot(t[2], t[3]) || item.height || 0;
          items.push({ height: h, text: item.str, width: item.width || 0, x: t[4], y: t[5] - h });
        }
        // The same predicate the native lane uses, so "scanned" means the same
        // thing here as it does in the coverage record.
        const isScan = pageTextLength(raw) < THIN_PAGE_CHARS;

        const { rgb, width, height } = await pageToModelRgb(page as never);
        const detected = (await detectLayout(session, rgb, width, height)).regions
          .filter((r) => r.label === "table");
        if (detected.length === 0) continue;

        const rulings = await readRulings(pdfjs as never, page as never, viewport);

        for (const region of detected) {
          const [x0, y0, x1, y1] = region.box;
          const box = { x0, x1, y0, y1 };
          // Rules that touch the region at all, before any coverage judgement.
          const touching = rulings.filter((r) =>
            r.horizontal
              ? r.at >= y0 - 4 && r.at <= y1 + 4 && r.to > x0 && r.from < x1
              : r.at >= x0 - 4 && r.at <= x1 + 4 && r.to > y0 && r.from < y1,
          ).length;
          const grid = gridWithin(rulings, box, 0.6, items);
          const table = grid ? tableFromRegion(box, rulings, items) : null;

          let outcome: string;
          if (table) { outcome = "recovered"; recovered += 1; fileRecovered += 1; }
          else if (grid) { outcome = "grid-but-empty"; emptyGrid += 1; }
          else if (touching === 0) { outcome = "no-rulings"; noRulings += 1; }
          else { outcome = "rules-no-grid"; rulesNoGrid += 1; }
          if (isScan) scanned += 1;
          regions += 1;
          fileRegions += 1;

          appendFileSync(outPath!, JSON.stringify({
            cells: table ? table.rows.flat().filter((c) => c.trim()).length : 0,
            cols: table ? (table.rows[0]?.length ?? 0) : 0,
            file: row.name,
            isScan,
            outcome,
            page: n,
            rows: table ? table.rows.length : 0,
            score: Number(region.score.toFixed(3)),
            touchingRules: touching,
          }) + "\n");
        }
      } finally { page.cleanup(); }
    }
  } catch { /* a file that will not read contributes nothing, not a crash */ }

  files += 1;
  if (fileRegions > 0) {
    console.log(`  ${String(files).padStart(3)}/${pdfs.length} ${String(row.name).slice(0, 52).padEnd(52)} ${fileRecovered}/${fileRegions}`);
  }
}

const pct = (n: number) => (regions > 0 ? ((n / regions) * 100).toFixed(1) : "0.0") + "%";
console.log(`\n=== ${files} PDFs · ${regions} detected table regions · ${Math.round((Date.now() - started) / 1000)}s ===`);
console.log(`  recovered as a real table : ${String(recovered).padStart(5)}  ${pct(recovered)}`);
console.log(`  grid found but no text    : ${String(emptyGrid).padStart(5)}  ${pct(emptyGrid)}`);
console.log(`  rules present, no grid    : ${String(rulesNoGrid).padStart(5)}  ${pct(rulesNoGrid)}   <- tuning`);
console.log(`  NO rulings at all         : ${String(noRulings).padStart(5)}  ${pct(noRulings)}   <- needs TableFormer or vision`);
console.log(`  (of all regions, on scanned pages: ${scanned})`);
