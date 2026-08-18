/**
 * Whether a parse got the STRUCTURE right, not whether it got the same amount of stuff.
 *
 * 🔴🔴 THE HOLE THIS FILLS: `judgeShadow` COUNTS KINDS, AND A COUNT CANNOT SEE WRONGNESS INSIDE A
 * KIND BOTH PARSERS FOUND. It compares tables to tables, figures to figures, characters to
 * characters, and calls a run `serious` when a kind is missing entirely or the vendor recovered
 * nearly twice the text. That catches absence. It is blind to the two failures that matter most
 * for teaching, because both preserve every count:
 *
 *   1. A TABLE WHOSE CELLS LANDED IN THE WRONG COLUMNS. One table, forty-eight cells, both sides.
 *      Identical on every number the shadow evaluator records. The relationship the table existed
 *      to express — this row's value belongs to that column's heading — is gone, and a learner is
 *      taught the wrong pairing with full confidence.
 *   2. A TWO-COLUMN PAGE READ ACROSS THE GUTTER. Every word present, every character counted, and
 *      the sentences alternate between two unrelated arguments.
 *
 * Both are "good characters in the wrong shape", and no character count will ever see them.
 *
 * 🔴 EVALUATION ONLY. NOTHING HERE MAY BECOME A ROUTING HEURISTIC. `preflight.ts` decides what to
 * pay for and it decides on signals about whether our own read is TRUSTWORTHY. These are signals
 * about whether a read was CORRECT, which is a different question and one we can only answer by
 * comparison or after the fact. Wiring these into routing would turn a measurement apparatus into
 * the thing being measured, and we would lose the ability to tell whether routing is working.
 *
 * 🔴 STRUCTURAL, THEREFORE FIELD-AGNOSTIC. Every signal below is geometry, position and sequence.
 * There is no vocabulary list, no subject-matter cue and nothing that knows what a document is
 * about — so a statute, a circuit diagram and a Renaissance-history essay are judged by the same
 * arithmetic. A keyword heuristic would work for whichever field wrote it and quietly fail the
 * rest.
 *
 * PURE. Every function here is a function of its arguments.
 */

import { cellText, projectCells, type DocBlock, type DocTable, type DocumentModel } from "@nemesis/shared";

// ── Reading order: does this parse cross the gutter? ────────────────────────────────────────────
//
// Needs ONE parse and no vendor, which is what makes it usable over a whole corpus for free.

/**
 * How far apart two groups of blocks must sit, as a share of the text width, before the space
 * between them is a COLUMN GUTTER rather than an ordinary ragged margin.
 *
 * 🔴 A SHARE, NEVER A POINT MEASUREMENT, BECAUSE PAGE SIZES ARE NOT A CONSTANT. A4, US Letter, a
 * 16:9 slide and a scanned lecture handout have different widths in every unit anyone might use.
 * A fifth of the text width is comfortably wider than the indent of a quoted paragraph and
 * comfortably narrower than any real two-column gutter.
 */
export const MIN_GUTTER_SHARE = 0.2;

/** A block wider than this share of the text width spans the page and belongs to no column. */
export const FULL_WIDTH_SHARE = 0.7;

/** Below this many blocks a side is not a column, it is a stray caption. */
export const MIN_BLOCKS_PER_COLUMN = 2;

/**
 * Gutter crossings a correctly-ordered two-column page is allowed.
 *
 * 🔴 ONE IS THE CORRECT READ AND THE ALLOWANCE IS TWO. Reading a two-column page properly means
 * going down the left column and then down the right: exactly one crossing. Two absorbs the
 * ordinary case of a full-width heading or figure that the width test did not catch splitting the
 * page into two stacked two-column regions. Three or more is a parser alternating between columns,
 * which is the defect.
 */
export const MAX_CLEAN_CROSSINGS = 2;

