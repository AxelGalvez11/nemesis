/**
 * A table that reached the parser as a PICTURE, and what to keep of it.
 *
 * 🔴🔴 THE MEASUREMENT THIS FILE EXISTS FOR (production, 2026-09-03). `08-insulin.pdf` is a
 * pharmacy lecture whose "Insulin Pharmacodynamics" slides carry their onset/peak/duration table
 * as a pasted screenshot — an image XObject, 1838x978, not a single ruled line of PDF geometry.
 * Every lane behaved exactly as designed and the numbers were still lost:
 *
 *   `table-lattice.ts` reads the rules the PDF DRAWS. A screenshot draws none, so no table
 *   region was detected — and therefore `tableRegionsUnread` was 0, and `preflightPdf`'s
 *   "there is no rate at which losing a table is acceptable" escalation never fired.
 *
 *   `pages.ts` sends a page to vision when its text is thin. The slide's title plus its citation
 *   footer is 252 characters, comfortably over `THIN_PAGE_CHARS`, so the page was never sent.
 *
 *   The figure lane DID catch it: a figure block was created, the pixels were stored, the image
 *   was sent to Gemini, and an answer came back. `FIGURE_PROMPT` asked for the picture "in one to
 *   three sentences", so the answer was a caption ABOUT the table:
 *
 *     "This table lists the pharmacokinetic parameters of various insulin preparations …
 *      For each preparation, values are provided for Onset, Peak time, and Duration in hours."
 *
 *   Values are provided — and not one of them was returned. The document then recorded
 *   `state: "complete"`, `unitsUnread: 0`, `figures.described: 6`. A source gap wearing a full
 *   read's clothes, which is the one failure this lane exists to prevent.
 *
 * So the prompt now asks a table to be TRANSCRIBED rather than described, and this module is
 * what turns that reply back into a grid.
 *
 * 🔴 WHAT THIS DOES NOT CLAIM. A grid recovered here came from a model reading pixels, not from
 * the file's own characters — the opposite of the `table-lattice` + `table-grid` lane, where
 * "no model ever re-reads a character" is the property the whole arrangement protects
 * (`docs/pdf-tables.md` §2). These two are not the same fact and must never be counted as one:
 * this grid stays inside `DocFigure.description`, where `blockToText` already prefixes it with
 * `[Figure]` and keeps it separable from the document's own words. It does NOT become a
 * `kind: "table"` block, and it does NOT raise `table_count`.
 *
 * Everything here is PURE.
 */

import { tableToMarkdown, type DocTable } from "@nemesis/shared";

/**
 * Fewest printed rows before a run of pipes is a table.
 *
 * 🔴 TWO, AND THE SEPARATOR DOES NOT COUNT TOWARDS IT. One row is a caption someone drew a box
 * around; a grid is at minimum a header and a value, or two values. Below this the lines stay
 * prose, which loses nothing — the characters are still in the description either way.
 */
export const MIN_TABLE_ROWS = 2;

/**
 * Fewest columns before a run of pipes is a table.
 *
 * A single-column "table" is a list, and `document-model.ts` already has a kind for those. Reading
 * it as a one-column grid would put a real list behind a table renderer for no gain.
 */
export const MIN_TABLE_COLUMNS = 2;

/**
 * Most rows kept from one transcribed picture.
 *
 * 🔴 A CEILING ON PATHOLOGY, NOT A BUDGET. Transcription at temperature 0 is bounded by what is
 * printed in the image, unlike the label enumeration one clause up in `FIGURE_PROMPT` — which ran
 * to 18,642 output tokens on a molecular diagram because the model REASONED its way down a list.
 * Nothing in a real course table approaches this; a reply that does is a model that has started
 * generating rather than reading, and the honest thing to do with it is refuse the grid rather
 * than store an invented tail.
 */
export const MAX_TABLE_ROWS = 200;

/** Is this line a markdown table row? A leading pipe and at least one interior boundary. */
function isRow(line: string): boolean {
  const text = line.trim();
  if (!text.startsWith("|")) return false;
  // "| a |" has two pipes and one cell; "| a | b |" has three and two. Two boundaries is the floor
  // for anything, and the column count is checked properly further down.
  return (text.match(/(?<!\\)\|/g) ?? []).length >= 2;
}

