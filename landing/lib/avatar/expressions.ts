// 🔴 COPIED FROM apps/web — DO NOT EDIT HERE. Run `pnpm --filter @pharmaorb/web character:sync`.
// Sixteen feelings, and each one looks like its name.
//
// 🔴 THIS FILE EXISTS BECAUSE THE OTHER SET DID NOT KEEP ITS PROMISE (owner 2026-08-25:
// *"the bible avatar has expressions that dont match descriptions: the bloub actually
// matches them"*). The reference's own animations are named for where the eyes GO —
// `angryRight` has the tops of its eyes diverging, which by its own geometry is the shape
// of sadness — because they were measured off a video and labelled afterwards. These were
// drawn from the feeling backwards, which is why they read.
//
// 🔴 AND THEY ARE THE SAME FOUR LEVERS, WHICH IS WHY THEY FIT ON THIS ENGINE AT ALL. Both
// projects model a face as: where the head points, how far apart the eyes sit, how wide and
// tall each one is, and how far each is tilted. Nothing had to be invented to carry these
// across — only converted, and the conversion is two multiplications. See `feeling` below.

import { RAD, RADIUS } from "./space";
import type { Animation, EyeMotion, BodyMotion, Face } from "./types";

/**
 * Half a separation in degrees of arc, to a full separation in mark units.
 *
 * 🔴 THE FACTOR OF TWO IS THE WHOLE CONVERSION, AND IT IS THE ONE THAT BIT LAST TIME. The
 * source measures the angle from the middle of the face to ONE eye; this engine wants the
 * distance between BOTH. Getting it the wrong way round puts the eyes out on the rim, and
 * it looks close enough to plausible that it survived a review.
 */
const SPLIT_TO_SPACING = 2 * RAD * RADIUS;

/**
 * A lid at half mast, as a shorter eye.
 *
 * The source closes an eye by squashing it vertically on screen after it has been laid on
 * the sphere — the same move as a blink. This engine already shortens an eye to blink it,
 * so a half-open eye is simply a shorter one, and the two mechanisms never fight over the
 * same eye. The constants are the source's own.
 */
const lidded = (height: number, open: number): number => height * (0.06 + 0.94 * open);

interface Eye {
  /** Width and height in body radii, as the source measures them. */
  readonly w: number;
  readonly h: number;
  /** Degrees; positive leans the eye's top to the right. */
  readonly tilt?: number;
  readonly open?: number;
}

function feeling(
  id: string,
  /** Yaw (right is positive), pitch (up is positive), roll — degrees, as the source writes them. */
  gaze: readonly [number, number, number],
  /** Half the angle from the middle of the face to one eye, in degrees. */
  split: number,
  eyes: readonly [Eye, Eye],
  eyeMotion: EyeMotion,
  bodyMotion: BodyMotion,
): Face {
  const cut = (e: Eye) => ({
    width: e.w * RADIUS,
    height: lidded(e.h, e.open ?? 1) * RADIUS,
    x: 0,
    y: 0,
    angle: e.tilt ?? 0,
  });
  return {
    id,
    // Yaw turns about the vertical axis, pitch about the horizontal one, and both projects
    // compose them in the same order — intrinsic yaw, then pitch, then roll, which is the
    // same rotation as this engine's Z·X·Y. Nothing to reconcile.
    head: { x: gaze[1], y: gaze[0], z: gaze[2] },
    spacing: split * SPLIT_TO_SPACING,
    left: cut(eyes[0]),
    right: cut(eyes[1]),
    eyeMotion,
    bodyMotion,
  };
}

/** Both eyes alike, tilts mirrored — which is what makes brows possible with no brows. */
const both = (w: number, h: number, tilt = 0, open = 1): readonly [Eye, Eye] => [
  { w, h, tilt, open },
  { w, h, tilt: -tilt, open },
];

