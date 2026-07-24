// Deno unit tests (repo convention) for the note-block model behind the
// phone editor's live-preview mode.
// Run: deno test --no-check apps/mobile/src/lib/note-blocks.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appendEmptyBlock,
  mergeBlockIntoPrevious,
  blockIndexAtOffset,
  blockStartOffset,
  joinBlocks,
  replaceBlockBody,
  splitBlocks,
} from "./note-blocks.ts";

const roundtrips = (md: string) => assertEquals(joinBlocks(splitBlocks(md)), md);

Deno.test("split/join is lossless across shapes", () => {
  roundtrips("");
  roundtrips("one paragraph, no trailing newline");
  roundtrips("trailing newline\n");
  roundtrips("# Head\n\nBody line one\nline two\n\n- a\n- b\n");
  roundtrips("\n\nleading blanks\n");
  roundtrips("gap run\n\n\n\nafter big gap\n\n");
  roundtrips("| a | b |\n|---|---|\n| 1 | 2 |\n");
  roundtrips("---\ntitle: x\ntags: [y]\n---\n\nprose\n");
  roundtrips("```js\ncode\n\nstill code after blank line\n```\n\nafter\n");
  roundtrips("~~~\nunclosed fence to EOF\n");
  roundtrips("   \n\t\n  mixed blank leading\n");
});

Deno.test("blank lines separate blocks; PROSE bodies hold contiguous lines", () => {
  // Prose keeps its contiguous lines. The list does NOT: as of 2026-07-24 each
  // item is its own reveal unit, so tapping one shows only that item's dash
  // (see the per-line tests at the foot of this file).
  const nb = splitBlocks("# Head\n\npara one\npara one line two\n\n- a\n- b\n");
  assertEquals(nb.blocks.map((b) => b.body), ["# Head\n", "para one\npara one line two\n", "- a\n", "- b\n"]);
  assertEquals(nb.leading, "");
});

Deno.test("fenced code with interior blank lines stays ONE block", () => {
  const nb = splitBlocks("before\n\n```\nline\n\nline after blank\n```\n\nafter\n");
  assertEquals(nb.blocks.length, 3);
  assertEquals(nb.blocks[1].body, "```\nline\n\nline after blank\n```\n");
});

Deno.test("leading frontmatter stays ONE block", () => {
  const nb = splitBlocks("---\ntitle: x\n---\n\nprose\n");
  assertEquals(nb.blocks.length, 2);
  assertEquals(nb.blocks[0].body, "---\ntitle: x\n---\n");
  assertEquals(nb.blocks[1].body, "prose\n");
});

Deno.test("a lone --- mid-document is a plain (hr) block, not frontmatter", () => {
  const nb = splitBlocks("prose\n\n---\n\nmore\n");
  assertEquals(nb.blocks.map((b) => b.body), ["prose\n", "---\n", "more\n"]);
});

Deno.test("replaceBlockBody swaps one body, keeps gaps, stays immutable", () => {
  const nb = splitBlocks("a\n\nb\n");
  const next = replaceBlockBody(nb, 1, "B edited\n");
  assertEquals(joinBlocks(next), "a\n\nB edited\n");
  assertEquals(joinBlocks(nb), "a\n\nb\n");
});

Deno.test("blockStartOffset / blockIndexAtOffset agree, including after a re-split shift", () => {
  const nb = splitBlocks("\nfirst\n\nsecond block\n\nthird\n");
  for (let i = 0; i < nb.blocks.length; i += 1) {
    assertEquals(blockIndexAtOffset(nb, blockStartOffset(nb, i)), i);
  }
  // Typing a blank line into block 1 splits it in two; the offset that used to
  // open block 2 ("third") now lands on the block that still holds that text.
  const edited = splitBlocks(joinBlocks(replaceBlockBody(nb, 1, "second\n\nblock\n")));
  const thirdOffset = joinBlocks(edited).indexOf("third");
  assertEquals(edited.blocks[blockIndexAtOffset(edited, thirdOffset)].body, "third\n");
});