/** Split one row into its cells. A pipe the model escaped is a pipe, not a boundary. */
function cellsOf(line: string): string[] {
  const text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return text
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

/**
 * Is this the `| --- | --- |` rule under a header?
 *
 * It is structure, never content, so it is removed from the grid wherever it appears — a model
 * that repeats it mid-table has drawn a rule, not written a row of dashes.
 */
function isSeparator(line: string): boolean {
  const cells = cellsOf(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

/** The longest run of consecutive table rows, as [start, endExclusive). PURE. */
function longestRun(lines: readonly string[]): [number, number] | null {
  let best: [number, number] | null = null;
  let start: number | null = null;
  lines.forEach((line, index) => {
    if (isRow(line)) {
      if (start === null) start = index;
      return;
    }
    if (start !== null) {
      if (!best || index - start > best[1] - best[0]) best = [start, index];
      start = null;
    }
  });
  if (start !== null && (!best || lines.length - start > best[1] - best[0])) best = [start, lines.length];
  return best;
}

export interface FigureRead {
  /**
   * What the model said in prose, with the transcribed grid removed.
   *
   * Empty when the reply was nothing but a table, which is the correct answer for a picture that
   * is nothing but a table. It is NOT the `examined-empty` state — `table` is present, so
   * something was read.
   */
  readonly description: string;
  /** The grid, when one was transcribed. Absent means no table was found, never "no table there". */
  readonly table?: DocTable;
}

/**
 * Pull a transcribed grid out of one figure's reply.
 *
 * 🔴 IT REFUSES RATHER THAN REPAIRS, in the same asymmetry `parseFigureLabels` uses. A run of
 * pipes that is too short, too narrow or absurdly long stays in the prose: the characters survive
 * either way, so refusing costs a renderer and nothing else, while a repaired grid would put
 * invented structure around real numbers and nothing downstream could tell.
 *
 * The one thing it DOES normalise is width. A model that drops a trailing empty cell has printed
 * a short row, and padding it with `""` writes no value anywhere — an empty cell says "nothing is
 * printed here", which is exactly what happened. Dropping the whole table over it would lose every
 * value in it to fix a cosmetic ragged edge.
 *
 * PURE.
 */
export function readFigureTable(entry: string): FigureRead {
  const lines = entry.split(/\r?\n/);
  const run = longestRun(lines);
  if (!run) return { description: entry.trim() };

  const [from, to] = run;
  const body = lines.slice(from, to);
  const hasHeaderRule = body.length > 1 && isSeparator(body[1]!);
  const rows = body.filter((line) => !isSeparator(line)).map(cellsOf);

  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  if (rows.length < MIN_TABLE_ROWS || rows.length > MAX_TABLE_ROWS || width < MIN_TABLE_COLUMNS) {
    return { description: entry.trim() };
  }

  const prose = [...lines.slice(0, from), ...lines.slice(to)]
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    description: prose,
    table: {
      // 🔴 0 UNLESS THE MODEL DREW THE RULE. `DocTable.headerRows` documents why guessing "row 0
      // is always a header" is wrong, and it is wrong here for the same reason: a table of values
      // that happens to start with data would have its first reading relabelled as column names.
      headerRows: hasHeaderRule ? 1 : 0,
      rows: rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]),
    },
  };
}

/**
 * One figure's reply as the single string the rest of the pipeline already carries.
 *
 * The grid is rendered by `tableToMarkdown` — the SAME renderer a Word table and a spreadsheet go
 * through — so a table read out of a picture and a table read out of a file reach a model in the
 * same shape. Two renderers would be a retrieval bug that looks like a model bug.
 *
 * PURE.
 */
export function figureDescriptionText(entry: string): string {
  const read = readFigureTable(entry);
  if (!read.table) return read.description;
  return [read.description, tableToMarkdown(read.table)].filter(Boolean).join("\n\n").trim();
}
