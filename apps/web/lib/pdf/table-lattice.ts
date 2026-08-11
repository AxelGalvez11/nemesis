/**
 * Where a ruled table is, from the lines the PDF already draws.
 *
 * 🔴 THIS EXISTS BECAUSE THE 171 MB LAYOUT MODEL WAS NEVER THE MISSING PIECE.
 * That model returns `{label, score, box}` — a rectangle and a class name. It
 * has never produced a row, a column or a cell; every cell has always come from
 * `table-grid.ts`, deterministically, from the ruling lines. So the only thing
 * the model contributed was "look here", and for a ruled table the rulings say
 * that themselves, exactly, for free. Measured on a real 26-page syllabus:
 * 4/4 exams, 6/6 iRATs, 47/47 rows dated, zero prose pages claimed.
 * Full argument in `docs/table-lattice-decision.md`.
 *
 * The model stays behind its flag for UNRULED tables, which geometry can never
 * reach — 3.4% of the detected regions on the 164-PDF corpus.
 *
 * Everything here is PURE. Finding a region is separate from reconstructing it
 * (`table-grid.ts`) and separate again from deciding whether the reconstruction
 * is trustworthy enough to replace the page's prose (`table-validate.ts`).
 */

import { clusterLines, type Ruling } from "./table-grid";

/** A rectangle in top-left points, matching `table-grid.ts`'s `Box`. */
export interface LatticeBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Distinct column positions bounding two columns.
 *
 * 🔴 NOT A TUNED THRESHOLD. Three positions bound two columns, and two columns
 * is already what `gridWithin` requires before it will call something a grid.
 * Raising it would drop real two-column tables — the late-penalty table in a
 * real syllabus is exactly two columns — so the honest way to reject a
 * two-column candidate over prose is the validator, not a bigger number here.
 */
const MIN_COLUMN_POSITIONS = 3;

/** Two rules within this many points are the same drawn line. Matches `SAME_LINE`. */
const SAME_LINE = 2.5;

/** A band shorter than this cannot hold a header and a data row. */
const MIN_BAND_HEIGHT = 20;

/** Merge overlapping intervals, tolerating a hairline gap. PURE. */
function merge(spans: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = spans.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return [];
  const out: [number, number][] = [[sorted[0]![0], sorted[0]![1]]];
  for (const [s, e] of sorted.slice(1)) {
    const last = out[out.length - 1]!;
    if (s <= last[1] + 2) {
      if (e > last[1]) last[1] = e;
      continue;
    }
    out.push([s, e]);
  }
  return out;
}

/**
 * The vertical bands where enough distinct column positions coexist.
 *
 * 🔴 TWO PROPERTIES OF REAL PDFs DEFEAT THE OBVIOUS VERSIONS OF THIS, AND BOTH
 * FAIL SILENTLY.
 *
 *   THE BORDER IS A TABLE      A page border is drawn as a rectangle, so "the
 *                              bounding box of every ruling" is the whole page
 *                              ON EVERY PAGE. Handing that to `tableFromRegion`
 *                              makes a table that ends mid-page fail the
 *                              60%-of-region coverage test and come back as a
 *                              single column. Measured: that is precisely how a
 *                              real syllabus's fourth exam disappeared — its row
 *                              sits on the page where the schedule stops
 *                              half-way down and prose resumes.
 *   THE BORDER IS DRAWN 5-7×   The same rectangle is emitted repeatedly, so a
 *                              sweep counting RULINGS is already at depth ten
 *                              before any table exists. Only distinct CLUSTERED
 *                              positions are countable.
 *
 * So each column position contributes its own merged coverage exactly once, and
 * the sweep asks how many *positions* — not how many lines — are live at each y.
 *
 * PURE.
 */
export function columnBands(
  rulings: readonly Ruling[],
  min = MIN_COLUMN_POSITIONS,
): { y0: number; y1: number }[] {
  const verticals = rulings.filter((r) => !r.horizontal);
  if (verticals.length < min) return [];

  const events: { at: number; delta: number }[] = [];
  for (const x of clusterLines(verticals.map((r) => r.at))) {
    const spans = verticals
      .filter((r) => Math.abs(r.at - x) <= SAME_LINE)
      .map((r) => [Math.min(r.from, r.to), Math.max(r.from, r.to)] as const);
    for (const [a, b] of merge(spans)) {
      events.push({ at: a, delta: 1 });
      events.push({ at: b, delta: -1 });
    }
  }
  // Opens before closes at the same coordinate, so two rules that merely touch
  // do not read as a gap in the band.
  events.sort((a, b) => a.at - b.at || b.delta - a.delta);

  const bands: { y0: number; y1: number }[] = [];
  let depth = 0;
  let open: number | null = null;
  for (const event of events) {
    const before = depth;
    depth += event.delta;
    if (before < min && depth >= min) open = event.at;
    else if (before >= min && depth < min && open !== null) {
      bands.push({ y0: open, y1: event.at });
      open = null;
    }
  }
  return bands.filter((band) => band.y1 - band.y0 > MIN_BAND_HEIGHT);
}

/**
 * The horizontal extent of a band, from the rules that live inside it.
 *
 * Taken from the horizontals rather than the verticals because a table's row
 * lines span its full width, while its column lines only say where the splits
 * are — and a table whose outermost column is unruled would otherwise be
 * cropped to the first interior split.
 *
 * PURE.
 */
export function bandBox(rulings: readonly Ruling[], band: { y0: number; y1: number }): LatticeBox | null {
  const inside = rulings.filter((r) => r.horizontal && r.at >= band.y0 - 3 && r.at <= band.y1 + 3);
  if (inside.length < 2) return null;
  const x0 = Math.min(...inside.map((r) => Math.min(r.from, r.to)));
  const x1 = Math.max(...inside.map((r) => Math.max(r.from, r.to)));
  if (!(x1 > x0)) return null;
  return { x0, x1, y0: band.y0, y1: band.y1 };
}

/**
 * Every region on a page that a ruled table might occupy.
 *
 * A page can hold several — a grading scale near the top and a schedule below
 * it are two lattices, not one — so this returns a list and never merges them.
 *
 * PURE.
 */
export function latticeRegions(rulings: readonly Ruling[]): LatticeBox[] {
  const out: LatticeBox[] = [];
  for (const band of columnBands(rulings)) {
    const box = bandBox(rulings, band);
    if (box) out.push(box);
  }
  return out;
}

/**
 * Drop columns that are empty in every row.
 *
 * 🔴 NOT COSMETIC. The page border sits outside the table's own outermost
 * column lines, so a lattice box routinely carries one empty column at each
 * end. `headerRowsOf` requires EVERY cell of the first row to hold text, so an
 * empty border column silently costs the table its header row — and with it the
 * column names that tell a consumer which cell held the date. The observable
 * symptom is a perfect grid whose header is reported as absent.
 *
 * PURE.
 */
export function trimEmptyColumns(rows: readonly (readonly string[])[]): string[][] {
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const keep: number[] = [];
  for (let c = 0; c < width; c += 1) {
    if (rows.some((row) => (row[c] ?? "").trim().length > 0)) keep.push(c);
  }
  return rows.map((row) => keep.map((c) => row[c] ?? ""));
}
