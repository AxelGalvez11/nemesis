import assert from "node:assert/strict";
import test from "node:test";

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";

import { documentBlocks, dropIndexAt, reorderBlocks, type DocBlock } from "./library-block-drag";

/** Blocks for a doc of paragraphs separated by one blank line. */
function blocksOf(doc: string): DocBlock[] {
  const out: DocBlock[] = [];
  let offset = 0;
  for (const part of doc.split("\n\n")) {
    out.push({ from: offset, index: out.length, kind: "block", to: offset + part.length });
    offset += part.length + 2;
  }
  return out;
}

/** The real tree walk, against the same markdown config the editor loads. */
function blocksFor(doc: string): DocBlock[] {
  return documentBlocks(EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] }));
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
    { from: 21, index: 0, kind: "block", to: 27 },
    { from: 29, index: 1, kind: "block", to: 34 },
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

// ── the tree walk ────────────────────────────────────────────────────────────
// The owner's report: "the dragability of note components is not applicable to
// individual bullet points. it groups bullet points together." A list used to
// be ONE block, so the handle picked up every bullet at once.

test("each bullet is its own block, not one block for the list", () => {
  const blocks = blocksFor("# Head\n\nPara.\n\n- one\n- two\n- three\n");
  assert.deepEqual(blocks.map((block) => block.kind), ["block", "block", "list-item", "list-item", "list-item"]);
});

test("a numbered list splits per item too", () => {
  const blocks = blocksFor("1. first\n2. second\n");
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every((block) => block.kind === "list-item"));
});

// A sub-bullet has no handle of its own; it rides inside its parent's range, so
// dragging the parent takes its children along.
test("a nested sub-list rides inside its parent item", () => {
  const doc = "- one\n- two\n  - nested\n- three\n";
  const blocks = blocksFor(doc);
  assert.equal(blocks.length, 3, "three top-level bullets, not four");
  assert.equal(doc.slice(blocks[1]!.from, blocks[1]!.to), "- two\n  - nested");
});

test("headings, quotes, code fences and tables each stay one block", () => {
  const blocks = blocksFor("# Head\n\n> Quoted.\n\n```js\nconst a = 1;\n```\n\nTail.\n");
  assert.equal(blocks.length, 4);
  assert.ok(blocks.every((block) => block.kind === "block"));
});

test("blank space between blocks is not a block", () => {
  assert.equal(blocksFor("\n\n\nAlpha.\n\n\n\nBeta.\n\n").length, 2);
});

// ── moving items in and out of lists ─────────────────────────────────────────
// The separator is decided by whichever two pieces end up ADJACENT. This is the
// whole correctness surface of per-item dragging.

test("a bullet moved within its list keeps the list tight", () => {
  const doc = "- one\n- two\n- three";
  const moved = reorderBlocks(doc, blocksFor(doc), 2, 0);
  assert.equal(moved, "- three\n- one\n- two");
  assert.ok(!moved?.includes("\n\n"), "a blank line here would make the list loose");
});

test("a bullet dropped between two paragraphs becomes its own list", () => {
  const doc = "Alpha.\n\n- one\n- two\n\nOmega.";
  // blocks: [Alpha, one, two, Omega] — move "two" to the very end.
  const moved = reorderBlocks(doc, blocksFor(doc), 2, 4);
  assert.equal(moved, "Alpha.\n\n- one\n\nOmega.\n\n- two");
});

test("a paragraph dropped into a list splits that list in two", () => {
  const doc = "- one\n- two\n- three\n\nOmega.";
  // blocks: [one, two, three, Omega] — move "Omega." between one and two.
  const moved = reorderBlocks(doc, blocksFor(doc), 3, 1);
  assert.equal(moved, "- one\n\nOmega.\n\n- two\n- three");
});

test("a heading dragged below a list does not glue itself to the last bullet", () => {
  const doc = "## Head\n\n- one\n- two";
  const moved = reorderBlocks(doc, blocksFor(doc), 0, 3);
  assert.equal(moved, "- one\n- two\n\n## Head");
});

// Markdown renders an ordered list from its FIRST marker and ignores the rest,
// so a reordered "1. 3. 2." still reads 1, 2, 3. Nothing is renumbered: the
// student's own markers are theirs, and rewriting lines they did not drag would
// be a bigger surprise than out-of-order source.
test("reordering a numbered list leaves the student's markers alone", () => {
  const doc = "1. first\n2. second\n3. third";
  assert.equal(reorderBlocks(doc, blocksFor(doc), 2, 0), "3. third\n1. first\n2. second");
});
