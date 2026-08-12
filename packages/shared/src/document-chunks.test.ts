import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkDocument, chunkedText } from "./document-chunks.ts";
import { buildDocument, documentToText, type DocBlock } from "./document-model.ts";

function doc(blocks: readonly Omit<DocBlock, "id">[], units = 1) {
  return buildDocument({
    blocks,
    format: "pdf",
    title: null,
    units: Array.from({ length: units }, (_, index) => ({ index, kind: "page" as const })),
  });
}

const para = (text: string, headingPath: string[] = [], unit = 0): Omit<DocBlock, "id"> => ({
  headingPath,
  kind: "paragraph",
  text,
  unit,
});

const heading = (text: string, level = 1, unit = 0): Omit<DocBlock, "id"> => ({
  headingPath: [],
  kind: "heading",
  level,
  text,
  unit,
});

// 🔴 THE PROPERTY THAT MUST NEVER STOP HOLDING.
// "Never solve capacity by silently deleting content" is only a rule if
// something checks it. Chunking rearranges nothing and loses nothing.
test("chunking loses no text and reorders nothing", () => {
  const built = doc([
    heading("Section One"),
    para("a".repeat(900)),
    para("b".repeat(900)),
    heading("Section Two"),
    para("c".repeat(900)),
  ]);
  assert.equal(chunkedText(chunkDocument(built)), documentToText(built));
});

// 🔴 THE DEFECT A FIXED CHARACTER SLICE CREATES.
// A section's content retrieved without the heading that names it is an
// instruction with no idea what it is an instruction about.
test("a heading opens a chunk and never closes one", () => {
  const built = doc([
    para("x".repeat(1700)),
    heading("Dosing"),
    para("Give 10 mg."),
  ]);
  const chunks = chunkDocument(built);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[1]!.text.startsWith("# Dosing"), "the heading starts the second chunk");
  assert.ok(chunks[1]!.text.includes("Give 10 mg."), "and its content is with it");
});

// 🔴 HALF A TABLE ROW IS A SET OF VALUES UNDER THE WRONG COLUMN NAMES.
test("a table larger than the target is kept whole and says so", () => {
  const rows = Array.from({ length: 200 }, (_, i) => [`row ${i}`, `value ${i}`, `note ${i}`]);
  const built = doc([{ headingPath: [], kind: "table", table: { headerRows: 1, rows }, text: "", unit: 0 }]);
  const chunks = chunkDocument(built);
  assert.equal(chunks.length, 1, "a table is never split");
  assert.equal(chunks[0]!.oversized, true, "and an oversized chunk declares itself");
  assert.ok(chunks[0]!.text.includes("row 199"), "the last row is still there");
});

test("a table is not merged into the paragraph that discusses it", () => {
  const built = doc([
    { headingPath: [], kind: "table", table: { headerRows: 1, rows: [["a", "b"], ["1", "2"]] }, text: "", unit: 0 },
    para("The table above shows the result."),
  ]);
  const chunks = chunkDocument(built);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0]!.text.startsWith("| a | b |"));
});

test("every chunk names the blocks it came from, with none used twice", () => {
  const built = doc([heading("A"), para("one"), heading("B"), para("two"), para("three")]);
  const chunks = chunkDocument(built);
  const ids = chunks.flatMap((c) => c.blockIds);
  assert.deepEqual(ids, built.blocks.map((b) => b.id));
  assert.equal(new Set(ids).size, ids.length, "no block may appear in two chunks");
});

test("a chunk is filed under the section it opens in, not the one it ends in", () => {
  const built = doc([
    para("intro text", ["Overview"]),
    para("more intro", ["Overview"]),
  ]);
  assert.deepEqual(chunkDocument(built)[0]!.headingPath, ["Overview"]);
});

test("a chunk spanning two pages reports both, and its unit kind", () => {
  const built = doc([para("end of page one", [], 0), para("start of page two", [], 1)], 2);
  const [chunk] = chunkDocument(built);
  assert.equal(chunk!.unitStart, 0);
  assert.equal(chunk!.unitEnd, 1);
  assert.equal(chunk!.unitKind, "page");
});

test("empty blocks contribute nothing and produce no empty chunk", () => {
  const built = doc([para(""), para("   "), para("real text")]);
  const chunks = chunkDocument(built);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]!.text, "real text");
});

test("a document with nothing in it chunks to nothing rather than to one empty chunk", () => {
  assert.deepEqual(chunkDocument(doc([para("")])), []);
});

test("chunk indexes are contiguous from zero", () => {
  const built = doc(Array.from({ length: 12 }, (_, i) => para("y".repeat(700), [], 0)));
  const chunks = chunkDocument(built);
  assert.deepEqual(chunks.map((c) => c.index), chunks.map((_, i) => i));
});

// 🔴 AN UNEXAMINED FIGURE CONTRIBUTES NO TEXT TO RETRIEVAL.
//
// This test used to assert the opposite — that "[Figure — not examined]"
// survived into a chunk, on the reasoning that it was "the only trace of the
// gap in the very layer that answers". That reasoning inverts. A chunk is
// retrievable, so the sentence came back to a learner as something the document
// said. Making a coverage fact searchable prose does not disclose the gap; it
// launders the gap into content. The disclosure belongs in `coverage`, which
// nobody can mistake for the author's words.
test("an unexamined figure contributes no synthetic prose to any chunk", () => {
  const built = doc([
    para("Before the figure."),
    { figure: {}, headingPath: [], kind: "figure", text: "", unit: 0 },
    para("After the figure."),
  ]);
  const chunks = chunkDocument(built);
  const all = chunks.map((c) => c.text).join("\n");
  assert.ok(!/not examined/i.test(all), "no invented sentence reaches retrieval");
  assert.ok(!/\[Figure/i.test(all), "and no invented marker either");
  // The real text on both sides is untouched — this removes an addition, never content.
  assert.ok(all.includes("Before the figure."));
  assert.ok(all.includes("After the figure."));
});

test("a figure the document captioned still reaches retrieval — that IS source text", () => {
  const built = doc([
    { figure: {}, headingPath: [], kind: "figure", text: "Figure 3. Renal clearance over time.", unit: 0 },
  ]);
  const all = chunkDocument(built).map((c) => c.text).join("\n");
  assert.ok(all.includes("Renal clearance over time."), "a caption is what the document says");
});
