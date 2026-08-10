/**
 * The grid logic, tested on constructed geometry.
 *
 * 🔴 THE CENTRAL TEST IS THE SEGMENTED RULE, because that is the bug that
 * actually happened and it was invisible: an 8-column table came back with
 * perfect columns and ONE row, because each row line is drawn as ~24 short
 * per-cell segments and each segment individually spans far less than the
 * table. Columns looked right, so nothing about the output said "broken".
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clusterLines,
  fillGrid,
  gridWithin,
  headerRowsOf,
  tableFromRegion,
  unionLength,
  type PlacedText,
  type Ruling,
} from "./table-grid";

const REGION = { x0: 0, x1: 800, y0: 0, y1: 400 };

/** A line drawn as `pieces` abutting segments, the way a real PDF draws one. */
function segmented(at: number, horizontal: boolean, from: number, to: number, pieces: number): Ruling[] {
  const step = (to - from) / pieces;
  return Array.from({ length: pieces }, (_, i) => ({
    at, from: from + i * step, horizontal, to: from + (i + 1) * step,
  }));
}

// ── unionLength ────────────────────────────────────────────────────────────

test("unionLength does not double-count overlapping segments", () => {
  // 🔴 THE OTHER HALF OF THE SAME BUG. Summing lengths instead of unioning
  // them made one line on a real 727pt-wide page measure 7,270 points, because
  // each cell's rectangle redraws the shared edge. Ten times the page width
  // reads as "definitely spans the table" for any line, however short.
  assert.equal(unionLength([[0, 100], [0, 100], [0, 100]]), 100);
  assert.equal(unionLength([[0, 60], [40, 100]]), 100);
  assert.equal(unionLength([[0, 10], [20, 30]]), 20, "a genuine gap is not covered");
  assert.equal(unionLength([]), 0);
  assert.equal(unionLength([[50, 50]]), 0, "a zero-length segment covers nothing");
});

test("clusterLines merges coordinates one point apart", () => {
  // Real tables draw a border and a cell edge a hair apart: y=61 and y=62 are
  // one visual line and must not become two rows with nothing between them.
  assert.deepEqual(clusterLines([61, 62]).map(Math.round), [62]);
  assert.equal(clusterLines([10, 200, 400]).length, 3, "genuinely distinct lines stay distinct");
});

// ── gridWithin ─────────────────────────────────────────────────────────────

test("🔴 a row line drawn as many short segments still forms a row", () => {
  // The regression. Each piece is 100pt against an 800pt table — 12.5%, far
  // under any sane coverage threshold — but together they span it completely.
  const rulings: Ruling[] = [
    ...segmented(0, true, 0, 800, 8),
    ...segmented(200, true, 0, 800, 8),   // the header separator, per-cell
    ...segmented(400, true, 0, 800, 8),
    ...segmented(0, false, 0, 400, 4),
    ...segmented(800, false, 0, 400, 4),
  ];
  const grid = gridWithin(rulings, REGION);
  assert.ok(grid, "a fully-ruled table must produce a grid");
  assert.equal(grid.rows.length - 1, 2, "two rows, not one");
  assert.equal(grid.cols.length - 1, 1);
});

test("a stray underline inside a cell does not become a row boundary", () => {
  const rulings: Ruling[] = [
    { at: 0, from: 0, horizontal: true, to: 800 },
    { at: 400, from: 0, horizontal: true, to: 800 },
    { at: 150, from: 20, horizontal: true, to: 90 },   // underlined heading in a cell
    { at: 0, from: 0, horizontal: false, to: 400 },
    { at: 800, from: 0, horizontal: false, to: 400 },
  ];
  const grid = gridWithin(rulings, REGION);
  assert.ok(grid);
  assert.equal(grid.rows.length - 1, 1, "the underline is not a row");
});

test("a region with no rules has no grid, and says so rather than guessing", () => {
  // A scanned page: the layout model still finds a table, but there is no
  // vector geometry to recover. Reporting no grid sends it to whatever can
  // actually read pixels instead of inventing cells.
  assert.equal(gridWithin([], REGION), null);
  assert.equal(gridWithin(segmented(0, true, 0, 800, 8), REGION), null, "one line is not a grid");
});

// ── fillGrid ───────────────────────────────────────────────────────────────

const GRID = { cols: [0, 400, 800], rows: [0, 200, 400] };

function at(text: string, x: number, y: number): PlacedText {
  return { height: 10, text, width: 40, x, y };
}

test("text lands in the cell its centre falls in", () => {
  const rows = fillGrid(GRID, [at("A", 10, 10), at("B", 500, 10), at("C", 10, 250), at("D", 500, 250)]);
  assert.deepEqual(rows, [["A", "B"], ["C", "D"]]);
});

test("a run overhanging a rule still lands where it visually sits", () => {
  // Starts left of the divider, centre is right of it: it belongs to column 1.
  const rows = fillGrid(GRID, [at("spill", 385, 10)]);
  assert.deepEqual(rows[0], ["", "spill"]);
});

test("text within a cell is joined in reading order, not extraction order", () => {
  const rows = fillGrid(GRID, [at("second", 10, 60), at("first", 10, 20), at("same-line", 60, 20)]);
  assert.equal(rows[0]![0], "first same-line second");
});

test("text outside every cell is dropped rather than forced into one", () => {
  const rows = fillGrid(GRID, [at("margin", 900, 10), at("above", 10, -50)]);
  assert.deepEqual(rows, [["", ""], ["", ""]]);
});

// ── headers ────────────────────────────────────────────────────────────────

test("a header row is claimed only when every cell in it has text", () => {
  assert.equal(headerRowsOf([["A", "B"], ["1", "2"]]), 1);
  assert.equal(headerRowsOf([["A", ""], ["1", "2"]]), 0, "a gap means it is data, not a header");
  assert.equal(headerRowsOf([["A", "B"]]), 0, "a lone row is the data, not a header for nothing");
});

// ── the whole region ───────────────────────────────────────────────────────

test("a ruled region becomes a DocTable with its header marked", () => {
  const rulings: Ruling[] = [
    ...segmented(0, true, 0, 800, 8),
    ...segmented(200, true, 0, 800, 8),
    ...segmented(400, true, 0, 800, 8),
    ...segmented(0, false, 0, 400, 4),
    ...segmented(400, false, 0, 400, 4),
    ...segmented(800, false, 0, 400, 4),
  ];
  const table = tableFromRegion(REGION, rulings, [
    at("Drug", 10, 10), at("Dose", 410, 10),
    at("Carvedilol", 10, 250), at("3.125mg", 410, 250),
  ]);
  assert.ok(table);
  assert.equal(table.headerRows, 1);
  assert.deepEqual(table.rows, [["Drug", "Dose"], ["Carvedilol", "3.125mg"]]);
});

test("🔴 a grid with no text in it is a border, not a table", () => {
  // Decorative boxes are ruled too. Emitting them as tables would fill a
  // document with empty grids that retrieval then has to wade through.
  const rulings: Ruling[] = [
    ...segmented(0, true, 0, 800, 4),
    ...segmented(400, true, 0, 800, 4),
    ...segmented(0, false, 0, 400, 4),
    ...segmented(800, false, 0, 400, 4),
  ];
  assert.equal(tableFromRegion(REGION, rulings, []), null);
});
