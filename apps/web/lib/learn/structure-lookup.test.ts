// The seam between a model answer and PubChem, driven with no network and no server.
//
// 🔴 THE HAPPY PATH IS TWO LINES; THE FAILURES ARE THE FILE. This sits between the model and the
// learner, so every way it can go wrong is a way a turn can be lost or — worse — a way a wrong
// molecule can be drawn confidently. §42's whole argument is that the second failure is invisible
// from the outside, which is why several tests below insist on "nothing at all" rather than "as much
// as we could manage".

import assert from "node:assert/strict";
import test from "node:test";

import { resolveStructures, type StructureLookupDeps } from "./structure-lookup";

const ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O";

function routeReturning(results: unknown, status = 200): StructureLookupDeps & { calls: number } {
  const deps = {
    calls: 0,
    fetch: (async () => {
      deps.calls += 1;
      return { json: async () => ({ results }), ok: status < 400, status } as unknown as Response;
    }) as unknown as typeof globalThis.fetch,
  };
  return deps;
}

const NEVER: StructureLookupDeps & { calls: number } = {
  calls: 0,
  fetch: (async () => {
    NEVER.calls += 1;
    throw new Error("the route must not have been called");
  }) as unknown as typeof globalThis.fetch,
};

const ONE_NAME = JSON.stringify({ say: "Aspirin: [compound: aspirin]" });

const resolved = { id: "2244", name: "aspirin", notation: "smiles", provider: "pubchem", value: ASPIRIN };

test("an answer with no compound in it never reaches the route", async () => {
  const before = NEVER.calls;
  for (const text of ['{"say":"hello"}', '{"say":"an alcohol is [smiles: *O]"}']) {
    assert.equal(await resolveStructures(text, NEVER), text);
  }
  assert.equal(NEVER.calls, before);
});

test("text that is not JSON is returned untouched", async () => {
  const text = "I could look up [compound: aspirin] for you.";
  assert.equal(await resolveStructures(text, NEVER), text);
});

test("a resolved name becomes a drawable structure", async () => {
  const deps = routeReturning([{ ok: true, structure: resolved }]);
  const out = JSON.parse(await resolveStructures(ONE_NAME, deps));
  assert.equal(deps.calls, 1);
  assert.equal(out.say, `Aspirin: [smiles: ${ASPIRIN}]`);
});

// 🔴🔴 EVERYTHING OR NOTHING. Results are addressed by POSITION, so a route returning fewer than it
// was asked for would shift every later name onto the wrong structure — benzene under the caption
// for glucose. That is a confidently wrong molecule, which is exactly what resolving names was meant
// to prevent, and it is invisible to everything downstream.
test("a result array of the wrong length applies nothing at all", async () => {
  const two = JSON.stringify({ say: "[compound: aspirin] and [compound: caffeine]" });
  assert.equal(await resolveStructures(two, routeReturning([{ ok: true, structure: resolved }])), two);
});

test("a route that errors, or answers with rubbish, costs the picture and not the answer", async () => {
  for (const deps of [
    routeReturning([], 500),
    routeReturning("not an array"),
    { calls: 0, fetch: (async () => { throw new Error("offline"); }) as unknown as typeof globalThis.fetch },
  ]) {
    assert.equal(await resolveStructures(ONE_NAME, deps), ONE_NAME);
  }
});

test("a name PubChem does not hold loses its token, and the sentence survives", async () => {
  const deps = routeReturning([{ detail: "no such compound", ok: false, reason: "not-found" }]);
  const out = JSON.parse(await resolveStructures(ONE_NAME, deps));
  assert.equal(out.say, "Aspirin: ");
  assert.ok(!out.say.includes("compound"), "the internal token must never reach a learner");
});

// 🔴 OUR OWN ROUTE IS STILL CHECKED ON ARRIVAL, and here that is not ceremony. A half-written
// response that kept the provenance stamp but lost the SMILES would present a model's own memory as
// a database lookup — worse than carrying no provenance at all.
test("a partial resolution is refused rather than half-applied", async () => {
  for (const structure of [
    { id: "2244", name: "aspirin", notation: "smiles", provider: "pubchem" },
    { ...resolved, provider: "somewhere-else" },
    { ...resolved, notation: "inchi" },
    { ...resolved, value: "" },
  ]) {
    const out = JSON.parse(await resolveStructures(ONE_NAME, routeReturning([{ ok: true, structure }])));
    assert.equal(out.say, "Aspirin: ", `a structure missing its guarantees was drawn: ${JSON.stringify(structure)}`);
  }
});

test("a slow resolver is abandoned rather than held against the learner", async () => {
  const deps: StructureLookupDeps = {
    fetch: ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof globalThis.fetch,
    timeoutMs: 20,
  };
  assert.equal(await resolveStructures(ONE_NAME, deps), ONE_NAME);
});
