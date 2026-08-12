/**
 * THE INVARIANT: extracted source text contains only what the document says.
 *
 * 🔴 THE DEFECT THIS EXISTS TO END. An unexamined figure rendered as the literal
 * sentence "[Figure — not examined]" — application metadata dressed as prose —
 * and every consumer downstream of `blockToText` inherited it: `documentToText`,
 * chunks, embeddings, retrieval, Canvas evidence, chat context. A learner could
 * be shown, as the document's own words, a sentence no author ever wrote.
 *
 * It was invisible on our own corpus because our corpus asks "did we lose
 * anything?" and this ADDS. An external benchmark found it immediately: 8,135
 * occurrences across 769 of 2,036 documents, and the largest single cause of
 * Nemesis being scored as hallucinating.
 *
 * 🔴 THE GAP IS NOT HIDDEN — IT MOVED TO WHERE IT CANNOT BE MISREAD. The figure
 * block survives, `coverage` still counts it, `figureFacts` still says
 * `examined: false`. What is gone is the forged sentence. "Disclosing" a gap by
 * making it retrievable prose does not disclose it; it launders it into content.
 *
 * The rule this file enforces, for every format:
 *
 *     figure exists, no description
 *       → the model still records the figure
 *       → coverage still reports it
 *       → extracted text contains NO synthetic prose
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkDocument } from "./document-chunks.ts";
import { inventoryFacts } from "./document-facts.ts";
import { buildDocument, documentToText, type DocBlock } from "./document-model.ts";

/** Anything a parser invents rather than reads. Matched case-insensitively. */
const SYNTHETIC = [/not examined/i, /\[figure\b/i, /\[image\b/i, /\[unsupported/i];

function assertNoSyntheticProse(text: string, where: string): void {
  for (const pattern of SYNTHETIC) {
    assert.ok(!pattern.test(text), `${where} contains invented prose matching ${pattern}`);
  }
}

const FIGURE: DocBlock = { figure: {}, headingPath: [], id: "b2", kind: "figure", text: "", unit: 0 };

const MODEL = buildDocument({
  blocks: [
    { headingPath: [], kind: "paragraph", text: "Clearance falls with age.", unit: 0 },
    FIGURE,
    { headingPath: [], kind: "paragraph", text: "The mechanism is renal.", unit: 0 },
  ],
  format: "pdf",
  title: "T",
  units: [{ index: 0, kind: "page" }],
});

test("🔴 a figure nobody examined adds no sentence to the document's text", () => {
  const text = documentToText(MODEL);
  assertNoSyntheticProse(text, "documentToText");
  // And nothing real was removed to achieve that.
  assert.ok(text.includes("Clearance falls with age."));
  assert.ok(text.includes("The mechanism is renal."));
});

test("🔴 nor to any chunk — chunks are what retrieval returns to a learner", () => {
  const joined = chunkDocument(MODEL).map((c) => c.text).join("\n");
  assertNoSyntheticProse(joined, "chunks");
  assert.ok(joined.includes("Clearance falls with age."));
});

test("the figure is STILL in the model — the gap is disclosed, not deleted", () => {
  const figures = MODEL.blocks.filter((b) => b.kind === "figure");
  assert.equal(figures.length, 1, "the block survives; only its forged text is gone");
  assert.equal(figures[0]!.text, "", "and it claims no text of its own");
});

test("the inventory still reports it, as a field", () => {
  const figure = inventoryFacts(MODEL).find((f) => f.kind === "figure");
  assert.ok(figure, "an unexamined figure is still inventoried");
  assert.equal(figure!.examined, false, "`examined: false` is the disclosure");
  assertNoSyntheticProse(figure!.text ?? "", "figure fact text");
});

test("a CAPTION is source text and must survive — this removes additions, not content", () => {
  const captioned = buildDocument({
    blocks: [{ figure: {}, headingPath: [], kind: "figure", text: "Figure 3. Renal clearance.", unit: 0 }],
    format: "pdf",
    title: "T",
    units: [{ index: 0, kind: "page" }],
  });
  assert.ok(documentToText(captioned).includes("Renal clearance."));
});

test("a vision description still reaches consumers when one exists", () => {
  // The vision lane's whole value is that description. It is an inference and is
  // marked as one, but it is not synthetic prose pretending to be the source.
  const described = buildDocument({
    blocks: [
      { figure: { description: "Two curves crossing at t=4." }, headingPath: [], kind: "figure", text: "", unit: 0 },
    ],
    format: "pdf",
    title: "T",
    units: [{ index: 0, kind: "page" }],
  });
  assert.ok(documentToText(described).includes("Two curves crossing at t=4."));
});
