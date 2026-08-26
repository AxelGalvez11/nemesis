// What an avatar is made of.
//
// 🔴 THIS IS NOT `lib/mascot`, AND THE TWO MUST NOT BE MERGED. The mascot is a FLAT mark:
// one radial profile r(theta), drawn into a fixed box, morphing by interpolating radii.
// That model is right for what it does and it cannot express this one — a solid turned in
// space, with a face wrapped onto its surface, projected through a lens. An eye here is
// not an ellipse that moves; it is a rounded rectangle whose every point is laid on the
// body's skin and projected individually, which is why it curves and foreshortens on its
// own instead of being told to.
//
// The first attempt at this transcribed the reference's numbers INTO the flat engine, and
// the result could not match no matter how the numbers were tuned, because the difference
// was never in the numbers.

/** Degrees. Applied in X, then Y, then Z. */
export interface HeadTurn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One eye, in mark units on a face of radius `RADIUS`. */
export interface EyeSpec {
  /** Full width and height of the rounded rectangle, before the blink shortens it. */
  readonly width: number;
  readonly height: number;
  /** Offset from this eye's own resting place, which is `±spacing / 2` across. */
  readonly x: number;
  readonly y: number;
  /** Degrees, turning the eye about its own centre. */
  readonly angle: number;
}

/** Ambient life. Both are movement the face makes on its own, with no animation running. */
export type EyeMotion = "none" | "microSaccades" | "shake";
export type BodyMotion = "none" | "slowDrift" | "shake";

/**
 * A disc of decor, beside the body.
 *
 * 🔴 DECOR IS PART OF THE POSE, NOT A LAYER BOLTED ON TOP. Four of the ten routines are
 * only legible because of what is drawn NEXT to the body — the two outer dots of a pause
 * for thought, the point over an exclamation mark, the sparks of a scatter. Putting them on
 * the face means they blend, morph and hand over exactly as the eyes do; putting them in
 * the component would have meant a second timeline that could drift out of step with the
 * first.
 */
export interface Dot {
  /** Mark units, on the same scale as the eyes: `RADIUS` is the face's own radius. */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly opacity: number;
  /** Drawn before the body, so the body covers it. */
  readonly behind?: boolean;
}

/**
 * The body, when a routine changes it.
 *
 * Every field is a NUMBER, and that is the point: a morph between two bodies is the same
 * arithmetic as a morph between two faces. Nothing here names a shape — naming shapes is
 * what would force a cut, because there is no halfway between "egg" and "hexagon".
 */
export interface BodyPose {
  /** Multiplies the body's size. 1 is the body as the avatar declares it. */
  readonly scale: number;
  /** Moves the body AND the face AND the decor together, in mark units. */
  readonly x: number;
  readonly y: number;
  /**
   * An exact silhouette: a radius per angle in the PICTURE, 64 samples, or nothing.
   *
   * 🔴 MEASURED, NOT MODELLED, AND THE FIRST VERSION OF THIS WAS THE OTHER WAY ROUND. It
   * carried four parameters of my own — a taper for the egg, a rounded-polygon generator for
   * the hexagon — which produced shapes that were close and were not the reference's. They
   * had already been traced at the pixel, and the licence on them is MIT. See
   * `vendor/silhouettes.ts`.
   *
   * 🔴 AND IT IS IN THE PICTURE PLANE, NOT THE BODY'S. Applied in the body's own frame, the
   * head's roll would tip the egg over like a skittle — which is what the parametric version
   * did, and why it needed the head angles halved to look upright. The source treats the
   * silhouette as a flat shape with the face painted on a ball behind it; doing the same
   * means the reference's own gaze numbers work unchanged.
   */
  readonly profile: readonly number[] | null;
}

