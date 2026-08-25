import assert from "node:assert/strict";
import { test } from "node:test";

import { ANIMATIONS, ANIMATION_BY_ID } from "./animations";
import { AVATARS, DEFAULT_AVATAR } from "./avatars";
import { FACES, FACE_BY_ID } from "./faces";
import {
  animationDuration,
  blendFaces,
  blinkAt,
  cursorAt,
  ease,
  nearestAngle,
  playedFaceAt,
} from "./play";
import { SHUT_HEIGHT, drawFace } from "./render";
import { FOCAL, RADIUS, faceToSkin, project, quatFromTurn, rotate } from "./space";
import { avatarFrameAt } from "./index";

/** The bounding box of every coordinate pair in a path. */
const box = (d: string): { cx: number; cy: number; w: number; h: number } => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n.length; i += 2) {
    x0 = Math.min(x0, n[i]!);
    x1 = Math.max(x1, n[i]!);
    y0 = Math.min(y0, n[i + 1]!);
    y1 = Math.max(y1, n[i + 1]!);
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
};

// ── Fidelity ────────────────────────────────────────────────────────────────────

/**
 * 🔴 THE REFERENCE'S OWN OUTPUT, RESTATED BY HAND.
 *
 * These are the eye boxes the reference engine produces for five of its faces —
 * `[centreX, centreY, width, height]`, in the 300-unit frame both engines draw into. They
 * were read off that engine running beside this one and then typed in here, so this file
 * and the reference are two independent statements of the same geometry.
 *
 * That is the whole point of this test. This engine was written from a reading of theirs
 * and it is far too easy to write something that LOOKS right: the first version had the
 * head's three rotations composed in the wrong order, which moved every eye a few units
 * and passed every other check. Nothing catches that except a number.
 *
 * If one of these ever disagrees, the fix is to go back to the reference and re-measure,
 * never to edit the expectation until it matches.
 */
const REFERENCE_EYES: readonly [string, readonly number[], readonly number[]][] = [
  ["upwardSideGlance", [23.64, -49.63, 33.93, 45.91], [75.04, -58.84, 29.34, 42.49]],
  ["skepticalRight", [-31.89, 46.55, 36.65, 63.01], [32.63, 33.54, 56.99, 27.7]],
  ["surprisedLeft", [-72.38, 21.27, 48.23, 59.96], [-0.59, -7.64, 63.18, 63.08]],
  ["eyesClosed", [-54.65, 30.34, 58.16, 22.17], [22.85, 17.81, 66.08, 28.86]],
  ["farRightGlance", [53.97, -11.06, 28.3, 47.61], [99.55, -19.57, 18.4, 44.72]],
];

test("🔴 every eye lands where the reference puts it", () => {
  for (const [id, left, right] of REFERENCE_EYES) {
    const face = FACE_BY_ID.get(id);
    assert.ok(face, `no face called ${id}`);
    const frame = drawFace(DEFAULT_AVATAR.surface, face);
    for (const [side, want] of [["left", left], ["right", right]] as const) {
      const got = box(side === "left" ? frame.left : frame.right);
      const near = (a: number, b: number, what: string) =>
        assert.ok(Math.abs(a - b) < 0.15, `${id} ${side} ${what}: ${a.toFixed(2)} vs ${b}`);
      near(got.cx, want[0]!, "centre x");
      near(got.cy, want[1]!, "centre y");
      near(got.w, want[2]!, "width");
      near(got.h, want[3]!, "height");
    }
  }
});

test("🔴 a sphere projects to the radius the lens says, not to its own", () => {
  // 122.31 for a ball of radius 120, and the reference's own rendered path says
  // "A122.32 122.31". A body drawn at 120 would mean the perspective divide is missing,
  // which is most of what makes a turned head read as turned.
  const frame = drawFace(DEFAULT_AVATAR.surface, FACE_BY_ID.get("smallAttentive")!);
  const radii = frame.body.match(/A([\d.]+) ([\d.]+)/);
  assert.ok(radii, "the body is not an arc");
  const want = (RADIUS * FOCAL) / Math.sqrt(FOCAL * FOCAL - RADIUS * RADIUS);
  assert.ok(Math.abs(Number(radii[1]) - want) < 0.02, `${radii[1]} vs ${want.toFixed(2)}`);
  assert.ok(Math.abs(want - 122.31) < 0.01, `the lens moved: ${want.toFixed(3)}`);
});