export interface UnitOrderFinding {
  readonly unit: number;
  /** 1 when no gutter was found, 2 when one was. Never more — see `splitByGutter`. */
  readonly columns: number;
  /** Times the reading order stepped from one column to the other. */
  readonly crossings: number;
  readonly blocksConsidered: number;
  readonly interleaved: boolean;
  /**
   * Blocks on a two-column unit that span the page rather than sitting in a column.
   *
   * 🔴 AN UPPER BOUND ON COLUMN FUSION, NOT A COUNT OF IT, AND THE DIFFERENCE MATTERS. A banner
   * title, a full-width figure and a table spanning both columns are all legitimately this wide.
   * So is a line that WELDED TWO COLUMNS TOGETHER — which `docs/column-segmentation.md` identifies
   * as the real defect behind what was first misdiagnosed as a reading-order problem, and reports
   * as improved but not eliminated. This number cannot tell those apart; it says where to look.
   */
  readonly fullWidthBlocks: number;
}

export interface ColumnReport {
  readonly unitsWithGeometry: number;
  readonly twoColumnUnits: number;
  readonly interleavedUnits: number;
  /** Summed across two-column units. See `UnitOrderFinding.fullWidthBlocks`. */
  readonly fullWidthOnTwoColumnUnits: number;
  readonly findings: readonly UnitOrderFinding[];
}

/** Text-bearing blocks with geometry, in the order the parse put them. */
function orderedBlocks(model: DocumentModel, unit: number): DocBlock[] {
  return model.blocks.filter(
    (block) => block.unit === unit && block.rect !== undefined && block.text.trim().length > 0,
  );
}

/**
 * Split blocks into two columns, or report that there is only one.
 *
 * The gutter is found as the widest empty vertical band between block centres. Centres rather than
 * edges: a block's left edge moves with its indentation, and its centre does not.
 */
function splitByGutter(
  blocks: readonly DocBlock[],
): { left: Set<string>; right: Set<string>; fullWidth: number } | null {
  const spanning = blocks.map((b) => b.rect!);
  const leftEdge = Math.min(...spanning.map((r) => r.x));
  const rightEdge = Math.max(...spanning.map((r) => r.x + r.width));
  const textWidth = rightEdge - leftEdge;
  if (!(textWidth > 0)) return null;

  // A full-width block belongs to no column and must not drag the gutter search around.
  const inColumns = blocks.filter((b) => b.rect!.width < textWidth * FULL_WIDTH_SHARE);
  if (inColumns.length < MIN_BLOCKS_PER_COLUMN * 2) return null;

  const centres = inColumns
    .map((b) => ({ id: b.id, x: b.rect!.x + b.rect!.width / 2 }))
    .sort((a, b) => a.x - b.x);

  let widestGap = 0;
  let splitAfter = -1;
  for (let i = 0; i < centres.length - 1; i += 1) {
    const gap = centres[i + 1]!.x - centres[i]!.x;
    if (gap > widestGap) {
      widestGap = gap;
      splitAfter = i;
    }
  }
  if (widestGap < textWidth * MIN_GUTTER_SHARE) return null;

  const left = new Set(centres.slice(0, splitAfter + 1).map((c) => c.id));
  const right = new Set(centres.slice(splitAfter + 1).map((c) => c.id));
  if (left.size < MIN_BLOCKS_PER_COLUMN || right.size < MIN_BLOCKS_PER_COLUMN) return null;
  return { fullWidth: blocks.length - inColumns.length, left, right };
}

/**
 * Does this parse read down its columns, or across them?
 *
 * 🔴 THIS IS THE ONE STRUCTURAL CHECK THAT NEEDS NO SECOND OPINION. Everything else in this file
 * compares two parses. Column interleave is visible in a single parse's own geometry, so it can be
 * run over an entire corpus without paying a vendor a penny — which is exactly what makes it
 * affordable to run over every document rather than a 5% sample.
 */