Deno.test("blockIndexAtOffset clamps to the last block", () => {
  const nb = splitBlocks("only\n");
  assertEquals(blockIndexAtOffset(nb, 9999), 0);
});

Deno.test("appendEmptyBlock pads the gap so typed text becomes a real new block", () => {
  for (const doc of ["abc", "abc\n", "abc\n\n"]) {
    const appended = appendEmptyBlock(splitBlocks(doc));
    const typed = joinBlocks(replaceBlockBody(appended, appended.blocks.length - 1, "new"));
    const resplit = splitBlocks(typed);
    assertEquals(resplit.blocks.length, 2, `doc ${JSON.stringify(doc)}`);
    assertEquals(resplit.blocks[1].body, "new");
  }
});

Deno.test("appendEmptyBlock left untyped vanishes on normalize", () => {
  const appended = appendEmptyBlock(splitBlocks("abc\n"));
  assertEquals(splitBlocks(joinBlocks(appended)).blocks.length, 1);
});

Deno.test("appendEmptyBlock on an empty document yields one editable block", () => {
  const nb = appendEmptyBlock(splitBlocks(""));
  assertEquals(nb.blocks.length, 1);
  assertEquals(joinBlocks(nb), "");
});

Deno.test("CRLF documents: blank/fence/frontmatter detection works, bytes preserved", () => {
  const doc = "---\r\ntitle: x\r\n---\r\n\r\nprose one\r\n\r\n```\r\ncode\r\n\r\nstill code\r\n```\r\n\r\nafter\r\n";
  roundtrips(doc);
  const nb = splitBlocks(doc);
  assertEquals(nb.blocks.length, 4);
  assertEquals(nb.blocks[0].body, "---\r\ntitle: x\r\n---\r\n");
  assertEquals(nb.blocks[2].body, "```\r\ncode\r\n\r\nstill code\r\n```\r\n");
});

// --- tables get their own block (owner 2026-07-24) ---------------------------
//
// "Table in editing mode should not show the markdown at all." The grid editor
// existed and was wired; it simply never fired, because a table written
// directly under a heading (which is how everyone writes one) shared a block
// with it and isTableBlock said no.

Deno.test("a table under a heading is its own block, with no blank line between", () => {
  const nb = splitBlocks("## Results\n| drug | dose |\n|---|---|\n| aspirin | 81mg |\n");
  assertEquals(nb.blocks.length, 2);
  assertEquals(nb.blocks[0].body, "## Results\n");
  assertEquals(nb.blocks[1].body, "| drug | dose |\n|---|---|\n| aspirin | 81mg |\n");
});

Deno.test("a sentence written UNDER a table is not swallowed by it", () => {
  // The worse half of the same bug: parseTable treats every line after the
  // delimiter as a body row, so this sentence used to be absorbed into the grid
  // and rewritten as "| That is all. |  |" the moment it saved.
  const nb = splitBlocks("| a | b |\n|---|---|\n| 1 | 2 |\nThat is all.\n");
  assertEquals(nb.blocks.length, 2);
  assertEquals(nb.blocks[0].body, "| a | b |\n|---|---|\n| 1 | 2 |\n");
  assertEquals(nb.blocks[1].body, "That is all.\n");
});

Deno.test("a pipe in ordinary prose does NOT start a table", () => {
  // Only a delimiter row makes a table. Without this guard, a sentence
  // containing "|" would be torn out of its own paragraph.
  const md = "Use a | to separate them\nand carry on writing.\n";
  const nb = splitBlocks(md);
  assertEquals(nb.blocks.length, 1);
  assertEquals(joinBlocks(nb), md);
});