/** A disc bitten out of the body, so something can sit just outside it and read as apart. */
export interface Notch {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * A shower of dots that spiral in and are swallowed.
 *
 * 🔴 A PLAN, EVALUATED LATER — NOT A LIST OF DOTS. Five sparks with staggered births over a
 * two-and-a-half second routine would take fifteen keyframes to write out, and blending two
 * faces with different spark counts is meaningless. Held as a plan, the plan itself blends
 * (an `amount` of zero is no sparks at all), and the dots are worked out afterwards from
 * the clock. See `sparkDots`.
 */
export interface SparkPlan {
  readonly count: number;
  /** Milliseconds between one spark's birth and the next. */
  readonly everyMs: number;
  readonly lifeMs: number;
  /** Where they start, in mark units, and how fast they fall inward per second. */
  readonly from: number;
  readonly pull: number;
  readonly spinDegPerSec: number;
  readonly r0: number;
  readonly r1: number;
  /** 0..1. This is the field that blends; everything else is the shape of the effect. */
  readonly amount: number;
}

export interface Face {
  readonly id: string;
  readonly head: HeadTurn;
  /**
   * The FULL distance between the two eyes. Each sits at `±spacing / 2`.
   *
   * 🔴 FULL, NOT HALF. Reading this as a half-separation puts the eyes twice as far apart
   * as they belong — out near the rim instead of near the middle of the face — and it is
   * the single mistake that made the first transcription unrecognisable.
   */
  readonly spacing: number;
  readonly left: EyeSpec;
  readonly right: EyeSpec;
  readonly eyeMotion: EyeMotion;
  readonly bodyMotion: BodyMotion;
  /** Absent means the avatar's own body, unchanged. */
  readonly body?: BodyPose;
  /** 1 unless the routine takes the face away. Four of the ten do. */
  readonly eyeAlpha?: number;
  readonly dots?: readonly Dot[];
  readonly notch?: Notch | null;
  readonly sparks?: SparkPlan | null;
}

/**
 * How a step's morph is shaped.
 *
 * 🔴 `linear` EXISTS FOR KEYFRAMES SAMPLED OFF A CONTINUOUS CURVE, AND WITHOUT IT THEY STOP.
 * `smooth` is a smoothstep: zero velocity at BOTH ends. That is right for a pose arriving and
 * settling, and wrong for one sample in the middle of a movement — the character comes to a
 * complete halt at every sample it passes through. Measured on the first cut of the gestures:
 * the nod stopped dead twice inside seven hundred milliseconds. When the curve already carries
 * the easing, the step must not add its own.
 */
export type EaseName = "smooth" | "snappy" | "bouncy" | "linear";

export interface Step {
  /** The face this step arrives at. */
  readonly face: string;
  /** How long the morph into it takes, then how long it sits there. */
  readonly transitionMs: number;
  readonly holdMs: number;
  readonly ease: EaseName;
}

export interface BlinkPlan {
  readonly firstMs: number;
  readonly minGapMs: number;
  readonly maxGapMs: number;
  readonly durationMs: number;
}

export type PlaybackMode = "loop" | "once" | "pingPong";

export interface Animation {
  readonly id: string;
  readonly steps: readonly Step[];
  readonly mode: PlaybackMode;
  readonly blink: BlinkPlan | null;
}

/** The body, as a solid. */
export type SurfaceType = "sphere" | "capsule" | "cube" | "cylinder" | "cone" | "diamond";

export interface Surface {
  readonly type: SurfaceType;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** 0..1-ish, how far the corners are rounded. Meaning depends on the type. */
  readonly roundness: number;
  /**
   * How far a turned body is pulled toward being an egg, 0..2.
   *
   * 🔴 THIS IS WHAT MAKES THEIR CONE A TEARDROP RATHER THAN A TRAFFIC CONE, and skipping
   * it drew two of the ten bodies as flat wedges. Past 1 the profile is more than half
   * ellipsoid, which is the setting both of their cone characters actually use.
   */
  readonly morphRoundness?: number;
  /** Cone only: how far the point and the base are rounded off, 0..2 each. */
  readonly tipRoundness?: number;
  readonly baseRoundness?: number;
}

export interface Avatar {
  readonly id: string;
  readonly name: string;
  readonly surface: Surface;
  readonly ink: string;
  readonly eye: string;
}

/** One drawn frame: everything the picture is, as strings and numbers. */
export interface AvatarFrame {
  readonly body: string;
  readonly left: string;
  readonly right: string;
  /** 0 hides the face entirely. Four of the ten routines do that at some point. */
  readonly eyeAlpha: number;
  /** All the decor in front of the body, as one path; and all the decor behind it. */
  readonly dots: string;
  readonly dotsBehind: string;
  /** A disc taken out of the body, or nothing. */
  readonly notch: { readonly x: number; readonly y: number; readonly r: number } | null;
  /**
   * Whether each eye is on the near side of the body.
   *
   * A face wrapped onto a solid keeps going round the back as the head turns. The eye is
   * hidden as a whole rather than clipped, because half an eye appearing from behind the
   * limb reads as a rendering fault rather than as a turn.
   */
  readonly leftVisible: boolean;
  readonly rightVisible: boolean;
}