export function columnInterleave(model: DocumentModel): ColumnReport {
  const findings: UnitOrderFinding[] = [];

  for (const unit of model.units) {
    const blocks = orderedBlocks(model, unit.index);
    if (blocks.length === 0) continue;

    const split = splitByGutter(blocks);
    if (!split) {
      findings.push({
        blocksConsidered: blocks.length,
        columns: 1,
        crossings: 0,
        fullWidthBlocks: 0,
        interleaved: false,
        unit: unit.index,
      });
      continue;
    }

    const sequence = blocks
      .map((b) => (split.left.has(b.id) ? "L" : split.right.has(b.id) ? "R" : null))
      .filter((side): side is "L" | "R" => side !== null);

    let crossings = 0;
    for (let i = 1; i < sequence.length; i += 1) {
      if (sequence[i] !== sequence[i - 1]) crossings += 1;
    }

    findings.push({
      blocksConsidered: sequence.length,
      columns: 2,
      crossings,
      fullWidthBlocks: split.fullWidth,
      interleaved: crossings > MAX_CLEAN_CROSSINGS,
      unit: unit.index,
    });
  }

  return {
    findings,
    fullWidthOnTwoColumnUnits: findings.reduce((sum, f) => sum + f.fullWidthBlocks, 0),
    interleavedUnits: findings.filter((f) => f.interleaved).length,
    twoColumnUnits: findings.filter((f) => f.columns === 2).length,
    unitsWithGeometry: findings.length,
  };
}

// ── Tables: the same cells, or the same cells in the same places? ───────────────────────────────

/** Cell text reduced to what a reader would call "the same value". */
function normaliseCell(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLowerCase();
}

export interface TableFidelity {
  /** Did both parses agree on the grid's dimensions? */
  readonly shapeMatches: boolean;
  readonly rows: readonly [number, number];
  readonly columns: readonly [number, number];
  /** Share of one side's cell VALUES that appear anywhere in the other. Order-blind. */
  readonly valueAgreement: number;
  /** Share of grid POSITIONS holding the same value in both. Order-sensitive. */
  readonly positionAgreement: number;
  readonly cellsCompared: number;
}

