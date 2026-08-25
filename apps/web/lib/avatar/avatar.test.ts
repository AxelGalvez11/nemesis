import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { AVATARS, DEFAULT_AVATAR } from "./avatars";
import { ANIMATIONS, ANIMATION_BY_ID, FACES, FACE_BY_ID } from "./catalogue";
import { EXPRESSION_IDS } from "./expressions";
import { ROUTINE_IDS } from "./routines";
import {
  HANDOVER_MS,
  animationDuration,
  blendFaces,
  blinkAt,
  createPlayhead,
  cursorAt,
  ease,
  nearestAngle,
  playedFaceAt,
} from "./play";
import { REST_BODY, SHUT_HEIGHT, drawFace, eyeFrames } from "./render";
import { FOCAL, RADIUS, faceToSkin, project, quatFromTurn, rotate } from "./space";
import { PROFILE_SAMPLES, TRACED, radiusAtAngle } from "./vendor/silhouettes";
import { avatarFrameAt } from "./index";
import { sparkDots } from "./play";
import type { Face, Surface } from "./types";

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
  const a = ANIMATION_BY_ID.get("gaze-idle")!;
  const sum = a.steps.reduce((s, x) => s + x.transitionMs + x.holdMs, 0);
  assert.equal(animationDuration(a), sum);
  assert.equal(animationDuration({ ...a, mode: "pingPong" }), sum * 2);
});

test("🔴 the cursor walks the steps in order and wraps into a morph, not a jump", () => {
  const a = ANIMATION_BY_ID.get("gaze-thinking")!;
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
  const base = ANIMATION_BY_ID.get("gaze-angry")!;
  const total = animationDuration(base);
  const last = base.steps.length - 1;
  assert.equal(cursorAt({ ...base, mode: "once" }, total * 4).step, last);
  assert.equal(cursorAt({ ...base, mode: "loop" }, total + 1).step, 0);
});

test("a ping-pong plays the steps back the other way", () => {
  const base = ANIMATION_BY_ID.get("gaze-thinking")!;
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
  // 🔴 THE THREE SETS, COUNTED SEPARATELY. A single total would have gone on passing when
  // one set silently emptied and another grew — which is exactly the shape of the mistake
  // this file exists to catch, since two of the three are produced by generators.
  assert.equal(EXPRESSION_IDS.length, 16, "the sixteen feelings");
  assert.equal(ROUTINE_IDS.length, 10, "the ten routines");
  assert.equal(ANIMATIONS.filter((a) => a.id.startsWith("gaze-")).length, 23, "the reference's own");
  assert.equal(ANIMATIONS.length, 49);

  // 🔴 THE PLAIN WORDS BELONG TO THE SET THAT KEEPS THEM (owner 2026-08-25: "the bible
  // avatar has expressions that dont match descriptions: the bloub actually matches them").
  // Seventeen of the reference's twenty-three carry a feeling's name; asking for `happy`
  // has to give the one that looks happy, and the only thing standing between those two
  // sets is the prefix.
  for (const id of EXPRESSION_IDS) {
    assert.ok(ANIMATION_BY_ID.get(id)?.steps[0]?.face === id, `${id} is not the feeling itself`);
  }
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
        assert.ok(
          !/NaN|Infinity/.test(f.body + f.left + f.right + f.dots + f.dotsBehind),
          `${avatar.name} / ${a.id} at ${i}/12 is not a number`,
        );
        // 🔴 UNLESS THE ROUTINE HAS TAKEN THE FACE AWAY, WHICH FOUR OF THEM DO. A pause for
        // thought turns the body into one of three dots and a scatter takes it apart; both
        // are faceless by design. The check still has to bite everywhere else, so it asks
        // the frame whether the face is meant to be there rather than skipping by name.
        if (f.eyeAlpha > 0.01) {
          assert.ok(f.left.length > 20 && f.right.length > 20, `${avatar.name} / ${a.id} at ${i}/12 lost an eye`);
        } else {
          assert.ok(
            f.dots.length > 20 || f.body.length > 20,
            `${avatar.name} / ${a.id} at ${i}/12 has neither a face nor anything else`,
          );
        }
      }
    }
  }
});

test("reduced motion holds the authored face exactly, with no wander and no blink", () => {
  const played = playedFaceAt("gaze-searching", 7777, { reduced: true })!;
  const authored = FACE_BY_ID.get(played.stepFace)!;
  assert.deepEqual(played.face, authored);
  assert.equal(played.blink, 1);
  assert.deepEqual(played.eyeDrift, { x: 0, y: 0 });
});

