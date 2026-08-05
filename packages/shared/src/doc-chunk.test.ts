import assert from "node:assert/strict";
import test from "node:test";

import type { DocBlock, DocCell, DocTable, DocUnit, Locator, ParsedDocument } from "./doc-model.ts";
import {
  CHUNKER_VERSION,
  chunkDocument,
  DEFAULT_OVERLAP_TOKENS,
  DEFAULT_TARGET_TOKENS,
  estimateTokens,
} from "./doc-chunk.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function blk(id: string, text: string, extra: Partial<DocBlock> = {}): DocBlock {
  return { id, kind: "paragraph", method: "textLayer", ordinal: 0, text, ...extra };
}

/** Ordinals are assigned by array position unless the fixture set one, so a test
 *  only spells out reading order when reading order is what it is about. */
function unit(locator: Locator, blocks: DocBlock[]): DocUnit {
  return { blocks: blocks.map((b, i) => (b.ordinal === 0 ? { ...b, ordinal: i } : b)), locator };
}

function cell(text: string, extra: Partial<DocCell> = {}): DocCell {
  return { col: 0, row: 0, text, ...extra };
}

function table(id: string, rows: DocCell[][], extra: Partial<DocTable> = {}): DocTable {
  return { id, locator: { index: 1, kind: "page" }, method: "textLayer", rows, ...extra };
}

function doc(units: DocUnit[], tables: DocTable[] = []): ParsedDocument {
  return {
    contentHash: "sha256-fixture",
    coverage: {
      tablesFound: tables.length,
      unitsFound: units.length,
      unitsRead: units.length,
      visualsFound: 0,
      visualsKept: 0,
      visualsUnreadable: 0,
    },
    kind: "pdf",
    parserVersion: "test-parser",
    tables,
    units,
    visuals: [],
  };
}

/** Sentences that are individually small, so a test can reason about packing
 *  rather than about how one giant sentence gets cut. */
function sentences(count: number, word: string): string {
  return Array.from({ length: count }, (_, i) => `${word} sentence number ${i} here.`).join(" ");
}

// ── The rule the whole file exists for ───────────────────────────────────────

// 🔴 A chunk that spans two pages cannot be cited as either. This is the
// requirement everything else bends around.
test("a chunk never crosses a unit boundary, even when both units would fit in one", () => {
  const parsed = doc([
    unit({ index: 6, kind: "page" }, [blk("a", "Alpha on page six.")]),
    unit({ index: 7, kind: "page" }, [blk("b", "Beta on page seven.")]),
  ]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.locator.index, 6);
  assert.equal(chunks[0]?.text, "Alpha on page six.");
  assert.equal(chunks[1]?.locator.index, 7);
  assert.equal(chunks[1]?.text, "Beta on page seven.");
});

test("units that each need several chunks still never bleed into each other", () => {
  const parsed = doc([
    unit({ index: 1, kind: "slide" }, [blk("a", sentences(40, "alpha"))]),
    unit({ index: 2, kind: "slide" }, [blk("b", sentences(40, "beta"))]),
  ]);
  const chunks = chunkDocument(parsed, { targetTokens: 40 });
  assert.ok(chunks.length > 4, "the fixture is meant to split several times");
  for (const chunk of chunks) {
    const mentionsAlpha = chunk.text.includes("alpha");
    const mentionsBeta = chunk.text.includes("beta");
    assert.ok(!(mentionsAlpha && mentionsBeta), `chunk ${chunk.chunkIndex} mixes two slides`);
    assert.equal(chunk.locator.index, mentionsAlpha ? 1 : 2);
    assert.deepEqual(chunk.blockIds, mentionsAlpha ? ["a"] : ["b"]);
  }
});

test("overlap never reaches back across a unit boundary", () => {
  const parsed = doc([
    unit({ index: 1, kind: "page" }, [blk("a", sentences(20, "alpha"))]),
    unit({ index: 2, kind: "page" }, [blk("b", sentences(20, "beta"))]),
  ]);
  const chunks = chunkDocument(parsed, { overlapTokens: 20, targetTokens: 40 });
  const firstOfPageTwo = chunks.find((c) => c.locator.index === 2);
  assert.ok(firstOfPageTwo);
  assert.ok(!firstOfPageTwo.text.includes("alpha"), "page 2's first chunk must not open with page 1's tail");
});

