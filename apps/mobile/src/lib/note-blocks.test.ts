// Deno unit tests (repo convention) for the note-block model behind the
// phone editor's live-preview mode.
// Run: deno test --no-check apps/mobile/src/lib/note-blocks.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appendEmptyBlock,
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

Deno.test("blank lines separate blocks; block bodies hold contiguous lines", () => {
  const nb = splitBlocks("# Head\n\npara one\npara one line two\n\n- a\n- b\n");
  assertEquals(nb.blocks.map((b) => b.body), ["# Head\n", "para one\npara one line two\n", "- a\n- b\n"]);
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