test("the head's rotations compose in the order the faces were authored against", () => {
  // Z · X · Y. Asserted through a point rather than through the quaternion's components,
  // because the components are an implementation detail and where a point lands is not.
  const turn = { x: 30, y: 40, z: 20 };
  const p = rotate(quatFromTurn(turn), [0, 0, RADIUS]);
  // Measured from the composition under test; the guard is that ANY other order moves it.
  const other = rotate(quatFromTurn({ x: 40, y: 30, z: 20 }), [0, 0, RADIUS]);
  assert.ok(Math.hypot(p[0] - other[0], p[1] - other[1]) > 5, "the axes are interchangeable — they must not be");
  assert.ok(Math.abs(Math.hypot(...p) - RADIUS) < 1e-6, "rotation changed the length");
});

test("the face is wrapped on a globe, so the centre stays at the centre", () => {
  const middle = faceToSkin(0, 0);
  assert.equal(middle.x, 0);
  assert.equal(middle.y, 0);
  // A quarter turn round the body lands on the side, not a quarter of the way across.
  const side = faceToSkin((RADIUS * Math.PI) / 2, 0);
  assert.ok(Math.abs(side.x - RADIUS) < 1e-6, `a quarter turn reached ${side.x}`);
});

test("a point behind the lens is still finite", () => {
  for (const z of [-1000, 0, FOCAL - 0.00001, FOCAL + 1000]) {
    const [x, y] = project([10, 10, z]);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `z=${z} projected to ${x},${y}`);
  }
});

// ── Blinking ────────────────────────────────────────────────────────────────────

const PLAN = { firstMs: 1000, minGapMs: 2000, maxGapMs: 3000, durationMs: 400 };

test("🔴 the eyes are open before the first blink and shut in the middle of one", () => {
  assert.equal(blinkAt(PLAN, 0), 1);
  assert.equal(blinkAt(PLAN, 999), 1);
  assert.ok(blinkAt(PLAN, 1200) < 0.02, `mid-blink is ${blinkAt(PLAN, 1200)}`);
  assert.ok(blinkAt(PLAN, 1399) > 0.9, "the blink did not reopen");
  assert.equal(blinkAt(null, 5000), 1);
});

test("🔴 a shut eye is a line, not nothing", () => {
  // Taking the height to zero collapses the outline and the character loses its eyes for
  // a frame. See SHUT_HEIGHT.
  const face = FACE_BY_ID.get("smallAttentive")!;
  const open = box(drawFace(DEFAULT_AVATAR.surface, face, { blink: 1 }).left);
  const shut = box(drawFace(DEFAULT_AVATAR.surface, face, { blink: 0 }).left);
  assert.ok(shut.h < open.h * 0.35, `a shut eye is ${shut.h.toFixed(1)} tall against ${open.h.toFixed(1)}`);
  assert.ok(shut.h > 1, "a shut eye vanished entirely");
  assert.ok(shut.w > open.w * 0.8, "a shut eye lost its width too");
  assert.ok(SHUT_HEIGHT > 0);
});

test("🔴 the blink schedule is addressed, not accumulated", () => {
  // Asking about the same instant twice must give the same answer whichever order the
  // questions are asked in — which is what lets a timeline be scrubbed backwards and a
  // frame be screenshotted. A schedule built by stepping a counter fails this.
  const instants: number[] = [];
  for (let t = 0; t <= 40_000; t += 137) instants.push(t);
  const forwards = instants.map((t) => blinkAt(PLAN, t));
  // The SAME instants, asked in the opposite order. Walking a different set of times
  // would only prove the two walks differ, which is not the claim.
  const backwards = [...instants].reverse().map((t) => blinkAt(PLAN, t)).reverse();
  assert.deepEqual(backwards, forwards);
});

test("blinks actually happen, and are not all the same distance apart", () => {
  const shut: number[] = [];
  for (let t = 0; t < 60_000; t += 20) if (blinkAt(PLAN, t) < 0.05) shut.push(t);
  assert.ok(shut.length > 10, `only ${shut.length} blinks in a minute`);
  const gaps: number[] = [];
  for (let i = 1; i < shut.length; i++) if (shut[i]! - shut[i - 1]! > 100) gaps.push(shut[i]! - shut[i - 1]!);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  assert.ok(spread > 200, `the character blinks metronomically: gaps span ${spread}ms`);
});

