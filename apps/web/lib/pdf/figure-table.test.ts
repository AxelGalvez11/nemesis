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
