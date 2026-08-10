/**
 * The grid a PDF already draws, and the text that falls into it.
 *
 * 🔴 THE TABLE'S STRUCTURE IS USUALLY IN THE FILE ALREADY — WE JUST NEVER
 * LOOKED. A ruled table is drawn as line and rectangle operations, and those
 * carry exact coordinates. Measured over a real 24-page course document, 23 of
 * 24 pages yield a clean grid this way (the exception is a scanned page, which
 * has no vector content at all). The 8-column drug chart that our lane
 * flattened into unreadable prose states every one of its column boundaries.
 *
 * 🔴 AND THIS IS WHY NO MODEL EVER RE-READS A CHARACTER. The cell contents here
 * are the SAME `TextItem`s pdf.js already extracted — exact, with correct
 * spelling, incapable of being hallucinated. The layout model contributes only
 * "a table is here"; the ruling lines contribute "and these are its cells". A
 * vision model that re-read the pixels could turn 3.125 mg into 31.25 mg and
 * nothing downstream could tell. This arrangement makes that impossible.
 *
 * What it does NOT do: unruled tables, whose columns are implied by whitespace.
 * Those need TableFormer or a vision pass, and until one exists a region with no
 * recoverable grid is reported as having none rather than guessed at.
 *
 * PURE below `readRulings`, which needs the page's operator list.
 */

import type { DocTable } from "@nemesis/shared";

/** A text run in top-left-origin points, as `readPage` already produces. */
export interface PlacedText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One drawn rule, in top-left-origin points. */
export interface Ruling {
  horizontal: boolean;
  /** Constant coordinate: y for a horizontal rule, x for a vertical one. */
  at: number;
  /** Extent along the other axis. */
  from: number;
  to: number;
}

/** Thinner than this and the box IS the line rather than contains one. */
const THIN = 3;
/** Shorter than this and it cannot bound a cell. */
const MIN_RUN = 20;
/** Two rules closer than this are the same drawn line. */
const SAME_LINE = 2.5;

/**
 * Every ruling the page draws, in top-left-origin points.
 *
 * Mirrors `readFigures`'s transform handling exactly: a path's bounding box is
 * expressed in the space current at paint time, so the save/restore/transform
 * sequence has to be replayed or a table inside any transformed group lands
 * somewhere else entirely.
 */
export async function readRulings(
  pdfjs: { OPS: Record<string, number>; Util: { transform: (a: number[], b: number[]) => number[] } },
  page: { getOperatorList: () => Promise<{ argsArray: unknown[][]; fnArray: number[] }> },
  viewport: { transform: number[] },
): Promise<Ruling[]> {
  const { OPS, Util } = pdfjs;
  let ops: { argsArray: unknown[][]; fnArray: number[] };
  try {
    ops = await page.getOperatorList();
  } catch {
    // Unreadable operators mean the grid is UNKNOWN, not absent. Returning none
    // makes the caller fall back to no table rather than to a wrong one.
    return [];
  }

  const rulings: Ruling[] = [];
  let ctm = [...viewport.transform];
  const stack: number[][] = [];

  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i]!;
    if (fn === OPS.save) { stack.push([...ctm]); continue; }
    if (fn === OPS.restore) { ctm = stack.pop() ?? [...viewport.transform]; continue; }
    if (fn === OPS.transform) {
      const a = ops.argsArray[i] as number[] | undefined;
      if (a && a.length >= 6) ctm = Util.transform(ctm, a);
      continue;
    }
    if (fn !== OPS.constructPath) continue;

    // 🔴 THE BOUNDING BOX, NOT THE DECODED SEGMENTS. pdf.js changed how path
    // segments are encoded between versions (the op codes moved into a separate
    // internal enum); the third argument has stayed the path's bbox throughout.
    // For "is this a horizontal rule, a vertical rule, or neither" the bbox is
    // the entire answer, so this avoids depending on the volatile part.
    const bbox = (ops.argsArray[i] as unknown[])[2] as ArrayLike<number> | undefined;
    if (!bbox || bbox.length < 4) continue;

    const xs: number[] = [];
    const ys: number[] = [];
    for (const [px, py] of [
      [Number(bbox[0]), Number(bbox[1])], [Number(bbox[2]), Number(bbox[1])],
      [Number(bbox[0]), Number(bbox[3])], [Number(bbox[2]), Number(bbox[3])],
    ] as const) {
      xs.push(ctm[0]! * px + ctm[2]! * py + ctm[4]!);
      ys.push(ctm[1]! * px + ctm[3]! * py + ctm[5]!);
    }
    if (![...xs, ...ys].every(Number.isFinite)) continue;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = x1 - x0;
    const h = y1 - y0;

    if (w >= MIN_RUN && h <= THIN) rulings.push({ at: (y0 + y1) / 2, from: x0, horizontal: true, to: x1 });
    else if (h >= MIN_RUN && w <= THIN) rulings.push({ at: (x0 + x1) / 2, from: y0, horizontal: false, to: y1 });
    else if (w >= MIN_RUN && h >= MIN_RUN) {
      // A drawn rectangle is four rules — the common way a cell or a whole
      // table border is emitted.
      rulings.push({ at: y0, from: x0, horizontal: true, to: x1 });
      rulings.push({ at: y1, from: x0, horizontal: true, to: x1 });
      rulings.push({ at: x0, from: y0, horizontal: false, to: y1 });
      rulings.push({ at: x1, from: y0, horizontal: false, to: y1 });
    }
  }
  return rulings;
}

