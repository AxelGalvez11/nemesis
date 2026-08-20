// The rest pose, and how two poses blend.
//
// 🔴 `REST` IS THE ONLY BASE ANY STATE INHERITS FROM, AND IT IS EXPLICIT.
//
// States are authored as sparse patches over this record and resolved to a complete
// `Pose` at module load (`states.ts`), so nothing incomplete ever reaches the engine.
// The rule comes from a real failure in the landing organism, written down in
// `landing/components/organism/states.ts`: a partial state that inherits "the rest"
// lets one screen silently keep the PREVIOUS screen's motion while looking deliberate,
// and that class of bug is invisible until someone visits in an order nobody tested.
// Inheriting from one named constant has neither problem — the fallback is always the
// blob standing still, which is never wrong, only plain.

import { clamp01, lerp, lerpAngle } from "./easing";
import { EYE_H, EYE_RISE, EYE_SPLIT, EYE_W } from "./geometry";
import { blendRadii, SHAPES, type ShapeId } from "./shapes";
import type { BodyPose, EyePose, Pose, SatellitePose } from "./types";

/**
 * The resting silhouette.
 *
 * `blob` is the identity — a superellipse of exponent 2.45. At 2 the body would be
 * exactly an ellipse, the shape every mascot already is; above about 3 it reads as a
 * rounded rectangle rather than as a creature. 2.45 has real sides and soft corners, and
 * both survive 18px.
 *
 * `taper: 0.07` is small enough that nobody can name it and large enough that the form
 * is not symmetric. A perfectly symmetric blob reads as a logo.
 */
const NEUTRAL_BODY: BodyPose = {
  dx: 0,
  dy: 0,
  scale: 1,
  stretch: 1,
  squash: 1,
  tilt: 0,
  radii: SHAPES.blob,
  taper: 0.07,
  pinch: 0,
  ripple: 0,
  ripplePhase: 0,
  alpha: 1,
};

const NEUTRAL_SAT: SatellitePose = {
  spread: 0,
  spin: -90,
  sweep: 0,
  scatter: 0,
  scale: 0,
  alpha: 0,
};

const NEUTRAL_EYE: EyePose = {
  w: EYE_W,
  h: EYE_H,
  open: 1,
  split: EYE_SPLIT,
  rise: EYE_RISE,
  tilt: 0,
  asym: 0,
  curve: 0,
  wink: 0,
};

/** The blob, standing still, looking straight ahead. */
export const REST: Pose = {
  body: NEUTRAL_BODY,
  eye: NEUTRAL_EYE,
  gazeX: 0,
  gazeY: 0,
  sat: NEUTRAL_SAT,
  glow: 0,
  lift: 0,
  bodyAlpha: 1,
  liveliness: 1,
  lookGain: 0.55,
};

// ── Patches ─────────────────────────────────────────────────────────────────────

export type PosePatch = {
  readonly [K in keyof Pose]?: Pose[K] extends number ? number : Partial<Pose[K]>;
} & {
  /**
   * Sugar so a state can say `body: { shape: "lens" }` instead of importing the
   * catalogue and spelling out an array of forty-eight numbers. Resolved here, once, at
   * module load.
   */
  readonly body?: Partial<BodyPose> & { shape?: ShapeId };
};

/**
 * Fills a patch out to a complete pose.
 *
 * Two levels deep and no deeper, which is the shape of `Pose` — a generic deep merge
 * would accept a patch with a misspelled key and silently drop it.
 */
export function resolvePose(patch: PosePatch, base: Pose = REST): Pose {
  const { shape, ...body } = patch.body ?? {};
  return {
    body: { ...base.body, ...(shape ? { radii: SHAPES[shape] } : null), ...body },
    eye: { ...base.eye, ...patch.eye },
    gazeX: patch.gazeX ?? base.gazeX,
    gazeY: patch.gazeY ?? base.gazeY,
    sat: { ...base.sat, ...patch.sat },
    glow: patch.glow ?? base.glow,
    lift: patch.lift ?? base.lift,
    bodyAlpha: patch.bodyAlpha ?? base.bodyAlpha,
    liveliness: patch.liveliness ?? base.liveliness,
    lookGain: patch.lookGain ?? base.lookGain,
  };
}

// ── Blending ────────────────────────────────────────────────────────────────────

function blendBody(a: BodyPose, b: BodyPose, t: number): BodyPose {
  return {
    dx: lerp(a.dx, b.dx, t),
    dy: lerp(a.dy, b.dy, t),
    scale: lerp(a.scale, b.scale, t),
    stretch: lerp(a.stretch, b.stretch, t),
    squash: lerp(a.squash, b.squash, t),
    tilt: lerpAngle(a.tilt, b.tilt, t),
    radii: blendRadii(a.radii, b.radii, t),
    taper: lerp(a.taper, b.taper, t),
    pinch: lerp(a.pinch, b.pinch, t),
    ripple: lerp(a.ripple, b.ripple, t),
    // NOT shortest-path: the phase is a running total, and taking the short way round
    // would make a wave that has travelled 400 degrees rewind to 40 mid-transition.
    ripplePhase: lerp(a.ripplePhase, b.ripplePhase, t),
    alpha: lerp(a.alpha, b.alpha, t),
  };
}

function blendEye(a: EyePose, b: EyePose, t: number): EyePose {
  return {
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    open: lerp(a.open, b.open, t),
    split: lerp(a.split, b.split, t),
    rise: lerp(a.rise, b.rise, t),
    tilt: lerpAngle(a.tilt, b.tilt, t),
    asym: lerp(a.asym, b.asym, t),
    curve: lerp(a.curve, b.curve, t),
    wink: lerp(a.wink, b.wink, t),
  };
}

function blendSat(a: SatellitePose, b: SatellitePose, t: number): SatellitePose {
  return {
    spread: lerp(a.spread, b.spread, t),
    spin: lerp(a.spin, b.spin, t),
    sweep: lerp(a.sweep, b.sweep, t),
    scatter: lerp(a.scatter, b.scatter, t),
    scale: lerp(a.scale, b.scale, t),
    alpha: lerp(a.alpha, b.alpha, t),
  };
}

/** Straight interpolation of two complete poses. `t = 0` is `a`, `t = 1` is `b`. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    body: blendBody(a.body, b.body, t),
    eye: blendEye(a.eye, b.eye, t),
    gazeX: lerp(a.gazeX, b.gazeX, t),
    gazeY: lerp(a.gazeY, b.gazeY, t),
    sat: blendSat(a.sat, b.sat, t),
    glow: lerp(a.glow, b.glow, t),
    lift: lerp(a.lift, b.lift, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    liveliness: lerp(a.liveliness, b.liveliness, t),
    lookGain: lerp(a.lookGain, b.lookGain, t),
  };
}

/**
 * Turns the character down.
 *
 * `intensity` interpolates the pose back toward `REST`, so one number covers "the same
 * state, less of it" for every state at once. It deliberately does NOT touch
 * `liveliness` or `lookGain`: a quiet mascot still blinks and still looks at you —
 * those are what make it alive, and turning them down makes it dead rather than calm.
 */
export function scalePose(pose: Pose, intensity: number): Pose {
  const k = clamp01(intensity);
  if (k >= 1) return pose;
  const out = blendPose(REST, pose, k);
  return { ...out, liveliness: pose.liveliness, lookGain: pose.lookGain };
}
