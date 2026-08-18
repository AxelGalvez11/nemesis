import assert from "node:assert/strict";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";

import { buildSourceContext, readableUnits, unitContent, type SourceContext } from "./source-context";

// 🔴 A DIAGRAM WHOSE PARTS ARE NAMED WAS BEING CALLED EMPTY.
//
// Found by the production figure-occlusion harness, not by a test. It uploaded a labelled diagram to
// the real application; the real parser stored the pixels and the real vision pass read two labels
// off them — and `extractKnowledgeObjects` minted nothing:
//
//   PASS  FIGURE-LEGIBLE — 1 figures · 1 carry pixels and at least two labels
//   FAIL  SPATIAL-KNOWLEDGE — none extracted
//
// The cause was one condition in `unitContent`: a figure with neither caption nor description
// returned `{ kind: "empty" }`, `readableUnits` drops every empty unit, and `figuresFromUnits`
// iterates `readableUnits`. So the figure never reached the extractor that exists to read it, and
// no learner could ever be shown a covered diagram — however green the unit tests were.
//
// 🔴 AND THE DISCARDED CASE WAS THE BEST ONE. "Empty" was judging PROSE. A bare diagram — no
// caption, no surrounding sentence, parts named in the picture itself — is the most occludable
// figure there is, and it is exactly the shape that was thrown away. Anatomy plates, circuit
// schematics and labelled apparatus are all this shape.
//
// 🔴 BUILT THROUGH THE REAL BOUNDARY, NOT A HAND-WRITTEN CONTEXT. A stub `SourceContext` would let
// this pass while `buildSourceContext` dropped the labels on the way in — which is the hop six other
// structural fields have died at. The model below is the shape a parser actually emits.

function figureModel(
  labels: { text: string; x: number; y: number }[],
  over: { caption?: string; description?: string } = {},
): DocumentModel {
  return {
    blocks: [
      {
        figure: {
          asset: { mime: "image/png", path: "u/1/image1.png" },
          labels,
          ref: "image1.png",
          ...(over.description ? { description: over.description } : {}),
        },
        headingPath: [],
        id: "f1",
        kind: "figure",
        // 🔴 THE CAPTION IS THE BLOCK'S OWN TEXT, not `figure.caption` — `buildSourceContext` reads
        // `block.text.trim()` for it. Writing this fixture the other way produced a null caption and
        // looked like a field dying at the boundary; it was the fixture that was wrong.
        text: over.caption ?? "",
        unit: 0,
      } as unknown as DocBlock,
    ],
    format: "pptx",
    title: "A deck of one diagram",
    units: [{ index: 0, kind: "slide" }],
  } as unknown as DocumentModel;
}

function contextOf(model: DocumentModel): SourceContext {
  return buildSourceContext({
    sourceId: "lib-1",
    sourceKind: "slides",
    structure: JSON.parse(JSON.stringify(structureEnvelope({ model, text: "", title: "A deck of one diagram" }))),
  });
}

const TWO_LABELS = [
  { text: "anode", x: 0.3, y: 0.4 },
  { text: "cathode", x: 0.7, y: 0.4 },
];

// ── the defect, at each hop it had to survive ───────────────────────────────

test("🔴 a diagram with named parts and no caption is CONTENT, not empty", () => {
  const [unit] = contextOf(figureModel(TWO_LABELS)).units;
  assert.ok(unit, "the figure must survive into the source context at all");
  assert.notEqual(
    unitContent(unit).kind,
    "empty",
    "two named parts and stored pixels is the most teachable figure there is — it cannot be empty",
  );
});

test("🔴 and it survives readableUnits, which is what the extractor iterates", () => {
  // A correct `unitContent` consulted by a filter that still dropped the unit would be the defect
  // unchanged. This is the hop that actually starved the extractor.
  assert.equal(readableUnits(contextOf(figureModel(TWO_LABELS))).length, 1);
});

