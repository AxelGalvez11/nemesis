/**
 * Pure helpers for the ruling-lattice table experiment.
 *
 * 🔴 EXPERIMENT SUPPORT, NOT PRODUCTION ARCHITECTURE. Nothing in `lib/` or
 * `app/` may import this. It exists so the recall script and the false-positive
 * script share one definition of "where is the table" — two copies would let the
 * two halves of a two-sided test drift apart, which is the one thing that would
 * make the measurement meaningless.
 *
 * The production form of this belongs in `lib/pdf/structure.ts`, beside the
 * layout-model gate it is meant to stand in front of.
 */

import { clusterLines, type Ruling } from "../lib/pdf/table-grid.ts";

/** Merge overlapping intervals. PURE. */
function merge(spans: [number, number][]): [number, number][] {
  const sorted = spans.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return [];
  const out: [number, number][] = [sorted[0]!];
  for (const [s, e] of sorted.slice(1)) {
    const last = out[out.length - 1]!;
    if (s <= last[1] + 2) { if (e > last[1]) last[1] = e; continue; }
    out.push([s, e]);
  }
  return out;
}

/**
 * The Y bands where at least `min` DISTINCT column positions coexist.
 *
 * 🔴 TWO PROPERTIES OF REAL PDFs DEFEAT THE OBVIOUS VERSIONS OF THIS.
 *   1. A page border is a drawn rectangle, so "the bounding box of every ruling"
 *      is the whole page ON EVERY PAGE. Handing that to `tableFromRegion` makes
 *      a table that ends mid-page fail the 60%-of-region coverage test and come
 *      back as one column — measured: that is how Exam 4 was lost.
 *   2. That border is emitted FIVE TO SEVEN TIMES over, so a sweep that counts
 *      raw rulings is already at depth 10 before a table exists.
 * Clustering to distinct positions first fixes both. `min = 3` is not a tuned
 * threshold: three column positions bound two columns, and two columns is what
 * `gridWithin` already requires before it will call something a grid.
 *
 * PURE.
 */
export function columnBands(rulings: readonly Ruling[], min = 3): { y0: number; y1: number }[] {
  const verticals = rulings.filter((r) => !r.horizontal);
  const events: { at: number; delta: number }[] = [];
  for (const x of clusterLines(verticals.map((r) => r.at))) {
    const spans = verticals
      .filter((r) => Math.abs(r.at - x) <= 2.5)
      .map((r) => [Math.min(r.from, r.to), Math.max(r.from, r.to)] as [number, number]);
    for (const [a, b] of merge(spans)) { events.push({ at: a, delta: 1 }); events.push({ at: b, delta: -1 }); }
  }
  events.sort((a, b) => a.at - b.at || b.delta - a.delta);
  const bands: { y0: number; y1: number }[] = [];
  let depth = 0;
  let open: number | null = null;
  for (const e of events) {
    const was = depth;
    depth += e.delta;
    if (was < min && depth >= min) open = e.at;
    else if (was >= min && depth < min && open !== null) { bands.push({ y0: open, y1: e.at }); open = null; }
  }
  return bands.filter((b) => b.y1 - b.y0 > 20);
}

/** The X extent of the horizontal rules living inside a band. PURE. */
export function bandBox(rulings: readonly Ruling[], band: { y0: number; y1: number }) {
  const inside = rulings.filter((r) => r.horizontal && r.at >= band.y0 - 3 && r.at <= band.y1 + 3);
  if (inside.length < 2) return null;
  return { x0: Math.min(...inside.map((r) => r.from)), x1: Math.max(...inside.map((r) => r.to)), y0: band.y0, y1: band.y1 };
}

/**
 * Drop columns empty in EVERY row.
 *
 * The page border contributes one such column at each end, and it is not
 * cosmetic: `headerRowsOf` requires every cell of the first row to carry text,
 * so an empty border column silently costs the table its header — and with it
 * the column names that tell a reader which cell held the date.
 *
 * PURE.
 */
export function trimEmptyColumns(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((r) => r.length), 0);
  const keep: number[] = [];
  for (let c = 0; c < width; c += 1) if (rows.some((r) => (r[c] ?? "").trim())) keep.push(c);
  return rows.map((r) => keep.map((c) => r[c] ?? ""));
}
