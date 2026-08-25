import assert from "node:assert/strict";
import test from "node:test";

import { docBlocks } from "./doc-blocks";
import { sheetCsv } from "./doc-file";

// The model writes markdown; three file writers consume these shapes. What is guarded here is that
// nothing the model can write turns into a broken file.

test("headings, bullets, numbers and prose each become their own shape", () => {
  const blocks = docBlocks("# Title\n\nSome prose.\n\n## Part\n\n- one\n- two\n\n1. first\n2. second");
  assert.deepEqual(blocks, [
    { kind: "heading", level: 1, text: "Title" },
    { kind: "paragraph", text: "Some prose." },
    { kind: "heading", level: 2, text: "Part" },
    { kind: "bullet", text: "one" },
    { kind: "bullet", text: "two" },
    { index: 1, kind: "number", text: "first" },
    { index: 2, kind: "number", text: "second" },
  ]);
});

test("🔴 the numbering is ours, so a model that cannot count still gets a coherent list", () => {
  // Calibration: pass the model's own numbers through and this reddens.
  const blocks = docBlocks("1. a\n1. b\n7. c");
  assert.deepEqual(blocks.map((b) => (b.kind === "number" ? b.index : null)), [1, 2, 3]);
});

test("a blank line ends the run, so two lists do not continue each other's count", () => {
  const blocks = docBlocks("1. a\n2. b\n\n1. fresh");
  assert.deepEqual(blocks.map((b) => (b.kind === "number" ? b.index : null)), [1, 2, 1]);
});

test("🔴 a deep heading is clamped, because both writers have exactly three styles", () => {
  // Unclamped, `level` indexes past the end of the docx heading array and the row renders as
  // nothing at all — a section that silently vanishes from the file.
  assert.deepEqual(docBlocks("#### deep"), [{ kind: "heading", level: 3, text: "deep" }]);
});

test("inline marks are stripped, and a link keeps its words", () => {
  assert.deepEqual(docBlocks("**bold** and *italic* and `code`"), [
    { kind: "paragraph", text: "bold and italic and code" },
  ]);
  assert.deepEqual(docBlocks("see [the ruling](https://example.com/x)"), [
    { kind: "paragraph", text: "see the ruling" },
  ]);
});

test("🔴 anything unrecognised survives as a paragraph rather than disappearing", () => {
  // The rule that keeps this a border and not a parser: a table, a code fence or a block quote is
  // not handled, and must therefore arrive intact rather than be dropped.
  const blocks = docBlocks("> quoted\n\n| a | b |\n\n```js\nlet x = 1;\n```");
  const texts = blocks.map((b) => b.text);
  assert.ok(texts.some((t) => t.includes("quoted")));
  assert.ok(texts.some((t) => t.includes("| a | b |")));
  assert.ok(texts.some((t) => t.includes("let x = 1;")));
});

test("🔴🔴 a wrapped paragraph is ONE paragraph, which is markdown's own rule", () => {
  // Found by looking at the artifact card, which renders through this same parser: a paragraph the
  // model hard-wrapped came out as four stubby paragraphs with a gap between each — in the .docx
  // and the PDF, not only on screen. Calibration: split on every newline again and this reddens.
  assert.deepEqual(docBlocks("A promise is enforceable\nwhen the promisor should\nexpect reliance."), [
    { kind: "paragraph", text: "A promise is enforceable when the promisor should expect reliance." },
  ]);
  // A blank line still separates them.
  assert.equal(docBlocks("one\ntwo\n\nthree").length, 2);
});

test("🔴 every other shape closes the paragraph it interrupts", () => {
  // Without this, prose immediately before a heading or a bullet would swallow it into the run.
  assert.deepEqual(docBlocks("prose\n## Heading\nmore"), [
    { kind: "paragraph", text: "prose" },
    { kind: "heading", level: 2, text: "Heading" },
    { kind: "paragraph", text: "more" },
  ]);
  assert.deepEqual(docBlocks("prose\n- a bullet"), [
    { kind: "paragraph", text: "prose" },
    { kind: "bullet", text: "a bullet" },
  ]);
  assert.deepEqual(docBlocks("prose\n1. an item"), [
    { kind: "paragraph", text: "prose" },
    { index: 1, kind: "number", text: "an item" },
  ]);
});

test("a horizontal rule carries no words, so it leaves nothing behind", () => {
  assert.deepEqual(docBlocks("a\n\n---\n\nb"), [
    { kind: "paragraph", text: "a" },
    { kind: "paragraph", text: "b" },
  ]);
});

// ── CSV ─────────────────────────────────────────────────────────────────────────────────────────

test("🔴🔴 a cell holding a comma, a quote or a newline is quoted — RFC 4180", () => {
  // Each of these, unquoted, produces a spreadsheet that OPENS SUCCESSFULLY and is wrong: the comma
  // splits one cell into two columns, the quote ends the field early, the newline ends the row.
  // Silent corruption is worse than a file that refuses to open.
  const csv = sheetCsv({
    columns: ["a", "b"],
    rows: [["plain", "has,comma"], ['say "hi"', "line\nbreak"]],
  });
  assert.equal(csv, 'a,b\r\nplain,"has,comma"\r\n"say ""hi""","line\nbreak"');
});

test("the row separator is CRLF, which is what Excel on Windows expects", () => {
  assert.ok(sheetCsv({ columns: ["a"], rows: [["1"], ["2"]] }).includes("\r\n"));
});