Deno.test("splitting tables out stays byte-for-byte lossless", () => {
  // The whole block model rests on this: entering and leaving edit mode must
  // never rewrite a note the student didn't touch.
  for (
    const md of [
      "## Results\n| a | b |\n|---|---|\n| 1 | 2 |\nAfter.\n",
      "Intro line\n| a | b |\n|---|---|\n\n\nTail\n",
      "| a | b |\n|---|---|\n",
      "- bullet\n| a | b |\n|---|---|\n| 1 | 2 |\n- another\n",
      "\n\n| a | b |\n|---|---|\n",
      "| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n",
    ]
  ) {
    assertEquals(joinBlocks(splitBlocks(md)), md, `lossless for ${JSON.stringify(md)}`);
  }
});

Deno.test("a table inside a fenced code block is left alone", () => {
  // Fences are captured whole and must stay that way — a table drawn inside a
  // code sample is text, not a grid to edit.
  const md = "```\n| a | b |\n|---|---|\n```\n";
  const nb = splitBlocks(md);
  assertEquals(nb.blocks.length, 1);
  assertEquals(joinBlocks(nb), md);
});

// --- one reveal unit per line, where a line stands alone (owner 2026-07-24) ---

Deno.test("a list becomes one block per item, so only the tapped item shows its dash", () => {
  const md = "- alpha\n- beta\n- gamma\n";
  const nb = splitBlocks(md);
  assertEquals(nb.blocks.map((b) => b.body), ["- alpha\n", "- beta\n", "- gamma\n"]);
  assertEquals(joinBlocks(nb), md);
});

Deno.test("numbered lists, tasks, quotes and stacked headings split the same way", () => {
  assertEquals(splitBlocks("1. one\n2. two\n").blocks.length, 2);
  assertEquals(splitBlocks("- [ ] todo\n- [x] done\n").blocks.length, 2);
  assertEquals(splitBlocks("> quoted\n> lines\n").blocks.length, 2);
  assertEquals(splitBlocks("# Title\n## Subtitle\n").blocks.length, 2);
});

Deno.test("a WRAPPED list item is not torn from its continuation line", () => {
  // The continuation line carries no marker, so on its own it would render as
  // a stray paragraph and lose the item it belongs to. Every line has to stand
  // alone or the block stays whole — this is the guard for that.
  const md = "- a long item that\n  wraps onto another line\n- second\n";
  const nb = splitBlocks(md);
  assertEquals(nb.blocks.length, 1);
  assertEquals(joinBlocks(nb), md);
});

Deno.test("prose is left whole — only line-oriented markdown splits", () => {
  const md = "First sentence here.\nSecond sentence here.\n";
  const nb = splitBlocks(md);
  assertEquals(nb.blocks.length, 1);
  assertEquals(joinBlocks(nb), md);
});

Deno.test("per-line splitting stays byte-for-byte lossless, gaps included", () => {
  for (
    const md of [
      "- alpha\n- beta\n\n\nnext paragraph\n",
      "# H1\n- a\n- b\n\ntail",
      "> q\n> r\n",
      "- only one\n",
      "- alpha\r\n- beta\r\n",
      "\n\n- a\n- b\n\n",
    ]
  ) {
    assertEquals(joinBlocks(splitBlocks(md)), md, `lossless for ${JSON.stringify(md)}`);
  }
});

Deno.test("a list inside a fenced code block is still left whole", () => {
  const md = "```\n- not a list\n- still not\n```\n";
  assertEquals(splitBlocks(md).blocks.length, 1);
  assertEquals(joinBlocks(splitBlocks(md)), md);
});

Deno.test("mergeBlockIntoPrevious joins two list items and reports the join point", () => {
  // Backspace at the very start of an item. With a list as one block per item
  // this is the ordinary way to join two bullets, so it must actually do
  // something — the caret lands exactly where the two now meet.
  const nb = splitBlocks("- alpha\n- beta\n");
  const merged = mergeBlockIntoPrevious(nb, 1);
  assertEquals(merged?.nb.blocks.map((b) => b.body), ["- alpha- beta\n"]);
  assertEquals(merged?.caret, "- alpha".length);
  assertEquals(joinBlocks(merged!.nb), "- alpha- beta\n");
});

