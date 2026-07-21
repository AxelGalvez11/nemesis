import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTableRow,
  columnAlignments,
  displayCellText,
  emptyTableRow,
  splitTableRow,
  tableRowSlots,
} from "./library-table-model";

test("split and build round-trip, including escaped pipes", () => {
  const cells = splitTableRow("| Drug | 5\\|10 mg |");
  assert.deepEqual(cells, [" Drug ", " 5|10 mg "]);
  assert.equal(buildTableRow(cells), "| Drug | 5\\|10 mg |");
});

test("build flattens newlines and trims cell padding", () => {
  assert.equal(buildTableRow(["  Warfarin  ", "INR\ntarget"]), "| Warfarin | INR target |");
});

test("alignments read the delimiter row", () => {
  assert.deepEqual(columnAlignments("| :--- | :---: | ---: |"), ["left", "center", "right"]);
});

test("empty rows match the column count and parse back", () => {
  const row = emptyTableRow(3);
  assert.equal(splitTableRow(row).length, 3);
  assert.equal(splitTableRow(emptyTableRow(1)).length, 1);
});

test("display text strips inline marks; raw keeps them", () => {
  assert.equal(displayCellText("**Bold** and ==hot== `x` [[Note|alias]]"), "Bold and hot x Note|alias");
  assert.equal(displayCellText("<u>under</u> [link](https://x)"), "under link");
});

test("row slots carry offsets and flag the delimiter", () => {
  const source = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const slots = tableRowSlots(source);
  assert.equal(slots.length, 3);
  assert.equal(slots[0]?.offset, 0);
  assert.equal(slots[1]?.isDelimiter, true);
  assert.equal(slots[2]?.offset, source.indexOf("| 1"));
  assert.equal(slots[2]?.isDelimiter, false);
});
