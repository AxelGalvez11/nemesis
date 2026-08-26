import assert from "node:assert/strict";
import { test } from "node:test";

import { compoundProfile, DEFAULT_PART, type BodyPart } from "./compound";
import { sampleState } from "./engine";
import { eyeOnSphere, HEAD_REST, headIsRest } from "./geometry";
import { PROFILE_SAMPLES, SHAPES } from "./shapes";

// ── The head ────────────────────────────────────────────────────────────────────

test("🔴 no head means the flat path, frame for frame", () => {
  // The whole claim of the spherical branch is that it costs nothing when unused. A
  // generalisation that "happens to reduce" to the flat case is a claim nobody checks;
  // this checks it, and it is why the branch is a branch rather than a formula.
  for (const mode of ["idle", "thinking", "listening"] as const) {
    for (const t of [0, 0.4, 1.6]) {
      const flat = sampleState(mode, t, { clock: t });
      const explicit = sampleState(mode, t, { clock: t, head: HEAD_REST });
      assert.deepEqual(explicit, flat, `${mode} at ${t} differs with an explicit resting head`);
    }
  }
});

test("headIsRest is true only for an actual rest", () => {
  assert.equal(headIsRest(undefined), true);
  assert.equal(headIsRest(HEAD_REST), true);
  assert.equal(headIsRest({ yaw: 0.001, pitch: 0, roll: 0 }), false);
  assert.equal(headIsRest({ yaw: 0, pitch: -1, roll: 0 }), false);
  assert.equal(headIsRest({ yaw: 0, pitch: 0, roll: 12 }), false);
});

test("🔴 turning the head moves the eyes AND foreshortens them", () => {
  // Moving them alone is the version that still reads as a sticker sliding across a
  // surface. The narrowing is the cue that says "solid object", so it is the half worth
  // asserting on.
  const rest = sampleState("idle", 0, { clock: 0, reduced: true });
  const turned = sampleState("idle", 0, { clock: 0, reduced: true, head: { yaw: 40, pitch: 0, roll: 0 } });

  assert.notEqual(turned.eyes[0].cx, rest.eyes[0].cx, "the eyes did not move");
  // Yawing right swings both eyes leftward on screen and narrows them, because both are
  // now further round the sphere from the viewer than they were.
  assert.ok(turned.eyes[0].rx < rest.eyes[0].rx, "the left eye did not narrow");
  assert.ok(turned.eyes[1].rx < rest.eyes[1].rx, "the right eye did not narrow");
});

test("🔴 a yaw far enough round takes an eye off the front of the face", () => {
  // At a large yaw the far eye is past the limb. It is not hidden — there is no per-eye
  // alpha — but it must have collapsed to nothing rather than sitting there at full size
  // outside the silhouette.
  const hard = sampleState("idle", 0, { clock: 0, reduced: true, head: { yaw: 85, pitch: 0, roll: 0 } });
  const rest = sampleState("idle", 0, { clock: 0, reduced: true });
  const shrunk = Math.min(hard.eyes[0].rx, hard.eyes[1].rx);
  assert.ok(shrunk < rest.eyes[0].rx * 0.5, `the far eye is still ${shrunk} wide`);
});

test("a roll turns both eyes by the same amount", () => {
  const rest = sampleState("idle", 0, { clock: 0, reduced: true });
  const rolled = sampleState("idle", 0, { clock: 0, reduced: true, head: { yaw: 0, pitch: 0, roll: 20 } });
  const d0 = rolled.eyes[0].tilt - rest.eyes[0].tilt;
  const d1 = rolled.eyes[1].tilt - rest.eyes[1].tilt;
  assert.ok(Math.abs(d0 - d1) < 1e-6, `roll turned the two eyes differently: ${d0} vs ${d1}`);
  assert.ok(Math.abs(d0) > 1, "roll did not turn the eyes at all");
});

test("🔴 a turned head never puts an eye outside the body", () => {
  // The containment fit is computed before the sphere branch runs, so a turn could in
  // principle carry an eye past the silhouette — which is the one way this feature could
  // break the drawing rather than merely look wrong.
  for (const yaw of [-70, -35, 0, 35, 70]) {
    for (const pitch of [-40, 0, 40]) {
      const f = sampleState("idle", 0, { clock: 0, reduced: true, head: { yaw, pitch, roll: 0 } });
      for (const e of f.eyes) {
        // Both eyes live inside the body's own half-extents, in the body's local frame.
        const reach = Math.hypot(e.cx / (f.body.rx || 1), e.cy / (f.body.ry || 1));
        assert.ok(reach <= 1.02, `yaw ${yaw} pitch ${pitch}: an eye centre reached ${reach.toFixed(3)} of the body`);
      }
    }
  }
});

test("🔴 every axis turns the way its own documentation says", () => {
  // 🔴 THIS GUARD EXISTS BECAUSE THE SIGN WAS WRONG AND NOTHING CAUGHT IT. `pitch` is
  // documented as "positive looks down"; the rotation about X in this frame carries the
  // face UP for a positive angle, so the field did the opposite of what it said. It was
  // found by looking at the screen — the reference's transcribed head turned the wrong
  // way — which is exactly the kind of thing a test should find first.
  const level = eyeOnSphere(0, 0, HEAD_REST);

  // Screen y is DOWN. Looking down puts the face lower.
  assert.ok(eyeOnSphere(0, 0, { yaw: 0, pitch: 40, roll: 0 }).y > level.y, "+pitch does not look down");
  assert.ok(eyeOnSphere(0, 0, { yaw: 0, pitch: -40, roll: 0 }).y < level.y, "-pitch does not look up");

  // +yaw looks to the character's right, which is to the viewer's right on screen.
  assert.ok(eyeOnSphere(0, 0, { yaw: 40, pitch: 0, roll: 0 }).x > level.x, "+yaw does not look right");
  assert.ok(eyeOnSphere(0, 0, { yaw: -40, pitch: 0, roll: 0 }).x < level.x, "-yaw does not look left");

  // +roll turns clockwise on screen: a point above the centre swings to the right.
  const rolled = eyeOnSphere(0, 30, { yaw: 0, pitch: 0, roll: 30 });
  assert.ok(rolled.x > eyeOnSphere(0, 30, HEAD_REST).x, "+roll does not turn clockwise");
});

