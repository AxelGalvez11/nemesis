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
}

export interface Avatar {
  readonly id: string;
  readonly name: string;
  readonly surface: Surface;
  readonly ink: string;
  readonly eye: string;
}

/** One drawn frame: three path strings and two visibility flags. */
export interface AvatarFrame {
  readonly body: string;
  readonly left: string;
  readonly right: string;
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
