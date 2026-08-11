/**
 * Whether a reconstructed grid has earned the right to replace the page's prose.
 *
 * 🔴 THIS EXISTS BECAUSE CLAIMING A TABLE IS DESTRUCTIVE. When a region becomes
 * a table, the text it covers is removed from the paragraph flow so the same
 * words are not emitted twice (`readPage`). That is correct for a real table and
 * catastrophic for a false one: a page of prose does not gain a junk table
 * beside its paragraphs, it LOSES its paragraphs and keeps a mangled grid, which
 * is then what gets chunked, indexed and quoted back to a student.
 *
 * So the rule is: a structured representation may supersede paragraph flow only
 * once it has been shown to account for the content it supersedes. A false
 * positive must cost a missed table, never damaged text.
 *
 * 🔴 EVERY THRESHOLD HERE WAS MEASURED BEFORE IT WAS CHOSEN, over 336 candidates
 * on 1,364 pages of the 164-PDF corpus (`scripts/lattice-signals.mts`). Two
 * findings shaped it:
 *
 *   TOKEN ACCOUNTING DOES NOT DISCRIMINATE.  302 of 336 candidates score exactly
 *     1.00, including the prose ones — because a paragraph forced into a grid
 *     still has all its words, just in the wrong boxes. Coverage is kept as a
 *     LOSS check, and it is deliberately not the deciding signal.
 *   THE GRID LINES THEMSELVES DO.  A rule that passes THROUGH a text run is a
 *     rule the content does not respect; in a genuine ruled table nothing
 *     crosses a rule, because the author drew the rules around the content.
 *     248 of 336 candidates have zero column crossings, and the ones that do not
 *     are exactly the bordered-prose cases (one had 18 crossings and a median
 *     "cell" of 1,855 characters). All 14 tables in the real syllabus score zero.
 */

import type { DocTable } from "@nemesis/shared";

import type { Grid, PlacedText, Ruling } from "./table-grid";

export type TableRejection =
  | "outside-page"
  | "too-few-columns"
  | "too-little-content"
  | "text-crosses-column-rule"
  | "text-crosses-row-rule"
  | "content-unaccounted";

export interface TableValidation {
  ok: boolean;
  reason?: TableRejection;
  /** Region tokens that reached a cell, over region tokens. 1 when nothing was lost. */
  coverage: number;
  straddleColumns: number;
  straddleRows: number;
}

/**
 * A boundary must be crossed by this much on BOTH sides to count.
 *
 * A glyph that overhangs a rule by a hair is normal typesetting — cell padding
 * is not always symmetric and pdf.js's advance widths are approximate. One point
 * is below the width of any character at any readable size, so this excludes
 * touching without excluding real crossings.
 */
const STRADDLE_SLACK = 1;

/**
 * How far past the page edge a region may still be a real table.
 *
 * 🔴 THE CHECK IS FOR A BROKEN COORDINATE SPACE, NOT FOR TIDY MARGINS. Measured:
 * 17 of 336 corpus candidates fall outside the page, and one covers 614 TIMES the
 * page area — its rulings live in a space the page never uses, so every boundary
 * derived from them is meaningless and any locator built on one points nowhere.
 * But real documents also overhang by a few points where a rule is drawn to the
 * bleed, and rejecting those threw away genuine tables. A tenth of the page
 * separates the two by orders of magnitude.
 */
const OFF_PAGE_SLACK = 0.1;

