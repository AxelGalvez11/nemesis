/**
 * Which cells the document merged, read off the lines it drew.
 *
 * 🔴 A MERGE IS AN ABSENCE, AND THAT IS WHY IT SURVIVED SO LONG UNNOTICED. Every
 * other structural fact in this lane is something the file draws: a column
 * boundary is a vertical rule, a row boundary is a horizontal one. A merged cell
 * is the author DECLINING to draw one — the grid still has the boundary, because
 * other rows do state it, and the two cells either side of it are one cell.
 *
 * The consequence of not modelling it is not a missing table, it is a wrong one.
 * `placeIntoGrid` seats text by its centre, so a value spanning three rows lands
 * in the first and the other two come back as "". Empty is not a neutral
 * reading: to anything downstream it means "the document does not say", which is
 * the strongest claim available, made about exactly the case where the document
 * is explicit. Measured over the 164-document corpus: 607 vertical and 280
 * horizontal merge pairs across the 270 accepted tables, leaving 221 cells blank
 * purely because a neighbour covers them.
 *
 * 🔴 THE TEST IS THE SAME ONE `table-validate` ALREADY TRUSTS, AND DELIBERATELY
 * SO. That file permits text to cross an UNDRAWN boundary precisely because a
 * merged cell does that — it already concluded a merge was there, and then threw
 * the conclusion away. This reads the same signal and keeps it. Two different
 * definitions of "merged" in one pipeline would eventually disagree, and the
 * disagreement would look like a parser bug in whichever file was read second.
 *
 * PURE.
 */

import type { DocCell } from "@nemesis/shared";

import type { Grid, Ruling } from "./table-grid";

/**
 * Tolerance for "the same drawn line", matching `table-grid`'s own clustering.
 * A rule is placed to a fraction of a point and two passes of the same line may
 * differ; anything inside this is one line.
 */
const SAME_LINE = 2.5;

/**
 * How far a rule may fall short of a cell edge and still be dividing it.
 *
 * 🔴 IT IS CHECKED AT THE MIDPOINT RATHER THAN ACROSS THE FULL EDGE, ON PURPOSE.
 * Cell rules routinely stop a point or two shy of the corner, and requiring full
 * coverage would read ordinary typesetting as a merge — which invents a span
 * where the document drew a boundary, the one direction of error that changes
 * what a value means. The midpoint is present in every genuinely drawn divider
 * and absent in every genuinely omitted one.
 */
const REACH = 1;

/** Is a divider drawn on this boundary, across this cell's extent? */
function drawn(
  rulings: readonly Ruling[],
  wantHorizontal: boolean,
  at: number,
  from: number,
  to: number,
): boolean {
  const mid = (from + to) / 2;
  for (const r of rulings) {
    if (r.horizontal !== wantHorizontal) continue;
    if (Math.abs(r.at - at) > SAME_LINE) continue;
    if (Math.min(r.from, r.to) <= mid + REACH && Math.max(r.from, r.to) >= mid - REACH) return true;
  }
  return false;
}

/**
 * The cells of a seated grid, merging across boundaries the page never drew.
 *
 * 🔴 CONNECTED COMPONENTS, NOT GREEDY GROWTH — AND THE REASON IS WHERE THE TEXT
 * SITS. `placeIntoGrid` seats a run by its CENTRE, so a header reading
 * `Assessment` across columns 2–4 lands in column 3, with 2 and 4 empty. Anything
 * that grows rightward from column 2 stops at column 3 because it is occupied,
 * and emits a stray empty cell plus a span starting one column too late. The
 * merge is a property of the BOUNDARIES; where the text happens to have landed
 * inside it is not evidence about its extent.
 *
 * Three rules, each of which exists to keep a wrong merge from destroying
 * content rather than merely mis-shaping it:
 *
 *   1. A component must be RECTANGULAR. An L-shaped or ragged region is not a
 *      merged cell — it is a grid whose boundaries we have misread — and
 *      describing it as one would assert a shape the document does not have.
 *   2. A component may hold AT MOST ONE non-empty position. Two values with no
 *      rule between them are two cells the author left unruled; calling them one
 *      cell would delete a value.
 *   3. Anything failing either check degrades to 1×1 cells, which is exactly
 *      today's behaviour. An uncertain merge costs the merge, never the text.
 *
 * The emitted cell's text sits at the component's ORIGIN, which is why callers
 * must take `rows` from `projectCells` afterwards rather than keeping the seated
 * grid: the value belongs where the merged cell begins, not where its centre
 * happened to fall. No text is added, dropped or copied by any of this — the
 * multiset of non-empty strings is preserved, and a test asserts it.
 */
