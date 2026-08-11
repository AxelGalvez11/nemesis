import assert from "node:assert/strict";
import { test } from "node:test";

import { columnsAlign, resolveColumns, type Fragment } from "./table-continuation";

const HEADER = ["Date", "Time", "Topic"];
const BODY_FONT = "g_d0_f2";
const HEAD_FONT = "g_d0_f1";

function fragment(over: Partial<Fragment> = {}): Fragment {
  return {
    columnPositions: [72, 150, 250, 540],
    firstRow: ["8-17", "10:00", "Exam 1"],
    firstRowComplete: true,
    rowFonts: [BODY_FONT, BODY_FONT, BODY_FONT],
    unit: 0,
    unitHeight: 792,
    y0: 100,
    y1: 700,
    ...over,
  };
}

// ── is row 0 a header at all? ────────────────────────────────────────────────

test("a complete first row is NOT a header on that evidence alone", () => {
  // 🔴 THE DEFECT THIS PREVENTS: a real syllabus opens its schedule with
  // `Week 1 Tuesday, August 11th | 1-2:50 CT | Course Introduction | …` — a complete row, and a
  // RECORD. Publishing it as `columns` told every consumer the date column was called
  // "Week 1 Tuesday, August 11th", and every value under it inherited that label.
  const [only] = resolveColumns([fragment()]);
  assert.equal(only!.columns, null);
  assert.equal(only!.headerSource, null);
});

test("a first row set in its own font IS a header", () => {
  const [only] = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT, BODY_FONT] }),
  ]);
  assert.deepEqual(only!.columns, HEADER);
  assert.equal(only!.headerSource, "present");
});

test("a first row reprinted on the next page IS a header, even in one font", () => {
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, unit: 0 }),
    fragment({ firstRow: HEADER, unit: 1 }),
  ]);
  assert.deepEqual(resolved.map((r) => r.headerSource), ["present", "present"]);
  assert.deepEqual(resolved[1]!.columns, HEADER);
});

test("two identical DATA rows do not become a header unless the columns also align", () => {
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, unit: 0 }),
    fragment({ columnPositions: [72, 300, 540], firstRow: HEADER, unit: 1 }),
  ]);
  assert.deepEqual(resolved.map((r) => r.headerSource), [null, null]);
});

// ── inheritance ──────────────────────────────────────────────────────────────

test("a continuation page with no header of its own inherits the names", () => {
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0, y1: 700 }),
    fragment({ unit: 1, y0: 80, y1: 700 }),
  ]);
  assert.equal(resolved[1]!.headerSource, "inherited");
  assert.deepEqual(resolved[1]!.columns, HEADER);
  assert.equal(resolved[1]!.continuesFromUnit, 0);
});

test("inherited names are identical to printed ones — only the provenance differs", () => {
  const inheritedRun = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0 }),
    fragment({ unit: 1, y0: 80 }),
  ]);
  const printedRun = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0 }),
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 1, y0: 80 }),
  ]);
  assert.deepEqual(inheritedRun[1]!.columns, printedRun[1]!.columns);
  assert.equal(inheritedRun[1]!.headerSource, "inherited");
  assert.equal(printedRun[1]!.headerSource, "present");
});

test("a next-page table with different columns inherits NOTHING", () => {
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0 }),
    fragment({ columnPositions: [72, 200, 400, 540], unit: 1, y0: 80 }),
  ]);
  assert.equal(resolved[1]!.columns, null);
  assert.equal(resolved[1]!.headerSource, null);
});

test("a table starting half-way down the next page is a new table, not a continuation", () => {
  // A table interrupted by a page break resumes at the TOP. One that starts in the middle began
  // there because it is a different table, however similar its columns look.
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0, y1: 700 }),
    fragment({ unit: 1, y0: 400 }),
  ]);
  assert.equal(resolved[1]!.headerSource, null);
});

test("a table ending half-way down its own page is not continued by the next page", () => {
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0, y1: 300 }),
    fragment({ unit: 1, y0: 80 }),
  ]);
  assert.equal(resolved[1]!.headerSource, null);
});

test("fragments of one table on ONE page inherit across the gap between them", () => {
  // A landscape schedule draws its column rules in several runs; 98 of 238 accepted candidates on
  // the corpus are single-row pieces of exactly this kind.
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0, y0: 100, y1: 200 }),
    fragment({ unit: 0, y0: 228, y1: 300 }),
  ]);
  assert.equal(resolved[1]!.headerSource, "inherited");
});

test("a gap too wide to be one table stops the inheritance", () => {
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0, y0: 100, y1: 200 }),
    fragment({ unit: 0, y0: 400, y1: 500 }),
  ]);
  assert.equal(resolved[1]!.headerSource, null);
});

test("a break in the chain stays broken — page four does not reach back past page three", () => {
  // 🔴 Keeping the carried names alive past a failed link would label a later, coincidentally
  // compatible table with column names from a table two pages back that it has nothing to do with.
  const resolved = resolveColumns([
    fragment({ firstRow: HEADER, rowFonts: [HEAD_FONT, BODY_FONT], unit: 0 }),
    fragment({ columnPositions: [72, 999, 540], unit: 1, y0: 80 }),   // incompatible: breaks it
    fragment({ unit: 2, y0: 80 }),
  ]);
  assert.equal(resolved[2]!.columns, null, "must not inherit across the break");
});

test("columnsAlign needs the same count, the same places, and enough of them", () => {
  assert.equal(columnsAlign([72, 150, 540], [72, 151, 540]), true, "within tolerance");
  assert.equal(columnsAlign([72, 150, 540], [72, 160, 540]), false, "10pt is a different layout");
  assert.equal(columnsAlign([72, 540], [72, 540]), false, "two positions is one column, not a grid");
  assert.equal(columnsAlign([72, 150, 540], [72, 150, 300, 540]), false);
});
