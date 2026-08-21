// 🔴 EVERY TEST HERE IS ABOUT WHOSE ANSWER REACHED THE LEARNER. The chemistry is `chem-resolver`'s
// problem and is already tested there; what is new is the correspondence — that a name resolves onto
// the structure that asked for it, that a failed lookup costs a picture rather than an explanation,
// and above all that a model cannot claim a resolver's provenance for a string it made up.

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyResolvedStructures,
  collectCompoundNames,
  mightResolveStructure,
  type StructureResolution,
} from "./structure-resolve";

const found = (name: string, value: string, id = "2244"): StructureResolution => ({
  ok: true,
  structure: { id, name, notation: "smiles", provider: "pubchem", value },
});

const missing: StructureResolution = { detail: "no such compound", ok: false, reason: "not-found" };

const ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O";

test("the cheap test comes first, so an answer with no compound in it pays nothing", () => {
  assert.equal(mightResolveStructure('{"say":"hello"}'), false);
  assert.equal(mightResolveStructure('{"say":"here is [smiles: CCO]"}'), false);
  assert.equal(mightResolveStructure('{"say":"here is [compound: aspirin]"}'), true);
  assert.equal(mightResolveStructure('{"visuals":[{"kind":"structure","compound":"benzene"}]}'), true);
});

test("names are collected from both channels", () => {
  assert.deepEqual(collectCompoundNames({ say: "look at [compound: aspirin] and [compound: caffeine]" }), [
    "aspirin",
    "caffeine",
  ]);
  assert.deepEqual(collectCompoundNames({ visuals: [{ compound: "benzene", kind: "structure" }] }), ["benzene"]);
});

// 🔴 A GENERIC GROUP IS NOT A LOOKUP, and this is the case that makes the whole design additive.
// `*O` is every alcohol; no database holds it under a name, and routing it through a resolver would
// have broken the fix that made functional groups drawable in the first place.
test("notation the model wrote is left completely alone", () => {
  assert.deepEqual(collectCompoundNames({ say: "an alcohol is [smiles: *O]" }), []);
  assert.deepEqual(collectCompoundNames({ visuals: [{ kind: "structure", notation: "smiles", value: "*O" }] }), []);
});

test("an inline token becomes the channel that already draws", () => {
  const answer = { say: "Aspirin: [compound: aspirin] — note the ester." };
  const applied = applyResolvedStructures(answer, [found("aspirin", ASPIRIN)]) as { say: string };
  assert.equal(applied.say, `Aspirin: [smiles: ${ASPIRIN}] — note the ester.`);
});

test("a structure visual is filled in and stamped", () => {
  const answer = { visuals: [{ compound: "aspirin", kind: "structure", learningGoal: "the ester" }] };
  const applied = applyResolvedStructures(answer, [found("aspirin", ASPIRIN)]) as {
    visuals: Array<Record<string, unknown>>;
  };
  const visual = applied.visuals[0] ?? {};
  assert.equal(visual.value, ASPIRIN);
  assert.equal(visual.notation, "smiles");
  assert.deepEqual(visual.resolvedFrom, { id: "2244", name: "aspirin", provider: "pubchem" });
  assert.equal("compound" in visual, false, "the request field must not survive into the visual");
  assert.equal(visual.learningGoal, "the ester", "everything else the model said survives");
});

// 🔴🔴 THE ONE THAT MATTERS MOST. `resolvedFrom` means "a resolver was asked for this name and
// returned this string". A model can write those words, and a model that wrote them beside a
// remembered SMILES would be laundering its own memory into provenance — producing a structure the
// product presents as looked-up when nothing was ever looked up. The validator still accepts the
// field because trusted callers set it; nothing arriving from a model gets to keep it.
test("🔴 a model cannot claim provenance it did not earn", () => {
  const claimed = {
    visuals: [{
      kind: "structure",
      notation: "smiles",
      resolvedFrom: { id: "2244", name: "aspirin", provider: "pubchem" },
      value: "CCO",
    }],
  };
  const applied = applyResolvedStructures(claimed, []) as { visuals: Array<Record<string, unknown>> };
  assert.equal("resolvedFrom" in (applied.visuals[0] ?? {}), false);
  assert.equal(applied.visuals[0]?.value, "CCO", "the notation itself still draws — only the claim goes");
});

test("a claimed stamp is also stripped from a structure that IS resolved", () => {
  const answer = { visuals: [{ compound: "aspirin", kind: "structure", resolvedFrom: { id: "1", name: "x", provider: "pubchem" } }] };
  const applied = applyResolvedStructures(answer, [found("aspirin", ASPIRIN)]) as {
    visuals: Array<Record<string, unknown>>;
  };
  assert.deepEqual(applied.visuals[0]?.resolvedFrom, { id: "2244", name: "aspirin", provider: "pubchem" });
});

// 🔴 A LOOKUP THAT FAILED LOSES THE PICTURE, NEVER THE PROSE — the same policy computed plots
// follow. Falling back to a model-written SMILES would run the least trustworthy path exactly when
// the trustworthy one found nothing, which is the failure §42 exists to prevent one layer down.
test("a name that did not resolve costs the picture and not the answer", () => {
  const answer = { say: "Here it is: [compound: unobtainium] — note the ring.", visuals: [] };
  const applied = applyResolvedStructures(answer, [missing]) as { say: string };
  assert.equal(applied.say, "Here it is:  — note the ring.");
  assert.ok(!applied.say.includes("compound"), "the internal token must never reach a learner");
});

test("an unresolved structure visual is removed rather than drawn empty", () => {
  const answer = { visuals: [{ compound: "unobtainium", kind: "structure" }] };
  const applied = applyResolvedStructures(answer, [missing]) as { visuals: unknown[] };
  assert.deepEqual(applied.visuals, []);
});

// 🔴 THE POSITIONAL CONTRACT, WHICH FAILS SILENTLY IF IT FAILS AT ALL. Results are consumed in
// traversal order across both channels at once; getting it wrong draws benzene under the caption for
// glucose, which is a confidently wrong molecule rather than a missing one.
test("results stay in register across both channels and a failure in the middle", () => {
  const answer = {
    say: "first [compound: aspirin], then [compound: nope], then [compound: caffeine]",
    visuals: [{ compound: "benzene", kind: "structure" }],
  };
  const applied = applyResolvedStructures(answer, [
    found("aspirin", ASPIRIN),
    missing,
    found("caffeine", "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "2519"),
    found("benzene", "c1ccccc1", "241"),
  ]) as { say: string; visuals: Array<Record<string, unknown>> };
  assert.equal(applied.say, `first [smiles: ${ASPIRIN}], then , then [smiles: Cn1cnc2c1c(=O)n(C)c(=O)n2C]`);
  assert.equal(applied.visuals[0]?.value, "c1ccccc1");
});

test("an answer with nothing to look up comes back unchanged", () => {
  const answer = { say: "an alcohol is [smiles: *O]", visuals: [{ kind: "quantitative" }] };
  assert.deepEqual(applyResolvedStructures(answer, []), answer);
});
