/**
 * What actually separates a ruled table from a page of prose forced into a grid?
 *
 * 🔴 THIS RUNS BEFORE THE VALIDATOR IS WRITTEN, ON PURPOSE. Picking thresholds
 * first and measuring afterwards is how a guard gets calibrated on the one
 * document that motivated it. This proposes a candidate for every lattice region
 * on every page of the corpus, records the signals WITHOUT judging any of them,
 * and leaves the decision to whoever reads the distribution.
 *
 * 🔴 THE CORPUS IS THE OWNER'S REAL FILES. Names go to the JSONL on disk so a
 * finding can be chased; stdout gets indices and aggregates only.
 *
 * Run from apps/web:
 *   npx tsx scripts/lattice-signals.mts <corpus.jsonl> <out.jsonl> [maxFiles]
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import { latticeRegions, trimEmptyColumns } from "../lib/pdf/table-lattice.ts";
import { readRulings, reconstructRegion, type PlacedText } from "../lib/pdf/table-grid.ts";

/** Bounds the tail so one 2,000-page file cannot own the run. Matches the earlier sweep. */
const MAX_PAGES_PER_FILE = 40;

const [listPath, outPath, maxFilesArg] = process.argv.slice(2);
if (!listPath || !outPath) {
  console.error("usage: lattice-signals.mts <corpus.jsonl> <out.jsonl> [maxFiles]");
  process.exit(2);
}

const rows = readFileSync(listPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const pdfs = rows
  .filter((r) => (r.ext === "pdf" || String(r.name ?? "").toLowerCase().endsWith(".pdf")) && r.file && existsSync(r.file))
  .slice(0, Number(maxFilesArg ?? "9999"));

writeFileSync(outPath, "");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

/** Words, after the same whitespace collapse `fillGrid` applies to a cell. */
function tokens(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

/** Multiset intersection size — repeated words must not count once. */
function overlap(a: readonly string[], b: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of b) {
    const n = counts.get(t) ?? 0;
    if (n > 0) { counts.set(t, n - 1); hit += 1; }
  }
  return hit;
}

interface Signal {
  file: string;
  page: number;
  rows: number;
  cols: number;
  /** placed tokens / tokens inside the region — the content-accounting metric. */
  coverage: number;
  /** region items the grid refused to seat. */
  droppedItems: number;
  regionItems: number;
  /** shape signals */
  meanFilledPerRow: number;
  longestCell: number;
  medianCell: number;
  rowsWithMultipleCells: number;
  /** how much of the page this region covers, as a share of page area. */
  areaShare: number;
  firstRow: string[];
  /**
   * 🔴 THE CHECK COVERAGE CANNOT MAKE. A grid line that passes THROUGH a text
   * run is a line the content does not respect — draw a column boundary down
   * the middle of a paragraph and dozens of runs straddle it. In a genuine
   * ruled table nothing crosses a rule, because the author drew the rules
   * around the content. Token accounting is blind to this: a straddling run is
   * still placed, in one cell or the other, so nothing is lost and everything
   * is scrambled.
   */
  straddleCols: number;
  straddleRows: number;
  /** A region larger than the page means the rulings lie outside it. */
  outsidePage: boolean;
}

let files = 0;
let pages = 0;
let candidates = 0;
const started = Date.now();

for (const row of pdfs) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(row.file)), disableFontFace: true }).promise;
  } catch { continue; }
  files += 1;

  try {
    const limit = Math.min(doc.numPages, MAX_PAGES_PER_FILE);
    for (let n = 1; n <= limit; n += 1) {
      pages += 1;
      const page = await doc.getPage(n);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: PlacedText[] = [];
        for (const item of content.items) {
          if (!("str" in item) || item.str.length === 0) continue;
          const t = pdfjs.Util.transform(viewport.transform, item.transform);
          const height = Math.hypot(t[2], t[3]) || item.height || 0;
          items.push({
            height,
            text: item.str,
            width: item.width || Math.abs(t[0]) * item.str.length * 0.5,
            x: t[4],
            y: t[5] - height,
          });
        }
        const rulings = await readRulings(pdfjs as never, page as never, viewport);
        for (const region of latticeRegions(rulings)) {
          const built = reconstructRegion(region, rulings, items);
          if (!built) continue;
          const trimmed = trimEmptyColumns(built.table.rows);
          const cols = trimmed[0]?.length ?? 0;
          if (cols < 2) continue;
          candidates += 1;

          const cellText = trimmed.flat();
          const placedTokens = tokens(cellText.join(" "));
          const regionTokens = tokens([...built.inRegion].map((i) => i.text).join(" "));
          const filled = trimmed.map((r) => r.filter((c) => c.trim()).length);
          const lens = cellText.map((c) => c.length).filter((l) => l > 0).sort((a, b) => a - b);
          const pageArea = viewport.width * viewport.height;
          // Interior boundaries only: the outer edges bound the table, and text
          // touching them is inside it rather than crossing anything.
          const interior = (bounds: number[]) => bounds.slice(1, -1);
          const crosses = (lo: number, hi: number, bounds: number[]) =>
            interior(bounds).some((b) => lo < b - 1 && hi > b + 1);
          let straddleCols = 0;
          let straddleRows = 0;
          for (const item of built.inRegion) {
            if (crosses(item.x, item.x + item.width, built.grid.cols)) straddleCols += 1;
            if (crosses(item.y, item.y + item.height, built.grid.rows)) straddleRows += 1;
          }

          const signal: Signal = {
            areaShare: pageArea > 0 ? ((region.x1 - region.x0) * (region.y1 - region.y0)) / pageArea : 0,
            cols,
            coverage: regionTokens.length ? overlap(regionTokens, placedTokens) / regionTokens.length : 1,
            droppedItems: built.inRegion.length - built.placed.size,
            file: row.file,
            firstRow: (trimmed[0] ?? []).map((c) => c.slice(0, 24)),
            longestCell: lens.length ? lens[lens.length - 1]! : 0,
            meanFilledPerRow: filled.reduce((s, v) => s + v, 0) / Math.max(filled.length, 1),
            medianCell: lens.length ? lens[Math.floor(lens.length / 2)]! : 0,
            page: n,
            regionItems: built.inRegion.length,
            rows: trimmed.length,
            rowsWithMultipleCells: filled.filter((f) => f >= 2).length,
            straddleCols,
            straddleRows,
            outsidePage: region.x1 > viewport.width + 1 || region.y1 > viewport.height + 1 || region.x0 < -1 || region.y0 < -1,
          };
          appendFileSync(outPath, JSON.stringify(signal) + "\n");
        }
      } finally {
        page.cleanup();
      }
    }
  } catch { /* one unreadable file must not cost the corpus */ }
  try { await doc.destroy?.(); } catch { /* already gone */ }
  if (files % 20 === 0) {
    console.log(`  … ${files}/${pdfs.length} files · ${pages} pages · ${candidates} candidates · ${Math.round((Date.now() - started) / 1000)}s`);
  }
}

console.log(`\nfiles ${files} · pages ${pages} · candidates ${candidates} · ${Math.round((Date.now() - started) / 1000)}s`);
console.log(`signals written to ${outPath} — inspect the distribution before choosing any threshold`);
process.exit(0);