export const EXPRESSIONS: readonly Face[] = [
  // The resting pose, measured frame by frame off the reference. The head is well off
  // centre on both axes on purpose: that is what makes the near eye smaller than the far
  // one, and it is the whole reason the face reads as a head rather than as two marks
  // painted on a disc.
  feeling("neutral", [28.49, 28.62, 0], 15.46, both(0.186, 0.412), "microSaccades", "slowDrift"),
  feeling("attentive", [4, 5, -4], 16, both(0.21, 0.44), "microSaccades", "slowDrift"),
  feeling("surprised", [3, -3, 0], 19, both(0.45, 0.47), "none", "slowDrift"),
  feeling("excited", [6, -14, 0], 19.5, both(0.4, 0.56, -10), "microSaccades", "slowDrift"),
  // Squinted into arcs: the tops lean toward each other a little. A smile, with no mouth.
  feeling("happy", [5, 9, 0], 17, both(0.27, 0.17, 14), "none", "slowDrift"),
  feeling("laughing", [4, 14, 0], 18, both(0.34, 0.13, 20), "none", "slowDrift"),
  // The tops converge hard. Anger and sadness are the SAME move with opposite signs, and
  // neither is reachable by rolling the head, which leans both eyes the same way.
  feeling("angry", [3, 7, 0], 17, both(0.34, 0.15, 30), "none", "shake"),
  feeling("sad", [3, -13, 0], 16, both(0.22, 0.4, -28), "none", "slowDrift"),
  feeling("scared", [2, -20, 0], 20.5, both(0.4, 0.6), "shake", "shake"),
  // One eye markedly more closed than the other.
  feeling("suspicious", [12, 6, -6], 16, [{ w: 0.21, h: 0.4 }, { w: 0.22, h: 0.15 }], "microSaccades", "slowDrift"),
  // Mismatched on both axes at once — sizes AND tilts. The squinted eye is deliberately
  // flat: at a ratio near 1 it would read as round, and its tilt would say nothing.
  feeling("confused", [-14, 3, 8], 16.5, [{ w: 0.2, h: 0.44, tilt: -18 }, { w: 0.28, h: 0.17, tilt: 14 }], "microSaccades", "slowDrift"),
  // The head tips. Curiosity is carried by the roll, not by the eyes.
  feeling("curious", [16, -9, -15], 16.5, [{ w: 0.24, h: 0.46, tilt: -8 }, { w: 0.2, h: 0.38, tilt: -8 }], "microSaccades", "slowDrift"),
  feeling("proud", [5, 17, 0], 17, both(0.3, 0.15, 18), "none", "slowDrift"),
  feeling("shy", [-19, -14, -7], 14, both(0.17, 0.3), "microSaccades", "slowDrift"),
  // Horizontal slits, and a look off to one side.
  feeling("unimpressed", [-22, 2, 0], 16, both(0.3, 0.12), "microSaccades", "slowDrift"),
  feeling("sleepy", [6, -9, -3], 16, both(0.2, 0.42, 0, 0.42), "none", "slowDrift"),
];

export const EXPRESSION_IDS: readonly string[] = EXPRESSIONS.map((f) => f.id);

/**
 * Each feeling, playable.
 *
 * A held pose is still an animation here: the ambient life carries it, the blink schedule
 * runs on it, and — the part that matters — asking for one of these by name goes through
 * exactly the same door as asking for a routine, so a surface never has to know which kind
 * of thing it is looking at.
 */
export const EXPRESSION_ANIMATIONS: readonly Animation[] = EXPRESSIONS.map((f) => ({
  id: f.id,
  mode: "loop" as const,
  steps: [{ face: f.id, transitionMs: 500, holdMs: 2600, ease: "smooth" as const }],
  blink:
    // Nothing that is already holding its eyes nearly shut also blinks: a blink on a face
    // whose lids are down is a flicker, not a blink.
    f.left.height < 0.2 * RADIUS
      ? null
      : { firstMs: 2400, minGapMs: 3200, maxGapMs: 6400, durationMs: 260 },
}));
