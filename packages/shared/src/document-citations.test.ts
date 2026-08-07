import assert from "node:assert/strict";
import { test } from "node:test";

import {
  citeQuote,
  partitionCitations,
  resolveLocator,
  verifyCitation,
} from "./document-citations.ts";
import { buildDocument, describeLocator, type DocBlock } from "./document-model.ts";

const para = (text: string, unit = 0, headingPath: string[] = []): Omit<DocBlock, "id"> => ({
  headingPath,
  kind: "paragraph",
  text,
  unit,
});

const pdf = (blocks: readonly Omit<DocBlock, "id">[], units = 3) =>
  buildDocument({
    blocks,
    format: "pdf",
    title: null,
    units: Array.from({ length: units }, (_, index) => ({ index, kind: "page" as const })),
  });

const word = (blocks: readonly Omit<DocBlock, "id">[]) =>
  buildDocument({ blocks, format: "docx", title: null, units: [{ index: 0, kind: "body" }] });

const LONG = "The infusion is reduced by half when clearance falls below the threshold.";

// 🔴 THE WHOLE POINT: THE LOCATION IS FOUND, NOT BELIEVED.
test("a quote produces the locator of the block that actually contains it", () => {
  const doc = pdf([para("something else entirely on page one"), para(LONG, 2)]);
  const result = citeQuote(doc, LONG);
  assert.ok(result.ok);
  assert.equal(result.locator.unit, 2);
  assert.equal(describeLocator(result.locator), "page 3");
});

test("a quote nobody wrote produces no citation at all", () => {
  const doc = pdf([para(LONG)]);
  const result = citeQuote(doc, "The dose is doubled whenever the moon is full and bright.");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal, "quote-not-found");
});

// 🔴 A SHORT QUOTE MATCHES EVERYWHERE, WHICH LOOKS EXACTLY LIKE MATCHING RIGHT.
test("a quote too short to identify anything is refused", () => {
  const doc = pdf([para("the patient improved"), para("the patient declined", 1)]);
  const result = citeQuote(doc, "the patient");
  assert.equal(result.ok === false && result.refusal, "quote-too-short");
});

test("a quote appearing twice is refused rather than pointed at the first", () => {
  const doc = pdf([para(LONG), para(LONG, 1)]);
  const result = citeQuote(doc, LONG);
  assert.equal(result.ok === false && result.refusal, "ambiguous");
});

test("whitespace differences do not defeat a correct quote", () => {
  const doc = pdf([para(LONG)]);
  const retyped = LONG.replace(/ /g, "  ").replace("half", "half\n");
  assert.equal(citeQuote(doc, retyped).ok, true);
});

test("an existing citation whose block moved is refused as unknown-block", () => {
  const doc = pdf([para(LONG)]);
  assert.equal(
    verifyCitation(doc, { blockId: "b47", quote: LONG }).ok === false &&
      verifyCitation(doc, { blockId: "b47", quote: LONG }).ok,
    false,
  );
  const result = verifyCitation(doc, { blockId: "b47", quote: LONG });
  assert.equal(result.ok === false && result.refusal, "unknown-block");
});

// The two failures mean different things — text moved vs location invented —
// and collapsing them into "invalid" loses which fix applies.
test("a real block with the wrong quote fails differently from a missing block", () => {
  const doc = pdf([para(LONG)]);
  const result = verifyCitation(doc, { blockId: "b0", quote: "A sentence that is not in this document." });
  assert.equal(result.ok === false && result.refusal, "quote-not-found");
});

test("a locator claiming the wrong unit does not resolve", () => {
  const doc = pdf([para(LONG, 1)]);
  const block = doc.blocks[0]!;
  assert.equal(resolveLocator(doc, { blockId: "b0", headingPath: [], unit: 1, unitKind: "page" }), block);
  assert.equal(resolveLocator(doc, { blockId: "b0", headingPath: [], unit: 2, unitKind: "page" }), null);
});

// 🔴 A LOCATOR MUST NOT VERIFY ITSELF. Believing its own unitKind would make
// every check pass by construction.
test("a locator claiming a page for a Word document does not resolve", () => {
  const doc = word([para(LONG)]);
  assert.equal(resolveLocator(doc, { blockId: "b0", headingPath: [], unit: 0, unitKind: "page" }), null);
  assert.equal(resolveLocator(doc, { blockId: "b0", headingPath: [], unit: 0, unitKind: "body" }), doc.blocks[0]);
});

// 🔴 SILENTLY DROPPING A FAILED CITATION PRESENTS A PARTLY-CHECKED ANSWER AS A
// FULLY CHECKED ONE.
test("partitioning returns the refusals as well as the survivors", () => {
  const doc = pdf([para(LONG)]);
  const { refused, verified } = partitionCitations(doc, [
    { blockId: "b0", quote: LONG },
    { blockId: "b9", quote: LONG },
    { blockId: "b0", quote: "short" },
  ]);
  assert.equal(verified.length, 1);
  assert.deepEqual(refused.map((r) => r.refusal), ["unknown-block", "quote-too-short"]);
});

test("a quote inside a table cell cites the table it belongs to", () => {
  const doc = pdf([
    {
      headingPath: ["Dosing"],
      kind: "table",
      table: { headerRows: 1, rows: [["Drug", "Adjustment"], ["Tacrolimus", LONG]] },
      text: "",
      unit: 1,
    },
  ]);
  const result = citeQuote(doc, LONG);
  assert.ok(result.ok);
  assert.equal(result.block.kind, "table");
  assert.equal(describeLocator(result.locator), "page 2 · Dosing");
});
