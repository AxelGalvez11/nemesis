// The material the causal lane reads — and the production defect these tests exist to hold shut.
//
// 🔴 THE BUG WAS NOT IN THE EXTRACTOR, IT WAS IN WHAT THE EXTRACTOR WAS HANDED. `mechanismsFor`
// received every source's canonical parse and passed the canvas's OWN stored excerpts instead.
// Measured on production 2026-08-16: 555 of 790 stored excerpts carry no `unitId`, and `locate()`
// refuses an excerpt with no unit as "unanchorable" — so on 4 of the 11 canvases holding material,
// every causal edge died before the model's reading was consulted. The first test below is that
// defect, written as the thing that must never come back.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanvasSource } from "./canvas-model";
import { causalMaterial } from "./causal-material";
import { parseCausalTerritory } from "./causal-grounded";
import type { SourceContext } from "@/lib/sources/source-context";

const PASSAGE =
  "When the load exceeds the yield point, permanent deformation occurs in the beam.";

/** A canonical parse, in the shape `sourceContextFromModel` produces. */
const CONTEXT = {
  capabilities: { semanticUnits: true },
  contentIntegrity: "intact",
  quality: "full",
  sourceId: "lib-1",
  sourceKind: "pdf",
  title: "Beam behaviour",
  units: [
    {
      anchor: { headingPath: ["Yielding"], sourceId: "lib-1", unitId: "b7" },
      depth: 0,
      id: "b7",
      text: PASSAGE,
      type: "paragraph",
      unitLabel: "Slide 7",
    },
  ],
} as unknown as SourceContext;

/** A canvas source as production actually stores one on the four affected canvases: excerpts that
 *  were built before units existed, so they carry no `unitId` at all. */
const STALE: CanvasSource = {
  durability: "durable",
  excerpts: [{ id: "s1:e1", label: "Yielding", text: PASSAGE }],
  id: "s1",
  kind: "pdf",
  librarySourceId: "lib-1",
  title: "Beam behaviour",
} as CanvasSource;

const EDGE = {
  cause: "the load exceeds the yield point",
  effect: "permanent deformation occurs in the beam",
  excerptId: "s1:e1",
  negated: false,
  quote: PASSAGE,
  relation: "causes",
  verb: "occurs",
};

const read = (sources: readonly CanvasSource[]) =>
  parseCausalTerritory({
    model: "test-model",
    sources,
    text: JSON.stringify({ relations: [EDGE] }),
  });

test("🔴🔴 THE PRODUCTION DEFECT: stale stored excerpts refuse every causal edge as unanchorable", () => {
  // Not a hypothetical. This is the shape of 4 of the 11 production canvases that hold material,
  // and it is why the corpus held zero causal knowledge: no model reading could have survived it.
  const { objects, refusals } = read([STALE]);
  assert.equal(objects.length, 0, "a stale excerpt must not silently produce an unanchorable object");
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0]!.reason, "unanchorable-excerpt");
});

test("🔴🔴 rebuilding from the canonical parse is what makes the same edge survive", () => {
  // The whole fix, stated as a before/after over one input: same canvas, same model response, and
  // the ONLY difference is that the material came from the context `mechanismsFor` already had.
  const material = causalMaterial([STALE], [CONTEXT]);
  const { objects, refusals } = read(material);
  assert.deepEqual(refusals, []);
  assert.equal(objects.length, 1);
  assert.equal(objects[0]!.type, "causal");
  // The durable anchor is the point of the whole exercise: it must name the document's own unit.
  assert.equal(objects[0]!.sourceAnchors?.[0]?.unitId, "b7");
  assert.equal(objects[0]!.sourceAnchors?.[0]?.sourceId, "lib-1");
});

test("every rebuilt excerpt carries the unit it was cut from", () => {
  // The anchorability guarantee, asserted directly rather than inferred from the edge surviving.
  const [source] = causalMaterial([STALE], [CONTEXT]);
  assert.ok(source);
  assert.ok(source.excerpts.length > 0);
  for (const excerpt of source.excerpts) {
    assert.ok(excerpt.unitId, `excerpt ${excerpt.id} must carry a unitId or it can never be anchored`);
  }
});

test("🔴 the canvas's own stored excerpts are never mutated or re-keyed", () => {
  // A canvas citation resolves by excerpt id. Re-keying the stored list would point existing
  // SourceRefs at different text — a locator that passes every check and means something else.
  const before = JSON.stringify(STALE);
  causalMaterial([STALE], [CONTEXT]);
  assert.equal(JSON.stringify(STALE), before, "the stored source must be untouched");
});

test("🔴 a source with no canonical parse is left out rather than passed through unanchored", () => {
  // Passing it through would reach the same zero one layer down, having paid for a model call.
  const orphan = { ...STALE, librarySourceId: "lib-does-not-exist" };
  assert.deepEqual(causalMaterial([orphan], [CONTEXT]), []);
  // And a source that was never filed at all has no durable id to match on.
  const ephemeral = { ...STALE, librarySourceId: undefined };
  assert.deepEqual(causalMaterial([ephemeral], [CONTEXT]), []);
});

test("the canvas-local id and title survive, because the model is told to cite them", () => {
  const [source] = causalMaterial([{ ...STALE, id: "s3", title: "Beams" }], [CONTEXT]);
  assert.equal(source?.id, "s3");
  assert.equal(source?.title, "Beams");
  assert.ok(source?.excerpts.every((excerpt) => excerpt.id.startsWith("s3:")));
});
