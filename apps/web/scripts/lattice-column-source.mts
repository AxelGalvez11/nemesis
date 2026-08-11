/**
 * Where do an accepted table's COLUMNS come from — lines the file drew, or
 * whitespace we inferred?
 *
 * 🔴 THIS EXISTS TO CHECK A CLAIM THIS PROJECT ALREADY MADE AND HAD NOT EARNED.
 * `docs/table-lattice-decision.md` said the lattice lane covers "~96.6% of the
 * tables in the measured corpus", carrying that figure over from
 * `docs/pdf-tables.md` §7. But §7 measured CELL RECOVERY on regions the layout
 * MODEL had already found — the model supplied "a table is here" and only the
 * grid builder was under test. The lattice lane has to find the region itself,
 * from vertical rules, and a table with no vertical rules at all gives it
 * nothing to find. The two numbers describe different problems and one does not
 * transfer to the other.
 *
 * `gridWithin` prefers drawn column lines and falls back to `inferColumns`, but
 * it returns only the answer, so this recomputes both branches per accepted
 * region and reports which one actually decided. No production code is touched.
 *
 * Run from apps/web:
 *   npx tsx scripts/lattice-column-source.mts <corpus.jsonl> [maxFiles]
 */

import { existsSync, readFileSync } from "node:fs";

import { latticeRegions, trimEmptyColumns } from "../lib/pdf/table-lattice.ts";
import { inferColumns, readRulings, reconstructRegion, type PlacedText, type Ruling } from "../lib/pdf/table-grid.ts";
import { validateTable } from "../lib/pdf/table-validate.ts";

const [listPath, maxFilesArg] = process.argv.slice(2);
if (!listPath) { console.error("usage: lattice-column-source.mts <corpus.jsonl> [maxFiles]"); process.exit(2); }

const rows = readFileSync(listPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const pdfs = rows
  .filter((r) => (r.ext === "pdf" || String(r.name ?? "").toLowerCase().endsWith(".pdf")) && r.file && existsSync(r.file))
  .slice(0, Number(maxFilesArg ?? "9999"));

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

/** Distinct drawn vertical positions that cross a region, at the same coverage `gridWithin` uses. */
function drawnColumns(rulings: readonly Ruling[], region: { x0: number; y0: number; x1: number; y1: number }): number {
  const height = region.y1 - region.y0;
  if (!(height > 0)) return 0;
  const positions = new Set<number>();
  for (const r of rulings) {
    if (r.horizontal) continue;
    if (r.at < region.x0 - 3 || r.at > region.x1 + 3) continue;
    const lo = Math.max(Math.min(r.from, r.to), region.y0);
    const hi = Math.min(Math.max(r.from, r.to), region.y1);
    if (hi - lo >= height * 0.6) positions.add(Math.round(r.at / 2.5));
  }
  return positions.size;
}

let accepted = 0;
let fromDrawn = 0;
let fromInferred = 0;
let bothAgree = 0;
const drawnCols: number[] = [];

for (const row of pdfs) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(row.file)), disableFontFace: true }).promise;
  } catch { continue; }
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 40); n += 1) {
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
          if ((trimmed[0]?.length ?? 0) < 2) continue;
          const verdict = validateTable({
            grid: built.grid,
            inRegion: built.inRegion,
            page: { height: viewport.height, width: viewport.width },
            placed: built.placed,
            region,
            rulings,
            table: { headerRows: 0, rows: trimmed },
          });
          if (!verdict.ok) continue;

          accepted += 1;
          const drawn = drawnColumns(rulings, region);
          drawnCols.push(drawn);
          const inferred = inferColumns(items, region).length;
          if (drawn >= 2) { fromDrawn += 1; if (inferred >= 2) bothAgree += 1; }
          else fromInferred += 1;
        }
      } finally { page.cleanup(); }
    }
  } catch { /* one bad file must not cost the run */ }
  try { await doc.destroy?.(); } catch { /* gone */ }
}

const pct = (n: number) => `${((n / Math.max(accepted, 1)) * 100).toFixed(1)}%`;
console.log(`\n${"═".repeat(72)}\nWHERE ACCEPTED TABLES GET THEIR COLUMNS\n${"═".repeat(72)}`);
console.log(`  accepted tables                 ${accepted}`);
console.log(`  columns from DRAWN vertical rules ${fromDrawn}  ${pct(fromDrawn)}`);
console.log(`  columns from INFERRED whitespace  ${fromInferred}  ${pct(fromInferred)}`);
console.log(`     (of the drawn ones, whitespace would also have worked: ${bothAgree})`);
const hist = drawnCols.reduce<Record<number, number>>((a, n) => { a[Math.min(n, 9)] = (a[Math.min(n, 9)] ?? 0) + 1; return a; }, {});
console.log(`  drawn-column-position histogram  ${JSON.stringify(hist)}`);
console.log(`\n  🔴 Region PROPOSAL needs ≥3 coexisting vertical positions regardless — a table with`);
console.log(`     no vertical rules is never proposed, so it cannot appear in these counts at all.`);
process.exit(0);
