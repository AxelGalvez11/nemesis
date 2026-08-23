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

/** Outer radii of a lens, body-radius units. */
export const LENS_RX = 0.2;
export const LENS_RY = 0.3;
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