export function cellsOf(grid: Grid, rows: readonly (readonly string[])[], rulings: readonly Ruling[]): DocCell[] {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height === 0 || width === 0) return [];

  const at = (r: number, c: number) => r * width + c;
  const text = (r: number, c: number) => rows[r]?.[c] ?? "";

  // ── connect positions across boundaries the page does not draw ─────────────
  const parent = Array.from({ length: height * width }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    // Path compression, so a tall merged column stays linear.
    let walk = i;
    while (parent[walk] !== root) {
      const next = parent[walk]!;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      // A column edge is a VERTICAL rule; a row edge is a HORIZONTAL one.
      if (c + 1 < width && !drawn(rulings, false, grid.cols[c + 1]!, grid.rows[r]!, grid.rows[r + 1]!)) {
        union(at(r, c), at(r, c + 1));
      }
      if (r + 1 < height && !drawn(rulings, true, grid.rows[r + 1]!, grid.cols[c]!, grid.cols[c + 1]!)) {
        union(at(r, c), at(r + 1, c));
      }
    }
  }

  // ── group, then judge each component ──────────────────────────────────────
  const groups = new Map<number, number[]>();
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const root = find(at(r, c));
      const bucket = groups.get(root);
      if (bucket) bucket.push(at(r, c));
      else groups.set(root, [at(r, c)]);
    }
  }

  const cells: DocCell[] = [];
  for (const members of groups.values()) {
    let r0 = height;
    let r1 = -1;
    let c0 = width;
    let c1 = -1;
    const filled: number[] = [];
    for (const i of members) {
      const r = Math.floor(i / width);
      const c = i % width;
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
      if (c < c0) c0 = c;
      if (c > c1) c1 = c;
      if (text(r, c).trim()) filled.push(i);
    }
    const rectangular = members.length === (r1 - r0 + 1) * (c1 - c0 + 1);
    if (!rectangular || filled.length > 1) {
      // Rule 3. Every position keeps exactly the text it already had.
      for (const i of members) {
        cells.push({ column: i % width, row: Math.floor(i / width), text: text(Math.floor(i / width), i % width) });
      }
      continue;
    }
    const only = filled[0];
    cells.push({
      column: c0,
      row: r0,
      text: only === undefined ? "" : text(Math.floor(only / width), only % width),
      ...(c1 > c0 ? { colSpan: c1 - c0 + 1 } : {}),
      ...(r1 > r0 ? { rowSpan: r1 - r0 + 1 } : {}),
    });
  }
  // Reading order, so a consumer walking `cells` sees the table as it is read.
  cells.sort((a, b) => a.row - b.row || a.column - b.column);
  return cells;
}

/**
 * Drop columns no cell puts text in, keeping spans meaningful.
 *
 * The cell-model counterpart of `trimEmptyColumns`: same decision — a column
 * that is empty in every row is a sliver the lattice proposed, not a column —
 * applied to a representation where a column can also be covered by a span.
 * A cell whose whole range disappears held no text and goes with it.
 */
export function trimEmptyCellColumns(cells: readonly DocCell[]): DocCell[] {
  let width = 0;
  for (const c of cells) width = Math.max(width, c.column + (c.colSpan ?? 1));
  const used = new Set<number>();
  for (const c of cells) if (c.text.trim()) used.add(c.column);
  const keep: number[] = [];
  for (let c = 0; c < width; c += 1) if (used.has(c)) keep.push(c);
  if (keep.length === width) return [...cells];

  const out: DocCell[] = [];
  for (const cell of cells) {
    const end = cell.column + (cell.colSpan ?? 1);
    const inside = keep.filter((c) => c >= cell.column && c < end);
    if (inside.length === 0) continue;
    const column = keep.indexOf(inside[0]!);
    out.push({
      column,
      row: cell.row,
      text: cell.text,
      ...(inside.length > 1 ? { colSpan: inside.length } : {}),
      ...(cell.rowSpan && cell.rowSpan > 1 ? { rowSpan: cell.rowSpan } : {}),
    });
  }
  return out;
}

/** Does any cell cover more than one position? Cheap enough to ask directly. */
export function hasMergedCells(cells: readonly DocCell[]): boolean {
  return cells.some((c) => (c.rowSpan ?? 1) > 1 || (c.colSpan ?? 1) > 1);
}