test("the sphere projection is continuous across the whole range", () => {
  // A jump anywhere here is a visible snap while the head turns. Sampled finely and
  // asserted on the step, because the failure is a discontinuity rather than a value.
  let prev = eyeOnSphere(20, -5, { yaw: -90, pitch: 0, roll: 0 });
  for (let yaw = -89; yaw <= 90; yaw += 1) {
    const now = eyeOnSphere(20, -5, { yaw, pitch: 0, roll: 0 });
    assert.ok(Math.abs(now.x - prev.x) < 0.05, `x jumps at yaw ${yaw}`);
    assert.ok(Math.abs(now.y - prev.y) < 0.05, `y jumps at yaw ${yaw}`);
    assert.ok(Number.isFinite(now.sx) && Number.isFinite(now.sy), `non-finite scale at yaw ${yaw}`);
    prev = now;
  }
});

// ── Compound bodies ─────────────────────────────────────────────────────────────

const stepOf = (p: readonly number[]) => {
  let m = 0;
  for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[(i + 1) % p.length]! - p[i]!));
  return m;
};
const rmsOf = (p: readonly number[]) => Math.sqrt(p.reduce((s, r) => s + r * r, 0) / p.length);

test("🔴 one circular part reproduces the circle exactly", () => {
  // The identity case, and the one that proves the ray-march is measuring what it thinks
  // it is. A bisection that stopped early, or an inside-test off by a scale factor, still
  // produces a plausible round blob — this catches both.
  const one = compoundProfile([{ ...DEFAULT_PART, rx: 1, ry: 1 }]);
  assert.equal(one.length, PROFILE_SAMPLES);
  for (let i = 0; i < one.length; i++) {
    assert.ok(Math.abs(one[i]! - SHAPES.circle[i]!) < 1e-3, `sample ${i}: ${one[i]} vs ${SHAPES.circle[i]}`);
  }
});

test("🔴 a compound body encloses the same area as every catalogue shape", () => {
  // Without it, adding a bump reads as the whole character growing, and a morph between a
  // compound body and a catalogue one reads as a size change rather than a shape change.
  const bodies: BodyPart[][] = [
    [{ ...DEFAULT_PART, rx: 1, ry: 1 }],
    [{ ...DEFAULT_PART, rx: 0.75, ry: 0.75, dy: 0.25 }, { ...DEFAULT_PART, rx: 0.5, ry: 0.5, dy: -0.55 }],
    [
      { ...DEFAULT_PART, rx: 0.8, ry: 0.8 },
      { ...DEFAULT_PART, rx: 0.28, ry: 0.28, dx: -0.62, dy: -0.62 },
      { ...DEFAULT_PART, rx: 0.28, ry: 0.28, dx: 0.62, dy: -0.62 },
    ],
  ];
  for (const parts of bodies) {
    for (const blend of [0, 0.3, 1]) {
      const rms = rmsOf(compoundProfile(parts, blend));
      assert.ok(Math.abs(rms - 1) < 1e-9, `${parts.length} parts at blend ${blend} enclose ${rms.toFixed(4)}`);
    }
  }
});

test("🔴 smoothing takes a creased junction under the catalogue's own spike limit", () => {
  // Measured: a slab base with a round head creases at 0.288 between neighbouring radii,
  // well past the 0.16 `geometry.test.ts` allows a catalogue shape. That crease is real
  // geometry rather than a defect, which is why the answer is a control and not a clamp —
  // but the control has to actually reach the limit or it is decoration.
  const pear: BodyPart[] = [
    { ...DEFAULT_PART, shape: "slab", rx: 0.9, ry: 0.6, dy: 0.35 },
    { ...DEFAULT_PART, rx: 0.6, ry: 0.6, dy: -0.2 },
  ];
  assert.ok(stepOf(compoundProfile(pear, 0)) > 0.16, "the hard union no longer creases; this test has gone stale");
  assert.ok(stepOf(compoundProfile(pear, 0.3)) < 0.16, "smoothing did not reach the spike limit");
});

test("smoothing a circle is a no-op", () => {
  // A moving average over a constant profile must return the constant. If it does not,
  // the kernel is not normalised and every smoothed body is quietly the wrong size.
  const plain = compoundProfile([{ ...DEFAULT_PART, rx: 1, ry: 1 }], 1);
  assert.ok(stepOf(plain) < 1e-9, "smoothing rippled a circle");
  assert.ok(Math.abs(rmsOf(plain) - 1) < 1e-9);
});

test("no parts is survivable, and every profile is finite and positive", () => {
  assert.equal(compoundProfile([]).length, PROFILE_SAMPLES);
  const odd = compoundProfile([{ ...DEFAULT_PART, rx: 0, ry: 0 }, { ...DEFAULT_PART, dx: 9, dy: 9 }], 0.5);
  for (const r of odd) {
    assert.ok(Number.isFinite(r) && r > 0, `a profile sample is ${r}`);
  }
});
