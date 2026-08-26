// The gestures: short things the character DOES to you, as opposed to how it feels.
//
// 🔴 NOT DRAWN, TIMED. Every one is built from faces that already exist — mostly the resting
// face with the head moved a few degrees — and what makes it a gesture is the schedule, not a
// new shape. That is the cheapest thing in the whole character: a nod costs one curve and
// says something no expression in the set can say.
//
// 🔴 AND NONE OF IT COMES FROM EITHER SOURCE PROJECT. The sixteen feelings and the ten
// routines were measured off references with licences attached; these are ours outright,
// which matters while the question over the imported set is open (see docs/character.md).
//
// 🔴🔴 A CURVE SAMPLED DENSELY, NOT FOUR KEYFRAMES — AND THE FIRST CUT GOT THIS WRONG.
// Owner, 2026-08-26: *"new gestures are not smooth like the original ones."* They were built
// as a handful of poses chained back to back, each morphing with `smooth`, which is a
// smoothstep — zero velocity at both ends. So the head accelerated, stopped dead, accelerated
// again, four times inside seven hundred milliseconds. Measured: two full mid-movement stalls
// in the nod and speed jumping 83% of peak between frames.
//
// The originals get away with the same shape because they hold each pose for one to three
// SECONDS; the stop is the point there, and there is nothing to compare it against. A gesture
// is all movement and no hold, so every stop is the thing you see.
//
// So each gesture is now one continuous function of time, sampled about every fifty
// milliseconds, and the samples carry `linear` — the curve already has the easing in it, and a
// step that eased again would put the stalls straight back.
//
// 🔴 EVERY GESTURE STARTS AND ENDS AT REST. A "once" animation holds its last step for ever,
// so a gesture that ended tilted would leave the character tilted. It also makes the seam
// free: the first step morphs FROM the last, so the entry is right whatever came before.

import { EXPRESSIONS } from "./expressions";
import { SHUT_HEIGHT } from "./render";
import type { Animation, BodyPose, EyeSpec, Face, Step } from "./types";

const REST: Face = EXPRESSIONS.find((f) => f.id === "neutral")!;
const WIDE: Face = EXPRESSIONS.find((f) => f.id === "surprised")!;

const SHUT: Face = {
  ...REST,
  id: "restShut",
  left: { ...REST.left, height: SHUT_HEIGHT },
  right: { ...REST.right, height: SHUT_HEIGHT },
};

// ── Blending, locally ───────────────────────────────────────────────────────────
//
// 🔴 NOT `blendFaces` FROM ./play, AND THAT IS AN IMPORT CYCLE RATHER THAN A PREFERENCE.
// `play` reads the catalogue, the catalogue reads this file; importing back would make
// gestures → play → catalogue → gestures, and these blends run at module load, which is
// exactly when a cycle bites. The three fields these gestures actually move are cheap.

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

const lerpEye = (a: EyeSpec, b: EyeSpec, p: number): EyeSpec => ({
  width: lerp(a.width, b.width, p),
  height: lerp(a.height, b.height, p),
  x: lerp(a.x, b.x, p),
  y: lerp(a.y, b.y, p),
  angle: lerp(a.angle, b.angle, p),
});

/** `a` moved `p` of the way to `b`. */
function between(a: Face, b: Face, p: number): Face {
  if (p <= 0) return a;
  return {
    ...a,
    head: { x: lerp(a.head.x, b.head.x, p), y: lerp(a.head.y, b.head.y, p), z: lerp(a.head.z, b.head.z, p) },
    spacing: lerp(a.spacing, b.spacing, p),
    left: lerpEye(a.left, b.left, p),
    right: lerpEye(a.right, b.right, p),
  };
}

// ── Sampling ────────────────────────────────────────────────────────────────────

/** One instant of a gesture: where the head is, how big the body is, and what it is blending toward. */
interface Moment {
  readonly pitch?: number;
  readonly yaw?: number;
  readonly roll?: number;
  readonly scale?: number;
  /** 0..1 toward `toward`. */
  readonly amount?: number;
}

