import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasPresentation } from "./canvas-presence";

// 🔴🔴🔴 THE LEARNER TYPED SOMETHING AND GOT AN EMPTY PAGE.
//
// Measured against production on 2026-08-18, sampling the real page twice a second:
//
//   "hello"                      nothing on the canvas, NO COMPOSER, for 25 seconds
//   "teach me pharmacokinetics"  the same, for 59 seconds
//
// No crash, no console error, no failed request. `learning-canvas.tsx` returned early on
// `policy.status === "loading"` and rendered a surface whose only content was a caption that
// appears solely once a NAMED phase has run long enough to be worth saying out loud. Most of that
// window there was no phase, so there was nothing at all — and the composer went with it, so the
// learner could not even type again.
//
// Two things had to be true for that to happen, and this file guards both.

const canvasSource = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const code = canvasSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("🔴🔴 resolving knowledge does not blank the canvas", () => {
  // Calibration: restore `!session.ready || policy.status === "loading"` and this reddens alone.
  const guard = code.slice(code.indexOf("if (!session.ready"), code.indexOf("if (!session.ready") + 120);
  assert.ok(
    !/policy\.status === "loading"/.test(guard),
    "the early return covers knowledge resolution again, which is the blank screen",
  );
  assert.match(guard, /if \(!session\.ready\)/, "the canvas renders before it has loaded");
});

test("🔴🔴 a canvas that is still resolving reports itself as WORKING", () => {
  // The other half. Without it the blank page returns wearing worse copy: knowledge resolution does
  // not always name a phase, so `working` would be false and presence would land on `quiet` — which
  // tells the learner there is nothing to ask them about while it is still working it out.
  // 🔴 REPOINTED 2026-08-19 FROM THE EXPRESSION TO ITS TERMS. This pinned the whole line, so ADDING
  // a fourth thing that counts as work — `policy.deciding`, which fixed "nothing to ask you about"
  // appearing between two questions — failed a guard whose own comment says more states should
  // count, not fewer. Each term is asserted separately now: dropping any one still reddens, and
  // adding one does not.
  for (const term of [
    /busy\.kind !== null/,
    /policy\.phase !== null/,
    /policy\.status === "loading"/,
    // The gap between two questions: ready, no phase named, session not busy. Without this the
    // canvas reported a dead end mid-lesson, with a Try again button for something that was working.
    /policy\.deciding/,
  ]) {
    assert.match(code, new RegExp(`const working =[\\s\\S]{0,240}?${term.source}`), `\`working\` no longer counts ${term.source}`);
  }
});

// ── What the learner is shown instead, at the level that decides it ─────────

test("a canvas with a turn in flight is `preparing`, which carries the composer", () => {
  const { presence, regions } = canvasPresentation({
    blocks: 0,
    canvasState: "empty",
    policyPresenting: false,
    working: true,
  });
  assert.equal(presence, "preparing");
  assert.equal(regions.policy, false, "a loading policy must not be given a region to present in");
});

test("🔴 a canvas that is still resolving is never `quiet`", () => {
  // `quiet` says "nothing to ask you about yet". Saying that about a canvas which has not finished
  // looking is progress rendered as failure.
  for (const canvasState of ["empty", "sources_attached", "learn"] as const) {
    const { presence } = canvasPresentation({ blocks: 0, canvasState, policyPresenting: false, working: true });
    assert.notEqual(presence, "quiet", `a working ${canvasState} canvas reported itself as having nothing`);
  }
});

test("an untouched canvas with nothing running is still the front door", () => {
  const { presence } = canvasPresentation({ blocks: 0, canvasState: "empty", policyPresenting: false, working: false });
  assert.equal(presence, "invitation");
});