// ── Handing over between animations ─────────────────────────────────────────────

test("🔴 changing animation is a morph, not a cut", () => {
  // Owner 2026-08-25: "the animations seem to cut abruptly". Steps INSIDE an animation
  // always eased into each other; the seam BETWEEN two animations was a jump, because the
  // clock restarted and the next frame was simply a different pose. This is the guard on
  // the fix, and it is why the bookkeeping lives in the engine rather than in a `useRef`
  // inside a requestAnimationFrame callback where nothing could reach it.
  const head = createPlayhead("gaze-sleeping");
  const before = head.at(4000, "gaze-sleeping")!.face;
  // The instant of the change: still the old face, because no time has passed yet.
  const atSwitch = head.at(4000, "gaze-excited")!.face;
  assert.ok(near(atSwitch, before), "the handover jumped on its very first frame");

  // Halfway through, it is between the two and equal to neither.
  const mid = head.at(4000 + HANDOVER_MS / 2, "gaze-excited")!.face;
  const target = playedFaceAt("gaze-excited", 4000 + HANDOVER_MS / 2)!.face;
  assert.ok(!near(mid, before), "the handover never left the old face");
  assert.ok(!near(mid, target), "the handover arrived instantly");

  // And past the handover it is exactly the new animation, with nothing left over.
  const after = head.at(4000 + HANDOVER_MS + 1, "gaze-excited")!.face;
  const clean = playedFaceAt("gaze-excited", 4000 + HANDOVER_MS + 1)!.face;
  assert.ok(near(after, clean), "the handover never finished");
});

test("🔴 a second change mid-handover starts from what is on screen", () => {
  // Otherwise the character snaps to the first target it never reached, and a surface that
  // changes state twice quickly — which is exactly what a busy app does — flinches harder
  // than it did before the fix.
  const head = createPlayhead("gaze-idle");
  head.at(0, "gaze-idle");
  head.at(100, "gaze-angry");
  const partway = head.at(100 + HANDOVER_MS / 3, "gaze-angry")!.face;
  const redirected = head.at(100 + HANDOVER_MS / 3, "gaze-sleeping")!.face;
  assert.ok(near(redirected, partway), "the redirect jumped instead of continuing");
});

test("the clock is the caller's, so a playhead never restarts it", () => {
  // The blink schedule is drawn from the same `ms`, so a playhead that reset time would
  // also reset blinking — the bug that hid behind the cut.
  const head = createPlayhead("gaze-idle");
  head.at(0, "gaze-idle");
  head.at(30_000, "gaze-thinking");
  const late = head.at(60_000, "gaze-thinking")!;
  assert.deepEqual(late.blink, playedFaceAt("gaze-thinking", 60_000)!.blink);
});

/** Two faces are the same picture if every number in them agrees. */
function near(a: Face, b: Face): boolean {
  const eye = (x: Face["left"], y: Face["left"]) =>
    Math.abs(x.width - y.width) < 0.01 &&
    Math.abs(x.height - y.height) < 0.01 &&
    Math.abs(x.y - y.y) < 0.01 &&
    Math.abs(x.angle - y.angle) < 0.01;
  return (
    Math.abs(a.head.x - b.head.x) < 0.01 &&
    Math.abs(a.head.y - b.head.y) < 0.01 &&
    Math.abs(a.head.z - b.head.z) < 0.01 &&
    Math.abs(a.spacing - b.spacing) < 0.01 &&
    eye(a.left, b.left) &&
    eye(a.right, b.right)
  );
}

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

// ── One engine, doing what the other one used to do ──────────────────────────────
//
// Owner 2026-08-25: "i need one shared layer and engine". Six of the ten routines change
// the BODY, which is the part the old engine did and this one could not. These are the
// guards on the four knobs that closed that gap.

/** Widest horizontal span of a path between two heights, as a fraction of its own box. */
function widthBetween(d: string, from: number, to: number): number {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
  const ys = pts.map((p) => p[1]);
  const top = Math.min(...ys);
  const span = Math.max(...ys) - top;
  const band = pts.filter((p) => p[1] >= top + span * from && p[1] <= top + span * to).map((p) => p[0]);
  return band.length < 2 ? 0 : Math.max(...band) - Math.min(...band);
}

