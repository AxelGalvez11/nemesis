// 🔴 COPIED FROM apps/web — DO NOT EDIT HERE. Run `pnpm --filter @pharmaorb/web character:sync`.
// The faces Nemesis wears that no reference has: brows, spectacles, a smirk.
//
// 🔴 OUR LAYER, ON THEIR GEOMETRY. The engine models a solid, a head turn and two eyes, and
// that is the whole of its vocabulary. Everything here is drawn ON TOP of an eye, through
// the eye's own frame (`eyeFrames` in render.ts) — so every feature turns with the head,
// foreshortens with it, and leaves with the eye when it goes round the back, without the
// engine knowing any of them exist.
//
// 🔴 THE RULES OF THE LANGUAGE (owner-approved 2026-08-23), so nothing creeps back:
//   1. It is a creature, never an icon — no glyphs, no badges, no body replacement.
//   2. Physics, not effects — squash, stretch, lean; no trails, no colour cycling.
//   3. Feelings point at itself, never at the learner.
//   4. Every face has a reason; nothing plays at random.
//   5. Every face melts back to the same rest face.
//
// 🔴 THE NUMBERS ARE THE TUNED ONES AND THEY TRAVELLED UNCHANGED. Every constant below was
// measured against a rendered contact strip — several of them by the owner, by eye, over
// several rounds. They are written in body radii exactly as they were tuned; the conversion
// to the engine's units happens once, in the builders at the bottom, so a future reading of
// "0.19" still means what it meant when it was chosen.
//
// Geometry only. No DOM, no React, so the whole face is testable.

import { RADIUS } from "./space";

/** The resting eye, in body radii. The face this layer was fitted against. */
const EYE_W = 0.186;
const EYE_H = 0.412;

export type FeatureFace = "reading" | "sigma";

// ── Spectacles ───────────────────────────────────────────────────────────────
//
// Round spectacles WORN ON THE FACE, painted in FRONT of the body — not holes in it.
// Two designs died before this one (owner 2026-08-25: "the glasses look a bit weird"):
// rings cut as mask holes around each eye read as outlined eyes, because a hole cannot
// overlap the eye hole without the two melting into one shape, which forced the rings tall,
// narrow and goggle-like. Painted in front in paper with an ink edge, a lens can sit where
// real glasses sit — centred low ON the eye, frame crossing it, the eye's top showing over
// the rim — and it still rides the eye's own frame.

export const SPECS = {
  /** Lens outer radius. Round — spectacles, not goggles. Sized to the ceiling (owner
   *  2026-08-25, twice: "make the glasses look bigger… it's too small"): as large as the
   *  face allows while the lens stays SHORTER than the eye is tall. */
  r: 0.19,
  /** Ring thickness of the paper frame; scaled with the lens so it stays a frame. */
  ring: 0.054,
  /** Lens centre, below the eye's centre — worn on the face the way reading glasses sit. */
  dy: 0.055,
  /** Ink edge around the frame, so it reads where it crosses the eye's own paper. */
  stroke: 0.03,
  /** Temple pieces, running outward from each rim toward the head's edge. */
  arm: { len: 0.16, dy: -0.06 },
  /** The bridge welds the two inner rims; from eye 0's centre toward eye 1. */
  bridge: { w: 0.12, dx: 0.24, dy: -0.05 },
} as const;

// ── Brows ────────────────────────────────────────────────────────────────────
//
// 🔴 A BROW IS DRAWN THE WAY AN EYE IS, AND THAT IS WHAT MAKES IT BELONG. The eyes are holes
// cut in the body, which is why they clip themselves against the silhouette as the gaze
// carries them toward its edge. A brow added as a dark stroke on top would be the one
// feature that does not, and it would show the moment the character turned.
//
// 🔴 AND IT IS ONLY EVER PRESENT DURING A GESTURE. A resting brow is a permanent change to
// what the character looks like — a different creature, not a gesture.

/** How long one waggle runs, in milliseconds. */
export const WAGGLE_MS = 900;

/** Wider than the eye: a brow that matches its eye reads as a second, smaller eye above it. */
const BROW_W = EYE_W * 1.55;
/** Thin enough to read as a line rather than a bar, thick enough to survive 52px. */
const BROW_H = 0.085;
/**
 * Where a brow sits when it is down.
 *
 * 🔴 MEASURED AGAINST A RENDER, NOT CHOSEN. The first pass used a gap of 0.115 and a rise of
 * 0.135, and a headless contact strip of the gesture showed the brows BREACHING THE
 * SILHOUETTE at the top of each lift, cutting a notch out of the crown. The eyes already sit
 * high on the head and the resting gaze carries them off-centre, so the diagonal distance to
 * the body's edge is far shorter than the vertical numbers suggest.
 */
