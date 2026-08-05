import assert from "node:assert/strict";
import { test } from "node:test";

import { blocksFromPages, bodyFontSize, linesFromItems, type PdfTextItem } from "./pdf-blocks";
import { at } from "./test-helpers";

/** A text item as pdf.js reports one: transform is [a,b,c,d,x,y] and the PDF
 *  origin is the BOTTOM-left, so a bigger y is higher on the page. */
function item(str: string, x: number, y: number, size: number, options: Partial<PdfTextItem> = {}): PdfTextItem {
  return {
    str,
    dir: "ltr",
    transform: [size, 0, 0, size, x, y],
    width: str.length * size * 0.5,
    height: size,
    fontName: "Helvetica",
    ...options,
  };
}

test("items on the same baseline become one line, left to right", () => {
  const lines = linesFromItems([item("world", 150, 700, 12), item("hello ", 64, 700, 12)]);
  assert.equal(lines.length, 1);
  assert.equal(at(lines, 0).text, "hello world");
});

test("lines come out top to bottom even though PDF y counts upward", () => {
  const lines = linesFromItems([item("bottom", 64, 100, 12), item("top", 64, 700, 12), item("middle", 64, 400, 12)]);
  assert.deepEqual(lines.map((line) => line.text), ["top", "middle", "bottom"]);
});

test("right-to-left text is ordered from the right", () => {
  const lines = linesFromItems([
    item("الدستوري", 64, 700, 12, { dir: "rtl" }),
    item("القانون ", 200, 700, 12, { dir: "rtl" }),
  ]);
  assert.equal(at(lines, 0).dir, "rtl");
  assert.equal(at(lines, 0).text, "القانون الدستوري");
});

test("body size is the size most of the TEXT is set in, not most lines", () => {
  const lines = linesFromItems([
    item("A Very Large Title Here", 64, 700, 32),
    item("body text body text body text body text", 64, 660, 11),
    item("more body text more body text more text", 64, 640, 11),
    item("still more body text still more body", 64, 620, 11),
  ]);
  assert.equal(bodyFontSize(lines), 11);
});

test("a bigger line reads as a heading and body text as a paragraph", () => {
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [
        item("Chapter One", 64, 700, 24),
        item("This is ordinary running text on the page.", 64, 660, 11),
        item("It continues on a second line here.", 64, 642, 11),
      ],
    },
  ]);
  assert.deepEqual(blocks.map((block) => block.kind), ["heading", "paragraph"]);
  assert.equal(at(blocks, 0).text, "Chapter One");
  assert.equal(at(blocks, 0).level, 1);
  assert.equal(at(blocks, 1).text, "This is ordinary running text on the page. It continues on a second line here.");
});

test("heading levels follow measured size order across the whole document", () => {
  const blocks = blocksFromPages([
    { unit: 1, items: [item("Part", 64, 700, 28), item("Section", 64, 660, 18), item("body body body body", 64, 620, 11)] },
    { unit: 2, items: [item("Another Section", 64, 700, 18), item("more body text here", 64, 660, 11)] },
  ]);
  const headings = blocks.filter((block) => block.kind === "heading");
  assert.deepEqual(headings.map((heading) => [heading.text, heading.level]), [
    ["Part", 1],
    ["Section", 2],
    ["Another Section", 2],
  ]);
});

test("blocks remember which page they were measured on", () => {
  const blocks = blocksFromPages([
    { unit: 4, items: [item("only text on page four here", 64, 700, 11)] },
    { unit: 5, items: [item("only text on page five here", 64, 700, 11)] },
  ]);
  assert.deepEqual(blocks.map((block) => block.unit), [4, 5]);
});

test("bullets become list items and lose their marker", () => {
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [
        item("• first point of the list", 64, 700, 11),
        item("• second point of the list", 64, 682, 11),
        item("• third point of the list", 64, 664, 11),
      ],
    },
  ]);
  assert.deepEqual(blocks.map((block) => block.kind), ["list-item", "list-item", "list-item"]);
  assert.equal(at(blocks, 0).text, "first point of the list");
});

test("numbered and lettered markers count too", () => {
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [item("1. first numbered point", 64, 700, 11), item("(a) a lettered point here", 64, 682, 11)],
    },
  ]);
  assert.deepEqual(blocks.map((block) => block.kind), ["list-item", "list-item"]);
  assert.deepEqual(blocks.map((block) => block.text), ["first numbered point", "a lettered point here"]);
});

test("a wrapped list item stays with its bullet instead of becoming a paragraph", () => {
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [
        item("• a point long enough to wrap", 64, 700, 11),
        item("onto a second indented line", 76, 682, 11),
        item("• the next point", 64, 664, 11),
      ],
    },
  ]);
  assert.deepEqual(blocks.map((block) => block.kind), ["list-item", "list-item"]);
  assert.equal(at(blocks, 0).text, "a point long enough to wrap onto a second indented line");
});

test("a big vertical gap starts a new paragraph", () => {
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [
        item("first paragraph line one here", 64, 700, 11),
        item("first paragraph line two here", 64, 682, 11),
        item("second paragraph after a gap", 64, 620, 11),
      ],
    },
  ]);
  assert.deepEqual(blocks.map((block) => block.kind), ["paragraph", "paragraph"]);
  assert.equal(at(blocks, 0).text, "first paragraph line one here first paragraph line two here");
});

test("a document set entirely in bold does not become all headings", () => {
  const bold = { fontName: "Helvetica-Bold" };
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [
        item("every line here is bold text", 64, 700, 11, bold),
        item("and so is this one as well", 64, 682, 11, bold),
        item("and this third line also", 64, 664, 11, bold),
        item("and a fourth for good measure", 64, 646, 11, bold),
      ],
    },
  ]);
  assert.equal(blocks.filter((block) => block.kind === "heading").length, 0);
});

test("one bold line among plain ones reads as a heading", () => {
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [
        item("Definitions", 64, 700, 11, { fontName: "Helvetica-Bold" }),
        item("the first plain line of the section", 64, 682, 11),
        item("the second plain line of it", 64, 664, 11),
        item("the third plain line of it", 64, 646, 11),
      ],
    },
  ]);
  assert.equal(at(blocks, 0).kind, "heading");
  assert.equal(at(blocks, 0).text, "Definitions");
});

test("a page of only CJK text is measured the same way as a Latin one", () => {
  // Deliberately short strings: any rule counting characters would call this
  // page empty. Only geometry decides here.
  const blocks = blocksFromPages([
    {
      unit: 1,
      items: [
        item("第一章", 64, 700, 24),
        item("電気回路の基礎について説明する", 64, 660, 11),
        item("次に抵抗と電流の関係を扱う", 64, 642, 11),
      ],
    },
  ]);
  assert.deepEqual(blocks.map((block) => block.kind), ["heading", "paragraph"]);
  assert.equal(at(blocks, 0).text, "第一章");
});

test("empty and whitespace-only items are ignored", () => {
  assert.deepEqual(linesFromItems([item("   ", 64, 700, 11), item("", 64, 700, 11)]), []);
  assert.deepEqual(blocksFromPages([{ unit: 1, items: [] }]), []);
});