/** Collapse coordinates that are one drawn line. PURE. */
export function clusterLines(values: readonly number[], tolerance = SAME_LINE): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  let group: number[] = [];
  for (const v of sorted) {
    if (group.length === 0 || v - group[group.length - 1]! <= tolerance) { group.push(v); continue; }
    out.push(group.reduce((s, n) => s + n, 0) / group.length);
    group = [v];
  }
  if (group.length) out.push(group.reduce((s, n) => s + n, 0) / group.length);
  return out;
}

export interface Grid {
  /** Row boundaries, top to bottom. n boundaries = n-1 rows. */
  rows: number[];
  /** Column boundaries, left to right. */
  cols: number[];
}

/** A rectangle in top-left points. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Total length covered by a set of possibly-overlapping intervals. PURE. */
export function unionLength(intervals: readonly (readonly [number, number])[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return 0;
  let total = 0;
  let [start, end] = sorted[0]!;
  for (let i = 1; i < sorted.length; i += 1) {
    const [s, e] = sorted[i]!;
    if (s > end) { total += end - start; start = s; end = e; continue; }
    if (e > end) end = e;
  }
  return total + (end - start);
}

/**
 * The lines that genuinely cross a region, as clustered positions.
 *
 * 🔴 THE SEGMENTS ARE UNIONED PER LINE, AND THAT IS THE WHOLE CORRECTNESS
 * POINT. A ruled table is almost never drawn as one long stroke per row: on a
 * real course document the line under the header row arrives as 24 separate
 * ~88pt segments, one per cell border, plus overlapping rectangle edges.
 * Testing each segment against "does it span most of the table" rejects every
 * one of them, which silently collapses an 8-column, many-row table into a
 * single row — the columns look perfect and the rows are simply gone. Measured:
 * that bug produced 7 tables from 28 regions and 1 row where there were 2.
 *
 * Summing the segments is equally wrong in the other direction, because the
 * overlaps double-count: the same line summed to 7,270 points across a 727
 * point-wide page. Only the union is the truth.
 *
 * PURE.
 */
function crossingLines(
  rulings: readonly Ruling[],
  horizontal: boolean,
  lo: number,
  hi: number,
  spanLo: number,
  spanHi: number,
  coverage: number,
): number[] {
  const candidates = rulings.filter(
    (r) => r.horizontal === horizontal && r.at >= lo - THIN && r.at <= hi + THIN,
  );
  const extent = spanHi - spanLo;
  if (!(extent > 0)) return [];

  const kept: number[] = [];
  for (const at of clusterLines(candidates.map((r) => r.at))) {
    const parts: [number, number][] = [];
    for (const r of candidates) {
      if (Math.abs(r.at - at) > SAME_LINE) continue;
      const from = Math.max(r.from, spanLo);
      const to = Math.min(r.to, spanHi);
      if (to > from) parts.push([from, to]);
    }
    if (unionLength(parts) >= extent * coverage) kept.push(at);
  }
  return kept;
}

/**
 * A gutter narrower than this is the space between words, not between columns.
 *
 * In points, so it does not drift with page size. Roughly three spaces at 11pt.
 */
const MIN_GUTTER = 7;

/**
 * Column boundaries inferred from the whitespace running down a region.
 *
 * 🔴 MOST RULED TABLES DO NOT RULE THEIR COLUMNS, AND WITHOUT THIS THEY ARE ALL
 * REFUSED. Measured on the corpus: a syllabus grading table came back with
 * SEVEN horizontal lines at 99% coverage and ZERO vertical ones. That is the
 * ordinary academic table — rows separated by rules, columns separated by
 * space — and requiring drawn verticals rejects every one of them. Across the
 * sample, "rules present but no grid" outnumbered "no rules at all" by more
 * than ten to one, so this is the difference between needing a second 213 MB
 * model and not needing one.
 *
 * A gutter counts only when it is clear down the WHOLE region. That is the
 * strong form of the signal on purpose: a gap that exists on some rows and not
 * others is a short cell, not a column boundary, and splitting on it would slice
 * a sentence in half and file the pieces under different headers.
 *
 * PURE.
 */
export function inferColumns(items: readonly PlacedText[], region: Box): number[] {
  const inside = items.filter((i) => {
    const cx = i.x + i.width / 2;
    const cy = i.y + i.height / 2;
    return i.text.trim() && cx >= region.x0 && cx <= region.x1 && cy >= region.y0 && cy <= region.y1;
  });
  if (inside.length < 4) return [];

  // Every x-interval covered by text, merged. The gaps between them are the
  // candidate gutters.
  const spans = inside
    .map((i) => [Math.max(i.x, region.x0), Math.min(i.x + i.width, region.x1)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  if (spans.length === 0) return [];

  const merged: [number, number][] = [spans[0]!];
  for (const [s, e] of spans.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (s <= last[1]) { if (e > last[1]) last[1] = e; continue; }
    merged.push([s, e]);
  }

  const cuts: number[] = [];
  for (let i = 1; i < merged.length; i += 1) {
    const gap = merged[i]![0] - merged[i - 1]![1];
    if (gap >= MIN_GUTTER) cuts.push((merged[i - 1]![1] + merged[i]![0]) / 2);
  }
  if (cuts.length === 0) return [];
  return [region.x0, ...cuts, region.x1];
}

/**
 * The grid inside a region, from the rules that actually cross it — falling
 * back to inferred columns when the table rules its rows but not its columns.
 *
 * A line counts only if its segments together span a real share of the region;
 * otherwise every underline inside a cell becomes a row boundary and the table
 * shatters into hundreds of one-word rows.
 *
 * PURE.
 */
export function gridWithin(
  rulings: readonly Ruling[],
  region: Box,
  coverage = 0.6,
  items: readonly PlacedText[] = [],
): Grid | null {
  const width = region.x1 - region.x0;
  const height = region.y1 - region.y0;
  if (!(width > 0) || !(height > 0)) return null;

  const rows = crossingLines(rulings, true, region.y0, region.y1, region.x0, region.x1, coverage);
  let cols = crossingLines(rulings, false, region.x0, region.x1, region.y0, region.y1, coverage);

  // 🔴 DRAWN COLUMNS WIN WHENEVER THEY EXIST. Inference is the fallback, never
  // an override: a stated boundary is evidence and a deduced one is a reading,
  // and preferring the reading would let a wide gap inside a cell outvote the
  // line the author actually drew.
  if (cols.length < 2 && items.length > 0) cols = inferColumns(items, region);

  // A grid needs at least one row and one column to be a grid at all.
  if (rows.length < 2 || cols.length < 2) return null;
  return { cols, rows };
}

/** Which slot a coordinate falls in, or -1. PURE. */
function slotOf(boundaries: readonly number[], value: number): number {
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    if (value >= boundaries[i]! && value < boundaries[i + 1]!) return i;
  }
  return -1;
}

/**
 * Fill a grid with the page's own text.
 *
 * Items are placed by their CENTRE, so a run that overhangs a rule by a hair
 * still lands in the cell it visually belongs to. Within a cell, text is
 * ordered top-to-bottom then left-to-right — the order it is read in — and
 * joined with spaces, with line breaks preserved as spaces because a cell's
 * internal wrapping is presentation, not content.
 *
 * 🔴 A MERGED CELL PUTS ITS TEXT IN THE TOP-LEFT SLOT IT SPANS, and nothing
 * marks the span, because `DocTable` has no way to express one. That is a known
 * loss and an honest one: the text is present and attributed to a cell it
 * genuinely occupies, rather than duplicated across the span or dropped.
 *
 * PURE.
 */
export function fillGrid(grid: Grid, items: readonly PlacedText[]): string[][] {
  const rowCount = grid.rows.length - 1;
  const colCount = grid.cols.length - 1;
  const buckets: PlacedText[][][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => [] as PlacedText[]),
  );

  for (const item of items) {
    if (!item.text.trim()) continue;
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const r = slotOf(grid.rows, cy);
    const c = slotOf(grid.cols, cx);
    if (r < 0 || c < 0) continue;
    buckets[r]![c]!.push(item);
  }

  return buckets.map((row) =>
    row.map((cell) => {
      cell.sort((a, b) => (Math.abs(a.y - b.y) > Math.max(a.height, b.height) * 0.5 ? a.y - b.y : a.x - b.x));
      return cell.map((i) => i.text).join(" ").replace(/\s+/g, " ").trim();
    }),
  );
}

/**
 * How many leading rows are a header.
 *
 * Only the first row, and only when every cell in it carries text — a partially
 * filled first row is data with an empty cell, not a header. Deliberately
 * conservative: claiming a header that is not one mislabels every column below.
 *
 * PURE.
 */
export function headerRowsOf(rows: readonly string[][]): number {
  const first = rows[0];
  if (!first || first.length < 2 || rows.length < 2) return 0;
  return first.every((cell) => cell.trim().length > 0) ? 1 : 0;
}

/**
 * A region plus the page's rules and text, as a `DocTable` — or null when the
 * region has no recoverable grid.
 *
 * PURE.
 */
export function tableFromRegion(
  region: Box,
  rulings: readonly Ruling[],
  items: readonly PlacedText[],
): DocTable | null {
  const grid = gridWithin(rulings, region, 0.6, items);
  if (!grid) return null;
  const rows = fillGrid(grid, items);
  // A grid every one of whose cells is empty is a border, not a table.
  if (!rows.some((row) => row.some((cell) => cell.length > 0))) return null;
  return { headerRows: headerRowsOf(rows), rows };
}
