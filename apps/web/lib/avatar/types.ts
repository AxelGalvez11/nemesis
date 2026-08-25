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
  /** Widens or narrows against the body's own width and height. 1 is unchanged. */
  readonly stretchX: number;
  readonly stretchY: number;
  /** See `Surface.taper`, `Surface.straight`, `Surface.facets`. */
  readonly taper: number;
  readonly straight: number;
  readonly facets: number;
  readonly facetAmount: number;
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

export type EaseName = "smooth" | "snappy" | "bouncy";

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

  // ── The four knobs a routine can turn ─────────────────────────────────────────
  //
  // 🔴 KNOBS, NOT SHAPES, AND THAT IS WHAT MAKES ONE ENGINE POSSIBLE. The character has to
  // become an egg, a hexagon, an upright bar and a small dot, and it has to become them by
  // MELTING rather than by cutting. A set of named silhouettes cannot do that: there is no
  // halfway between "egg" and "hexagon" to draw on the frames in between. Four numbers that
  // are all zero for the plain body can, because halfway is just halfway.
  //
  // They compose in this order, and `frontOfSkin` undoes them in the same order, which is
  // why the eyes stay on the body however far it is bent.

  /**
   * Fatter at the TOP OF THE PICTURE than at the bottom, -1..1.
   *
   * This is what makes an egg an egg rather than an ellipse, and what makes an exclamation
   * mark's bar thicker at the top. 🔴 THE SIGN IS IN SCREEN TERMS, WHICH IS THE OPPOSITE OF
   * the body's own axis — the solid is built with `y` running downward, so its own zero end
   * is the top of the picture. Read the other way round it drew an egg standing on its
   * point and an exclamation mark shaped like a traffic cone, which is exactly what the
   * first pass shipped.
   */
  readonly taper?: number;
  /**
   * How much of the height is a straight barrel rather than a curve, 0..1.
   *
   * 0 is an ellipsoid and 1 is a capsule: round ends with parallel sides in between. The
   * bar of an exclamation mark is nearly 1.
   */
  readonly straight?: number;
  /**
   * How many flat sides the SILHOUETTE has, and how far toward them it goes, 0..1.
   *
   * 🔴 MEASURED IN THE SCREEN PLANE, NOT AROUND THE BODY'S AXIS. A hexagonal prism seen
   * head-on is a rectangle, not a hexagon — faceting a body around its vertical axis would
   * have drawn wavy sides and no hexagon at all. So the radius is scaled by the angle in
   * the picture, which deforms the solid outward toward its own outline.
   */
  readonly facets?: number;
  readonly facetAmount?: number;
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