// ── Heading trail ────────────────────────────────────────────────────────────

test("the heading trail is kept, outermost first, so a result can be placed", () => {
  const parsed = doc([
    unit({ kind: "section" }, [
      blk("h1", "Termination", { depth: 1, kind: "heading" }),
      blk("h2", "Notice period", { depth: 2, kind: "heading" }),
      blk("p", "Either party may terminate on thirty days notice."),
    ]),
  ]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0]?.locator.headingPath, ["Termination", "Notice period"]);
});

test("a heading at the same level replaces its predecessor in the trail", () => {
  const parsed = doc([
    unit({ kind: "section" }, [
      blk("h1", "Part One", { depth: 1, kind: "heading" }),
      blk("p1", "First body."),
      blk("h2", "Part Two", { depth: 1, kind: "heading" }),
      blk("p2", "Second body."),
    ]),
  ]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0]?.locator.headingPath, ["Part One"]);
  assert.deepEqual(chunks[1]?.locator.headingPath, ["Part Two"]);
  assert.ok(chunks[1]?.text.startsWith("Part Two"));
});

test("the unit's own measured trail sits underneath headings found inside it", () => {
  const parsed = doc([
    unit({ headingPath: ["Schedule B"], kind: "section" }, [
      blk("h", "Fees", { depth: 1, kind: "heading" }),
      blk("p", "Payable monthly."),
    ]),
  ]);
  assert.deepEqual(chunkDocument(parsed)[0]?.locator.headingPath, ["Schedule B", "Fees"]);
});

test("a bare heading chain does not mint a three-token chunk of its own", () => {
  // "Chapter 3" immediately followed by "3.1 Scope" — the first has no body, and
  // it survives in the trail as an ancestor, so splitting there buys nothing.
  const parsed = doc([
    unit({ kind: "section" }, [
      blk("h1", "Chapter 3", { depth: 1, kind: "heading" }),
      blk("h2", "Scope", { depth: 2, kind: "heading" }),
      blk("p", "This chapter covers the inspection regime."),
    ]),
  ]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0]?.locator.headingPath, ["Chapter 3", "Scope"]);
});

// ── Locators are copied, never rebuilt ───────────────────────────────────────

test("every measured locator field survives — printedLabel, label, range", () => {
  const parsed = doc([
    unit({ index: 3, kind: "page", label: "Preface", printedLabel: "vii" }, [blk("a", "Front matter.")]),
    unit({ index: 2, kind: "sheet", label: "Q3 Actuals", range: "A1:F40" }, [blk("b", "Revenue held flat.")]),
  ]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks[0]?.locator.printedLabel, "vii");
  assert.equal(chunks[0]?.locator.label, "Preface");
  assert.equal(chunks[1]?.locator.range, "A1:F40");
  assert.equal(chunks[1]?.locator.label, "Q3 Actuals");
});

// ── Tables ───────────────────────────────────────────────────────────────────

const HEADER_ROW = [
  cell("Drug", { header: true }),
  cell("Dose", { header: true }),
  cell("Route", { header: true }),
];

function bodyRows(count: number): DocCell[][] {
  return Array.from({ length: count }, (_, i) => [
    cell(`compound-${i}`),
    cell(`${i * 5} mg`),
    cell(i % 2 === 0 ? "oral" : "intravenous"),
  ]);
}

test("a table that fits stays whole, in one chunk", () => {
  const t = table("t1", [HEADER_ROW, ...bodyRows(3)], { title: "Table 4. Dosing" });
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [t]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0]?.text.startsWith("Table 4. Dosing\nDrug | Dose | Route"));
  assert.ok(chunks[0]?.text.includes("compound-2"));
  assert.deepEqual(chunks[0]?.blockIds, ["b"]);
});

