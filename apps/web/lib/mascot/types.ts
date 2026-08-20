// The Nemesis mascot — the vocabulary.
//
// ONE FLAT BLOB, DRAWN PROCEDURALLY. The character is a single closed silhouette in a
// single flat ink, with two eyes cut into it and — in a few states — one or two
// fragments that leave the body and come back. There is no shading, no gloss, no
// specular and no depth: the product sits beside dense reading material, and a
// rendered-looking object next to a paragraph competes with the paragraph.
//
// WHAT MAKES IT NEMESIS AND NOT A BALL WITH EYES:
//
//  · the silhouette is a SUPERELLIPSE, not a circle and not an oval — round-cornered
//    with real sides, so it reads as considered geometry rather than as a bubble;
//  · the eyes are the same superellipse at a much smaller scale, stood upright. One
//    shape, two scales;
//  · nothing bounces, floats or squashes for fun. The body deforms — tapers, gathers
//    at the waist, carries a three-lobe wave — and those deformations are the
//    character's whole physical vocabulary.
//
// PERSONALITY LIVES IN GAZE AND TIMING, NOT IN MOVEMENT. The mascot is very nearly
// still most of the time. What makes it alive is that it blinks, its gaze drifts and
// flicks, and it notices you.

/**
 * What Nemesis is doing. One entry per semantic state; the mascot never takes an
 * animation name, only a thing the system is actually doing.
 */
export type MascotMode =
  | "idle"
  | "notice"
  | "listening"
  | "thinking"
  | "searching"
  | "reading"
  | "teaching"
  | "question"
  | "waiting"
  | "evaluating"
  | "correct"
  | "partial"
  | "incorrect"
  | "confusion"
  | "insight"
  | "generating-visual"
  | "speaking"
  | "success"
  | "complete"
  | "inactive";

/** Where the mascot's attention is pointed when nothing is tracking a pointer. */
export type MascotFocus = "user" | "composer" | "canvas" | "source" | "response" | "none";

/**
 * Everything the product can tell the mascot.
 *
 * A mode alone would make the character a slideshow of poses. These four extra fields
 * are the difference between "Nemesis is evaluating" and "Nemesis is evaluating an
 * answer it is not sure about, while looking at the composer".
 */
export interface MascotState {
  readonly mode: MascotMode;
  /**
   * How far the pose departs from rest, 0..1. The pose is interpolated FROM `REST` by
   * this amount, so 0 is the plain resting blob and 1 is the state as authored. One
   * knob for "turn the character down" — a mascot beside dense reading material can run
   * at 0.5 without every state needing a quiet variant.
   */
  readonly intensity?: number;
  readonly focus?: MascotFocus;
  /**
   * 0..1. Low confidence narrows the eyes slightly and loosens the posture. Kept
   * deliberately small: this is a shading on the state, never a state of its own.
   */
  readonly confidence?: number;
  /** 0..1 speech energy. Drives `speaking`'s deformation and `listening`'s swell. */
  readonly voiceActivity?: number;
}

/**
 * The body.
 *
 * The first six fields place and size it; the last four are its OUTLINE, and they are
 * what separate this from a mascot that only ever moves. See `profileAt` in geometry.ts
 * for what each does to the silhouette.
 */
export interface BodyPose {
  /** Offset from the resting centre, mark units, screen frame. */
  readonly dx: number;
  readonly dy: number;
  /** Uniform scale about the body's own centre. */
  readonly scale: number;
  /** Width and height, independently — `stretch < 1` with `squash > 1` is compression. */
  readonly stretch: number;
  readonly squash: number;
  /** Degrees. The resting body is upright; a tilt is always something the state means. */
  readonly tilt: number;
  /** Superellipse exponent. 2 is exactly an ellipse; higher squares the sides off. */
  readonly round: number;
  /** -1..1. Moves mass toward one side. A blob with no taper is a logo, not a creature. */
  readonly taper: number;
  /** 0..1. A waist across the middle — the form gathering itself in. */
  readonly pinch: number;
  /** Amplitude of a three-lobe wave on the outline. Reads as internal activity. */
  readonly ripple: number;
  /** Degrees. Rotating this travels the wave around the outline without moving the body. */
  readonly ripplePhase: number;
  readonly alpha: number;
}

/**
 * The eyes.
 *
 * Geometry is in fractions of the body's own rx / ry, so a body that stretches carries
 * its eyes with it instead of tearing them off the face.
 */
