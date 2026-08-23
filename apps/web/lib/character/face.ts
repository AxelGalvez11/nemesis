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

import { EYE_H, EYE_W } from "@/lib/bloub/face";

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
// A lens is an elliptical ring hole around each eye — TALL, not round, and the shape is
// forced by the face: the eyes sit EYE_H = 0.412 high and only ~0.46 body-radii apart, so a
// circle big enough to clear an eye's top is too wide not to merge with its neighbour. Two
// merged rings read as one white mass — the vendored "big eyes" all over again, measured on
// the preview board 2026-08-23. Tall ellipses clear the eye vertically, stay apart
// horizontally, and read MORE like glasses on this face, not less.

/** Outer radii of a lens, body-radius units. Sized up 2026-08-24 (owner: "the glasses look
 *  way too tight") — as big as the 0.46 eye gap allows while two rings still read as two. */
export const LENS_RX = 0.215;
export const LENS_RY = 0.335;
/** Ring thickness. Thin enough to read as wire, thick enough to survive 52px. */
export const LENS_RING = 0.05;

/**
 * An elliptical annulus as a single even-odd path: outer ellipse one way, inner inside it.
 * In the mask both subpaths fill black and even-odd leaves the middle open — a ring hole.
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

// ── The glove ────────────────────────────────────────────────────────────────
//
// Owner 2026-08-24, round two of the hand: "make it look like a real hand… the classic white
// glove, like in the cartoons, but minimalist." The first attempt was three floating capsules
// and read as nothing; this is a drawn silhouette — one plump index finger continuing the
// hand's own left edge, two knuckle scallops for the curled fingers, a thumb, and a flared
// cuff overlapping the wrist the way cartoon cuffs do. The character has no arms, so the
// glove floats beside the body, Rayman-fashion; the shared ink outline is what ties it to
// the creature. Drawn in ENGINE units (RAYON = 100, the frame is ±158) because it lives
// outside the body's mask, painted in front.
//
// 🔴 IT ARRIVES BY POPPING OUT FROM BEHIND THE BODY — smaller, closer in, more tilted, then
// eased to its held pose (owner: "it's supposed to be an animation, not a thing that stays
// on there"). `gloveTransform` is that whole journey as a single eased parameter.

/** The hand: index up, two knuckle scallops, a thumb. One closed path, engine units. */
export const GLOVE_HAND =
  "M -38 -54 A 15 15 0 0 1 -8 -54 L -8 -18 C -2 -29 12 -29 16 -18 C 21 -26 32 -22 34 -9 " +
  "C 38 -3 40 8 38 15 C 35 25 26 30 12 30 L -16 30 C -28 30 -36 24 -38 13 C -38 10 -40 8 -43 7 " +
  "C -50 5 -56 1 -58 -6 A 8.5 8.5 0 0 1 -50 -21 C -45 -19 -41 -15 -38 -9 Z";

/** The cuff: a flared rounded band, drawn AFTER the hand so its stroke crosses the wrist —
 *  the crossing is the seam. */
export const GLOVE_CUFF =
  "M -44 37 A 11.5 11.5 0 0 1 -32.5 25.5 L 32.5 25.5 A 11.5 11.5 0 0 1 44 37 " +
  "A 11.5 11.5 0 0 1 32.5 48.5 L -32.5 48.5 A 11.5 11.5 0 0 1 -44 37 Z";

/** Outline weight, engine units — a cartoon line, reads at 52px and at 168px. */
export const GLOVE_STROKE = 7.6;

/** The thumb hand: a fat thumb off a squat fist, drawn like the like-icon everyone reads
 *  at a glance — no seams; the silhouette carries it. Mirrored/flipped by its poses. */
export const GLOVE_THUMB =
  "M -32.4 -21.7 A 10 10 0 0 1 -14.6 -29.3 L -5.6 -10.3 C -4 -13.5 0 -15 4 -15 L 10 -15 " +
  "C 20 -15 27 -9 27 -1 L 27 15 C 27 24 20 29 10 29 L -10 29 C -19 29 -24 24 -24 15 L -24 -1 " +
  "C -27 -8 -30 -15 -32.4 -21.7 Z";

/** The thumb hand's narrower cuff — the pointing hand is nearly twice as wide. */
export const GLOVE_CUFF_SMALL =
  "M -34 37 A 11.5 11.5 0 0 1 -22.5 25.5 L 22.5 25.5 A 11.5 11.5 0 0 1 34 37 " +
  "A 11.5 11.5 0 0 1 22.5 48.5 L -22.5 48.5 A 11.5 11.5 0 0 1 -34 37 Z";

/** What the glove can do. Owner 2026-08-25: "I don't just want it to point — maybe give,
 *  like, a thumbs up or thumbs down." */
export type HandId = "point" | "up" | "down";

/** Where each pose holds and where its pop begins (tucked behind the shoulder). `fx`/`fy`
 *  mirror the drawing: the thumb hand flips horizontally so the thumb jabs AWAY from the
 *  body into open space, and thumbs-down is the same hand flipped over. */
export const GLOVE_POSE: Record<HandId, {
  at: { x: number; y: number; rot: number; scale: number };
  from: { x: number; y: number; rot: number; scale: number };
  fx: 1 | -1;
  fy: 1 | -1;
}> = {
  point: { at: { x: 102, y: -86, rot: 18, scale: 0.92 }, from: { x: 70, y: -58, rot: 34, scale: 0.4 }, fx: 1, fy: 1 },
  up: { at: { x: 108, y: -96, rot: 10, scale: 1 }, from: { x: 76, y: -64, rot: 26, scale: 0.4 }, fx: -1, fy: 1 },
  down: { at: { x: 112, y: -54, rot: 10, scale: 1 }, from: { x: 80, y: -40, rot: 26, scale: 0.4 }, fx: -1, fy: -1 },
};

/** Kept as the point pose's own numbers — the fingertip clip guard reads them. */
export const GLOVE_AT = GLOVE_POSE.point.at;
export const GLOVE_FROM = GLOVE_POSE.point.from;

/** How long the pop takes, seconds of scene time. A touch longer than a face's arrival —
 *  it crosses real distance, where a face only fades in place. */
export const HAND_IN = 0.22;

/** A pose's whole entrance as one transform; `enter` is `arrival(elapsed, HAND_IN)`. */
export function gloveTransform(enter: number, pose: HandId = "point"): string {
  const t = Math.min(Math.max(enter, 0), 1);
  const l = (a: number, b: number) => a + (b - a) * t;
  const { at, from, fx, fy } = GLOVE_POSE[pose];
  const k = l(from.scale, at.scale);
  return (
    `translate(${l(from.x, at.x).toFixed(1)} ${l(from.y, at.y).toFixed(1)}) ` +
    `rotate(${l(from.rot, at.rot).toFixed(1)}) ` +
    `scale(${(k * fx).toFixed(3)} ${(k * fy).toFixed(3)})`
  );
}