test("🔴 so spatial knowledge is actually minted, with pixels to show", () => {
  // The end of the chain, and the assertion the production harness makes. Anything short of this
  // proves a boundary rather than the feature.
  const spatial = extractKnowledgeObjects(contextOf(figureModel(TWO_LABELS))).objects.filter(
    (knowledge) => knowledge.type === "spatial" && Boolean(knowledge.figure?.assetPath),
  );
  assert.equal(spatial.length, 1, "a labelled diagram must become one spatial knowledge object");
  assert.match(spatial[0]!.statement, /anode/);
  assert.match(spatial[0]!.statement, /cathode/);
});

// ── what must NOT have changed ──────────────────────────────────────────────

test("🔴 a figure with NOTHING — no caption, no description, no labels — is still empty", () => {
  // The case the empty branch was written for, and it is the common one: a logo, a divider, a
  // decorative photograph. Making every figure readable would push those into the extractor and
  // into coverage, where they would read as material a learner could be taught from.
  const context = contextOf(figureModel([]));
  const [unit] = context.units;
  assert.equal(unit ? unitContent(unit).kind : "empty", "empty");
  assert.equal(readableUnits(context).length, 0);
});

test("🔴 ONE label is still empty — a single-label picture is not a diagram", () => {
  // `isOccludable` refuses fewer than two: covering the only label collapses the question to "what
  // is this picture called", which the association lane already serves. Admitting it here would put
  // a unit into coverage that no extractor can use, which is a false claim about how much of the
  // document a learner could be taught from — worse than dropping it.
  const context = contextOf(figureModel([{ text: "anode", x: 0.3, y: 0.4 }]));
  const [unit] = context.units;
  assert.equal(unit ? unitContent(unit).kind : "empty", "empty");
  assert.equal(readableUnits(context).length, 0);
});

test("a captioned figure keeps its caption and description", () => {
  const [unit] = contextOf(
    figureModel([], { caption: "Figure 2. A diode.", description: "Current flows one way." }),
  ).units;
  const content = unit ? unitContent(unit) : { kind: "empty" as const };
  assert.equal(content.kind, "figure");
  assert.equal(content.kind === "figure" ? content.caption : null, "Figure 2. A diode.");
  assert.equal(content.kind === "figure" ? content.description : null, "Current flows one way.");
});

// ── the gate above the gate ─────────────────────────────────────────────────

test("🔴 a deck that is ONLY diagrams is not a failed parse", () => {
  // 🔴🔴 THE DEFECT THE PRODUCTION HARNESS ACTUALLY FOUND, and it is one exit higher than the empty
  // judgement above. `parseQuality` returns "failed" whenever `capabilities.text` is false, and a
  // slide carrying nothing but a labelled diagram has no text — so `readKnowledgeObjects` returned
  // *"nothing readable survived this document's parse"* while the parser had stored the pixels and
  // vision had read two labels off them. Both fixes are needed: without the first the unit never
  // reaches the extractor, and without this one the extractor never runs.
  const context = contextOf(figureModel(TWO_LABELS));
  assert.equal(context.quality, "failed", "a textless deck really does report a failed parse — that is the trap");

  const extraction = extractKnowledgeObjects(context);
  assert.equal(extraction.objects.length, 1, "the figure lane must run before the quality gate, not after it");
  assert.deepEqual(
    extraction.refusals ?? [],
    [],
    "claiming nothing readable survived is false once a diagram has been read",
  );
  assert.notEqual(extraction.outcome, "failed");
});

test("🔴 and a document with genuinely nothing still says so", () => {
  // The refusal must survive for the case it was written for. Deleting the gate rather than
  // narrowing it would turn every truly empty parse into a silent success.
  const extraction = extractKnowledgeObjects(contextOf(figureModel([])));
  assert.equal(extraction.outcome, "failed");
  assert.equal(extraction.refusals?.[0]?.reason, "degraded-parse");
});
