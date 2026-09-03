// A table that arrives as a PICTURE has to arrive with its numbers.
//
// 🔴 THE DEFECT THESE GUARD, MEASURED ON PRODUCTION 2026-09-03. `08-insulin.pdf` pastes its
// onset/peak/duration table into the slide as a 1838x978 screenshot. No PDF geometry, so
// `table-lattice.ts` sees nothing; 252 characters of title and citation on the page, so
// `pages.ts` never sends it. The figure lane reached it, paid for it, and — under a prompt that
// asked for "one to three sentences" — was told the table "provides values for Onset, Peak time,
// and Duration". Not one value came back, and the document recorded `state: "complete"`.
//
// Every assertion below fails against that build.

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TABLE_ROWS,
  MIN_TABLE_COLUMNS,
  MIN_TABLE_ROWS,
  figureDescriptionText,
  readFigureTable,
} from "./figure-table";

/** The shape the table clause in `FIGURE_PROMPT` asks a screenshot of a grid to come back as. */
const TRANSCRIBED = [
  "| Preparation | Onset | Peak | Duration |",
  "| --- | --- | --- | --- |",
  "| Lispro | 15-30 min | 0.5-2.5 h | 3-6 h |",
  "| Regular | 30-60 min | 2-4 h | 6-10 h |",
  "| NPH | 2-4 h | 4-10 h | 10-16 h |",
].join("\n");

test("🔴 a transcribed grid keeps every value, not a sentence about them", () => {
  const read = readFigureTable(TRANSCRIBED);
  assert.ok(read.table, "a run of markdown rows is a table");
  assert.equal(read.table!.rows.length, 4, "header plus three data rows; the rule is not a row");
  assert.deepEqual(read.table!.rows[0], ["Preparation", "Onset", "Peak", "Duration"]);
  assert.deepEqual(read.table!.rows[3], ["NPH", "2-4 h", "4-10 h", "10-16 h"]);
  // The peak column is the exact thing production could not answer with.
  assert.match(figureDescriptionText(TRANSCRIBED), /4-10 h/);
});

test("a drawn header rule is a header; nothing else is", () => {
  assert.equal(readFigureTable(TRANSCRIBED).table!.headerRows, 1);
  // 🔴 NO RULE, NO HEADER. `DocTable.headerRows` documents why guessing "row 0 is a header" is
  // wrong: a grid that starts with data would have its first reading relabelled as column names.
  const noRule = readFigureTable("| 15 mg | 30 mg |\n| 45 mg | 60 mg |");
  assert.equal(noRule.table!.headerRows, 0);
});

test("prose beside a grid survives beside it, not inside it", () => {
  const read = readFigureTable(`A screenshot of the pharmacodynamics table.\n${TRANSCRIBED}\nTaken from the textbook.`);
  assert.equal(read.description, "A screenshot of the pharmacodynamics table. Taken from the textbook.");
  assert.equal(read.table!.rows.length, 4);
  // Both halves reach the model, and the grid is rendered by the shared renderer.
  const text = figureDescriptionText(`A screenshot.\n${TRANSCRIBED}`);
  assert.match(text, /^A screenshot\./);
  assert.match(text, /\| Lispro \| 15-30 min \|/);
});

test("a picture that is nothing but a table describes nothing and still reads as something", () => {
  const read = readFigureTable(TRANSCRIBED);
  assert.equal(read.description, "", "there was no prose, so none is invented");
  assert.ok(read.table, "and the read is not empty — the grid is the answer");
});