/**
 * One sample per rendered frame, near enough.
 *
 * 🔴 IT HAS TO BEAT THE CURVE, NOT THE EYE, AND IN BETWEEN IS WORSE THAN EITHER. The nod is
 * two full cycles inside seven hundred milliseconds. At fifty it got seven samples a cycle and
 * the straight lines between them cut the corner off every dip — three degrees adrift on a
 * nine degree movement. At twenty-two it was WORSE than thirty, because the samples very
 * nearly lined up with the screen's own sixty a second and beat against it: some frames landed
 * two to a segment and some one, so the speed changed for a reason that had nothing to do with
 * the gesture.
 *
 * Sixteen is one sample per frame. That makes the keyframes redundant rather than approximate,
 * which is the point: there is no interpolation left to be wrong. Drift measured at 0.34
 * degrees on all three moving gestures, which is the floor set by the resting wander itself.
 */
const SAMPLE_MS = 16;

interface Sampled {
  readonly faces: readonly Face[];
  readonly animation: Animation;
}

/**
 * A continuous movement, cut into keyframes.
 *
 * 🔴🔴 SAMPLE `i` IS THE END OF STEP `i`, NOT THE START, AND GETTING THAT BACKWARDS SHIFTS THE
 * WHOLE GESTURE BY ONE SAMPLE. `cursorAt` blends FROM the previous step's face INTO this one,
 * so the face named by step `i` is what the character has arrived at when step `i` finishes —
 * at `(i + 1) / count` of the way through, not `i / count`. Authored the other way the nod
 * drifted three degrees off its own curve and read as a stutter, which is exactly the fault
 * this rewrite was meant to remove.
 *
 * It also lands the arithmetic where it belongs: the last sample is `u = 1`, the resting pose,
 * which is both where the gesture must end and what step 0 morphs away from on the next pass.
 */
function sample(id: string, ms: number, at: (u: number) => Moment, toward: Face = REST): Sampled {
  const count = Math.max(4, Math.round(ms / SAMPLE_MS));
  const faces: Face[] = [];
  for (let i = 0; i < count; i++) {
    const m = at((i + 1) / count);
    const base = m.amount ? between(REST, toward, m.amount) : REST;
    const scale = m.scale ?? 1;
    const last = i === count - 1;
    faces.push({
      ...base,
      id: `${id}${i}`,
      head: {
        x: base.head.x + (m.pitch ?? 0),
        y: base.head.y + (m.yaw ?? 0),
        z: base.head.z + (m.roll ?? 0),
      },
      // 🔴🔴 NO AMBIENT DRIFT WHILE IT IS MOVING, AND THIS IS THE REAL CAUSE OF THE JUDDER.
      // `livenFace` seeds the resting wander from the head's own ANGLES, so a head that is
      // moving re-rolls its wander every frame — several degrees of noise, arriving at the
      // rate the samples do. On a pose held for two seconds that is the gentle life it was
      // written to be; on a nod it is a shiver on top of the movement, and it is what made
      // the first cut read as rough even after the keyframe stalls were gone.
      //
      // 🔴 THE LAST SAMPLE GETS IT BACK. A "once" animation holds its final face for ever, so
      // leaving the whole gesture dead would land the character in a freeze instead of at
      // rest — the drift has to be running again by the time it settles.
      bodyMotion: last ? base.bodyMotion : "none",
      ...(scale === 1 ? null : { body: { scale, x: 0, y: 0, profile: null } satisfies BodyPose }),
    });
  }
  const steps: Step[] = faces.map((f) => ({
    face: f.id,
    transitionMs: ms / count,
    holdMs: 0,
    ease: "linear" as const,
  }));
  return { faces, animation: { id, mode: "once", steps, blink: null } };
}