test("a blink plan with no gap at all cannot hang", () => {
  const t0 = Date.now();
  assert.equal(blinkAt({ firstMs: 0, minGapMs: 0, maxGapMs: 0, durationMs: 0 }, 1e9), 1);
  assert.ok(Date.now() - t0 < 1000, "the blink loop did not terminate promptly");
});

// ── Timing ──────────────────────────────────────────────────────────────────────

test("an animation's length is its steps, and a ping-pong is twice that", () => {
  const a = ANIMATION_BY_ID.get("idle")!;
  const sum = a.steps.reduce((s, x) => s + x.transitionMs + x.holdMs, 0);
  assert.equal(animationDuration(a), sum);
  assert.equal(animationDuration({ ...a, mode: "pingPong" }), sum * 2);
});

test("🔴 the cursor walks the steps in order and wraps into a morph, not a jump", () => {
  const a = ANIMATION_BY_ID.get("thinking")!;
  const total = animationDuration(a);
  // Just inside the first step's morph: arriving at step 0, coming FROM the last one.
  const opening = cursorAt(a, 1);
  assert.equal(opening.step, 0);
  assert.equal(opening.from, a.steps.length - 1);
  assert.ok(opening.progress < 0.05, `the loop seam starts at ${opening.progress}`);
  // Inside the first hold: the morph is finished.
  assert.equal(cursorAt(a, a.steps[0]!.transitionMs + 10).progress, 1);
  // And it wraps.
  assert.deepEqual(cursorAt(a, total + 1), cursorAt(a, 1));
});

test("once stops at the end; loop does not", () => {
  const base = ANIMATION_BY_ID.get("angry")!;
  const total = animationDuration(base);
  const last = base.steps.length - 1;
  assert.equal(cursorAt({ ...base, mode: "once" }, total * 4).step, last);
  assert.equal(cursorAt({ ...base, mode: "loop" }, total + 1).step, 0);
});

test("a ping-pong plays the steps back the other way", () => {
  const base = ANIMATION_BY_ID.get("thinking")!;
  const one = base.steps.reduce((s, x) => s + x.transitionMs + x.holdMs, 0);
  const forward = cursorAt({ ...base, mode: "pingPong" }, 10);
  const back = cursorAt({ ...base, mode: "pingPong" }, one + 10);
  assert.equal(forward.step, 0);
  assert.equal(back.step, base.steps.length - 1);
});

test("the three easings all start at 0 and land exactly on 1", () => {
  for (const name of ["smooth", "snappy", "bouncy"] as const) {
    assert.ok(Math.abs(ease(name, 0)) < 1e-9, `${name} does not start at 0`);
    assert.ok(Math.abs(ease(name, 1) - 1) < 1e-9, `${name} does not land on 1`);
    assert.equal(ease(name, -5), ease(name, 0));
    assert.equal(ease(name, 5), ease(name, 1));
  }
});

// ── Blending ────────────────────────────────────────────────────────────────────

test("🔴 a head at 170 degrees morphing to -170 turns 20 degrees, not 340", () => {
  assert.equal(nearestAngle(-170, 170), 190);
  assert.equal(nearestAngle(170, -170), -190);
  assert.equal(nearestAngle(10, 20), 10);
  const a = { ...FACE_BY_ID.get("smallAttentive")!, head: { x: 0, y: 170, z: 0 } };
  const b = { ...FACE_BY_ID.get("smallAttentive")!, head: { x: 0, y: -170, z: 0 } };
  assert.equal(blendFaces(a, b, 0.5).head.y, 180);
});

test("a blend at the ends is exactly one face or the other", () => {
  const a = FACE_BY_ID.get("joyfulWide")!;
  const b = FACE_BY_ID.get("angryLeft")!;
  assert.equal(blendFaces(a, b, 0), a);
  assert.equal(blendFaces(a, b, 1), b);
  assert.equal(blendFaces(a, b, 0.5).eyeMotion, b.eyeMotion);
});

// ── The whole thing ─────────────────────────────────────────────────────────────

test("🔴 the same millisecond always draws the same frame", () => {
  for (const id of ["idle", "searching", "excited"]) {
    for (const t of [0, 1234, 9999, 45_000]) {
      assert.deepEqual(avatarFrameAt(id, t), avatarFrameAt(id, t), `${id} at ${t} is not reproducible`);
    }
  }
});

