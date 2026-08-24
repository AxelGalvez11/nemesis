// The atlas resolver: names in, region files and highlight lists out, nothing invented.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is the multi-match one. "cervical vertebrae" is FIVE nodes in
// the atlas, and a resolver that picked one arbitrarily would highlight C3 while the lesson talks
// about the neck — plausible, wrong, and invisible. Every match travels, like a pointer circling a
// group on a wall chart.

import assert from "node:assert/strict";
import test from "node:test";

import { ANATOMY_ATLAS } from "./anatomy-atlas";
import { collectAnatomyAsks, mightResolveAnatomy, resolveAnatomy, resolveStructureName } from "./anatomy-resolve";
import { validateCanvasVisual } from "./canvas-visual";

test("the registry holds the harvested skeleton with the atlas's own names", () => {
  assert.ok(ANATOMY_ATLAS.length >= 1);
  const skeleton = ANATOMY_ATLAS.find((region) => region.region === "overview-skeleton");
  assert.ok(skeleton, "the skeleton region has gone missing from the registry");
  assert.ok(skeleton.structures.length > 100, `only ${skeleton?.structures.length} structures harvested`);
  for (const name of ["Sacrum", "Frontal bone", "Atlas (C1)"]) {
    assert.ok(skeleton.structures.includes(name), `"${name}" is not in the registry`);
  }
  assert.match(skeleton.assetPath, /^\/anatomy\/[a-z0-9-]+\.glb$/);
});

test("a single bone resolves to itself", () => {
  const resolved = resolveStructureName("sacrum");
  assert.ok(resolved);
  assert.deepEqual(resolved?.structures, ["Sacrum"]);
  assert.equal(resolved?.region, "overview-skeleton");
});

test("🔴 a group name resolves to EVERY member, never an arbitrary one", () => {
  const resolved = resolveStructureName("cervical vertebrae");
  assert.ok(resolved);
  // C3–C7 carry the group name; the atlas names C1 and C2 Atlas and Axis.
  assert.ok((resolved?.structures.length ?? 0) >= 5, `only ${resolved?.structures.length} matched`);
  assert.ok(resolved?.structures.every((name) => name.includes("Cervical")));
});

test("a left/right pair both travel", () => {
  const resolved = resolveStructureName("parietal bone");
  assert.deepEqual(resolved?.structures.slice().sort(), ["Parietal bone left", "Parietal bone right"]);
});

test("🔴 an ask too broad to point at anything becomes the whole region, not a smear of highlights", () => {
  const broad = resolveStructureName("bone");
  assert.ok(broad);
  assert.deepEqual(broad?.structures, []);
  const region = resolveStructureName("skeleton");
  assert.deepEqual(region?.structures, []);
});

test("a structure the atlas does not carry resolves to nothing", () => {
  assert.equal(resolveStructureName("mitral valve"), null);
  assert.equal(resolveStructureName(""), null);
});

test("the pass stamps in place and the stamp satisfies the validator", () => {
  const answer = JSON.stringify({
    blocks: [
      {
        content: "The keystone of the pelvis.",
        visual: { kind: "anatomy", learningGoal: "Place the sacrum", structure: "sacrum" },
      },
    ],
  });
  const out = JSON.parse(resolveAnatomy(answer)) as { blocks: Array<{ visual: unknown }> };
  const validated = validateCanvasVisual(out.blocks[0]?.visual);
  assert.equal(validated.ok, true);
  assert.ok(validated.ok && validated.visual.kind === "anatomy" && validated.visual.resolved?.structures[0] === "Sacrum");
});

test("🔴 an unresolvable ask loses its visual whole and the prose survives", () => {
  const answer = JSON.stringify({
    blocks: [
      {
        content: "The valve between the left atrium and ventricle.",
        visual: { kind: "anatomy", learningGoal: "Place it", structure: "mitral valve" },
      },
    ],
  });
  const out = JSON.parse(resolveAnatomy(answer)) as { blocks: Array<{ content: string; visual?: unknown }> };
  assert.equal(out.blocks[0]?.visual, undefined);
  assert.equal(out.blocks[0]?.content, "The valve between the left atrium and ventricle.");
});

test("a stamped request passes through untouched, and prose mentioning anatomy is not a request", () => {
  const stamped = JSON.stringify({
    visual: {
      kind: "anatomy",
      learningGoal: "g",
      resolved: { assetPath: "/anatomy/overview-skeleton.glb", region: "overview-skeleton", regionTitle: "Skeleton", structures: ["Sacrum"] },
      structure: "sacrum",
    },
  });
  assert.equal(resolveAnatomy(stamped), stamped);
  const prose = 'This lesson touches "anatomy" only in passing.';
  assert.equal(resolveAnatomy(prose), prose);
  assert.equal(mightResolveAnatomy("no such word"), false);
});

test("🔴 the validator refuses what no resolver stamped — the registry is the only door to the meshes", () => {
  const raw = validateCanvasVisual({ kind: "anatomy", learningGoal: "g", structure: "sacrum" });
  assert.equal(raw.ok, false);
  assert.equal(raw.ok === false && raw.reason, "malformed-anatomy");
  const steered = validateCanvasVisual({
    kind: "anatomy",
    learningGoal: "g",
    resolved: { assetPath: "https://evil.test/model.glb", region: "overview-skeleton", regionTitle: "Skeleton", structures: [] },
    structure: "sacrum",
  });
  assert.equal(steered.ok, false);
  assert.match(steered.ok === false ? steered.detail : "", /same-origin/);
});

test("the collector counts unresolved asks for the progress label", () => {
  const value = {
    visuals: [
      { kind: "anatomy", structure: "sacrum" },
      { kind: "anatomy", resolved: {}, structure: "already stamped" },
      { kind: "equation", latex: "x" },
    ],
  };
  assert.deepEqual(collectAnatomyAsks(value), ["sacrum"]);
});
