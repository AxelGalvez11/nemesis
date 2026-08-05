import assert from "node:assert/strict";
import { test } from "node:test";

import { blocksFromPages, type PdfTextItem } from "./pdf-blocks";
import { readingOrderGroups } from "./pdf-columns";

/** One text item at a place on the page. PDF space: y grows UPWARD. */
function item(text: string, x: number, y: number, width: number, size = 10): PdfTextItem {
  return { str: text, transform: [size, 0, 0, size, x, y], width, height: size };
}

/** A page of two columns, each `rows` lines, at the given y positions. Left
 *  column at x=60 (width 200), right at x=320 (width 200) — a 60pt gutter. */
function twoColumnPage(rows: number): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y = 700 - row * 14;
    items.push(item(`left${row}`, 60, y, 200));
    items.push(item(`right${row}`, 320, y, 200));
  }
  return items;
}

test("a two-column page is read down one column, then down the other", () => {
  const groups = readingOrderGroups(twoColumnPage(10));
  assert.equal(groups.length, 2, "expected one group per column");
  assert.deepEqual(groups[0]?.map((entry) => entry.str), Array.from({ length: 10 }, (_, row) => `left${row}`));
  assert.deepEqual(groups[1]?.map((entry) => entry.str), Array.from({ length: 10 }, (_, row) => `right${row}`));
});

test("a single-column page is left exactly as it was", () => {
  const items = Array.from({ length: 20 }, (_, row) => item(`line${row}`, 60, 700 - row * 14, 460));
  const groups = readingOrderGroups(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.length, items.length);
});

test("a full-width heading keeps its place between the columns above and below it", () => {
  const items = [
    ...twoColumnPage(6).map((entry) => ({ ...entry, transform: [...entry.transform.slice(0, 5), (entry.transform[5] ?? 0)] })),
    item("A HEADING ACROSS THE WHOLE PAGE", 60, 700 - 6 * 14 - 20, 460, 14),
    ...twoColumnPage(4).map((entry) => {
      const next = { ...entry, transform: [...entry.transform] };
      next.transform[5] = (entry.transform[5] ?? 0) - 6 * 14 - 60;
      next.str = `below-${entry.str}`;
      return next;
    }),
  ];
  const order = readingOrderGroups(items).flat().map((entry) => entry.str);
  const heading = order.indexOf("A HEADING ACROSS THE WHOLE PAGE");
  assert.ok(heading > 0, "heading should not come first");
  // Everything above the heading precedes it; everything below follows it.
  assert.ok(order.slice(0, heading).every((text) => !text.startsWith("below-")), `order: ${JSON.stringify(order)}`);
  assert.ok(order.slice(heading + 1).every((text) => text.startsWith("below-")), `order: ${JSON.stringify(order)}`);
});

test("a lopsided gap is not mistaken for a column break", () => {
  // One short indented line beside a wide body is not a second column.
  const items = [
    ...Array.from({ length: 18 }, (_, row) => item(`body${row}`, 60, 700 - row * 14, 460)),
    item("note", 320, 400, 60),
  ];
  assert.equal(readingOrderGroups(items).length, 1);
});

test("right-to-left pages read right column first", () => {
  const items = twoColumnPage(10).map((entry) => ({ ...entry, dir: "rtl" }));
  const groups = readingOrderGroups(items);
  assert.equal(groups[0]?.[0]?.str, "right0", "RTL should start with the right-hand column");
});

test("columns do not interleave into one line, and do not run into each other", () => {
  // 🔴 The regression this pins. A real Journal of Cardiac Failure article is
  // two-column on all 13 pages, and every reconstructed line was a splice of
  // both columns: "were atPatients'characteristics and GDMT were summarized
  // for least 18 years of age". Two columns sharing a baseline must never
  // become one line.
  const items: PdfTextItem[] = [];
  for (let row = 0; row < 8; row += 1) {
    const y = 700 - row * 14;
    items.push(item(`alpha${row}`, 60, y, 200));
    items.push(item(`beta${row}`, 320, y, 200));
  }
  const blocks = blocksFromPages([{ unit: 1, items }]);
  const text = blocks.map((block) => block.text).join("\n");
  assert.ok(!/alpha\d+beta/.test(text), `columns interleaved: ${JSON.stringify(text)}`);
  assert.ok(/alpha0/.test(text) && /beta0/.test(text), "both columns should survive");
  // The foot of one column must not run into the head of the next — they belong
  // to DIFFERENT blocks, so no single block may hold both.
  assert.ok(
    !blocks.some((block) => block.text.includes("alpha7") && block.text.includes("beta0")),
    `column break lost: ${JSON.stringify(blocks.map((block) => block.text))}`,
  );
});

test("a word broken by the typesetter rejoins without a stray space", () => {
  // Real: "contraindica-" / "tions" used to reconstruct as "contraindica- tions".
  const items = [
    item("Patients were considered to have relative contraindica-", 60, 700, 460),
    item("tions to initiation if they were not prescribed the class.", 60, 686, 460),
  ];
  const blocks = blocksFromPages([{ unit: 1, items }]);
  const text = blocks.map((block) => block.text).join(" ");
  assert.ok(text.includes("contraindica-tions"), `expected the hyphen closed up, got ${JSON.stringify(text)}`);
  assert.ok(!text.includes("contraindica- tions"));
});

test("a TABLE is never read down its columns", () => {
  // 🔴 The regression this pins. Column detection alone turned the Course
  // Schedule page of a real syllabus into
  // "MHC structure 11-11:50 -function, CT / 8/18antigenDr. Hole" — every row
  // scrambled. A table has a gutter just like a two-column page; what it does
  // not have is lines that run the width of their column.
  const items: PdfTextItem[] = [];
  const rows = [
    ["8/18", "MHC structure and function"],
    ["8/21", "Adaptive immunity"],
    ["8/25", "Lymphocyte development"],
    ["8/28", "Antigen recognition"],
    ["9/01", "Innate immunity"],
    ["9/04", "Complement"],
  ];
  rows.forEach(([date, topic], row) => {
    const y = 700 - row * 20;
    items.push(item(date ?? "", 60, y, 34)); // short cell in a wide band
    items.push(item(topic ?? "", 320, y, 190));
  });
  assert.equal(readingOrderGroups(items).length, 1, "a table must stay in reading (row) order");
});

test("a short two-block layout is not a column layout", () => {
  // Two stacks of three lines side by side is a table or a form, not columns.
  const items: PdfTextItem[] = [];
  for (let row = 0; row < 3; row += 1) {
    const y = 700 - row * 16;
    items.push(item(`aaa${row}`, 60, y, 200));
    items.push(item(`bbb${row}`, 320, y, 200));
  }
  items.push(...Array.from({ length: 8 }, (_, row) => item(`tail${row}`, 60, 600 - row * 14, 460)));
  assert.equal(readingOrderGroups(items).length, 1);
});
