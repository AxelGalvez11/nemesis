/**
 * What two parser lanes disagree about, unit by unit — Nemesis Lab §6.
 *
 * 🔴🔴 CHARACTER COUNT IS NOT THE QUALITY METRIC, AND THIS FILE IS WHERE THAT RULE IS ENFORCED.
 * The comparison every parser benchmark reaches for first is "how many characters came out", and it
 * is the one number that reliably ranks a WORSE read higher: a vendor that flattens a six-column
 * table into a paragraph emits the same characters as one that keeps the grid, and a lane that
 * duplicates a page header onto every page emits MORE. So the aspects below are ordered by how much
 * teaching they can destroy — grid structure first, then merges, then figures and equations, then
 * headings and reading order, and text last — and the surface prints them in that order.
 *
 * 🔴 A LANE THAT DID NOT RUN IS NOT AGREEMENT. `compareParses` refuses to produce a comparison
 * unless BOTH sides actually read the file, because an empty result rendered beside a real one is
 * indistinguishable from two parsers that saw the same thing. This is the single most likely way
 * this feature could lie, and it is a returned fact (`ran`) rather than a convention.
 *
 * PURE. No React, no I/O, no network.
 */

import type { DocBlock, DocumentModel } from "@nemesis/shared";

/** The aspects compared, most destructive first. The surface prints them in this order. */
export const COMPARED_ASPECTS = [
  "tables",
  "tableCells",
  "mergedCells",
  "headerRows",
  "figures",
  "equations",
  "headings",
  "notes",
  "readingOrder",
  "geometry",
  "text",
] as const;

export type ComparedAspect = (typeof COMPARED_ASPECTS)[number];

export interface AspectDifference {
  aspect: ComparedAspect;
  a: string;
  b: string;
}

export interface UnitDisagreement {
  unit: number;
  differences: AspectDifference[];
}

export interface ParseComparison {
  /**
   * Did both lanes read the file?
   *
   * 🔴 `false` MEANS THE PAGE MUST SAY SO INSTEAD OF DRAWING A DIFF. Never render an empty
   * disagreement list from a comparison that did not happen.
   */
  ran: boolean;
  /** Why not, when `ran` is false. */
  note: string | null;
  unitsA: number;
  unitsB: number;
  disagreements: UnitDisagreement[];
  /** Units both lanes produced that differ in nothing compared here. */
  agreedUnits: number;
}

/** One unit's structural facts, as the model states them. */
interface UnitFacts {
  tables: number;
  tableCells: number;
  mergedCells: number;
  headerRows: number;
  figures: number;
  equations: number;
  headings: number;
  notes: number;
  /** Block kinds in reading order — the shape of the page, independent of its words. */
  order: string;
  /** How many blocks carry a rectangle. Geometry a lane lost is provenance a citation cannot use. */
  withRect: number;
  text: string;
}