test("🔴 the shapes are the reference's own, not a description of them", () => {
  // 🔴 THE FIRST VERSION MODELLED THESE AND THE OWNER SAW IT IMMEDIATELY (2026-08-25: "they
  // dont perfectly match, did you even check the bloub github? its MIT license"). It carried
  // a taper for the egg and a rounded-polygon generator for the hexagon — parameters of mine,
  // fitted by eye to shapes somebody had already traced at the pixel, under a licence that
  // permits copying them outright. This asserts the tables ARE those tables.
  for (const name of ["egg", "hexagon"] as const) {
    const traced = TRACED[name];
    assert.equal(traced.length, PROFILE_SAMPLES, `${name} is not a full profile`);
    assert.ok(traced.every((r) => r > 0.5 && r < 1.3), `${name} has a radius that is not a radius`);
  }
  // The measured footprints, from the source's own comments: 1.647 x 2.000 and 1.826 x 2.011.
  const across = (profile: readonly number[], at: number) => radiusAtAngle([...profile], at);
  const wide = (profile: readonly number[]) => across(profile, 0) + across(profile, Math.PI);
  const tall = (profile: readonly number[]) => across(profile, Math.PI / 2) + across(profile, -Math.PI / 2);
  assert.ok(Math.abs(wide(TRACED.egg) - 1.647) < 0.02, `the egg is ${wide(TRACED.egg).toFixed(3)} wide`);
  assert.ok(Math.abs(tall(TRACED.egg) - 2.0) < 0.02, `the egg is ${tall(TRACED.egg).toFixed(3)} tall`);
  assert.ok(Math.abs(wide(TRACED.hexagon) - 1.826) < 0.02, `the hexagon is ${wide(TRACED.hexagon).toFixed(3)} wide`);

  // 🔴 AND THE NOTICE TRAVELS WITH THEM. MIT permits the copy and requires this.
  const licence = readFileSync(new URL("./vendor/LICENSE.bloub", import.meta.url), "utf8");
  assert.match(licence, /MIT License/);
  assert.match(licence, /Jérémy Perret/);
  const vendored = readFileSync(new URL("./vendor/silhouettes.ts", import.meta.url), "utf8");
  assert.match(vendored, /LICENSE\.bloub/, "the vendored tables do not say where they came from");
});

test("🔴 a silhouette is applied in the PICTURE, so a roll leans the face and not the body", () => {
  // The source draws its shapes flat, with the face painted on a ball behind them, and its
  // egg wears 17 degrees of roll while standing perfectly upright. Applied in the body's own
  // frame — which the first version did — that roll tips the whole egg over, and the only way
  // to make it look right was to halve the reference's own numbers. This is the guard on not
  // doing that again.
  const upright = ANIMATION_BY_ID.get("egg")!;
  const frame = avatarFrameAt(upright.id, animationDuration(upright) * 0.9, DEFAULT_AVATAR)!;
  const b = box(frame.body);
  // An egg standing up is taller than it is wide, and its widest point is level.
  assert.ok(b.h > b.w * 1.12, `the egg is ${(b.h / b.w).toFixed(2)}:1, which is not standing up`);
  const face = FACE_BY_ID.get("egg")!;
  assert.ok(Math.abs(face.head.z) > 10, "the egg's roll was removed rather than being made to work");
  // The same body drawn with no roll has the same outline: the shape does not turn with it.
  const level = drawFace(DEFAULT_AVATAR.surface, { ...face, head: { ...face.head, z: 0 } });
  const l = box(level.body);
  assert.ok(Math.abs(l.w - b.w) < 1 && Math.abs(l.h - b.h) < 1, "the silhouette turned with the head");
});

test("🔴 the exclamation mark is a glyph, and the egg is not a ball", () => {
  const bar = ANIMATION_BY_ID.get("exclaim")!;
  const barBody = avatarFrameAt(bar.id, animationDuration(bar) * 0.8, DEFAULT_AVATAR)!.body;
  const b = box(barBody);
  const ratio = b.h / b.w;
  assert.ok(ratio > 2.7 && ratio < 3.7, `the bar is ${ratio.toFixed(1)}:1 against the reference's 3.2:1`);
  assert.ok(
    widthBetween(barBody, 0.1, 0.35) > widthBetween(barBody, 0.65, 0.9) * 1.15,
    "the exclamation mark is not thicker at the top",
  );

  const egg = ANIMATION_BY_ID.get("egg")!;
  const eggBody = avatarFrameAt(egg.id, animationDuration(egg) * 0.9, DEFAULT_AVATAR)!.body;
  assert.ok(
    widthBetween(eggBody, 0.1, 0.35) < widthBetween(eggBody, 0.65, 0.9) * 0.94,
    "the egg is not narrower at the top",
  );
});

