// The surface walk: finding formula requests, putting grids back, dropping what failed.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is the positional one. `applySurfaceGrids` consumes results by
// walk order, so the invariant that keeps a grid off the wrong surface is that collect and apply
// visit the identical tree identically — asserted here on an answer holding two requests.

import assert from "node:assert/strict";
import test from "node:test";

import { applySurfaceGrids, collectSurfaceRequests, mightComputeSurface } from "./computed-surface";

const SADDLE = {
  expression: "x^2 - y^2",
  kind: "surface",
  learningGoal: "See the saddle",
  xFrom: -2,
  xTo: 2,
  yFrom: -2,
  yTo: 2,
};

const LESSON = {
  blocks: [
    { content: "First, the saddle.", type: "paragraph", visual: SADDLE },
    { content: "No picture here.", type: "paragraph" },
    {
      content: "Then the bowl.",
      type: "paragraph",
      visual: { ...SADDLE, expression: "x^2 + y^2", learningGoal: "See the bowl" },
    },
  ],
};

const GRID = [
  [1, 2],
  [3, 4],
];

test("the substring gate is cheap and honest", () => {
  assert.equal(mightComputeSurface(JSON.stringify(LESSON)), true);
  assert.equal(mightComputeSurface('{"blocks":[{"content":"hi"}]}'), false);
});

test("collect walks any envelope and keeps walk order", () => {
  const found = collectSurfaceRequests(LESSON);
  assert.equal(found.length, 2);
  assert.equal(found[0]?.expression, "x^2 - y^2");
  assert.equal(found[1]?.expression, "x^2 + y^2");
});

test("🔴 a surface already carrying a grid is not collected — a stored block must not recompute", () => {
  const found = collectSurfaceRequests({ visual: { ...SADDLE, grid: GRID } });
  assert.equal(found.length, 0);
});

test("a surface with a missing bound or an empty expression is left for the validator", () => {
  assert.equal(collectSurfaceRequests({ visual: { ...SADDLE, xTo: undefined } }).length, 0);
  assert.equal(collectSurfaceRequests({ visual: { ...SADDLE, expression: " " } }).length, 0);
});

test("apply stamps grids positionally onto the same tree", () => {
  const applied = applySurfaceGrids(LESSON, [
    { grid: GRID, ok: true },
    { grid: [[5, 6], [7, 8]], ok: true },
  ]) as typeof LESSON & { blocks: Array<{ visual?: { grid?: unknown; expression?: string } }> };
  assert.deepEqual(applied.blocks[0]?.visual?.grid, GRID);
  assert.deepEqual(applied.blocks[2]?.visual?.grid, [[5, 6], [7, 8]]);
  assert.equal(applied.blocks[1]?.visual, undefined);
});

test("🔴 a surface that could not be computed loses its visual whole — the prose survives", () => {
  const applied = applySurfaceGrids(LESSON, [
    { detail: "no value anywhere", ok: false, reason: "nothing-to-plot" },
    { grid: GRID, ok: true },
  ]) as { blocks: Array<{ content: string; visual?: { expression?: string } }> };
  assert.equal(applied.blocks[0]?.visual, undefined);
  assert.equal(applied.blocks[0]?.content, "First, the saddle.");
  // ...and the SECOND result still lands on the SECOND request: position held despite the failure.
  assert.equal(applied.blocks[2]?.visual?.expression, "x^2 + y^2");
});

test("a failed surface in a visuals array leaves the array rather than sitting in it as null", () => {
  const decision = { visuals: [SADDLE, { kind: "equation", latex: "e = mc^2", learningGoal: "E" }] };
  const applied = applySurfaceGrids(decision, [
    { detail: "refused", ok: false, reason: "expression-unknown-function" },
  ]) as { visuals: unknown[] };
  assert.equal(applied.visuals.length, 1);
  assert.deepEqual(applied.visuals[0], { kind: "equation", latex: "e = mc^2", learningGoal: "E" });
});

test("collection is capped, and everything past the cap is dropped rather than misapplied", () => {
  const crowded = { visuals: Array.from({ length: 6 }, (_, index) => ({ ...SADDLE, xTo: 2 + index })) };
  const found = collectSurfaceRequests(crowded);
  assert.equal(found.length, 4);
  const applied = applySurfaceGrids(crowded, found.map(() => ({ grid: GRID, ok: true }))) as {
    visuals: Array<{ grid?: unknown }>;
  };
  // Four stamped, two dropped — never a fifth surface wearing the first grid again.
  assert.equal(applied.visuals.filter((visual) => visual.grid).length, 4);
  assert.equal(applied.visuals.length, 4);
});