/**
 * Text, reduced to what a difference in it would MEAN.
 *
 * Whitespace and case are normalised away because no downstream consumer distinguishes them, so a
 * diff on them would be noise that buries the differences that matter.
 */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function factsFor(model: DocumentModel, unit: number): UnitFacts {
  const blocks = model.blocks.filter((block) => block.unit === unit);
  const facts: UnitFacts = {
    equations: 0,
    figures: 0,
    headerRows: 0,
    headings: 0,
    mergedCells: 0,
    notes: 0,
    order: blocks.map((block) => block.kind).join(">"),
    tableCells: 0,
    tables: 0,
    text: normalizeText(blocks.map((block) => block.text).join(" ")),
    withRect: blocks.filter((block) => block.rect).length,
  };
  for (const block of blocks) {
    if (block.kind === "heading") facts.headings += 1;
    if (block.kind === "equation") facts.equations += 1;
    if (block.kind === "note") facts.notes += 1;
    if (block.figure) facts.figures += 1;
    if (block.table) {
      facts.tables += 1;
      facts.headerRows += block.table.headerRows;
      facts.tableCells += countCells(block);
      facts.mergedCells += (block.table.cells ?? []).filter(
        (cell) => (cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1,
      ).length;
    }
  }
  return facts;
}

/**
 * How many cells a table holds.
 *
 * 🔴 `cells` IS TRUTH AND `rows` IS ITS PROJECTION — a merged cell occupies several grid positions
 * and appears once in `cells`. Counting `rows` would report a lane that LOST every merge as having
 * more cells than the lane that kept them, which is the exact inversion this file exists to avoid.
 */
function countCells(block: DocBlock): number {
  const table = block.table;
  if (!table) return 0;
  if (table.cells) return table.cells.length;
  return table.rows.reduce((total, row) => total + row.length, 0);
}

const LABELS: Record<ComparedAspect, (facts: UnitFacts) => string> = {
  equations: (f) => `${f.equations}`,
  figures: (f) => `${f.figures}`,
  geometry: (f) => `${f.withRect} block(s) with a bounding box`,
  headerRows: (f) => `${f.headerRows}`,
  headings: (f) => `${f.headings}`,
  mergedCells: (f) => `${f.mergedCells}`,
  notes: (f) => `${f.notes}`,
  readingOrder: (f) => f.order || "(nothing)",
  tableCells: (f) => `${f.tableCells}`,
  tables: (f) => `${f.tables}`,
  text: (f) => `${f.text.length} characters`,
};

const VALUES: Record<ComparedAspect, (facts: UnitFacts) => string | number> = {
  equations: (f) => f.equations,
  figures: (f) => f.figures,
  geometry: (f) => f.withRect,
  headerRows: (f) => f.headerRows,
  headings: (f) => f.headings,
  mergedCells: (f) => f.mergedCells,
  notes: (f) => f.notes,
  readingOrder: (f) => f.order,
  tableCells: (f) => f.tableCells,
  tables: (f) => f.tables,
  text: (f) => f.text,
};

/**
 * Compare two lanes' readings of the same file.
 *
 * `note` is what to show when `ran` is false — pass the reason the second lane produced nothing
 * (a missing vendor key, a format no vendor reads) rather than letting an absent model read as a
 * document with no content.
 */
export function compareParses(
  a: DocumentModel | null,
  b: DocumentModel | null,
  note: string | null = null,
): ParseComparison {
  if (!a || !b) {
    return {
      agreedUnits: 0,
      disagreements: [],
      note: note ?? (a || b ? "Only one lane produced a reading, so there is nothing to compare." : "Neither lane produced a reading."),
      ran: false,
      unitsA: a?.units.length ?? 0,
      unitsB: b?.units.length ?? 0,
    };
  }

  const shared = Math.min(a.units.length, b.units.length);
  const disagreements: UnitDisagreement[] = [];
  let agreedUnits = 0;

  for (let unit = 0; unit < shared; unit += 1) {
    const factsA = factsFor(a, unit);
    const factsB = factsFor(b, unit);
    const differences: AspectDifference[] = [];
    for (const aspect of COMPARED_ASPECTS) {
      if (VALUES[aspect](factsA) === VALUES[aspect](factsB)) continue;
      differences.push({ a: LABELS[aspect](factsA), aspect, b: LABELS[aspect](factsB) });
    }
    if (differences.length === 0) agreedUnits += 1;
    else disagreements.push({ differences, unit });
  }

  return {
    agreedUnits,
    disagreements,
    // 🔴 A DIFFERENT NUMBER OF PAGES IS ITSELF A DISAGREEMENT, and it is reported as the two counts
    // rather than folded into the per-unit list — a lane that found 40 pages where the other found
    // 12 has not disagreed about page 13, it has disagreed about what the document IS.
    note: a.units.length === b.units.length ? null : "The two lanes did not even agree on how many units the document has.",
    ran: true,
    unitsA: a.units.length,
    unitsB: b.units.length,
  };
}