const BROW_REST = EYE_H / 2 + 0.084;
/** How much further up it goes at the top of a waggle. Small: the head has little room. */
const BROW_RISE = 0.08;
/**
 * How much of the gesture grows the brows in, and again takes them away.
 *
 * 🔴 THEY GROW, THEY DO NOT FADE, AND THE MASK IS THE REASON. A brow is a hole; a hole at
 * partial opacity makes the mask grey there, which reads as a smudge of half-cut body rather
 * than as a faint brow. Width from zero is the only reveal that stays a clean cut throughout.
 */
const REVEAL = 0.12;

export interface Brow {
  /** Capsule width and height, in body radii. */
  readonly w: number;
  readonly h: number;
  /** Up the face from the eye's centre, in the eye's own frame. Negative is up. */
  readonly dy: number;
}

/**
 * The brows at `ms` into a waggle, or nothing to draw.
 *
 * Two full up-and-downs across the window. One reads as a single raised brow that happened
 * to come back down — a question, not a waggle; three at this length is a twitch.
 */
export function browAt(ms: number): Brow | null {
  if (!Number.isFinite(ms) || ms < 0 || ms > WAGGLE_MS) return null;
  const p = ms / WAGGLE_MS;
  const reveal = Math.min(1, Math.max(0, Math.min(p / REVEAL, (1 - p) / REVEAL)));
  // Below this the capsule is a speck, and a capsule clamps tiny sizes up — so it would stop
  // shrinking and pop out of existence instead of closing.
  if (reveal < 0.02) return null;
  const lift = (1 - Math.cos(p * Math.PI * 4)) / 2;
  return { w: BROW_W * reveal, h: BROW_H, dy: -(BROW_REST + lift * BROW_RISE) };
}

/**
 * A single brow held at the TOP of its lift.
 *
 * The sigma face borrows the waggle's own geometry so the two can never drift apart. Full
 * width — a held face is not a gesture arriving.
 */
export function raisedBrow(lift = 1): Brow {
  return { w: BROW_W, h: BROW_H, dy: -(BROW_REST + lift * BROW_RISE) };
}

// ── The smirk ────────────────────────────────────────────────────────────────
//
// A short capsule below the face's midline, tilted so one corner rises — the whole joke is
// the asymmetry. Offsets are from the FIRST eye's centre, in that eye's own frame, because
// the frame already carries the head's roll and foreshortening and a mouth placed anywhere
// else would detach the moment the head moved.

export const SMIRK = {
  /** From eye 0's centre toward the face's midline. */
  dx: 0.36,
  /** Down the face. Below the eye's bottom, with a chin's worth of gap. */
  dy: 0.46,
  w: 0.3,
  h: 0.062,
  /** Degrees. Negative lifts the far corner — the smirk side. */
  rot: -12,
} as const;

/** The sigma raises exactly one brow. Index into the two eyes. */
export const SIGMA_EYE = 0;

// ── Arrival ──────────────────────────────────────────────────────────────────
//
// 🔴 A FACE ARRIVES, IT DOES NOT POP (owner 2026-08-24: "smoother animations… work on the
// sigma"). The sigma's brow LIFTS to its height and the smirk grows in; the glasses scale up
// over the last quarter. One easing for all of it, so every face arrives as the same creature.

/** How long a face takes to arrive, in milliseconds of scene time. */
export const FACE_IN_MS = 180;

/** 0..1 of an arrival, eased out. A null elapsed means "already there". */
export function arrival(elapsedMs: number | null, span = FACE_IN_MS): number {
  if (elapsedMs === null || !Number.isFinite(elapsedMs)) return 1;
  const p = Math.min(Math.max(elapsedMs / span, 0), 1);
  return 1 - (1 - p) ** 3;
}

// ── Builders: body radii in, engine units out ────────────────────────────────

/** A capsule centred on the origin — the shape every feature except a lens is made of. */
export function capsulePath(width: number, height: number): string {
  const hw = Math.max(width, 0.01) / 2;
  const hh = Math.max(height, 0.01) / 2;
  const r = Math.min(hw, hh);
  const n = (v: number) => (Math.round(v * 100) / 100).toString();
  return (
    `M${n(-hw)} ${n(-hh + r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(-hw + r)} ${n(-hh)}` +
    `L${n(hw - r)} ${n(-hh)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(hw)} ${n(-hh + r)}` +
    `L${n(hw)} ${n(hh - r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(hw - r)} ${n(hh)}` +
    `L${n(-hw + r)} ${n(hh)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(-hw)} ${n(hh - r)}Z`
  );
}

/**
 * A ring, as one even-odd path: an outer circle, and an inner one inside it.
 *
 * Filled with `evenodd` the middle stays open, so a lens is a frame with the eye showing
 * through rather than a disc laid over it.
 */
export function ringPath(radius: number, ring: number): string {
  const circle = (r: number) => `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
  return `${circle(radius)} ${circle(radius - ring)}`;
}

/** Body radii to the engine's own units. Every constant above is written in the former. */
export const inFace = (radii: number): number => radii * RADIUS;