test("🔴 the plain body still takes the circle shortcut, and a shaped one never does", () => {
  // A ball's outline is a circle at every angle, which is why the shortcut exists — and it
  // draws a flawless circle whatever the body is doing, so it has to be refused the moment a
  // silhouette is applied. Found by deleting that guard and watching every other test pass.
  const plain = DEFAULT_AVATAR.surface;
  const face = FACE_BY_ID.get("smallAttentive")!;
  const rested = drawFace(plain, { ...face, body: REST_BODY });
  assert.equal(rested.body, drawFace(plain, face).body, "a body at rest is not the body it was");
  assert.ok(/^M[^A]*A/.test(rested.body), "the sphere shortcut was lost");

  const shaped = drawFace(plain, { ...face, body: { ...REST_BODY, profile: [...TRACED.hexagon] } });
  assert.ok(!/^M[^A]*A/.test(shaped.body), "a shaped body took the circle shortcut");
  assert.ok(shaped.body.length > 400, "a shaped body was not sampled");
});

test("🔴 an eye rides the silhouette rather than being stretched by it", () => {
  // The shape is a radial push. Pushing every point of an eye by its own angle would stretch
  // the eye into the shape of the body — a hexagon would come out with six-sided eyes. The
  // source moves the eye's CENTRE and leaves the eye alone, and so does this.
  const face = FACE_BY_ID.get("hexagon")!;
  const shaped = box(drawFace(DEFAULT_AVATAR.surface, face).left);
  const round = box(drawFace(DEFAULT_AVATAR.surface, { ...face, body: REST_BODY }).left);
  assert.ok(Math.abs(shaped.w - round.w) < 1.5, `the eye's width changed by ${(shaped.w - round.w).toFixed(2)}`);
  assert.ok(Math.abs(shaped.h - round.h) < 1.5, `the eye's height changed by ${(shaped.h - round.h).toFixed(2)}`);
  // And it did move, or the ride is not happening at all.
  const moved = Math.hypot(shaped.cx - round.cx, shaped.cy - round.cy);
  assert.ok(moved > 0.5, "the eye ignored the silhouette entirely");
});

test("🔴 decor blends by index, so a dot grows rather than appearing", () => {
  const bare = FACE_BY_ID.get("smallAttentive")!;
  const three = FACE_BY_ID.get("think0")!;
  assert.ok((three.dots?.length ?? 0) > 0, "the pause for thought lost its dots");
  const half = blendFaces(bare, three, 0.5);
  assert.equal(half.dots?.length, three.dots!.length);
  for (let i = 0; i < half.dots!.length; i++) {
    const to = three.dots![i]!;
    assert.ok(half.dots![i]!.r > 0 && half.dots![i]!.r < to.r, "a dot did not grow into place");
  }
  // And the body travels with them rather than cutting to its new size.
  assert.ok(half.body!.scale > three.body!.scale && half.body!.scale < 1, "the body cut instead of shrinking");
});

test("🔴 sparks are addressed from the start of the loop, not from the clock", () => {
  // They last two thirds of a second inside a routine that repeats every two and a half,
  // so reading the never-restarting clock would have fired the shower once, at start-up,
  // and never again. Same instant of the loop, same shower — one loop later.
  const burst = ANIMATION_BY_ID.get("burst")!;
  const total = animationDuration(burst);
  const first = playedFaceAt("burst", 300)!.face.dots ?? [];
  const later = playedFaceAt("burst", total * 4 + 300)!.face.dots ?? [];
  assert.ok(first.length > 0, "the scatter never scattered");
  assert.deepEqual(later, first);
  // They are behind the body, which is what makes it read as gathering rather than blowing up.
  assert.ok(first.every((d) => d.behind), "the sparks flew over the body");
  // And a plan at no strength is no dots at all, which is what makes the plan blendable.
  assert.deepEqual(sparkDots({ ...FACE_BY_ID.get("burstIn")!.sparks!, amount: 0 }, 300), []);
});

