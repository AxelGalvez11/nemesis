import assert from "node:assert/strict";
import test from "node:test";

import { dropIndexAt, reorderBlocks, type DocBlock } from "./library-block-drag";

/** Blocks for a doc of paragraphs separated by one blank line. */
function blocksOf(doc: string): DocBlock[] {
  const out: DocBlock[] = [];
  let offset = 0;
  for (const part of doc.split("\n\n")) {
    out.push({ from: offset, index: out.length, to: offset + part.length });
    offset += part.length + 2;
  }
  return out;
}

const DOC = "First para.\n\nSecond para.\n\nThird para.";

test("a block dragged down lands before the block it was dropped on", () => {
  const moved = reorderBlocks(DOC, blocksOf(DOC), 0, 2);
  assert.equal(moved, "Second para.\n\nFirst para.\n\nThird para.");
});

test("a block dragged to the end goes last", () => {
  const moved = reorderBlocks(DOC, blocksOf(DOC), 0, 3);
  assert.equal(moved, "Second para.\n\nThird para.\n\nFirst para.");
});

test("a block dragged upward lands above its target", () => {
  const moved = reorderBlocks(DOC, blocksOf(DOC), 2, 0);
  assert.equal(moved, "Third para.\n\nFirst para.\n\nSecond para.");
});

// Dropping a block back where it started must not dispatch a transaction —
// otherwise every stray click lands in the undo history as an edit.
test("dropping a block onto its own edges is a no-op, not an empty edit", () => {
  assert.equal(reorderBlocks(DOC, blocksOf(DOC), 1, 1), null);
  assert.equal(reorderBlocks(DOC, blocksOf(DOC), 1, 2), null);
  assert.equal(reorderBlocks(DOC, blocksOf(DOC), 0, 5), null, "out of range");
  assert.equal(reorderBlocks(DOC, blocksOf(DOC), 9, 0), null, "no such block");
});

// The blank line is what keeps two paragraphs from merging into one when
// markdown is parsed again.
test("reordering keeps the blank line that separates blocks", () => {
  const moved = reorderBlocks(DOC, blocksOf(DOC), 0, 2) ?? "";
  assert.equal(moved.split("\n\n").length, 3);
  assert.ok(!moved.includes("\n\n\n"), "and does not accumulate extra ones");
});

// Frontmatter is excluded from the block list, so text before the first block
// and after the last must survive untouched.
test("text outside the block range is preserved verbatim", () => {
  const doc = "---\ntitle: Note\n---\n\nAlpha.\n\nBeta.";
  const blocks: DocBlock[] = [
    { from: 21, index: 0, to: 27 },
    { from: 29, index: 1, to: 34 },
  ];
  const moved = reorderBlocks(doc, blocks, 0, 2) ?? "";
  assert.ok(moved.startsWith("---\ntitle: Note\n---\n\n"), "properties stay at the top");
  assert.ok(moved.includes("Beta.\n\nAlpha."));
});

test("the drop target flips at each block's midpoint", () => {
  const midpoints = [50, 150, 250];
  assert.equal(dropIndexAt(10, midpoints), 0, "above the first block");
  assert.equal(dropIndexAt(60, midpoints), 1);
  assert.equal(dropIndexAt(200, midpoints), 2);
  assert.equal(dropIndexAt(999, midpoints), 3, "past the last block means the end");
});
