// The character is a squircle, and stays one.
//
// Owner, 2026-08-26: *"could you make the character, the mascot, a cube? instead of the circle?"*
// → *"use squircle like in the github repo for bloub"*, applied to the app AND the site.
//
// 🔴 THESE ARE GEOMETRY TESTS, NOT SOURCE-TEXT ONES, WHEREVER THAT IS POSSIBLE. A shape that is
// wired up but never reaches the picture is the exact failure this feature is most exposed to:
// the outline is one optional field threaded through two draw calls, and dropping it anywhere
// along the way draws a perfectly good ball. So the questions asked here are "is the drawn body
// actually not round" and "do the eyes sit on the drawn body", both answered off real path data.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ANIMATION_BY_ID, DEFAULT_AVATAR, FACE_BY_ID } from "@/lib/avatar";
import { drawFace, eyeFrames } from "@/lib/avatar/render";
import { SQUIRCLE, superellipseProfile, normaliseProfile } from "@/lib/avatar/vendor/silhouettes";

import { CHARACTER_SILHOUETTE } from "./body";
import { ACTIVITY_STATE } from "./stations";

const RESTING = FACE_BY_ID.get("neutral")!;

/** Every coordinate pair in an SVG path, as points. */
function points(d: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) {
    out.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return out;
}

/** How far the outline reaches, in the direction `deg`, from the picture's centre. */
function reach(d: string, deg: number): number {
  let best = 0;
  for (const p of points(d)) {
    const at = (Math.atan2(p.y, p.x) * 180) / Math.PI;
    // Smallest turn between the two headings, so 359 and 1 are two degrees apart.
    const off = Math.abs(((at - deg + 540) % 360) - 180);
    if (off < 6) best = Math.max(best, Math.hypot(p.x, p.y));
  }
  return best;
}

/**
 * A body drawn as a table of ones.
 *
 * 🔴 NOT `drawFace(...)` WITH NO OUTLINE, AND THE DIFFERENCE IS THE WHOLE REASON THIS EXISTS. A
 * sphere with no silhouette takes `bodyPath`'s exact shortcut and comes back as a two-arc circle,
 * which has no points along most rays and cannot be measured the same way. Handing it an explicitly
 * round table takes the SAMPLED path — the same code the squircle goes through — so the comparison
 * is between two hulls rather than between a hull and an arc.
 */
const ROUND: readonly number[] = new Array(64).fill(1);

// ── The shape itself ────────────────────────────────────────────────────────────────────────

test("🔴 the squircle is upstream's, not one of mine", () => {
  // If this ever fails, the fix is to match upstream again, never to retune the numbers here.
  // `skins.ts` in jeremy-prt/bloub: { id: 'squircle', radii: normalize(superellipseProfile(4.2), 1.15) }
  assert.deepEqual([...SQUIRCLE], normaliseProfile(superellipseProfile(4.2), 1.15));
  assert.equal(SQUIRCLE.length, 64, "the outline is not on the engine's 64-sample grid");
  assert.equal(CHARACTER_SILHOUETTE, SQUIRCLE, "the character wears something other than the vendored squircle");
});

test("🔴 it is flatter on the sides and fuller on the corners, which is what makes it a squircle", () => {
  // 0/90/180/270 are the flat faces; 45 and friends are the corners. A circle has these equal, so
  // this is the assertion that a table of ones cannot pass.
  const side = SQUIRCLE[0]!;
  const corner = SQUIRCLE[8]!;
  assert.ok(corner > side * 1.15, `corner ${corner} is not fuller than side ${side}`);
  assert.ok(side < 1, `the sides ${side} did not come in; the shape would read bigger than the ball`);
  assert.ok(Math.max(...SQUIRCLE) <= 1.1501, "the peak is not upstream's 1.15");

  // Four-fold symmetry: every quarter of the table is the same quarter. A shape that has drifted
  // off the axes would still pass the corner test above and would be visibly crooked on screen.
  for (let i = 0; i < 16; i += 1) {
    for (const q of [16, 32, 48]) {
      assert.ok(Math.abs(SQUIRCLE[i]! - SQUIRCLE[i + q]!) < 1e-9, `the outline is not symmetric at sample ${i}`);
    }
  }
});

// ── It reaches the picture ──────────────────────────────────────────────────────────────────

test("🔴🔴 the DRAWN body is a squircle, not a ball with a squircle in a variable somewhere", () => {
  const round = drawFace(DEFAULT_AVATAR.surface, RESTING, { rest: ROUND }).body;
  const shaped = drawFace(DEFAULT_AVATAR.surface, RESTING, { rest: CHARACTER_SILHOUETTE }).body;
  assert.notEqual(shaped, round, "the outline changed nothing about the drawn body");

  // A ball reaches the same distance in every direction. The squircle must not.
  const roundRatio = reach(round, 45) / reach(round, 0);
  const shapedRatio = reach(shaped, 45) / reach(shaped, 0);
  assert.ok(Math.abs(roundRatio - 1) < 0.02, `the reference body is not round (${roundRatio})`);
  assert.ok(shapedRatio > 1.12, `the drawn body is still round-ish (corner/side = ${shapedRatio})`);
});

