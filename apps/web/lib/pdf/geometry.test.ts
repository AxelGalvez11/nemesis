import assert from "node:assert/strict";
import { test } from "node:test";

import {
  columnSplit,
  groupLines,
  groupParagraphs,
  headingLevels,
  readingOrder,
  toRelative,
  unionBox,
  type TextItem,
} from "./geometry";

/** A run of text at a position, sized like ordinary body type. */
function item(text: string, x: number, y: number, height = 10): TextItem {
  return { height, text, width: text.length * height * 0.5, x, y };
}

test("items sharing a baseline become one line, in x order", () => {
  const lines = groupLines([item("world", 60, 100), item("Hello", 10, 100.4)]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.text, "Hello world");
});

// 🔴 THE TOLERANCE MUST SCALE WITH THE TYPE.
// A fixed tolerance either fuses two lines of a footnote or splits a title.
test("a small font and a large one on one page each line up correctly", () => {
  const footnote = groupLines([item("a", 10, 100, 6), item("b", 10, 104, 6)]);
  assert.equal(footnote.length, 2, "6 pt lines 4 pt apart are two lines");
  const title = groupLines([item("Big", 10, 100, 30), item("Title", 60, 104, 30)]);
  assert.equal(title.length, 1, "30 pt runs 4 pt apart are one line");
});

test("a gap between runs becomes a space; touching runs do not", () => {
  const [line] = groupLines([
    { height: 10, text: "the", width: 15, x: 10, y: 100 },
    { height: 10, text: "result", width: 30, x: 25, y: 100 },
  ]);
  assert.equal(line!.text, "theresult", "runs that touch are one word");

  const [spaced] = groupLines([
    { height: 10, text: "the", width: 15, x: 10, y: 100 },
    { height: 10, text: "result", width: 30, x: 40, y: 100 },
  ]);
  assert.equal(spaced!.text, "the result");
});

// 🔴 THE DEFECT THIS MODULE EXISTS FOR.
// Concatenating a two-column page in draw order gives alternating half
// sentences. This asserts the left column is read out completely first.
/** A column of wrapped prose: lines that run most of the column's width. */
function column(prefix: string, x: number, rows: number): TextItem[] {
  return Array.from({ length: rows }, (_, row) => ({
    height: 10,
    // Slight variation, as wrapped text has — but every line near full width.
    text: `${prefix}${row} ${"word ".repeat(8 - (row % 2))}`.trim(),
    width: 230 - (row % 2) * 12,
    x,
    y: 100 + row * 14,
  }));
}

test("a two-column page reads down one column, then the other", () => {
  const items = [...column("L", 40, 8), ...column("R", 330, 8)];
  const ordered = readingOrder(groupLines(items), 612);
  assert.deepEqual(
    ordered.map((l) => l.text.slice(0, 2)),
    ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7"],
  );
});

// 🔴 THE FALSE POSITIVE THAT WOULD BE WORSE THAN THE BUG.
// A term-and-definition list has a clean empty gutter and balanced sides, so a
// gutter test alone calls it two columns — and reading it that way returns every
// term first and every definition afterwards, permanently unpairing them.
test("a term-and-definition list is not two columns", () => {
  const items: TextItem[] = [];
  for (let row = 0; row < 8; row += 1) {
    items.push({ height: 10, text: `Term ${row}`, width: 45, x: 72, y: 100 + row * 16 });
    items.push({ height: 10, text: `the meaning of term ${row}`, width: 220, x: 220, y: 100 + row * 16 });
  }
  assert.equal(columnSplit(groupLines(items), 612), null);
});

// 🔴 A FULL-WIDTH ELEMENT MEANS ONE COLUMN, AND THAT IS THE RIGHT ANSWER.
// Reading a page in column order when a heading spans it tears the heading in
// half — worse than the interleaving the column rule is meant to fix.
test("a heading spanning the page defeats the column split", () => {
  const items: TextItem[] = [
    { height: 14, text: "A heading that runs the whole width of the page", width: 480, x: 40, y: 80 },
    ...column("L", 40, 8),
    ...column("R", 330, 8),
  ];
  assert.equal(columnSplit(groupLines(items), 612), null);
});