// 🔴 A table fragment without its header is unanswerable: "812 | 4.1 | yes" in
// isolation invites a confident answer about columns nobody can name.
test("a split table repeats its header row in every part", () => {
  const t = table("t1", [HEADER_ROW, ...bodyRows(40)], { title: "Table 4. Dosing" });
  const parsed = doc([unit({ index: 9, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [t]);
  const chunks = chunkDocument(parsed, { targetTokens: 40 });
  assert.ok(chunks.length > 3, "the fixture is meant to need several parts");
  for (const chunk of chunks) {
    assert.ok(chunk.text.includes("Drug | Dose | Route"), `part ${chunk.chunkIndex} lost its header`);
    assert.ok(chunk.text.startsWith("Table 4. Dosing"), `part ${chunk.chunkIndex} lost its caption`);
    assert.equal(chunk.locator.index, 9);
  }
  // Every body row survives the split exactly once.
  for (let i = 0; i < 40; i++) {
    const hits = chunks.filter((c) => c.text.includes(`compound-${i} |`));
    assert.equal(hits.length, 1, `compound-${i} appears ${hits.length} times`);
  }
});

test("a multi-row header is repeated whole", () => {
  const rows: DocCell[][] = [
    [cell("2025", { header: true }), cell("2026", { header: true })],
    [cell("actual", { header: true }), cell("forecast", { header: true })],
    ...Array.from({ length: 30 }, (_, i) => [cell(`row ${i} left`), cell(`row ${i} right`)]),
  ];
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [
    table("t1", rows),
  ]);
  const chunks = chunkDocument(parsed, { targetTokens: 30 });
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) assert.ok(chunk.text.startsWith("2025 | 2026\nactual | forecast"));
});

test("a table with no header the parser marked gets none repeated — nothing is invented", () => {
  const rows = Array.from({ length: 30 }, (_, i) => [cell(`left ${i}`), cell(`right ${i}`)]);
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [
    table("t1", rows),
  ]);
  const chunks = chunkDocument(parsed, { targetTokens: 25 });
  assert.ok(chunks.length > 1);
  // Row 0 is not promoted to a header just because it is first.
  assert.equal(chunks.filter((c) => c.text.includes("left 0 |")).length, 1);
  for (let i = 0; i < 30; i++) {
    assert.equal(chunks.filter((c) => c.text.includes(`left ${i} |`)).length, 1, `left ${i} was lost or duplicated`);
  }
});

test("splitting a table does not narrow its measured range", () => {
  // A part holds the header rows plus a NON-ADJACENT slice of the body; no single
  // range describes that honestly, so the parser's range is carried through.
  const t = table("t1", [HEADER_ROW, ...bodyRows(40)], {
    locator: { index: 1, kind: "sheet", label: "Dosing", range: "A1:C41" },
  });
  const parsed = doc([unit({ index: 1, kind: "sheet", label: "Dosing" }, [
    blk("b", "", { kind: "table", tableId: "t1" }),
  ])], [t]);
  for (const chunk of chunkDocument(parsed, { targetTokens: 40 })) {
    assert.equal(chunk.locator.range, "A1:C41");
    assert.equal(chunk.locator.label, "Dosing");
  }
});

