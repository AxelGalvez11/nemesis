// The anatomy walk: finding asks, putting stamps back, dropping what the atlas does not carry.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is the positional one, and the guard beside it: this module
// must never import the registry, or the names of every bone and muscle ship to every learner.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyResolvedAnatomy, collectAnatomyAsks, mightResolveAnatomy } from "./anatomy-resolve";
import { validateCanvasVisual } from "./canvas-visual";

const STAMP = {
  assetPath: "/anatomy/overview-skeleton.glb",
  region: "overview-skeleton",
  regionTitle: "Skeleton",
  source: "open3dmodel",
  structures: ["Sacrum"],
};

const LESSON = {
  blocks: [
    { content: "The keystone of the pelvis.", visual: { kind: "anatomy", learningGoal: "Place it", structure: "sacrum" } },
    { content: "No picture here." },
    { content: "And the neck.", visual: { kind: "anatomy", learningGoal: "Place them", structure: "cervical vertebrae" } },
  ],
};

test("🔴 the pure pass never imports the atlas — the registry stays off the learner's bundle", () => {
  const source = readFileSync(new URL("./anatomy-resolve.ts", import.meta.url), "utf8");
  assert.equal(source.includes("anatomy-atlas"), false, "the walk now imports the registry");
  assert.equal(source.includes("anatomy-match"), false, "the walk now imports the matcher, which imports the registry");
});

test("the substring gate is cheap and honest", () => {
  assert.equal(mightResolveAnatomy(JSON.stringify(LESSON)), true);
  assert.equal(mightResolveAnatomy('{"blocks":[{"content":"hi"}]}'), false);
});

test("collect walks any envelope, keeps order, and skips what is already stamped", () => {
  assert.deepEqual(collectAnatomyAsks(LESSON), ["sacrum", "cervical vertebrae"]);
  assert.deepEqual(collectAnatomyAsks({ visual: { kind: "anatomy", resolved: STAMP, structure: "sacrum" } }), []);
});

test("apply stamps positionally, and the stamp satisfies the validator", () => {
  const applied = applyResolvedAnatomy(LESSON, [
    { ok: true, resolved: STAMP },
    { ok: true, resolved: { ...STAMP, structures: ["Cervical vertebrae (C3)"] } },
  ]) as { blocks: Array<{ visual?: unknown }> };
  const validated = validateCanvasVisual(applied.blocks[0]?.visual);
  assert.equal(validated.ok, true);
  assert.ok(validated.ok && validated.visual.kind === "anatomy" && validated.visual.resolved?.structures[0] === "Sacrum");
  assert.equal(applied.blocks[1]?.visual, undefined);
});

test("🔴 an ask the atlas cannot answer loses its visual whole, and the prose survives", () => {
  const applied = applyResolvedAnatomy(LESSON, [
    { detail: "not in the atlas", ok: false, reason: "not-in-atlas" },
    { ok: true, resolved: STAMP },
  ]) as { blocks: Array<{ content: string; visual?: { resolved?: unknown } }> };
  assert.equal(applied.blocks[0]?.visual, undefined);
  assert.equal(applied.blocks[0]?.content, "The keystone of the pelvis.");
  // ...and the SECOND result still lands on the SECOND ask: position held despite the failure.
  assert.ok(applied.blocks[2]?.visual?.resolved);
});

test("a dropped view leaves a visuals array rather than sitting in it as null", () => {
  const decision = {
    visuals: [
      { kind: "anatomy", learningGoal: "g", structure: "nothing at all" },
      { kind: "equation", latex: "x", learningGoal: "g" },
    ],
  };
  const applied = applyResolvedAnatomy(decision, [{ detail: "", ok: false, reason: "not-in-atlas" }]) as {
    visuals: unknown[];
  };
  assert.equal(applied.visuals.length, 1);
});

test("🔴 the validator refuses what no resolver stamped — the atlas is the only door to the meshes", () => {
  const raw = validateCanvasVisual({ kind: "anatomy", learningGoal: "g", structure: "sacrum" });
  assert.equal(raw.ok, false);
  assert.equal(raw.ok === false && raw.reason, "malformed-anatomy");
  const steered = validateCanvasVisual({
    kind: "anatomy",
    learningGoal: "g",
    resolved: { ...STAMP, assetPath: "https://evil.test/model.glb" },
    structure: "sacrum",
  });
  assert.equal(steered.ok, false);
  assert.match(steered.ok === false ? steered.detail : "", /same-origin/);
});
