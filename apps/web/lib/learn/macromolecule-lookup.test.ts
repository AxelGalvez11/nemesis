// The seam between a model answer and the macromolecule route, driven with no network.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveMacromolecules, type MacromoleculeLookupDeps } from "./macromolecule-lookup";

function routeReturning(results: unknown, status = 200): MacromoleculeLookupDeps & { calls: number } {
  const deps = {
    calls: 0,
    fetch: (async () => {
      deps.calls += 1;
      return { json: async () => ({ results }), ok: status < 400, status } as unknown as Response;
    }) as unknown as typeof globalThis.fetch,
  };
  return deps;
}

const LESSON = JSON.stringify({
  blocks: [{ visual: { kind: "macromolecule", learningGoal: "g", molecule: "myoglobin" } }],
});

const RESOLVED = { accession: "1MBN", name: "myoglobin", provider: "rcsb", title: "Myoglobin" };

test("an answer with no macromolecule in it never reaches the route", async () => {
  const deps = routeReturning([]);
  assert.equal(await resolveMacromolecules('{"say":"hello"}', deps), '{"say":"hello"}');
  assert.equal(deps.calls, 0);
});

test("a resolved name arrives as an accession with its stamp", async () => {
  const out = JSON.parse(
    await resolveMacromolecules(LESSON, routeReturning([{ ok: true, structure: RESOLVED }])),
  ) as { blocks: Array<{ visual: Record<string, unknown> }> };
  const visual = out.blocks[0]!.visual;
  assert.equal(visual.accession, "1MBN");
  assert.deepEqual(visual.resolvedFrom, { id: "1MBN", name: "myoglobin", provider: "rcsb" });
});

test("🔴 an accession that is not a PDB id degrades to no picture — never into a data URL", async () => {
  for (const accession of ["AF_AFP69905F1", "..", "ABCD", ""]) {
    const out = JSON.parse(
      await resolveMacromolecules(LESSON, routeReturning([{ ok: true, structure: { ...RESOLVED, accession } }])),
    ) as { blocks: Array<Record<string, unknown>> };
    assert.equal("visual" in out.blocks[0]!, false, accession);
  }
});

test("a result array of the wrong length applies nothing at all", async () => {
  const two = JSON.stringify({
    blocks: [
      { visual: { kind: "macromolecule", learningGoal: "g", molecule: "one" } },
      { visual: { kind: "macromolecule", learningGoal: "g", molecule: "two" } },
    ],
  });
  assert.equal(await resolveMacromolecules(two, routeReturning([{ ok: true, structure: RESOLVED }])), two);
});

test("a route that errors costs the picture and not the answer", async () => {
  for (const deps of [routeReturning([], 500), routeReturning("rubbish"), routeReturning(null)]) {
    assert.equal(await resolveMacromolecules(LESSON, deps), LESSON);
  }
});
