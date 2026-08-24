// The faces Nemesis can wear — drawn over the vendored engine, never inside it.
//
// Owner 2026-08-23: *"essentially, I just want us to create our own animation language"* —
// brows, a mouth, glasses; minimalist, one ink, no effects. The engine models a silhouette,
// a gaze and two eye capsules, and that stays its whole vocabulary (see `brow.ts` for why
// adding rows to the vendored table is off the table). Everything here is a HOLE cut in the
// same mask as the eyes, placed through the eye's own matrix, so every feature turns,
// foreshortens and disappears round the back of the sphere exactly as the eyes do.
//
// 🔴 THE RULES OF THE LANGUAGE (owner-approved 2026-08-23), so nothing vendored creeps back:
//   1. It is a creature, never an icon — no glyphs, no badges, no body replacement.
//   2. Physics, not effects — squash, stretch, lean; no trails, no colour cycling.
//   3. Feelings point at itself, never at the learner.
//   4. Every face has a reason; nothing plays at random.
//   5. Every face melts back to the same rest face.
//
// This file is geometry only, in body-radius units, testable without a DOM.

import { EYE_H } from "@/lib/bloub/face";

/**
 * The faces a surface can ask for.
 *
 * - `reading`: round glasses over the eyes — worn while Nemesis is actually taking material
 *   in (an ingestion, a search), never as decoration.
 * - `sigma`: one raised brow and a lopsided smirk, held still. A joke the learner asked for
 *   by poking; it stares straight ahead on purpose (the gaze is suppressed while it holds).
 */
export type FaceId = "reading" | "sigma";

// ── Glasses ──────────────────────────────────────────────────────────────────
//
// Round spectacles WORN ON THE FACE, painted in FRONT of the body — not holes in it.
// Two designs died before this one (owner 2026-08-25: "the glasses look a bit weird"):
// rings cut as mask holes around each eye read as outlined eyes — the vendored "big
// eyes" ghost — because a hole cannot overlap the eye hole without the two melting into
// one shape, which forced the rings tall, narrow and goggle-like. Painted in front in
// paper with an ink edge (the theme-proof pair every front feature uses), a lens can sit
// where real glasses sit — centred low ON the eye, frame crossing it, the eye's top
// showing over the rim — and it still rides the eye's own matrix, so it turns and
// foreshortens with the head exactly as the eyes do.
//
// All numbers are body-radius units, offsets in the eye's local frame.

export const SPECS = {
  /** Lens outer radius. Round — spectacles, not goggles. Deliberately SMALLER than the
   *  eye is tall: the frame crossing the eye is what makes it read as worn, not drawn. */
  r: 0.145,
  /** Ring thickness of the paper frame. */
  ring: 0.046,
  /** Lens centre, below the eye's centre — worn on the face the way reading glasses sit. */
  dy: 0.04,
  /** Ink edge around the frame, so it reads where it crosses the eye's own paper. */
  stroke: 0.03,
  /** Temple pieces, running outward from each rim toward the head's edge. */
  arm: { len: 0.13, dy: -0.04 },
  /** The bridge welds the two inner rims; from eye 0's centre toward eye 1. The eyes sit
   *  ~0.46 apart, the rings span 2r of it, and the extra 0.06 buries both ends. */
  bridge: { w: 0.23, dx: 0.23, dy: -0.01 },
} as const;

/**
 * An elliptical annulus as a single even-odd path: outer ellipse one way, inner inside it.
 * Filled with even-odd the middle stays open — a ring.
 */
export function annulusPath(rx: number, ry: number, ring: number): string {
  const ellipse = (x: number, y: number) =>
    `M 0 ${-y} A ${x} ${y} 0 1 1 0 ${y} A ${x} ${y} 0 1 1 0 ${-y} Z`;
  return `${ellipse(rx, ry)} ${ellipse(rx - ring, ry - ring)}`;
}

// ── The smirk ────────────────────────────────────────────────────────────────
//
// A short capsule below the face's midline, tilted so one corner rises — the whole joke
// is the asymmetry. Offsets are from the FIRST eye's centre, in that eye's local frame
// (dx positive toward the other eye, dy positive down the face), because the eye matrix
// already carries the head's roll and foreshortening and a mouth placed anywhere else
// would detach the moment the head moved.

export const SMIRK = {
  /** From eye 0's centre toward the face's midline. */
  dx: 0.36,
  /** Down the face. Below the eye's bottom (EYE_H/2 = 0.206) with a chin-worth of gap. */
  dy: 0.46,
  /** Width and height of the mouth capsule. */
  w: 0.3,
  h: 0.062,
  /** Degrees. Negative lifts the far corner — the smirk side. */
  rot: -12,
} as const;

/** The sigma face raises exactly one brow. Index into the frame's two eyes. */
export const SIGMA_BROW_EYE = 0;

// ── Arrival ──────────────────────────────────────────────────────────────────
//
// 🔴 A FACE ARRIVES, IT DOES NOT POP (owner 2026-08-24: "smoother animations… work on the
// sigma"). The sigma's brow LIFTS to its height and the smirk grows in; the glasses scale
// up the last quarter. One easing for all of it, so every face arrives as the same creature.

/** How long a face takes to arrive, seconds of SCENE time. */
export const FACE_IN = 0.18;

/** 0..1 progress of an arrival; ease-out. `null` elapsed means "already there". */
export function arrival(elapsed: number | null, span: number = FACE_IN): number {
  if (elapsed === null || !Number.isFinite(elapsed)) return 1;
  const p = Math.min(Math.max(elapsed / span, 0), 1);
  return 1 - (1 - p) ** 3;
}

// ── The glasses' frame beyond the lenses ─────────────────────────────────────
//
// Owner 2026-08-24: "add the length part of the glasses, not just the circular part."
// The arms (temples) run OUTWARD from each lens toward the head's edge, slightly above the
// lens's middle the way real temples sit; the bridge welds the two inner rims. Both are
// capsule holes in the eye's local frame, like everything else on this face.

export const LENS_ARM = {
  /** Length of the visible temple piece. */
  len: 0.16,
  /** Wire thickness — matches LENS_RING so the frame reads as one object. */
  h: 0.05,
  /** Above the lens's middle, the way temples meet real frames. */
  dy: -0.06,
} as const;

export const BRIDGE = {
  /** Slightly wider than the gap between inner rims, so it welds rather than floats. */
  w: 0.12,
  h: 0.05,
  /** From eye 0's centre toward eye 1, in eye 0's local frame. The eyes sit ~0.48 apart. */
  dx: 0.24,
  /** A hair above centre — bridges sit at the frame's top half. */
  dy: -0.05,
} as const;
