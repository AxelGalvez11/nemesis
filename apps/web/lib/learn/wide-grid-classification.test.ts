import assert from "node:assert/strict";
import { test } from "node:test";

import { classAxesOf } from "./wide-grid-classification";

/**
 * A grid that is actually stored in production, copied verbatim from
 * `parsed_documents.structure -> model -> blocks[] -> table.rows`.
 *
 * 🔴 A REAL ROW SHAPE, NOT A CONVENIENT ONE. The header carries `**` emphasis markers the parser
 * did not strip, one class appears once while three appear twice, and the subject column holds
 * values written like codes. A fixture typed by hand would have had none of those, and would have
 * proved the lane works on grids that do not exist.
 */
const CYP2D6_HEADER = [
  "**Genotype CYP2D6** **(Allele Combination)**",
  "**Allele associated function**",
  "**Type of Variation**",
  "**Predicted Metabolizer status**",
] as const;

const CYP2D6_ROWS = [
  ["*1/*1", "Normal / Normal", "Reference", "Normal (NM)"],
  ["*1/*2", "Normal / Normal", "SNV (missense)", "Normal (NM)"],
  ["*1/*10", "Normal / Decreased", "SNV (missense)", "Intermediate (IM)"],
  ["*3/*3", "No function / No function", "SNV (nonsense)", "Poor (PM)"],
  ["*3/*6", "No function / No function", "SNV (nonsense)", "Poor (PM)"],
  ["*1/*1xN", "Normal / Duplication", "CNV", "Ultra-rapid (UM)"],
  ["*2/*2xN", "Normal / Duplication", "CNV", "Ultra-rapid (UM)"],
] as const;

const SUBJECT = { index: 0, populated: CYP2D6_ROWS.length };

test("a real production grid yields every column that groups its subjects", () => {
  const axes = classAxesOf(CYP2D6_ROWS, 4, SUBJECT, CYP2D6_HEADER);

  // Three non-subject columns, and all three group — this grid teaches three classifications.
  assert.deepEqual(
    axes.map((axis) => axis.column),
    [1, 2, 3],
  );
  // The source's own header word names the axis; nothing here invented a name for it.
  assert.equal(axes[2]?.name, "**Predicted Metabolizer status**");
});

test("the siblings on an axis are the rows that shared its value", () => {
  const status = classAxesOf(CYP2D6_ROWS, 4, SUBJECT, CYP2D6_HEADER).find((a) => a.column === 3);

  assert.deepEqual(
    status?.classes.map((entry) => entry.label),
    ["Normal (NM)", "Intermediate (IM)", "Poor (PM)", "Ultra-rapid (UM)"],
  );
  // Two genotypes are Poor metabolisers, and telling them from the Normal pair is the lesson.
  assert.deepEqual(
    status?.classes.find((entry) => entry.label === "Poor (PM)")?.members,
    ["*3/*3", "*3/*6"],
  );
  // What is left over is where the discriminating feature lives.
  assert.deepEqual(status?.featureColumns, [1, 2]);
});

test("classes keep the order the document introduced them, never sorted", () => {
  const status = classAxesOf(CYP2D6_ROWS, 4, SUBJECT, CYP2D6_HEADER).find((a) => a.column === 3);
  const labels = status?.classes.map((entry) => entry.label) ?? [];

  // Alphabetical would put Intermediate first; the source taught Normal first.
  assert.notDeepEqual(labels, [...labels].sort());
  assert.equal(labels[0], "Normal (NM)");
});

test("a two-column grid is a pair and stays with the pair lane", () => {
  // 🔴 THE SECOND COLUMN MUST REPEAT, OR THIS TEST PROVES NOTHING. With two distinct values the
  // grouping rule refuses the grid on its own and the width rule is never reached — the test then
  // passes with the width rule deleted, which is how a guard comes to be trusted for work it does
  // not do. Here `Normal` appears twice across three rows, so grouping WOULD accept it and only
  // the width rule can refuse it.
  const rows = [["*1", "Normal"], ["*2", "Normal"], ["*3", "No function"]];

  // Minting here would teach the same cells twice under two knowledge types.
  assert.deepEqual(classAxesOf(rows, 2, { index: 0, populated: 3 }), []);
});

test("a column as distinct as the subject states a fact per row, and is not a class", () => {
  const rows = [
    ["Aluminium", "70 GPa", "ductile"],
    ["Cast iron", "170 GPa", "brittle"],
    ["Steel", "200 GPa", "ductile"],
  ];

  const axes = classAxesOf(rows, 3, { index: 0, populated: 3 }, ["Material", "Modulus", "Failure"]);

  // Modulus is one value per material — a pair. Failure mode repeats, so only it groups.
  assert.deepEqual(axes.map((axis) => axis.column), [2]);
});

test("a column written as an index is refused the way a timetable is", () => {
  const rows = [
    ["Normal (*1)", "1.0", "full"],
    ["Decreased", "0.5", "partial"],
    ["No function", "0.5", "partial"],
  ];

  const axes = classAxesOf(rows, 3, { index: 0, populated: 3 }, ["Allele", "Activity score", "Effect"]);

  // The score column repeats exactly like a class label does; it is written as a number.
  assert.deepEqual(axes.map((axis) => axis.column), [2]);
});

test("a constant column groups nothing and is refused", () => {
  // 🔴 THE CONSTANT MUST BE A WORD, NOT A YEAR. `2019` is index-shaped, so the typographic rule
  // refuses that column first and this test passes with the one-class rule deleted — the guard
  // would then be credited with a refusal it never made. `upheld` is an ordinary label, so only
  // "one value groups nothing" can refuse it.
  const rows = [
    ["Case A", "upheld", "narrow"],
    ["Case B", "upheld", "broad"],
    ["Case C", "upheld", "narrow"],
  ];

  const axes = classAxesOf(rows, 3, { index: 0, populated: 3 }, ["Case", "Holding", "Reading"]);

  // Every case was upheld — that tells no two of them apart. The reading does.
  assert.deepEqual(axes.map((axis) => axis.column), [2]);
});

test("one row cannot demonstrate that anything repeats", () => {
  const axes = classAxesOf([["*1/*1", "Normal", "NM"]], 3, { index: 0, populated: 1 });

  assert.deepEqual(axes, []);
});
