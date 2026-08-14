// The grounded causal lane: what a model is allowed to have read out of the learner's own material.
//
// 🔴 EVERY TEST HERE IS A REFUSAL EXCEPT THE FIRST. That ratio is the design. The lane exists so a
// lecture full of mechanisms stops arriving as a glossary — but the cost of getting it wrong is not
// a missing question, it is a FALSE one: a claim the document never made, asked of a real learner as
// though their own lecture had said it, with their wrong answer recorded as their gap.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanvasSource } from "./canvas-model";
import { parseCausalTerritory } from "./causal-grounded";
import { objectivesForKnowledge } from "./learning-objective";
import { runtimeCanStage } from "./runtime-support";

const PASSAGE =
  "The incorporation of a stop codon will lead to pre-mature termination of the amino acid change.";

const SOURCES: CanvasSource[] = [
  {
    excerpts: [{ id: "s1:e1", label: "Variant types", text: PASSAGE, unitId: "b550" }],
    id: "s1",
    kind: "document",
    librarySourceId: "lib-1",
    title: "Variant types",
  } as CanvasSource,
];

const EDGE = {
  cause: "incorporation of a stop codon",
  effect: "pre-mature termination",
  excerptId: "s1:e1",
  negated: false,
  quote: "The incorporation of a stop codon will lead to pre-mature termination",
  relation: "causes",
  verb: "will lead to",
};

const read = (edges: unknown[], sources = SOURCES) =>
  parseCausalTerritory({ model: "test-model", sources, text: JSON.stringify({ relations: edges }) });

test("🔴 a grounded edge becomes knowledge the runtime can immediately stage", () => {
  const { objects, refusals } = read([EDGE]);
  assert.deepEqual(refusals, []);
  assert.equal(objects.length, 1);
  assert.equal(objects[0]!.type, "causal");
  assert.equal(objects[0]!.relation?.cause.text, "incorporation of a stop codon");
  assert.equal(objects[0]!.relation?.relation, "causes");
  assert.equal(objects[0]!.derivation, "model-prose");
  assert.equal(objects[0]!.provenance?.model, "test-model");

  // The anchor points at the source's real unit, so a correction can show where the claim came from.
  assert.equal(objects[0]!.sourceAnchors?.[0]?.sourceId, "lib-1");
  assert.equal(objects[0]!.sourceAnchors?.[0]?.unitId, "b550");

  // 🔴 AND IT REACHES A LEARNER, which is the whole reason this lane was wired. An object nothing can
  // stage is the state this codebase was already in: constructed, stored, and unreachable.
  const [objective] = objectivesForKnowledge(objects[0]!);
  assert.equal(objective?.capability, "predict");
  assert.ok(runtimeCanStage("causal", objective!.capability));
});

test("🔴 an edge naming no excerpt is refused — nothing in the material supports it", () => {
  const { objects, refusals } = read([{ ...EDGE, excerptId: undefined }]);
  assert.equal(objects.length, 0);
  assert.equal(refusals[0]?.reason, "missing-excerpt");
});

test("🔴 an invented excerpt id is refused, and it is the only place that can be caught", () => {
  // The grounding block prints every id we showed. An id that is not among them was invented, and so
  // was the relationship resting on it.
  const { objects, refusals } = read([{ ...EDGE, excerptId: "s9:e9" }]);
  assert.equal(objects.length, 0);
  assert.equal(refusals[0]?.reason, "unresolvable-excerpt");
});

test("🔴🔴 a quote stitched from a DIFFERENT excerpt is refused", () => {
  // 🔴 THE REASON VALIDATION IS PER EXCERPT AND NOT OVER THE WHOLE DOCUMENT. Both sentences below are
  // in the material, so a check against the concatenation would pass an edge whose cause came from
  // one slide and whose effect came from another — a relationship the document never asserted,
  // assembled out of two it did. Naming the excerpt is what makes this catchable at all.
  const sources: CanvasSource[] = [
    {
      ...SOURCES[0]!,
      excerpts: [
        { id: "s1:e1", label: "Variant types", text: PASSAGE, unitId: "b550" },
        { id: "s1:e2", label: "Variant types", text: "Silent variants change no amino acid at all.", unitId: "b551" },
      ],
    },
  ];
  const { objects, refusals } = read([{ ...EDGE, excerptId: "s1:e2" }], sources);
  assert.equal(objects.length, 0);
  assert.equal(refusals[0]?.reason, "rejected-by-contract");
  assert.match(refusals[0]!.detail, /quote-not-in-source/);
});

test("🔴 a source with no library row is refused rather than anchored to nothing", () => {
  const sources: CanvasSource[] = [{ ...SOURCES[0]!, librarySourceId: undefined } as CanvasSource];
  const { objects, refusals } = read([EDGE], sources);
  assert.equal(objects.length, 0);
  assert.equal(refusals[0]?.reason, "unanchorable-excerpt");
});

test("🔴 an unreadable response yields nothing, and never a salvage attempt", () => {
  const result = parseCausalTerritory({ model: "m", sources: SOURCES, text: "here are some edges: A causes B" });
  assert.equal(result.objects.length, 0);
  assert.equal(result.refusals[0]?.reason, "unreadable-response");
});

test("the same edge twice is one piece of knowledge", () => {
  const { objects, refusals } = read([EDGE, EDGE]);
  assert.equal(objects.length, 1);
  assert.equal(refusals[0]?.reason, "duplicate");
});

test("🔴 a denial is kept as a denial, and is different knowledge from the assertion", () => {
  // Dropping the negation would teach a learner the opposite of what their document says.
  const passage = "Price controls do not increase supply.";
  const sources: CanvasSource[] = [
    { ...SOURCES[0]!, excerpts: [{ id: "s1:e1", label: "Markets", text: passage, unitId: "b1" }] },
  ];
  const denied = read(
    [{ cause: "Price controls", effect: "supply", excerptId: "s1:e1", negated: true, quote: passage, relation: "increases" }],
    sources,
  );
  assert.equal(denied.objects.length, 1);
  assert.equal(denied.objects[0]!.relation?.negated, true);
  assert.match(denied.objects[0]!.statement, /does not increase/);

  // And the same edge asserted positively out of a passage that denies it is refused outright.
  const flipped = read(
    [{ cause: "Price controls", effect: "supply", excerptId: "s1:e1", negated: false, quote: passage, relation: "increases" }],
    sources,
  );
  assert.equal(flipped.objects.length, 0);
  assert.equal(flipped.refusals[0]?.reason, "rejected-by-contract");
});

test("🔴 one bad edge does not discard the good ones beside it", () => {
  // A lane that threw away the whole response on one refusal would make a single hallucination cost
  // a learner every mechanism in their lecture.
  const { objects, refusals } = read([{ ...EDGE, excerptId: "s9:e9" }, EDGE]);
  assert.equal(objects.length, 1);
  assert.equal(refusals.length, 1);
});
