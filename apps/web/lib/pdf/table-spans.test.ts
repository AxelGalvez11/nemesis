import assert from "node:assert/strict";
import { test } from "node:test";

import { projectCells, resolveCell, tableToMarkdown, type DocTable } from "@nemesis/shared";

import type { Grid, Ruling } from "./table-grid";
import { cellsOf, hasMergedCells, trimEmptyCellColumns } from "./table-spans";

/** A 3×3 grid on a 300×300 page, cells 100pt square. */
const GRID: Grid = { cols: [0, 100, 200, 300], rows: [0, 100, 200, 300] };

/** Every boundary of GRID drawn — the fully ruled case. */
function allRules(): Ruling[] {
  const out: Ruling[] = [];
  for (const at of [0, 100, 200, 300]) {
    out.push({ at, from: 0, horizontal: true, to: 300 });
    out.push({ at, from: 0, horizontal: false, to: 300 });
  }
  return out;
}

/** The same, minus one segment — how a document draws a merged cell. */
function withoutSegment(rules: Ruling[], horizontal: boolean, at: number, from: number, to: number): Ruling[] {
  return rules.flatMap((r) => {
    if (r.horizontal !== horizontal || r.at !== at) return [r];
    const kept: Ruling[] = [];
    if (from > r.from) kept.push({ ...r, to: from });
    if (to < r.to) kept.push({ ...r, from: to });
    return kept;
  });
}

// ── the shape of the defect ─────────────────────────────────────────────────

test("a fully ruled grid has no merged cells", () => {
  const rows = [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]];
  const cells = cellsOf(GRID, rows, allRules());
  assert.equal(cells.length, 9);
  assert.ok(!hasMergedCells(cells));
  assert.deepEqual(projectCells(cells), rows);
});

test("🔴 a value spanning three rows is present in all three, not just the first", () => {
  // THE MEASURED DEFECT. Text is seated by its CENTRE, so an instructor name
  // covering three sessions lands in the first row and the other two come back
  // "" — which reads downstream as "the document does not say", the strongest
  // possible claim about the one case where the document is explicit.
  // Corpus-wide: 607 vertical merge pairs across the 270 accepted tables.
  let rules = allRules();
  rules = withoutSegment(rules, true, 100, 0, 100);  // no rule under (0,0)
  rules = withoutSegment(rules, true, 200, 0, 100);  // nor under (1,0)
  const rows = [["Dr. Farrar", "Session 1", "x"], ["", "Session 2", "y"], ["", "Session 3", "z"]];
  const cells = cellsOf(GRID, rows, rules);
  const table: DocTable = { headerRows: 0, rows: projectCells(cells), cells };

  assert.equal(resolveCell(table, 0, 0)?.rowSpan, 3);
  for (const r of [0, 1, 2]) {
    assert.equal(resolveCell(table, r, 0)?.text, "Dr. Farrar", `row ${r} must know who teaches it`);
  }
});

test("🔴 a spanning header keeps its extent even though its text sits in the middle", () => {
  // `placeIntoGrid` puts `Assessment` in column 1 because that is where its
  // centre falls. Growing rightward from column 0 would stop at column 1 and
  // report a span that starts one column too late — which is why the merge is
  // read from the BOUNDARIES and not from where the text landed.
  let rules = allRules();
  rules = withoutSegment(rules, false, 100, 0, 100);
  rules = withoutSegment(rules, false, 200, 0, 100);
  const rows = [["", "Assessment", ""], ["a", "b", "c"], ["d", "e", "f"]];
  const cells = cellsOf(GRID, rows, rules);
  const header = cells.find((c) => c.row === 0)!;
  assert.equal(header.column, 0, "the span begins where the merged cell begins");
  assert.equal(header.colSpan, 3);
  assert.equal(header.text, "Assessment");
  // And the value now sits at the span's origin in the projection.
  assert.deepEqual(projectCells(cells)[0], ["Assessment", "", ""]);
});

// ── the safety rules ────────────────────────────────────────────────────────

test("🔴 two values with no rule between them stay two cells — a merge never eats text", () => {
  // The dangerous direction. If a missing rule were sufficient evidence on its
  // own, this would collapse to one cell and one of the two values would be
  // gone from the document with nothing to show it ever existed.
  const rules = withoutSegment(allRules(), false, 100, 0, 100);
  const rows = [["left", "right", "c"], ["d", "e", "f"], ["g", "h", "i"]];
  const cells = cellsOf(GRID, rows, rules);
  assert.deepEqual(projectCells(cells), rows, "every value keeps its position");
  assert.equal(cells.filter((c) => c.row === 0).length, 3);
});