Deno.test("mergeBlockIntoPrevious refuses across a blank line, and at the edges", () => {
  // A blank line between two blocks is a separation the student made on
  // purpose; backspace should eat that blank line first (which the text field
  // does on its own), not silently weld two paragraphs together.
  const spaced = splitBlocks("alpha\n\nbeta\n");
  assertEquals(mergeBlockIntoPrevious(spaced, 1), null);
  // Nothing before the first block, and nothing at an out-of-range index.
  assertEquals(mergeBlockIntoPrevious(spaced, 0), null);
  assertEquals(mergeBlockIntoPrevious(spaced, 99), null);
});

// --- boundary offsets between GAPLESS blocks -------------------------------
//
// Tables and line-oriented splitting both emit `gap: ""`, so a block's body end
// and the next block's start are the same number. Getting that boundary wrong
// put the caret one block ABOVE whatever was tapped, and made the last item of
// every gapless run unreachable — no tap could ever give it the caret.

Deno.test("tapping the second bullet of a list activates the SECOND bullet", () => {
  const nb = splitBlocks("- alpha\n- bravo\n- charlie\n");
  assertEquals(nb.blocks.length, 3);
  for (let i = 0; i < nb.blocks.length; i += 1) {
    assertEquals(blockIndexAtOffset(nb, blockStartOffset(nb, i)), i, `block ${i} is not reachable`);
  }
});

Deno.test("every heading in a stacked run is reachable", () => {
  const nb = splitBlocks("# One\n## Two\n### Three\n");
  assertEquals(nb.blocks.length, 3);
  assertEquals(blockIndexAtOffset(nb, blockStartOffset(nb, 1)), 1);
  assertEquals(blockIndexAtOffset(nb, blockStartOffset(nb, 2)), 2);
});

Deno.test("tapping a table under a heading lands on the TABLE, not the heading", () => {
  // This is the exact case the table split exists for: resolving to the
  // heading means isTableBlock says no and the grid editor never opens.
  const nb = splitBlocks("## Results\n| drug | dose |\n|---|---|\n| aspirin | 81mg |\n");
  assertEquals(nb.blocks.length, 2);
  assertEquals(blockIndexAtOffset(nb, blockStartOffset(nb, 1)), 1);
});

Deno.test("a caret inside a block still resolves to that block", () => {
  const nb = splitBlocks("- alpha\n- bravo\n");
  // Mid-word in the second bullet.
  assertEquals(blockIndexAtOffset(nb, blockStartOffset(nb, 1) + 3), 1);
  // The very end of the document clamps to the last block.
  assertEquals(blockIndexAtOffset(nb, 999), 1);
});

Deno.test("a blank line between paragraphs still puts the boundary in the FIRST", () => {
  // With a gap there is somewhere for the caret to be that is not the next
  // block's first character, and the tail of the paragraph is the right answer.
  const nb = splitBlocks("one\n\ntwo\n");
  assertEquals(nb.blocks.length, 2);
  const endOfFirst = nb.leading.length + nb.blocks[0].body.length;
  assertEquals(blockIndexAtOffset(nb, endOfFirst), 0);
});

// --- indented children stay with their parent ------------------------------

Deno.test("a nested list is ONE block, so the child keeps its indent meaning", () => {
  // Standing alone, "    - child" is four spaces of indent, which markdown
  // reads as a code block — the outline turned into grey monospace boxes the
  // moment edit mode opened.
  assertEquals(splitBlocks("- parent\n    - child\n").blocks.length, 1);
  assertEquals(splitBlocks("- a\n\t- tabbed\n").blocks.length, 1);
  assertEquals(splitBlocks("- a\n  - two spaces\n").blocks.length, 1);
});

Deno.test("a flat list at the margin still splits per line", () => {
  assertEquals(splitBlocks("- a\n- b\n- c\n").blocks.length, 3);
});