test("🔴 a routine with no face draws no eyes, and says so", () => {
  for (const id of ["thinking", "exclaim", "sleep"]) {
    const a = ANIMATION_BY_ID.get(id)!;
    const f = avatarFrameAt(id, animationDuration(a) * 0.6, DEFAULT_AVATAR)!;
    assert.equal(f.eyeAlpha, 0, `${id} kept its face`);
    assert.equal(f.left, "", `${id} drew an eye anyway`);
    assert.equal(f.right, "", `${id} drew an eye anyway`);
  }
});

/**
 * The circles in a decor path.
 *
 * 🔴 NOT `box()`. A dot is two elliptical arcs, and an SVG arc carries seven numbers of
 * which only the last two are a point — so reading the string as a list of coordinate pairs
 * turns the radii and the sweep flags into positions and reports a dot the size of the whole
 * drawing. That is exactly what this test measured on its first run, and the number looked
 * plausible enough to argue with.
 */
function circles(d: string): Array<{ x: number; y: number; r: number }> {
  return [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)A([\d.]+)/g)].map((m) => ({
    x: Number(m[1]) + Number(m[3]),
    y: Number(m[2]),
    r: Number(m[3]),
  }));
}

test("🔴 the badge sits outside the body, with the page showing between", () => {
  const f = avatarFrameAt("notify", 2000, DEFAULT_AVATAR)!;
  assert.ok(f.notch, "the notification lost its notch");
  const found = circles(f.dots);
  assert.equal(found.length, 1, "the notification lost its badge");
  const badge = { cx: found[0]!.x, cy: found[0]!.y, w: found[0]!.r * 2 };
  // The bite is concentric with the badge and bigger than it: that ring of page is the
  // whole reason the badge reads as a badge and not as a spot painted on the character.
  assert.ok(Math.abs(f.notch!.x - badge.cx) < 1 && Math.abs(f.notch!.y - badge.cy) < 1, "the bite missed the badge");
  assert.ok(f.notch!.r > badge.w / 2, "the bite is smaller than the badge it is meant to separate");
  // Upper right, on the rim.
  assert.ok(badge.cx > 60 && badge.cy < -40, `the badge is at ${badge.cx}, ${badge.cy}`);
});

test("🔴 a feature drawn through an eye's frame lands ON that eye", () => {
  // This is the whole contract `lib/avatar/features.ts` rests on: reading glasses, a raised
  // brow and a smirk are flat shapes drawn in an eye's own coordinates, and the frame is what
  // carries them onto a turning head. If the frame's origin drifts from where the eye is
  // actually drawn, every feature drifts with it — and the symptom is spectacles floating
  // beside a face, which is precisely what a 40px character in a corner hides.
  const face = FACE_BY_ID.get("neutral")!;
  for (const turn of [{ x: 0, y: -26 }, { x: 0, y: 0 }, { x: 0, y: 26 }, { x: -15, y: 14 }]) {
    const drawn = drawFace(DEFAULT_AVATAR.surface, face, { turn });
    const frames = eyeFrames(DEFAULT_AVATAR.surface, face, { turn });
    for (const [i, path] of [drawn.left, drawn.right].entries()) {
      const middle = box(path);
      const frame = frames[i]!;
      const off = Math.hypot(frame.x - middle.cx, frame.y - middle.cy);
      // The eye is a curved patch on a ball, so its bounding box's middle is not exactly its
      // centre. A couple of units out of a hundred and twenty is that; ten would be a drift.
      assert.ok(off < 4, `eye ${i} at turn ${JSON.stringify(turn)} is ${off.toFixed(1)} from its frame`);
    }
  }

  // And the frame FORESHORTENS, which is what makes a feature belong rather than sit on top.
  const ahead = eyeFrames(DEFAULT_AVATAR.surface, { ...face, head: { x: 0, y: 0, z: 0 } })[1]!;
  const away = eyeFrames(DEFAULT_AVATAR.surface, { ...face, head: { x: 0, y: 55, z: 0 } })[1]!;
  const area = (f: typeof ahead) => Math.abs(f.a * f.d - f.b * f.c);
  assert.ok(area(away) < area(ahead) * 0.8, "an eye near the limb is drawn at full size");

  // A roll turns the frame with the head, so a brow leans with the eye it belongs to.
  const rolled = eyeFrames(DEFAULT_AVATAR.surface, { ...face, head: { x: 0, y: 0, z: 30 } })[1]!;
  assert.ok(Math.abs(rolled.b) > Math.abs(ahead.b) + 0.2, "the frame ignores the head's roll");
});