test("a table is located by the unit its block sits in, not by a disagreeing table locator", () => {
  // Both are parser-measured, but the block's containment in this unit is
  // structural. A chunk emitted while walking page 9 must not claim page 1.
  const t = table("t1", [HEADER_ROW, ...bodyRows(2)], { locator: { index: 1, kind: "page" } });
  const parsed = doc([unit({ index: 9, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [t]);
  assert.equal(chunkDocument(parsed)[0]?.locator.index, 9);
});

test("a cell's formula rides along with its value", () => {
  const parsed = doc([unit({ index: 1, kind: "sheet" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [
    table("t1", [[cell("Total"), cell("41,200", { formula: "=SUM(B2:B40)" })]]),
  ]);
  assert.ok(chunkDocument(parsed)[0]?.text.includes("41,200 (=SUM(B2:B40))"));
});

// The two join failures that lose content silently if nobody decides about them.
test("a table block whose tableId matches nothing falls back to the block's own text", () => {
  const parsed = doc([
    unit({ index: 1, kind: "page" }, [blk("b", "Drug | Dose\naspirin | 81 mg", { kind: "table", tableId: "ghost" })]),
  ]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0]?.text.includes("aspirin | 81 mg"));
  assert.deepEqual(chunks[0]?.blockIds, ["b"]);
});

test("a table no block references is still emitted, with its own locator and no blockIds", () => {
  const t = table("orphan", [HEADER_ROW, ...bodyRows(2)], { locator: { index: 12, kind: "page" } });
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", "Body text.")])], [t]);
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 2);
  const orphan = chunks[1];
  assert.ok(orphan?.text.includes("compound-1"));
  assert.equal(orphan?.locator.index, 12);
  assert.deepEqual(orphan?.blockIds, []);
});

test("a referenced table is not also emitted as an orphan", () => {
  const t = table("t1", [HEADER_ROW, ...bodyRows(2)]);
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [t]);
  assert.equal(chunkDocument(parsed).length, 1);
});

// ── Token budget, script-aware ───────────────────────────────────────────────

// 🔴 THE BUG THIS ESTIMATE EXISTS TO PREVENT. A character budget hands a Chinese
// document three to four times the intended content and overflows the window it
// was sized for.
test("CJK text does not overflow the token budget", () => {
  const chinese = Array.from({ length: 120 }, (_, i) => `这是第${i}个句子，用来测试分块器的行为。`).join("");
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", chinese)])]);
  const chunks = chunkDocument(parsed, { overlapTokens: 0, targetTokens: 100 });
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.tokensEstimate <= 100, `chunk ${chunk.chunkIndex} is ${chunk.tokensEstimate} tokens`);
  }
});

test("a Chinese chunk carries far fewer CHARACTERS than an English one for the same budget", () => {
  const chineseDoc = doc([
    unit({ index: 1, kind: "page" }, [blk("a", Array.from({ length: 200 }, (_, i) => `这是第${i}个句子。`).join(""))]),
  ]);
  const englishDoc = doc([unit({ index: 1, kind: "page" }, [blk("a", sentences(200, "english"))])]);
  const opts = { overlapTokens: 0, targetTokens: 100 };
  const cjkChars = Array.from(chunkDocument(chineseDoc, opts)[0]?.text ?? "").length;
  const engChars = Array.from(chunkDocument(englishDoc, opts)[0]?.text ?? "").length;
  assert.ok(cjkChars > 0 && engChars > 0);
  // A character budget would make these roughly equal. The whole point is that
  // they are not: English gets ~4 characters per token, CJK ~1.
  assert.ok(cjkChars * 2 < engChars, `cjk ${cjkChars} chars vs english ${engChars} — the budget is not script-aware`);
});

test("surrogate-paired ideographs are counted once, by codepoint", () => {
  // Extension B: two UTF-16 units each. Counting `.length` would price ten of
  // them as five Latin-ish tokens — an UNDERestimate, the dangerous direction.
  const extB = "\u{20000}".repeat(10);
  assert.equal(extB.length, 20);
  assert.equal(estimateTokens(extB), 10);
});

test("mixed scripts are priced run by run, not by a document-wide share", () => {
  // A mostly-English document with one Chinese quotation: the quotation must not
  // inherit the document's English density.
  const mixed = `${"word ".repeat(400)}${"密度不同的中文段落。".repeat(40)}`;
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", mixed)])]);
  for (const chunk of chunkDocument(parsed, { overlapTokens: 0, targetTokens: 120 })) {
    assert.ok(chunk.tokensEstimate <= 120, `chunk ${chunk.chunkIndex} is ${chunk.tokensEstimate} tokens`);
  }
});

test("an empty string is zero tokens, not one", () => {
  assert.equal(estimateTokens(""), 0);
});

// ── Termination and completeness ─────────────────────────────────────────────

// The trap a hand-rolled overlapping chunker falls into: an overlap that can
// fill the budget means the packer emits the same text forever. If this test
// hangs, that is the bug.
test("a tiny target against a long paragraph terminates and drops nothing", () => {
  const text = sentences(60, "gamma");
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", text)])]);
  const chunks = chunkDocument(parsed, { overlapTokens: 999, targetTokens: 10 });
  assert.ok(chunks.length > 5 && chunks.length < 200, `suspicious chunk count: ${chunks.length}`);
  for (let i = 0; i < 60; i++) {
    assert.ok(chunks.some((c) => c.text.includes(`sentence number ${i} here.`)), `sentence ${i} was dropped`);
  }
});

test("a single sentence longer than the whole budget is emitted, not dropped and not looped on", () => {
  const wall = "x".repeat(4000); // no punctuation anywhere
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", wall)])]);
  const chunks = chunkDocument(parsed, { overlapTokens: 0, targetTokens: 50 });
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((c) => c.text).join(""), wall, "the wall of text must reassemble exactly");
});