/** Values as a multiset, so a value printed twice must appear twice to agree. */
function valueCounts(rows: readonly (readonly string[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const cell of row) {
      const value = normaliseCell(cell);
      if (value.length === 0) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The table as a plain grid, with spans RESOLVED.
 *
 * 🔴 RESOLVED ON BOTH SIDES OR THE COMPARISON IS A LIE. A covered position is stored empty on
 * purpose — repeating a spanning value into the cells it covers would put text in the grid that the
 * document printed once. But one parser may record a span where the other repeats the value, and
 * comparing the stored grids directly would score that as a disagreement about content when it is
 * only a disagreement about notation. `cellText` answers "what governs this position", which is the
 * question a reader of the table is actually asking.
 */
function gridOf(table: DocTable): string[][] {
  const base = table.cells ? projectCells(table.cells) : table.rows;
  return base.map((row, r) => row.map((_, c) => cellText(table, r, c)));
}

/**
 * Compare one table against another.
 *
 * 🔴🔴 THE TWO NUMBERS EXIST TO BE READ AGAINST EACH OTHER, AND THAT IS THE WHOLE DESIGN. Value
 * agreement asks "are the same values present"; position agreement asks "are they in the same
 * places". HIGH VALUE AGREEMENT WITH LOW POSITION AGREEMENT IS THE SIGNATURE OF A TABLE WHOSE CELLS
 * WENT INTO THE WRONG COLUMNS — every value recovered, every relationship destroyed. A single
 * similarity score would average the two into a middling number that means nothing, which is how a
 * count-based comparator misses this in the first place.
 */
export function tableFidelity(ours: DocTable, theirs: DocTable): TableFidelity {
  const a = gridOf(ours);
  const b = gridOf(theirs);

  const rowsA = a.length;
  const rowsB = b.length;
  const colsA = Math.max(0, ...a.map((r) => r.length));
  const colsB = Math.max(0, ...b.map((r) => r.length));

  const mine = valueCounts(a);
  const yours = valueCounts(b);
  let shared = 0;
  let mineTotal = 0;
  for (const [value, count] of mine) {
    mineTotal += count;
    shared += Math.min(count, yours.get(value) ?? 0);
  }

  let positionsCompared = 0;
  let positionsAgreed = 0;
  for (let r = 0; r < Math.min(rowsA, rowsB); r += 1) {
    const rowA = a[r] ?? [];
    const rowB = b[r] ?? [];
    for (let c = 0; c < Math.min(rowA.length, rowB.length); c += 1) {
      const left = normaliseCell(rowA[c] ?? "");
      const right = normaliseCell(rowB[c] ?? "");
      // Two empty positions agree about nothing; counting them would let a sparse grid
      // manufacture a high score out of blank space.
      if (left.length === 0 && right.length === 0) continue;
      positionsCompared += 1;
      if (left === right) positionsAgreed += 1;
    }
  }

  return {
    cellsCompared: positionsCompared,
    columns: [colsA, colsB],
    positionAgreement: positionsCompared === 0 ? 1 : positionsAgreed / positionsCompared,
    rows: [rowsA, rowsB],
    shapeMatches: rowsA === rowsB && colsA === colsB,
    valueAgreement: mineTotal === 0 ? 1 : shared / mineTotal,
  };
}

// ── Sequence: the same passages, in the same order? ─────────────────────────────────────────────

/** Passages long enough that two parses agreeing on one is not a coincidence. */
export const MIN_PASSAGE_CHARS = 24;

/** Bounded so the comparison stays cheap on a long document. */
export const MAX_PASSAGES = 400;

function passagesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/u)
    .map((line) => line.replace(/\s+/gu, " ").trim().toLowerCase())
    .filter((line) => line.length >= MIN_PASSAGE_CHARS)
    .slice(0, MAX_PASSAGES);
}

/** Longest common subsequence length. Classic DP, bounded by `MAX_PASSAGES`. */
function lcsLength(a: readonly string[], b: readonly string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? (previous[j - 1] ?? 0) + 1
        : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous[b.length] ?? 0;
}

export interface OrderAgreement {
  /** Passages present in both parses, regardless of position. */
  readonly sharedPassages: number;
  /** Of those, how many sit in a consistent order in both. */
  readonly orderedPassages: number;
  /** `orderedPassages / sharedPassages`. 1 means both told the same story in the same sequence. */
  readonly agreement: number;
}

/**
 * Did two parses put the same passages in the same order?
 *
 * 🔴 THE SAME LOGIC AS THE TABLE COMPARISON, APPLIED TO PROSE. Shared passages say the text was
 * recovered; the longest common subsequence says it was recovered in sequence. Many shared
 * passages with a low subsequence share means both parsers read the same page and one of them read
 * it in the wrong order — a two-column interleave, a sidebar spliced into the body, a footnote
 * lifted into the middle of a paragraph.
 */
export function orderAgreement(ourText: string, theirText: string): OrderAgreement {
  const mine = passagesOf(ourText);
  const yours = passagesOf(theirText);
  const theirSet = new Map<string, number>();
  for (const passage of yours) theirSet.set(passage, (theirSet.get(passage) ?? 0) + 1);

  let shared = 0;
  for (const passage of mine) {
    const remaining = theirSet.get(passage) ?? 0;
    if (remaining > 0) {
      shared += 1;
      theirSet.set(passage, remaining - 1);
    }
  }
  if (shared === 0) return { agreement: 1, orderedPassages: 0, sharedPassages: 0 };

  const ordered = lcsLength(mine, yours);
  return { agreement: ordered / shared, orderedPassages: ordered, sharedPassages: shared };
}