/** Words, after the same whitespace collapse `fillGrid` applies inside a cell. */
function tokens(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

/**
 * Multiset intersection size.
 *
 * A multiset, not a set: a table of repeated values ("-", "0", "N/A") would
 * otherwise score full marks while having dropped every duplicate but one.
 */
function overlap(source: readonly string[], produced: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const t of source) counts.set(t, (counts.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of produced) {
    const n = counts.get(t) ?? 0;
    if (n > 0) {
      counts.set(t, n - 1);
      hit += 1;
    }
  }
  return hit;
}

/**
 * Text that crosses a boundary WHERE A RULE IS ACTUALLY DRAWN.
 *
 * 🔴 THE "WHERE A RULE IS DRAWN" HALF IS NOT A REFINEMENT, IT IS THE WHOLE
 * TEST — AND LEAVING IT OUT REJECTED HALF THE REAL TABLES IN THE CORPUS.
 * A merged cell spans several columns precisely BY omitting the rule between
 * them: a syllabus row reading `August 17, 2026 | Exam 2` legitimately covers
 * two column slots, and its text crosses a boundary that this grid inherited
 * from other rows. Counting that as a violation threw away ten real tables in
 * one file, including every page of its schedule.
 *
 * A rule that IS drawn through the middle of a text run is the opposite fact:
 * the author separated two things and our grid put them in one run, or — the
 * dangerous case — no table exists and the boundary is a page border or a
 * decorative rule with a paragraph lying across it.
 *
 * So: crossing an undrawn boundary is a merged cell and permitted. Crossing a
 * drawn one is a contradiction between the geometry and the content, and the
 * geometry wins.
 *
 * PURE.
 */
function crossings(
  items: readonly PlacedText[],
  bounds: readonly number[],
  rulings: readonly Ruling[],
  axis: "x" | "y",
): number {
  const interior = bounds.slice(1, -1);
  if (interior.length === 0) return 0;
  // Rules running ACROSS this axis: vertical rules divide columns (x), horizontal
  // rules divide rows (y).
  const dividers = rulings.filter((r) => (axis === "x" ? !r.horizontal : r.horizontal));

  let count = 0;
  for (const item of items) {
    const lo = axis === "x" ? item.x : item.y;
    const hi = lo + (axis === "x" ? item.width : item.height);
    // The item's extent along the OTHER axis, which is where the divider must
    // actually be present for the crossing to be real.
    const otherLo = axis === "x" ? item.y : item.x;
    const otherHi = otherLo + (axis === "x" ? item.height : item.width);

    const violated = interior.some((b) => {
      if (!(lo < b - STRADDLE_SLACK && hi > b + STRADDLE_SLACK)) return false;
      return dividers.some(
        (r) =>
          Math.abs(r.at - b) <= STRADDLE_SLACK * 2 &&
          Math.min(r.from, r.to) < otherHi - STRADDLE_SLACK &&
          Math.max(r.from, r.to) > otherLo + STRADDLE_SLACK,
      );
    });
    if (violated) count += 1;
  }
  return count;
}

export interface ValidateInput {
  table: DocTable;
  grid: Grid;
  /** Every item whose centre lies in the region, placed or not. */
  inRegion: readonly PlacedText[];
  /** The items the grid actually seated — the only ones that may be suppressed. */
  placed: ReadonlySet<PlacedText>;
  region: { x0: number; y0: number; x1: number; y1: number };
  page: { width: number; height: number };
  /** The page's drawn rules, so a merged cell can be told from a broken grid. */
  rulings: readonly Ruling[];
}

/**
 * Judge one reconstruction.
 *
 * Ordered cheapest-first, and the reason is carried out rather than collapsed to
 * a boolean: a rejected candidate is a diagnostic the coverage record can report,
 * not silence. "We found a table here and could not trust it" and "there was no
 * table here" are different facts and only one of them is a gap.
 *
 * PURE.
 */
export function validateTable(input: ValidateInput): TableValidation {
  const { grid, inRegion, page, region, rulings, table } = input;
  const cells = table.rows.flat();
  const filled = cells.filter((cell) => cell.trim().length > 0);
  const straddleColumns = crossings(inRegion, grid.cols, rulings, "x");
  const straddleRows = crossings(inRegion, grid.rows, rulings, "y");
  const regionTokens = tokens(inRegion.map((i) => i.text).join(" "));
  const cellTokens = tokens(cells.join(" "));
  const coverage = regionTokens.length === 0 ? 1 : overlap(regionTokens, cellTokens) / regionTokens.length;
  const base = { coverage, straddleColumns, straddleRows };

  // 🔴 A REGION OUTSIDE THE PAGE IS NOT A TABLE, IT IS A BROKEN TRANSFORM.
  // Measured: 17 of 336 candidates, one of them 614× the page area. Their
  // rulings sit in a coordinate space the page never uses, so every cell
  // boundary derived from them is meaningless — and a locator built on one
  // would point somewhere that does not exist.
  const slackX = page.width * OFF_PAGE_SLACK;
  const slackY = page.height * OFF_PAGE_SLACK;
  if (
    region.x1 > page.width + slackX || region.y1 > page.height + slackY ||
    region.x0 < -slackX || region.y0 < -slackY
  ) {
    return { ...base, ok: false, reason: "outside-page" };
  }

  // One column is a border, not a grid. This is the definition, not a threshold.
  const columnCount = table.rows[0]?.length ?? 0;
  if (columnCount < 2) return { ...base, ok: false, reason: "too-few-columns" };

  // Content has to be divided by the grid, not merely surrounded by it: a
  // bordered paragraph fills exactly one cell and is prose with a box round it.
  const columnsWithContent = new Set<number>();
  for (const row of table.rows) {
    row.forEach((cell, c) => { if (cell.trim()) columnsWithContent.add(c); });
  }
  if (filled.length < 2 || columnsWithContent.size < 2) {
    return { ...base, ok: false, reason: "too-little-content" };
  }

  // 🔴 THE DECIDING SIGNAL. See the header: nothing crosses a rule in a real
  // ruled table, and everything crosses one when a grid is imposed over prose.
  if (straddleColumns > 0) return { ...base, ok: false, reason: "text-crosses-column-rule" };
  if (straddleRows > 0) return { ...base, ok: false, reason: "text-crosses-row-rule" };

  // 🔴 THE LOSS CHECK, WHICH SHOULD BE STRUCTURALLY IMPOSSIBLE — AND IS ASSERTED
  // ANYWAY. Suppression is limited to the items the grid seated, so a dropped
  // item stays a paragraph and nothing can vanish today. This guards the day
  // someone changes `placeIntoGrid` or the suppression rule: the invariant is
  // "content is accounted for", and an invariant that is only enforced by a
  // distant implementation detail is one refactor from being untrue.
  if (coverage < 1) return { ...base, ok: false, reason: "content-unaccounted" };

  return { ...base, ok: true };
}