test("one indivisible piece bigger than the target is emitted whole and oversized", () => {
  // A single row that blows the budget still ships: dropping it loses data, and
  // refusing to emit it never ends. The target is a target, not a cap.
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [
    table("t1", [HEADER_ROW, [cell("one"), cell("enormous ".repeat(200)), cell("row")]]),
  ]);
  const chunks = chunkDocument(parsed, { targetTokens: 20 });
  assert.equal(chunks.length, 1);
  assert.ok((chunks[0]?.tokensEstimate ?? 0) > 20);
});

test("adjacent chunks inside a unit overlap, so a sentence at the seam is still retrievable", () => {
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", sentences(40, "delta"))])]);
  const chunks = chunkDocument(parsed, { overlapTokens: 30, targetTokens: 60 });
  assert.ok(chunks.length > 2);
  const first = chunks[0]?.text ?? "";
  const second = chunks[1]?.text ?? "";
  const tail = first.slice(first.lastIndexOf("delta sentence"));
  assert.ok(tail.length > 0 && second.includes(tail), "the second chunk does not repeat the first's tail");
});

test("zero overlap means no repetition at all", () => {
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", sentences(30, "epsilon"))])]);
  const chunks = chunkDocument(parsed, { overlapTokens: 0, targetTokens: 40 });
  for (let i = 0; i < 30; i++) {
    const hits = chunks.filter((c) => c.text.includes(`sentence number ${i} here.`));
    assert.equal(hits.length, 1, `sentence ${i} appears ${hits.length} times with overlap off`);
  }
});

// ── Emptiness ────────────────────────────────────────────────────────────────

test("an empty document yields no chunks", () => {
  assert.deepEqual(chunkDocument(doc([])), []);
});

test("units with no blocks, and blocks with only whitespace, yield no chunks", () => {
  const parsed = doc([
    unit({ index: 1, kind: "page" }, []),
    unit({ index: 2, kind: "page" }, [blk("a", "   \n\t  "), blk("b", "")]),
  ]);
  assert.deepEqual(chunkDocument(parsed), []);
});

test("a table with no rows yields no chunk", () => {
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("b", "", { kind: "table", tableId: "t1" })])], [
    table("t1", []),
  ]);
  assert.deepEqual(chunkDocument(parsed), []);
});

// ── Determinism and indexing ─────────────────────────────────────────────────

// 🔴 The UNIQUE (parse, chunker, embedding, chunk_index) index turns any wobble
// here into rows deleted and re-embedded for a document nobody touched.
test("the same parse always chunks identically", () => {
  const build = () =>
    doc(
      [
        unit({ index: 1, kind: "page" }, [
          blk("h", "Overview", { depth: 1, kind: "heading" }),
          blk("a", sentences(25, "zeta")),
          blk("t", "", { kind: "table", tableId: "t1" }),
          blk("b", sentences(25, "eta")),
        ]),
        unit({ index: 2, kind: "page" }, [blk("c", "这是中文段落。".repeat(30))]),
      ],
      [table("t1", [HEADER_ROW, ...bodyRows(25)], { title: "Table 1" })],
    );
  assert.deepEqual(chunkDocument(build(), { targetTokens: 60 }), chunkDocument(build(), { targetTokens: 60 }));
});