test("🔴 a non-rectangular region of missing rules is not a merged cell", () => {
  // An L-shaped component means the grid has been misread. Describing it as a
  // merged cell would assert a shape the page does not have; falling back to
  // 1×1 costs the merge and keeps every value where it was.
  let rules = allRules();
  rules = withoutSegment(rules, false, 100, 0, 100);   // (0,0)-(0,1) joined
  rules = withoutSegment(rules, true, 100, 0, 100);    // (0,0)-(1,0) joined
  const rows = [["x", "", "c"], ["", "e", "f"], ["g", "h", "i"]];
  const cells = cellsOf(GRID, rows, rules);
  assert.deepEqual(projectCells(cells), rows);
  assert.ok(cells.some((c) => c.row === 0 && c.column === 0 && !c.colSpan && !c.rowSpan));
});

test("no text is created, lost or duplicated by merging", () => {
  let rules = allRules();
  rules = withoutSegment(rules, true, 100, 0, 100);
  rules = withoutSegment(rules, false, 200, 200, 300);
  const rows = [["a", "b", "c"], ["", "e", "f"], ["g", "h", ""]];
  const before = rows.flat().filter((t) => t.trim()).sort();
  const after = projectCells(cellsOf(GRID, rows, rules)).flat().filter((t) => t.trim()).sort();
  assert.deepEqual(after, before);
});

// ── the projection invariant ────────────────────────────────────────────────

test("rows is exactly the projection of cells, never a second copy", () => {
  const rules = withoutSegment(allRules(), true, 100, 0, 100);
  const rows = [["a", "b", "c"], ["", "e", "f"], ["g", "h", "i"]];
  const cells = cellsOf(GRID, rows, rules);
  assert.deepEqual(projectCells(cells), projectCells(cells), "deterministic");
  const table: DocTable = { headerRows: 0, rows: projectCells(cells), cells };
  assert.deepEqual(table.rows, projectCells(table.cells!));
});

test("a covered position stays EMPTY in the stored grid", () => {
  // Nothing persisted gains a copy. The rendering resolves the span; the stored
  // representation records it once, so no later reader can mistake a copy for a
  // second printing.
  const rules = withoutSegment(allRules(), true, 100, 0, 100);
  const cells = cellsOf(GRID, [["a", "b", "c"], ["", "e", "f"], ["g", "h", "i"]], rules);
  assert.equal(projectCells(cells)[1]![0], "");
});

test("markdown resolves a span rather than printing a blank", () => {
  const rules = withoutSegment(allRules(), true, 100, 0, 100);
  const cells = cellsOf(GRID, [["Dr. Farrar", "b", "c"], ["", "e", "f"], ["g", "h", "i"]], rules);
  const md = tableToMarkdown({ headerRows: 0, rows: projectCells(cells), cells });
  assert.match(md.split("\n")[1]!, /Dr\. Farrar/, "the second row must say who teaches it");
});

test("a table with no cells renders exactly as before", () => {
  const table: DocTable = { headerRows: 1, rows: [["A", "B"], ["1", "2"]] };
  assert.equal(tableToMarkdown(table), "| A | B |\n| --- | --- |\n| 1 | 2 |");
});

// ── trimming ────────────────────────────────────────────────────────────────

test("a column no cell puts text in is dropped, and spans follow", () => {
  const cells = trimEmptyCellColumns([
    { column: 0, colSpan: 3, row: 0, text: "Header" },
    { column: 0, row: 1, text: "a" },
    { column: 1, row: 1, text: "" },
    { column: 2, row: 1, text: "c" },
  ]);
  assert.deepEqual(projectCells(cells), [["Header", ""], ["a", "c"]]);
  assert.equal(cells.find((c) => c.row === 0)!.colSpan, 2, "the span narrows with the grid");
});

test("trimming leaves a table whose columns all carry text untouched", () => {
  const cells = [{ column: 0, row: 0, text: "a" }, { column: 1, row: 0, text: "b" }];
  assert.deepEqual(trimEmptyCellColumns(cells), cells);
});

test("🔴 a row no cell puts text in is dropped — 24 such rows existed on the corpus", () => {
  // Columns were trimmed from the start and rows never were, so a spurious
  // horizontal rule published a blank record between two real ones.
  const cells = trimEmptyCellColumns([
    { column: 0, row: 0, text: "a" },
    { column: 1, row: 0, text: "b" },
    { column: 0, row: 1, text: "" },
    { column: 1, row: 1, text: "" },
    { column: 0, row: 2, text: "c" },
    { column: 1, row: 2, text: "d" },
  ]);
  assert.deepEqual(projectCells(cells), [["a", "b"], ["c", "d"]]);
});

test("a span crossing a dropped row shrinks rather than disappearing", () => {
  const cells = trimEmptyCellColumns([
    { column: 0, row: 0, rowSpan: 3, text: "Dr. Farrar" },
    { column: 1, row: 0, text: "Session A" },
    { column: 1, row: 1, text: "" },
    { column: 1, row: 2, text: "Session B" },
  ]);
  assert.equal(cells.find((c) => c.column === 0)!.rowSpan, 2);
  assert.deepEqual(projectCells(cells), [["Dr. Farrar", "Session A"], ["", "Session B"]]);
});