test("a single-column page has no split and reads top to bottom", () => {
  const items = Array.from({ length: 10 }, (_, row) => item(`line ${row} of ordinary body text`, 72, 100 + row * 14));
  assert.equal(columnSplit(groupLines(items), 612), null);
  assert.deepEqual(readingOrder(groupLines(items), 612).map((l) => l.text.slice(0, 6)), [
    "line 0", "line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "line 7", "line 8", "line 9",
  ]);
});

test("a stray margin note does not count as a column", () => {
  const items = Array.from({ length: 10 }, (_, row) => item(`body line ${row}`, 72, 100 + row * 14));
  items.push(item("7", 560, 700));
  assert.equal(columnSplit(groupLines(items), 612), null);
});

test("a widening vertical gap starts a new paragraph", () => {
  const items = [
    item("first paragraph line one", 72, 100),
    item("first paragraph line two", 72, 112),
    item("second paragraph after a gap", 72, 160),
  ];
  const groups = groupParagraphs(readingOrder(groupLines(items), 612));
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.lines.length, 2);
});

// 🔴 STRUCTURAL SIGNALS ONLY. This must hold for any discipline, so the test
// uses text from one field and asserts on shape, never on the words.
test("a larger, shorter group is a heading; a larger, longer one is not", () => {
  const items = [
    item("Estoppel", 72, 60, 18),
    ...Array.from({ length: 6 }, (_, row) => item(`body text line ${row} of the section`, 72, 90 + row * 12, 10)),
  ];
  const groups = groupParagraphs(readingOrder(groupLines(items), 612));
  const levels = headingLevels(groups);
  assert.equal(levels[0], 1, "the short 18 pt line is a heading");
  assert.equal(levels[1], null, "the 10 pt body is not");
});

test("two heading sizes become two levels, largest first", () => {
  const items = [
    item("Title", 72, 40, 24),
    item("Section", 72, 80, 16),
    ...Array.from({ length: 8 }, (_, row) => item(`body line ${row}`, 72, 110 + row * 12, 10)),
  ];
  const levels = headingLevels(groupParagraphs(readingOrder(groupLines(items), 612)));
  assert.equal(levels[0], 1);
  assert.equal(levels[1], 2);
});

// A pull quote set one point larger is not a heading; treating it as one puts a
// paragraph into the heading path of everything beneath it.
test("a long block in a larger font is not a heading", () => {
  const long = "x".repeat(260);
  const items = [
    item(long, 72, 60, 13),
    ...Array.from({ length: 8 }, (_, row) => item(`body line ${row}`, 72, 100 + row * 12, 10)),
  ];
  assert.equal(headingLevels(groupParagraphs(readingOrder(groupLines(items), 612)))[0], null);
});

test("unionBox covers every box and an empty list is a zero box", () => {
  assert.deepEqual(unionBox([{ height: 4, width: 6, x: 10, y: 20 }, { height: 10, width: 2, x: 4, y: 30 }]), {
    height: 20,
    width: 12,
    x: 4,
    y: 20,
  });
  assert.deepEqual(unionBox([]), { height: 0, width: 0, x: 0, y: 0 });
});

test("a relative rect is 0..1 and clamped", () => {
  assert.deepEqual(toRelative({ height: 100, width: 306, x: 0, y: 0 }, 612, 792), {
    height: 100 / 792,
    width: 0.5,
    x: 0,
    y: 0,
  });
  const clamped = toRelative({ height: 2000, width: 2000, x: -50, y: -50 }, 612, 792);
  assert.deepEqual(clamped, { height: 1, width: 1, x: 0, y: 0 });
});

test("a zero-sized page yields a zero rect rather than a division by zero", () => {
  assert.deepEqual(toRelative({ height: 10, width: 10, x: 0, y: 0 }, 0, 0), {
    height: 0,
    width: 0,
    x: 0,
    y: 0,
  });
});