test("chunkIndex is document-global and contiguous across units and tables", () => {
  const parsed = doc(
    [
      unit({ index: 1, kind: "page" }, [blk("a", sentences(20, "alpha"))]),
      unit({ index: 2, kind: "page" }, [blk("b", sentences(20, "beta"))]),
    ],
    [table("orphan", [HEADER_ROW, ...bodyRows(2)], { locator: { index: 3, kind: "page" } })],
  );
  const chunks = chunkDocument(parsed, { targetTokens: 40 });
  assert.ok(chunks.length > 3);
  chunks.forEach((chunk, i) => assert.equal(chunk.chunkIndex, i));
});

test("blocks are read in their declared ordinal order, not their array order", () => {
  const parsed = doc([
    {
      blocks: [blk("second", "Then this.", { ordinal: 1 }), blk("first", "This comes first.", { ordinal: 0 })],
      locator: { index: 1, kind: "page" },
    },
  ]);
  assert.equal(chunkDocument(parsed)[0]?.text, "This comes first.\n\nThen this.");
});

test("consecutive list items read as a list, not as separate paragraphs", () => {
  const parsed = doc([
    unit({ index: 1, kind: "slide" }, [
      blk("l1", "First point", { kind: "listItem" }),
      blk("l2", "Second point", { kind: "listItem" }),
    ]),
  ]);
  assert.equal(chunkDocument(parsed)[0]?.text, "First point\nSecond point");
});

// 🔴 The defaults are baked into every stored chunk set. Editing one without
// moving CHUNKER_VERSION silently re-chunks documents whose rows still claim the
// old version — so this test exists to go red when a default moves.
test("the production defaults are pinned to the chunker version", () => {
  assert.equal(CHUNKER_VERSION, "chunk-1");
  assert.equal(DEFAULT_TARGET_TOKENS, 400);
  assert.equal(DEFAULT_OVERLAP_TOKENS, 60);
});

test("the defaults are what an option-free call actually uses", () => {
  const parsed = doc([unit({ index: 1, kind: "page" }, [blk("a", sentences(300, "theta"))])]);
  const bare = chunkDocument(parsed);
  const explicit = chunkDocument(parsed, {
    overlapTokens: DEFAULT_OVERLAP_TOKENS,
    targetTokens: DEFAULT_TARGET_TOKENS,
  });
  assert.deepEqual(bare, explicit);
  // The bound is target + overlap, NOT target. The overlap tail is charged to the
  // budget before the first new piece is taken unconditionally, so a chunk can
  // reach 460 tokens on the defaults without any single piece being oversized.
  const bound = DEFAULT_TARGET_TOKENS + DEFAULT_OVERLAP_TOKENS;
  for (const chunk of bare) assert.ok(chunk.tokensEstimate <= bound, `${chunk.tokensEstimate} > ${bound}`);
});

test("a table referenced from two units is chunked once, at its first reference", () => {
  // A table running across pages 6–8 is ONE DocTable with one locator. Chunking
  // it per referencing block would triple its rows in the index under three
  // locators, where nothing downstream could tell they were the same rows.
  const t = table("t1", [HEADER_ROW, ...bodyRows(3)], { locator: { index: 6, kind: "page" } });
  const parsed = doc(
    [
      unit({ index: 6, kind: "page" }, [blk("b6", "", { kind: "table", tableId: "t1" })]),
      unit({ index: 7, kind: "page" }, [blk("b7", "", { kind: "table", tableId: "t1" })]),
    ],
    [t],
  );
  const chunks = chunkDocument(parsed);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.locator.index, 6, "it belongs to the page it starts on");
  assert.deepEqual(chunks[0]?.blockIds, ["b6"]);
  for (let i = 0; i < 3; i++) {
    assert.equal(chunks.filter((c) => c.text.includes(`compound-${i} |`)).length, 1);
  }
});