// ── The curves ──────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
/** Smoothstep, for the shaped parts of a curve. The step never re-eases; this is where it lives. */
const smooth = (p: number): number => {
  const c = Math.min(1, Math.max(0, p));
  return c * c * (3 - 2 * c);
};
/** Up over `a`, held, then down over `b`. Zero velocity at every join, which is what a hold wants. */
const outAndBack = (u: number, a: number, b: number): number =>
  u < a ? smooth(u / a) : u < b ? 1 : 1 - smooth((u - b) / (1 - b));

const NOD_DIP = 9;
const SHAKE_SWING = 11;
const GLANCE_YAW = 24;
const SETTLE_OVER = 0.075;

const NOD = sample("nod", 700, (u) => ({
  // Two dips, the second smaller, both landing exactly on zero. A nod that returns at the
  // speed it left reads as a machine oscillating, so the whole thing decays.
  pitch: -NOD_DIP * ((1 - Math.cos(TAU * 2 * u)) / 2) * Math.exp(-1.05 * u),
}));

const SHAKE = sample("shake", 660, (u) => ({
  // A decaying sine: three swings, ending dead centre because sin(3π) is zero.
  yaw: SHAKE_SWING * Math.sin(TAU * 1.5 * u) * Math.exp(-1.15 * u),
}));

const DOUBLE_TAKE = sample(
  "doubleTake",
  780,
  (u) => ({
    // 🔴 THE SPEEDS ARE THE GESTURE. Caught wide in a sixth of the time it takes to recover.
    // Equal speeds in and out is a character DECIDING to look surprised.
    amount: outAndBack(u, 0.17, 0.44),
  }),
  WIDE,
);

const SLOW_BLINK = sample(
  "slowBlink",
  760,
  (u) => ({ amount: outAndBack(u, 0.42, 0.56) }),
  SHUT,
);

const SETTLE = sample("settle", 620, (u) => ({
  // Mass. A damped sine starting and ending at rest: overshoot, undershoot, still.
  scale: 1 + SETTLE_OVER * Math.exp(-3.1 * u) * Math.sin(TAU * 1.25 * u),
}));

const GLANCE = sample("glance", 1240, (u) => {
  // 🔴 THE HOLD IS WHAT POINTS. Looking away and straight back is a twitch; staying there
  // while the thing appears is the character telling you where to look, having no hands.
  const out = outAndBack(u, 0.21, 0.7);
  return { yaw: GLANCE_YAW * out, pitch: -6 * out };
});

// ── The one that is worn rather than played ─────────────────────────────────────
//
// 🔴 A STATE, SO IT LOOPS AND SO IT IS NOT SAMPLED. The others fire and are done; this is
// held for as long as the learner is talking. One pose, blinking and drifting on top, which is
// what keeps a held pose from reading as a freeze.

const LEANED: Face = {
  ...REST,
  id: "leanedIn",
  head: { ...REST.head, x: REST.head.x - 3 },
  body: { scale: 1.06, x: 0, y: 0, profile: null },
};

const LEAN_IN: Animation = {
  id: "leanIn",
  mode: "loop",
  steps: [{ face: "leanedIn", transitionMs: 420, holdMs: 2400, ease: "smooth" }],
  blink: { firstMs: 2200, minGapMs: 3000, maxGapMs: 5600, durationMs: 260 },
};

// ── The set ─────────────────────────────────────────────────────────────────────

const CUT = [NOD, SHAKE, DOUBLE_TAKE, SLOW_BLINK, SETTLE, GLANCE];

const FACES: readonly Face[] = [...CUT.flatMap((g) => g.faces), LEANED];

const GESTURES: readonly Animation[] = [
  NOD.animation,
  SHAKE.animation,
  DOUBLE_TAKE.animation,
  SLOW_BLINK.animation,
  LEAN_IN,
  SETTLE.animation,
  GLANCE.animation,
];

export { FACES as GESTURE_FACES, GESTURES };

/** The seven, in the order they were proposed. */
export const GESTURE_IDS: readonly string[] = GESTURES.map((g) => g.id);