// ── The column gutter ───────────────────────────────────────────────────────
//
// 🔴 THE DEFECT THESE PIN. `groupLines` allowed a join when the horizontal gap
// was under 2.5x the item's OWN font height. That licence is a property of the
// TYPE, while a gutter is a property of the PAGE, so the bigger the text the
// more freely it could weld two columns together — and the biggest text on a
// page is its title. Measured on a real two-column paper, one emitted block
// spanned 75% of the page: the title's second line married to the right
// column's body text.
//
// Worse, the damage was self-concealing: `columnSplit` refuses any candidate
// boundary that a line CROSSES, so a single fused line vetoed the split,
// `readingOrder` fell back to top-to-bottom, and the columns interleaved for the
// rest of the page. The fusion destroyed the evidence the detector needed.

test("🔴 a title fragment does not marry the next column's body text", () => {
  // The real geometry, from text_multicolumns__2col_paper.pdf page 1.
  const title = { height: 15.1, text: "How Prompt Politeness Affects", width: 198.8, x: 80.7, y: 88.1 };
  const body = { height: 10.1, text: "through a natural language interface, there ", width: 216, x: 324, y: 82.8 };
  const gutter = 306;

  assert.equal(groupLines([title, body]).length, 1, "without the gutter they fuse — the defect");
  const split = groupLines([title, body], gutter);
  assert.equal(split.length, 2, "with it they stay apart");
  assert.ok(split.every((l) => l.width < 300), "and neither line spans the page");
});

test("🔴 the check is SYMMETRIC — the right column is often reached FIRST", () => {
  // Items sort by y then x, and the two columns' baselines differ by a few
  // points, so the right column's run is frequently emitted first and the left
  // column's run joins onto it RIGHT-TO-LEFT. A one-directional test sees
  // nothing wrong with that, which is why the first version of this fix changed
  // no output at all.
  const rightFirst = { height: 10, text: "right column text", width: 200, x: 324, y: 82 };
  const leftSecond = { height: 15, text: "left column text", width: 190, x: 80, y: 88 };
  assert.equal(groupLines([rightFirst, leftSecond], 306).length, 2);
});

test("a gutter of null leaves grouping exactly as it was", () => {
  const items = [item("one", 50, 100), item("two", 90, 100), item("far", 400, 100)];
  assert.deepEqual(
    groupLines(items, null).map((l) => l.text),
    groupLines(items).map((l) => l.text),
  );
});

test("🔴 runs on ONE side of the gutter still join normally", () => {
  // The rule forbids crossing, not joining. Two words inside the left column
  // must still make one line, or every column would shatter into single words.
  const a = item("hello", 80, 100);
  const b = item("world", 80 + a.width + 3, 100);
  assert.equal(groupLines([a, b], 306).length, 1);
});

test("columnSplit reads raw items, which is the only moment it can be asked honestly", () => {
  // 🔴 REAL COLUMN GEOMETRY, NOT A SKETCH. A first attempt used 100pt columns
  // with a 170pt trough and was correctly REFUSED: `columnSplit` requires the
  // gutter to be narrow beside the columns it separates, which is the test that
  // tells a two-column article from a term-and-definition list. Typeset columns
  // are ~250pt with a ~30pt gutter on a 612pt page.
  const wide = (text: string, x: number, y: number): TextItem => ({ height: 10, text, width: 250, x, y });
  const items: TextItem[] = [];
  for (let i = 0; i < 5; i += 1) {
    items.push(wide("left side words here", 60, 100 + i * 14));
    items.push(wide("right side words here", 340, 100 + i * 14));
  }
  const split = columnSplit(items, 612);
  assert.ok(split !== null, "a real gutter is found");
  assert.ok(split! > 200 && split! < 400, `split sits in the gutter, got ${split}`);
});

test("🔴 a page with a full-width line reports NO columns — reading it in column order would scramble it", () => {
  const wide = (text: string, x: number, y: number, w = 250): TextItem => ({ height: 10, text, width: w, x, y });
  const items: TextItem[] = [wide("a headline that runs the whole width", 60, 60, 530)];
  for (let i = 0; i < 5; i += 1) {
    items.push(wide("left side words", 60, 100 + i * 14));
    items.push(wide("right side words", 340, 100 + i * 14));
  }
  assert.equal(columnSplit(items, 612), null);
});