export interface EyePose {
  /** Half-width, in body rx units. */
  readonly w: number;
  /** Half-height, in body ry units. */
  readonly h: number;
  /** Lid, 0 = shut, 1 = open. Multiplies `h`. */
  readonly open: number;
  /** Half-separation across the body, in rx units. */
  readonly split: number;
  /** Height the pair sits at, in ry units. Negative is above the centre. */
  readonly rise: number;
  /** Degrees, applied to both eyes equally. */
  readonly tilt: number;
  /**
   * Signed degrees added to one eye and subtracted from the other, plus a matching
   * height difference. This is the only asymmetry the face has, and it is what makes
   * `question` read as inquisitive without an eyebrow or any other cartoon device.
   */
  readonly asym: number;
}

/**
 * Fragments that leave the body.
 *
 * 🔴 THE COUNT IS FIXED AT `SATELLITES` AND NEVER INTERPOLATED. A count that changed
 * per state could not be blended — two fragments cannot become one halfway. Every state
 * carries both and hides the ones it does not want at `scale: 0`, `alpha: 0`, which
 * places them exactly at the body's edge with no size, so entering and leaving those
 * states is a plain lerp.
 */
export interface SatellitePose {
  /** Clearance outside the body's own outline, mark units. */
  readonly spread: number;
  /** Position around the body, degrees. */
  readonly spin: number;
  /** 0..1. Collapses the pair toward one direction: an orbit becomes a reach. */
  readonly sweep: number;
  /** 0..1 per-fragment variance, from a fixed hash. 0 is a perfectly even pair. */
  readonly scatter: number;
  /** Fragment size relative to the body. */
  readonly scale: number;
  readonly alpha: number;
}

/** A complete pose. Every field is always present — see `pose.ts` for why. */
export interface Pose {
  readonly body: BodyPose;
  readonly eye: EyePose;
  /** The state's own gaze bias, -1..1 in eye-travel units. The engine mixes. */
  readonly gazeX: number;
  readonly gazeY: number;
  readonly sat: SatellitePose;
  /** 0..1 brightening of the ink. */
  readonly glow: number;
  /** Mark units. Vertical offset of the whole assembly. Used sparingly — see states.ts. */
  readonly lift: number;
  readonly bodyAlpha: number;
  /**
   * 0..1 how much resting life (gaze drift, blink, micro-saccade) the state allows.
   * `confusion` sets it low on purpose: a character that stops blinking is staring.
   */
  readonly liveliness: number;
  /**
   * 0..1 how strongly an external look target overrides the state's own gaze bias.
   * `notice` and `confusion` raise it; `thinking` lowers it, because a mind turned
   * inward should not track the cursor.
   */
  readonly lookGain: number;
}

// ── What the renderer receives ──────────────────────────────────────────────────

/** One drawn fragment, resolved to absolute mark-space geometry. */
export interface BeadRender {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly tilt: number;
  readonly alpha: number;
}

export interface EyeRender {
  /** Centre in the body's LOCAL frame (untilted), mark units. */
  readonly cx: number;
  readonly cy: number;
  /** Half-extents. The eye is the body's own unit silhouette scaled to these. */
  readonly rx: number;
  readonly ry: number;
  /** Degrees, relative to the body's own tilt. */
  readonly tilt: number;
}

/**
 * One frame. Pure data — no DOM, no colour, no units the caller has to guess at.
 *
 * There is deliberately NO viewBox here. The box is a module constant (`geometry.ts`,
 * `VIEW`) sized once for the widest excursion any state makes, because a box that
 * tracked the pose would resize the element every frame, and an element that resizes is
 * a layout shift.
 */
export interface MascotFrame {
  readonly body: {
    /** Where the local frame sits, and how it is turned. */
    readonly cx: number;
    readonly cy: number;
    readonly tilt: number;
    /** The silhouette, in the local frame. */
    readonly d: string;
    /** Half-extents of the undeformed body, for anything anchored to the outline. */
    readonly rx: number;
    readonly ry: number;
    readonly alpha: number;
  };
  /** Absolute mark-space bounds of the whole drawing. Used by the viewBox guard. */
  readonly bounds: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  readonly eyes: readonly [EyeRender, EyeRender];
  /** Absolute mark-space geometry. Ordered, stable, `SATELLITES` long, always. */
  readonly satellites: readonly BeadRender[];
  readonly glow: number;
  readonly bodyAlpha: number;
}