test("🔴 it refuses rather than repairs", () => {
  // One row is a caption in a box.
  assert.equal(readFigureTable("| just the one row |").table, undefined);
  assert.equal(MIN_TABLE_ROWS, 2);
  // One column is a list, and `document-model.ts` already has a kind for those.
  assert.equal(readFigureTable("| alpha |\n| beta |\n| gamma |").table, undefined);
  assert.equal(MIN_TABLE_COLUMNS, 2);
  // Ordinary prose that happens to mention a pipe is not a grid.
  assert.equal(readFigureTable("A flow chart of the RAAS pathway.").table, undefined);
  assert.equal(readFigureTable("A flow chart of the RAAS pathway.").description, "A flow chart of the RAAS pathway.");
  // A model that starts generating instead of reading is refused whole rather than clipped.
  const runaway = Array.from({ length: MAX_TABLE_ROWS + 2 }, (_, i) => `| row ${i} | value |`).join("\n");
  assert.equal(readFigureTable(runaway).table, undefined);
});

test("a short row is padded with emptiness, never with a value", () => {
  const read = readFigureTable("| a | b | c |\n| 1 | 2 |");
  assert.deepEqual(read.table!.rows, [
    ["a", "b", "c"],
    ["1", "2", ""],
  ]);
});

test("an escaped pipe is a character in a cell, not a column boundary", () => {
  const read = readFigureTable("| dose \\| unit | value |\n| 5 mg \\| kg | high |");
  assert.deepEqual(read.table!.rows[0], ["dose | unit", "value"]);
});

test("🔴 the caption the old prompt produced is left exactly as it was", () => {
  // Nothing about this change may alter a figure that genuinely is a diagram: the same string in,
  // the same string out, so the 168 already-cached descriptions of real diagrams are unaffected in
  // shape even as they are re-read under the new prompt version.
  const caption =
    "This table lists the pharmacokinetic parameters of various insulin preparations. " +
    "For each preparation, values are provided for Onset, Peak time, and Duration in hours.";
  assert.equal(figureDescriptionText(caption), caption);
});

// ── the shape production actually returned ──────────────────────────────────
//
// 🔴🔴 THE FIRST FIX WORKED AND ITS READER STILL MISSED. On the 2026-09-03 reparse that proved the
// table clause, every value came back — and every row came back WITHOUT outer pipes, because the
// instruction said "cells separated by |" and the model separated the cells. The detector required
// a leading `|`, so it found no table and the grid survived only as loose lines. The instruction is
// explicit now; a model will drift back, so the reader accepts what it actually gets.

/** Verbatim from `figure_descriptions` after the production reparse of 08-insulin.pdf. */
const AS_RETURNED = [
  "Preparations (U-100 Unless Otherwise Noted) | Onset | Peak^a | Duration (Hours)^a",
  "Ultra-rapid Acting | | |",
  "Insulin aspart (Fiasp) | 15-20 min^b | 90-120 min | 5-7",
  "Insulin aspart (NovoLog) | 10-20 min | 30-90 min | 3-5",
].join("\n");

test("🔴 a row without outer pipes is still a row", () => {
  const read = readFigureTable(AS_RETURNED);
  assert.ok(read.table, "this exact text came back from production and read as prose");
  assert.equal(read.table!.rows.length, 4);
  assert.deepEqual(read.table!.rows[3], ["Insulin aspart (NovoLog)", "10-20 min", "30-90 min", "3-5"]);
  // A section heading row inside the grid keeps its empty cells rather than being dropped.
  assert.deepEqual(read.table!.rows[1], ["Ultra-rapid Acting", "", "", ""]);
});

test("🔴 two sentences that happen to carry a pipe are not a two-column table", () => {
  // Dropping the leading-pipe requirement is what lets a real transcription through, and it also
  // makes this ambiguous. A run this thin has to show some other evidence a table was meant.
  const prose = "The x axis | shows time\nThe y axis | shows concentration";
  assert.equal(readFigureTable(prose).table, undefined);
  // Three columns is evidence in itself — prose does not line up that way twice.
  assert.ok(readFigureTable("a | b | c\nd | e | f").table);
  // So is the delimited form, and so is a drawn rule.
  assert.ok(readFigureTable("| a | b |\n| c | d |").table);
  assert.ok(readFigureTable("a | b\n--- | ---\nc | d").table);
});
