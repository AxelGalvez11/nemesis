// Eyebrows, which the character does not have.
//
// Owner 2026-08-20: "he should jump, wink, or do an eyebrow waggle."
//
// 🔴 THE ENGINE HAS NO BROWS AND IS NOT GETTING ANY. `Pose` in `../bloub/states.ts` models a
// silhouette, a gaze, two eye capsules, dots, arcs and a notification badge — and that is the
// whole vocabulary. There is nowhere to put a brow without editing the vendored table, which
// `bloub-bot.tsx` is explicit about never doing: the pose model is spherical and measured, and
// the moment this repo starts adding rows to it, upstream stops being a thing we can read.
//
// 🔴 SO A BROW IS DRAWN THE WAY AN EYE IS, AND THAT IS WHAT MAKES IT BELONG. The eyes are not
// shapes laid on the face — they are HOLES cut in the body, which is why they clip themselves
// against the silhouette when the gaze carries them toward its edge. A brow added as a dark
// stroke on top would be the one feature that does not do that, and it would show the moment
// the character turned. So a brow is another hole, in the same mask, placed through the SAME
// eye matrix — which means it inherits the tangent frame for free: it foreshortens as the head
// turns, tilts with the eye it belongs to, and disappears round the back of the sphere with it.
// No second opinion about where the face is.
//
// 🔴 AND IT IS ONLY EVER PRESENT DURING A WAGGLE. A resting brow would be a permanent change to
// what the character looks like — a different creature, not a gesture. `browFrame` returns null
// outside the gesture's window, and the renderer parks the nodes.
//
// This file is geometry and timing only, in body-radius units, so it can be tested without a
// DOM. Ported 2026-08-23 from the parked canvas-mobile-and-character-polish branch, where it was
// measured against a rendered contact strip — the tuned numbers travel with it, untouched.

import { EYE_H, EYE_W } from "@/lib/bloub/face";
import { TAU, clamp } from "@/lib/bloub/math";

/** How long one waggle runs, in seconds. Mirrors WAGGLE_MS in the web `use-poke.ts`. */
export const WAGGLE_TIME = 0.9;

/**
 * Width of a brow relative to the eye under it.
 *
 * Wider than the eye, because a brow that matches its eye's width reads as a second, smaller
 * eye stacked above the first rather than as a brow. Half again is enough to be unmistakable
 * at the 52px the dock actually renders at.
 */
const BROW_W = EYE_W * 1.55;

/** Thin enough to read as a line rather than a bar, thick enough to survive 52px. */
const BROW_H = 0.085;

/**
 * Where a brow sits when it is down: clear of the eye's top edge by a small gap.
 *
 * 🔴 MEASURED AGAINST A RENDER, NOT CHOSEN. The first pass used a gap of 0.115 and a rise of
 * 0.135, which put the brows at 0.456 body-radii above the eye — and a headless contact strip
 * of the gesture showed them BREACHING THE SILHOUETTE at the top of each lift, cutting a notch
 * out of the crown. The eyes already sit high on the head, and the resting gaze carries them
 * off-centre, so the diagonal distance to the body's edge is far shorter than it looks from
 * the vertical numbers alone. These two are the tuned values; changing either wants the strip
 * re-rendered rather than an argument from the arithmetic.
 */
const BROW_REST = EYE_H / 2 + 0.084;

/** How much further up it goes at the top of a waggle. Small: the head has little room. */
const BROW_RISE = 0.08;

/**
 * How much of the gesture is spent growing the brows in, and again taking them away.
 *
 * 🔴 THEY GROW, THEY DO NOT FADE, AND THE MASK IS THE REASON. A brow is a hole; giving the hole
 * partial opacity makes the mask grey there, which does not read as a faint brow — it reads as
 * a smudge of half-cut body. Width from zero is the only reveal that stays a clean cut at every
 * instant of it.
 */
const REVEAL = 0.12;

export interface BrowFrame {
  /** Brow capsule width, in body-radius units. Scaled by the reveal. */
  w: number;
  /** Brow capsule height, in body-radius units. */
  h: number;
  /**
   * Offset from the EYE's centre in the eye's own local frame, body-radius units.
   * Negative is up the face, matching SVG's y-down convention.
   */
  dy: number;
}

/**
 * The brows at `elapsed` seconds into a waggle, or null when there is nothing to draw.
 *
 * Two full up-and-downs across the window. One reads as a single raised brow that happened to
 * come back down — a question, not a waggle; three at this duration is a twitch.
 */
export function browFrame(elapsed: number): BrowFrame | null {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > WAGGLE_TIME) return null;
  const p = elapsed / WAGGLE_TIME;
  const reveal = clamp(Math.min(p / REVEAL, (1 - p) / REVEAL));
  // Below this the capsule is a speck, and `capsulePath` clamps tiny sizes up to 0.01 anyway —
  // so it would stop shrinking and pop out of existence instead of closing.
  if (reveal < 0.02) return null;
  const lift = (1 - Math.cos(p * TAU * 2)) / 2;
  return {
    w: BROW_W * reveal,
    h: BROW_H,
    dy: -(BROW_REST + lift * BROW_RISE),
  };
}

/**
 * A single brow held at the TOP of its lift — the sigma face borrows the waggle's own
 * geometry so the two can never drift apart. Full width (no reveal: a held face is not a
 * gesture arriving), highest position the waggle reaches.
 */
export function raisedBrow(): BrowFrame {
  return { w: BROW_W, h: BROW_H, dy: -(BROW_REST + BROW_RISE) };
}
