// The rest pose, and how two poses blend.
//
// `REST` is the only base any state inherits from. States are authored as sparse
// patches over this record and resolved to a complete `Pose` at module load, so a state
// never accidentally inherits movement from the state that happened to precede it.

import { clamp01, lerp, lerpAngle } from "./easing";
import { EYE_H, EYE_RISE, EYE_SPLIT, EYE_W } from "./geometry";
import { blendRadii, SHAPES, type ShapeId } from "./shapes";
import type { BodyPose, EyePose, Pose, SatellitePose } from "./types";

/**
 * The resting silhouette is deliberately symmetric and circular.
 *
 * Personality now lives in the eyes, gaze and authored motion. A permanent taper made
 * the resting character a different silhouette, which conflicts with the product rule
 * that Nemesis is always recognisably the same round blob.
 */
const NEUTRAL_BODY: BodyPose = {
  dx: 0,
  dy: 0,
  scale: 1,
  stretch: 1,
  squash: 1,
  tilt: 0,
  radii: SHAPES.blob,
  taper: 0,
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

/** The circle, standing still, looking straight ahead. */
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
  /** Historical shape sugar retained for the lab. Production semantic states do not use it. */
  readonly body?: Partial<BodyPose> & { shape?: ShapeId };
};

/** Fills a patch out to a complete pose. */
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

/** Turns the character down without making it dead. */
export function scalePose(pose: Pose, intensity: number): Pose {
  const k = clamp01(intensity);
  if (k >= 1) return pose;
  const out = blendPose(REST, pose, k);
  return { ...out, liveliness: pose.liveliness, lookGain: pose.lookGain };
}
