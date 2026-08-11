/**
 * What is actually wrong with the tables we ACCEPT.
 *
 * 🔴 THE MEASURING INSTRUMENT MATTERS MORE THAN THE NUMBER HERE. The external
 * PubTables run cannot see either defect this is looking for: those papers are
 * booktabs, the lattice needs three coexisting vertical positions before it
 * proposes anything, so the parser never reaches those tables at all. Its own
 * numbers say so — mean GriTS-Top is 0.2354 on ground truths WITH spanning cells
 * and 0.2342 on ones without. Identical. If span fidelity were the limit there,
 * those two would differ.
 *
 * So the fixtures are the tables we accept and publish, on real documents. A
 * topology error on a rejected region changes nothing downstream; a topology
 * error on an accepted one is published as fact and replaces the prose it
 * covered.
 *
 * Emits one JSON line per accepted table. No document text is printed — these
 * are the owner's real files.
 *
 * Run from apps/web:
 *   npx tsx scripts/table-defect-census.mts <manifest.jsonl> > census.jsonl
 */

import { readFileSync } from "node:fs";

import { gridWithin, placeIntoGrid, readRulings, type PlacedText, type Ruling } from "../lib/pdf/table-grid.ts";
import { latticeRegions, trimEmptyColumns } from "../lib/pdf/table-lattice.ts";
import { validateTable } from "../lib/pdf/table-validate.ts";
// The same entry point `structure.ts` uses, so geometry matches production.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const manifest = process.argv[2];
if (!manifest) {
  console.error("usage: table-defect-census.mts <manifest.jsonl>");
  process.exit(2);
}

const SAME_LINE = 2.5;

/**
 * Is a rule DRAWN on this boundary, across this cell's extent?
 *
 * The same question `crossings` in table-validate asks, asked of a cell edge
 * rather than of a glyph. A boundary the grid holds but the page never draws
 * between two neighbours is a merged cell — the author's way of saying "these
 * two are one".
 */
function drawnBetween(
  rulings: readonly Ruling[],
  axis: "x" | "y",
  at: number,
  from: number,
  to: number,
): boolean {
  const want = axis === "x" ? false : true; // a column edge is a VERTICAL rule
  const mid = (from + to) / 2;
  return rulings.some(
    (r) =>
      r.horizontal === want &&
      Math.abs(r.at - at) <= SAME_LINE &&
      Math.min(r.from, r.to) <= mid + 1 &&
      Math.max(r.from, r.to) >= mid - 1,
  );
}

const files: string[] = [];
for (const line of readFileSync(manifest, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as { file: string; accepted?: number };
  if ((row.accepted ?? 1) > 0) files.push(row.file);
}

for (const file of files) {
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), disableFontFace: true }).promise;
  } catch {
    continue;
  }
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const rulings = await readRulings(pdfjs, page, viewport);
    const content = await page.getTextContent();
    const items: PlacedText[] = [];
    for (const item of content.items as { str: string; transform: number[]; width: number; height: number; fontName?: string }[]) {
      if (!("str" in item) || !item.str) continue;
      const [, , , , e, f] = item.transform;
      items.push({
        height: item.height,
        text: item.str,
        width: item.width,
        x: e!,
        y: viewport.height - f! - item.height,
        ...(item.fontName ? { font: item.fontName } : {}),
      });
    }

    for (const region of latticeRegions(rulings)) {
      const grid = gridWithin(rulings, region, 0.6, items);
      if (!grid) continue;
      const { rows: seated, placed } = placeIntoGrid(grid, items);
      if (!seated.some((r) => r.some((c) => c.length > 0))) continue;
      // Production trims all-empty columns out of the ROWS and leaves `grid.cols`
      // alone, so these two can disagree. Measured below rather than assumed.
      const rows = trimEmptyColumns(seated);
      const droppedColumns = (seated[0]?.length ?? 0) - (rows[0]?.length ?? 0);
      const inRegion = items.filter((i) => {
        if (!i.text.trim()) return false;
        const cx = i.x + i.width / 2;
        const cy = i.y + i.height / 2;
        return cx >= region.x0 && cx <= region.x1 && cy >= region.y0 && cy <= region.y1;
      });
      const verdict = validateTable({
        grid,
        inRegion,
        page: { height: viewport.height, width: viewport.width },
        placed,
        region,
        rulings,
        table: { headerRows: 0, rows },
      });
      if (!verdict.ok) continue;

      // ── the census ─────────────────────────────────────────────────────────
      // 🔴 SPAN GEOMETRY IS READ OFF THE UNTRIMMED GRID, because that is the one
      // whose boundaries correspond to drawn rules. Using the trimmed row width
      // here would index `grid.cols` with a column number that no longer means
      // the same thing — which is the very defect being counted.
      const nRows = seated.length;
      const nCols = seated[0]?.length ?? 0;
      let hMerges = 0; // undrawn COLUMN edge between two horizontal neighbours
      let vMerges = 0; // undrawn ROW edge between two vertical neighbours
      const mergedInRow: number[] = [];
      for (let r = 0; r < nRows; r += 1) {
        let inThisRow = 0;
        for (let c = 1; c < nCols; c += 1) {
          if (!drawnBetween(rulings, "x", grid.cols[c]!, grid.rows[r]!, grid.rows[r + 1]!)) {
            hMerges += 1;
            inThisRow += 1;
          }
        }
        mergedInRow.push(inThisRow);
      }
      for (let c = 0; c < nCols; c += 1) {
        for (let r = 1; r < nRows; r += 1) {
          if (!drawnBetween(rulings, "y", grid.rows[r]!, grid.cols[c]!, grid.cols[c + 1]!)) vMerges += 1;
        }
      }

      const emptyCells = seated.flat().filter((c) => !c.trim()).length;
      // A cell that is empty AND whose left edge is undrawn is the covered part
      // of a span — the text sits in the neighbour. That is the population the
      // current model reports as an anonymous blank column.
      let emptyBecauseSpanned = 0;
      for (let r = 0; r < nRows; r += 1) {
        for (let c = 1; c < nCols; c += 1) {
          if (seated[r]![c]!.trim()) continue;
          if (!drawnBetween(rulings, "x", grid.cols[c]!, grid.rows[r]!, grid.rows[r + 1]!)) emptyBecauseSpanned += 1;
        }
      }

      console.log(JSON.stringify({
        cols: nCols,
        droppedColumns,
        emptyBecauseSpanned,
        emptyCells,
        file,
        hMerges,
        // How many rows are fully merged across (a banner/section row).
        fullWidthMergedRows: mergedInRow.filter((n) => n === nCols - 1 && nCols > 1).length,
        page: p,
        rows: nRows,
        // A header row whose merges differ from the body is a spanning header.
        headerMerges: mergedInRow[0] ?? 0,
        vMerges,
      }));
    }
    page.cleanup();
  }
  await (doc as { cleanup?: () => Promise<void> }).cleanup?.();
}
