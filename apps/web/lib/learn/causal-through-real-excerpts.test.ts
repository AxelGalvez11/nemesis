// Does the causal lane survive the excerpts a REAL document is actually cut into?
//
// 🔴 THE LANE'S OWN TESTS BUILD THEIR EXCERPTS BY HAND, AND THAT IS THE HOLE THIS FILLS. Every
// refusal in `causal-grounded.test.ts` is checked against a fixture excerpt written to make the
// point — a single tidy sentence with an id. Production excerpts come from
// `excerptsFromSourceContext`, which drops headings, keeps a table whole however large, and BREAKS
// LONG PROSE INTO PIECES. If an asserting sentence can land across one of those breaks, then
// `validateCausalEdges` — whose strongest guard is that the quote appears character for character
// in the passage — refuses every edge on it, the lane returns nothing, and the result is
// indistinguishable from a document that simply asserts no mechanisms.
//
// 🔴 SO THE QUESTION IS NOT "DOES THE PARSER WORK", IT IS "CAN A TRUE EDGE EVER PASS". A lane that
// is wired, typechecks, and refuses 100% of real input is the failure this codebase keeps paying
// for, and nothing above it would notice.

import assert from "node:assert/strict";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext } from "@/lib/sources/source-context";

import { excerptsFromSourceContext } from "./canvas-grounding";
import type { CanvasSource } from "./canvas-model";
import { parseCausalTerritory } from "./causal-grounded";
import { objectivesForKnowledge } from "./learning-objective";

/** The asserting sentence the edges below are read from. Ordinary length, ordinary punctuation. */
const CLAIM = "The incorporation of a stop codon will lead to pre-mature termination of translation.";

/**
 * Prose long enough that `excerptsFromSourceContext` must split it.
 *
 * 🔴 OVER THE 2,400-CHARACTER CAP ON PURPOSE, AND THE CLAIM SITS PAST THE FIRST BREAK. A short
 * paragraph would prove only that an unsplit unit works, which is the case that was never in doubt.
 */
const FILLER = "Variant classification depends on the position and the reading frame. ".repeat(45);
const PROSE = `${FILLER}${CLAIM} ${FILLER}`;

function realExcerpts(): CanvasSource[] {
  const model: DocumentModel = {
    blocks: [
      { headingPath: [], id: "h1", kind: "heading", text: "Variant types", unit: 0 } as DocBlock,
      { headingPath: ["Variant types"], id: "b1", kind: "paragraph", text: PROSE, unit: 0 } as DocBlock,
    ],
    format: "pdf",
    title: "Variant types",
    units: [{ index: 0, kind: "page" }],
  };
  const context = buildSourceContext({
    sourceId: "lib-1",
    sourceKind: "pdf",
    structure: JSON.parse(JSON.stringify(structureEnvelope({ model, text: PROSE, title: "Variant types" }))),
  });
  return [
    {
      excerpts: excerptsFromSourceContext("s1", context),
      id: "s1",
      kind: "document",
      librarySourceId: "lib-1",
      title: "Variant types",
    } as CanvasSource,
  ];
}

const SOURCES = realExcerpts();

/** The excerpt the claim actually landed in, found the way a truthful model would find it. */
const HOLDER = SOURCES[0]!.excerpts.find((excerpt) => excerpt.text.includes(CLAIM));

test("🔴 the fixture is doing its job: the prose really is split into several excerpts", () => {
  // Calibrates everything below. If the paragraph came back whole, the tests that follow would pass
  // for the wrong reason — they would be proving the easy case while claiming to prove the hard one.
  assert.ok(SOURCES[0]!.excerpts.length > 1, "the paragraph must be split, or this file proves nothing");
  assert.ok(HOLDER, "and the claim must survive intact inside ONE of the pieces");
  // The heading is not itself quotable and must not have become an excerpt.
  assert.equal(SOURCES[0]!.excerpts.some((e) => e.text === "Variant types"), false);
});

test("🔴🔴 a true edge, quoted verbatim, survives real chunking all the way to an objective", () => {
  // 🔴 THE ONE THAT MATTERS. Everything else in this lane is a refusal; if this cannot pass, the
  // lane is a very careful way of returning nothing.
  const { objects, refusals } = parseCausalTerritory({
    model: "test-model",
    sources: SOURCES,
    text: JSON.stringify({
      relations: [
        {
          cause: "incorporation of a stop codon",
          effect: "pre-mature termination",
          excerptId: HOLDER!.id,
          negated: false,
          quote: CLAIM,
          relation: "causes",
          verb: "will lead to",
        },
      ],
    }),
  });

  assert.deepEqual(refusals, [], "a verbatim quote from a real excerpt must not be refused");
  assert.equal(objects.length, 1);
  assert.equal(objects[0]!.sourceAnchors?.[0]?.unitId, "b1", "the anchor points at the real block");
  assert.equal(objectivesForKnowledge(objects[0]!)[0]?.capability, "predict");
});

test("🔴 an edge quoting ACROSS a split boundary is refused, not silently accepted", () => {
  // The failure mode this file exists to bound. It degrades to a refusal — a missing question —
  // rather than to a claim anchored to a passage that does not contain it. That is the safe
  // direction, and it is worth asserting rather than assuming.
  const [first, second] = SOURCES[0]!.excerpts;
  const straddling = `${first!.text.slice(-40)}${second!.text.slice(0, 40)}`;
  const { objects, refusals } = parseCausalTerritory({
    model: "test-model",
    sources: SOURCES,
    text: JSON.stringify({
      relations: [
        {
          cause: "position",
          effect: "reading frame",
          excerptId: first!.id,
          negated: false,
          quote: straddling,
          relation: "causes",
          verb: "depends on",
        },
      ],
    }),
  });
  assert.equal(objects.length, 0);
  assert.equal(refusals[0]?.reason, "rejected-by-contract");
});

test("🔴 an excerpt id that is real but holds a DIFFERENT piece is refused", () => {
  // A model that names the paragraph rather than the piece is the likeliest real mistake — and it
  // must not pass, because the anchor would then point a learner at text that does not say this.
  const elsewhere = SOURCES[0]!.excerpts.find((excerpt) => excerpt.id !== HOLDER!.id)!;
  const { objects, refusals } = parseCausalTerritory({
    model: "test-model",
    sources: SOURCES,
    text: JSON.stringify({
      relations: [
        {
          cause: "incorporation of a stop codon",
          effect: "pre-mature termination",
          excerptId: elsewhere.id,
          negated: false,
          quote: CLAIM,
          relation: "causes",
          verb: "will lead to",
        },
      ],
    }),
  });
  assert.equal(objects.length, 0);
  assert.equal(refusals[0]?.reason, "rejected-by-contract");
  assert.match(refusals[0]!.detail, /quote-not-in-source/);
});
