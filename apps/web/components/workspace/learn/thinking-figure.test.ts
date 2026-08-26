// The character while it works: a face, and one line beside it, lit left to right.
//
// 🔴🔴 THE POSE CALLED `thinking` IS THE THREE DOTS. `lib/bloub/states.ts` says so outright — *"la
// boule DEVIENT le point du milieu"* — and it fades the eyes to zero while it does. So for weeks the
// character was not standing beside a caption while it worked; it had dissolved INTO the dots, which
// is why every screenshot the owner sent showed dots and no face. Owner, 2026-08-21: *"remove the
// three dots animation, i just want the mascot and the words lit left to right."*
//
// 🔴 THIS FILE WAS REWRITTEN AT THE MERGE, AND THE REWRITE IS THE INTERESTING PART. It used to
// assert that `CanvasThinkingPreview` drew its own character over its own dots — which was true of
// one branch and wrong on main, where the caption moved ONTO the dock so that being beside the
// character is structural rather than two layouts agreeing. Main's mechanism is better: the mascot's
// position is a live transform, and no static box on a page can sit beside one. What survives from
// both is the rule underneath — one character, a face on it, and the words carrying the motion.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const STATIONS = readFileSync(new URL("../../../lib/character/stations.ts", import.meta.url), "utf8");
const DOCK = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const BOT = readFileSync(new URL("../../avatar/nemesis-avatar.tsx", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

// 🔴 THIS GUARD USED TO PIN THE STRING `thinking: "idle"`, WHICH IS NOT WHAT IT MEANT. The rule
// the owner set is that the character keeps its FACE while it works — `idle` was merely the pose
// that happened to satisfy it in August. When the expression audit moved the working pose to
// `curious` (2026-08-25), a correct change failed this test and no incorrect change would have.
// So it now asks the question directly: resolve whatever the schedule names, and check every face
// it can reach actually has eyes and is still the creature's own body.
test("🔴 the character keeps its face while it works", async () => {
  const { ACTIVITY_STATE } = await import("../../../lib/character/stations");
  const { ANIMATION_BY_ID, FACE_BY_ID } = await import("../../../lib/avatar");

  for (const wait of ["thinking", "preparing"] as const) {
    const id = ACTIVITY_STATE[wait];
    const animation = ANIMATION_BY_ID.get(id);
    assert.ok(animation, `${wait} schedules "${id}", which is not in the catalogue`);
    for (const step of animation.steps) {
      const face = FACE_BY_ID.get(step.face)!;
      // The dots fade the eyes to zero. That is the exact thing the owner removed by name.
      assert.notEqual(face.eyeAlpha, 0, `${wait} → "${id}" reaches "${face.id}", which has no face`);
      // The egg, the hexagon and the exclamation mark stop it being a creature.
      assert.equal(face.body, undefined, `${wait} → "${id}" reaches "${face.id}", which changes the body`);
    }
  }

  // And they are still ONE experience (owner 2026-08-20: "why is it only doing swirl?").
  assert.equal(
    ACTIVITY_STATE.thinking,
    ACTIVITY_STATE.preparing,
    "the two waits no longer look like one experience",
  );
});

// 🔴🔴 THE BREAK THAT CAME WITH IT, AND WHY IT IS PASSED RATHER THAN DERIVED. `stationOf` reads the
// POSE to decide corner or centre, which worked while every working pose was unique to working.
// `idle` is also how the character rests, so one id now means two opposite places — and a resting
// character dragged to the middle of the page would be far worse than the dots ever were.
test("🔴 the surface says where the character stands, because the pose no longer can", () => {
  assert.match(DOCK, /station\?: Station;/, "the dock cannot be told where to stand");
  assert.match(DOCK, /const station = stationOverride \?\? stationOf\(shown\)/);
  assert.match(CANVAS, /station=\{turnInFlight \|\| presence === "preparing" \? "centre" : "corner"\}/);
  // 🔴 AND THE DERIVED DEFAULT SURVIVES FOR EVERY CALLER WITH NO OPINION. A prop that silently
  // became mandatory would move the character on surfaces nobody had looked at.
  assert.match(STATIONS, /export function stationOf/);
});

// 🔴 ONE MOTION SYSTEM. §20 asks for information forming left to right, and `.canvas-thinking-word`
// is the same band and the same 1900ms as `.canvas-forming` and `.canvas-rewriting`. A second
// treatment beside the character would read as a second kind of event happening at once.
test("🔴 the words are lit left to right, at the rate everything else moves at", () => {
  assert.match(DOCK, /canvas-thinking-word/, "the caption stopped carrying the motion");
  assert.match(CSS, /@keyframes canvas-thinking-word \{ from \{ background-position: 200% 0; \}/);
  assert.match(CSS, /\.canvas-thinking-word \{[\s\S]*?animation: canvas-thinking-word 1900ms linear infinite;/);
  for (const sibling of ["canvas-forming", "canvas-rewriting"]) {
    assert.match(CSS, new RegExp(`animation: ${sibling} 1900ms linear infinite`), `${sibling} drifted`);
  }
});

// 🔴 A FILLED CAPSULE IS A BADGE, AND A BADGE SAYS "STATUS" — which is what a spinner says. The
// words themselves carrying the light is what says "this is being worked through", and a background
// defeats `background-clip: text` outright.
test("🔴 the caption is words, not a pill", () => {
  const caption = DOCK.slice(DOCK.indexOf("character-caption"), DOCK.indexOf("character-caption") + 400);
  assert.ok(!/bg-\(--ui-bg-tertiary\)/.test(caption), "the caption is a filled badge again");
  assert.ok(!/rounded-full/.test(caption), "the caption is a filled badge again");
});

test("🔴 the caption makes way when the answer starts", () => {
  assert.match(DOCK, /captionLeaving/, "the caption cannot be told the wait is over");
  assert.match(CANVAS, /captionLeaving=\{Boolean\(replyText\.trim\(\)\)\}/);
  assert.match(CSS, /\.canvas-preview-out \{\s*animation: canvas-preview-out 220ms ease-out forwards;/);
  // 🔴 REDUCED MOTION SHORTENS IT RATHER THAN REMOVING IT. `forwards` holds the end state, so
  // `animation: none` would leave the caption sitting over the answer for ever — the one case where
  // stopping an animation is not the safe reading of the preference.
  const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.canvas-preview-out \{ animation-duration: 1ms; \}/);
});

test("🔴 nothing draws three dots, and the character is one ink", () => {
  assert.ok(!CSS.includes("canvas-thinking-dot"), "a hand-drawn dot row is back");
  assert.ok(!BOT.includes("pulseTint"), "the accent tint on the character is back");
});