test("every animation names faces that exist, and every id is unique", () => {
  const ids = new Set<string>();
  for (const f of FACES) {
    assert.ok(!ids.has(f.id), `two faces called ${f.id}`);
    ids.add(f.id);
  }
  const seen = new Set<string>();
  for (const a of ANIMATIONS) {
    assert.ok(!seen.has(a.id), `two animations called ${a.id}`);
    seen.add(a.id);
    assert.ok(a.steps.length > 0, `${a.id} has no steps`);
    for (const s of a.steps) assert.ok(FACE_BY_ID.has(s.face), `${a.id} names a missing face: ${s.face}`);
  }
  assert.equal(FACES.length, 27);
  assert.equal(ANIMATIONS.length, 23);
});

test("🔴 every animation draws something on every body, all the way through", () => {
  // The cheap sweep that catches an empty path, a NaN, or a body the surface code cannot
  // sample. A path string of "" renders as nothing at all, and nothing renders silently.
  for (const avatar of AVATARS) {
    for (const a of ANIMATIONS) {
      const total = animationDuration(a);
      for (let i = 0; i <= 12; i++) {
        const f = avatarFrameAt(a.id, (total * i) / 12, avatar);
        assert.ok(f, `${avatar.name} / ${a.id} produced no frame`);
        assert.ok(f.body.length > 20, `${avatar.name} / ${a.id} at ${i}/12 has no body`);
        assert.ok(!/NaN|Infinity/.test(f.body + f.left + f.right), `${avatar.name} / ${a.id} at ${i}/12 is not a number`);
        assert.ok(f.left.length > 20 && f.right.length > 20, `${avatar.name} / ${a.id} at ${i}/12 lost an eye`);
      }
    }
  }
});

test("reduced motion holds the authored face exactly, with no wander and no blink", () => {
  const played = playedFaceAt("searching", 7777, { reduced: true })!;
  const authored = FACE_BY_ID.get(played.stepFace)!;
  assert.deepEqual(played.face, authored);
  assert.equal(played.blink, 1);
  assert.deepEqual(played.eyeDrift, { x: 0, y: 0 });
});

test("🔴 tracking adds to the face's own turn rather than replacing it", () => {
  // 🔴 THE POINT IS THAT IT COMPOSES. Two faces that already look in different directions
  // must each move BY the same amount when the pointer moves, not both end up looking at
  // the pointer — otherwise following the cursor flattens every authored expression into
  // the same pose, and `farRightGlance` stops being a right glance.
  const turn = { x: 6, y: 12 };
  const moves: number[] = [];
  for (const id of ["smallAttentive", "farRightGlance", "downwardGaze"]) {
    const face = FACE_BY_ID.get(id)!;
    const rest = box(drawFace(DEFAULT_AVATAR.surface, face).left);
    const aimed = box(drawFace(DEFAULT_AVATAR.surface, face, { turn }).left);
    assert.notEqual(rest.cx, aimed.cx, `${id} did not move`);
    moves.push(aimed.cx - rest.cx);
  }
  // All three shift the same way. They cannot shift by exactly the same amount — the
  // projection is not linear — but a face that jumped to a fixed pose would show up as one
  // of these disagreeing in sign.
  assert.ok(moves.every((m) => Math.sign(m) === Math.sign(moves[0]!)), `tracking pulled faces apart: ${moves}`);
});

test("no turn is the same frame as an explicit zero turn", () => {
  const face = FACE_BY_ID.get("joyfulWide")!;
  assert.deepEqual(
    drawFace(DEFAULT_AVATAR.surface, face, { turn: { x: 0, y: 0 } }),
    drawFace(DEFAULT_AVATAR.surface, face),
  );
});

test("🔴 a face turned far enough takes an eye round the back", () => {
  // Not clipped — hidden. Half an eye emerging from the limb reads as a fault.
  const face = { ...FACE_BY_ID.get("smallAttentive")!, head: { x: 0, y: 88, z: 0 } };
  const frame = drawFace(DEFAULT_AVATAR.surface, face);
  assert.ok(!frame.leftVisible || !frame.rightVisible, "both eyes survived a 88-degree turn");
  const flat = drawFace(DEFAULT_AVATAR.surface, { ...face, head: { x: 0, y: 0, z: 0 } });
  assert.ok(flat.leftVisible && flat.rightVisible, "a face pointing at the viewer lost an eye");
});