test("🔴 a caller that asks for nothing still gets the body as it was measured", () => {
  // The catalogue browser and the character studio draw the ten vendored solids. Pushing our
  // outline onto a cone or a capsule would draw a shape that is in no reference and that nobody
  // chose, so `rest` is opt-in and this is the assertion that keeps it opt-in.
  const bare = drawFace(DEFAULT_AVATAR.surface, RESTING).body;
  const explicitlyNone = drawFace(DEFAULT_AVATAR.surface, RESTING, { rest: null }).body;
  assert.equal(bare, explicitlyNone);
});

test("🔴🔴 the eyes ride the squircle, so features do not float over its edge", () => {
  // 🔴 THIS IS THE HALF THAT IS SILENT WHEN IT BREAKS. `drawFace` and `eyeFrames` are two calls
  // with two option objects, and threading the outline into one of them draws a squircle body
  // wearing eyes positioned for a ball. Nothing errors; the spectacles and brows simply sit a few
  // units off the eye, worst where the outline differs most, which is the corners.
  const opts = { rest: CHARACTER_SILHOUETTE } as const;
  const [ballLeft] = eyeFrames(DEFAULT_AVATAR.surface, RESTING);
  const [shapedLeft] = eyeFrames(DEFAULT_AVATAR.surface, RESTING, opts);
  assert.ok(
    Math.hypot(shapedLeft.x - ballLeft.x, shapedLeft.y - ballLeft.y) > 0.5,
    "the eye did not move when the body did",
  );

  // And it moved OUTWARD, with the outline, rather than anywhere at all.
  assert.ok(Math.hypot(shapedLeft.x, shapedLeft.y) > Math.hypot(ballLeft.x, ballLeft.y));
});

// ── The assumption `posedAt` rests on ───────────────────────────────────────────────────────

test("🔴🔴🔴 no animation the app schedules brings a silhouette of its own", () => {
  // 🔴 WHY THIS IS THE MOST IMPORTANT TEST IN THE FILE. `posedAt` in render.ts lets a pose's own
  // silhouette win over the character's resting one, which is right — but `blendFaces` mixes a
  // MISSING silhouette against a table of ones, so the first frame of a morph from a resting face
  // into `egg` starts from a BALL. The character would snap squircle → round → egg. Nothing in the
  // product can reach that today because every scheduled animation rests at no silhouette, and
  // this is the test that keeps that sentence true rather than merely true-so-far.
  //
  // 🔴 IF IT FAILS, DO NOT ADD A BRANCH TO `posedAt`. The fix is upstream: `mixProfile` needs the
  // resting outline as its baseline. See the note on `posedAt`.
  //
  // It is also the app's half of the site's shape rule (`landing/lib/character/body.ts`), written
  // against a different table because the two renderers describe a body differently.
  for (const [activity, id] of Object.entries(ACTIVITY_STATE)) {
    const animation = ANIMATION_BY_ID.get(id);
    assert.ok(animation, `${activity} schedules ${id}, which is not in the catalogue`);
    for (const step of animation.steps) {
      const profile = FACE_BY_ID.get(step.face)?.body?.profile ?? null;
      assert.equal(profile, null, `${activity} plays ${id}, whose face ${step.face} reshapes the body`);
    }
  }
});

// ── Every surface that IS Nemesis wears it ──────────────────────────────────────────────────

test("🔴🔴 every surface that draws the product's own character passes the outline", () => {
  // 🔴 A SOURCE-TEXT GUARD, AND IT EARNS ITS KEEP: forgetting one site does not fail, it draws a
  // BALL beside a squircle on the same page. The front door's greeter and the canvas's dock are
  // the pair that would be caught in one glance; `canvas-thinking` and the settings preview are
  // the ones nobody would notice for weeks.
  const WEARS_IT = [
    ["../../components/character/character-dock.tsx", "the character above the composer"],
    ["../../components/workspace/learn/canvas-home.tsx", "the front door's greeter"],
    ["../../components/workspace/learn/canvas-thinking.tsx", "the small one beside a judgement"],
    ["../../components/SettingsSurface.tsx", "the settings preview"],
  ] as const;
  for (const [path, what] of WEARS_IT) {
    const src = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(src, /silhouette=\{CHARACTER_SILHOUETTE\}/, `${what} draws a ball while everything else is a squircle`);
  }
});
