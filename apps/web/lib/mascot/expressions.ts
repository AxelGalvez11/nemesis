// Emotion, as its own axis.
//
// 🔴 EXPRESSION IS NOT A STATE, AND KEEPING THEM APART IS THE WHOLE POINT. A state is
// what the system is DOING — thinking, evaluating, teaching. An expression is how the
// character feels about it. Fold them together and you need `thinking-but-pleased` and
// `thinking-but-concerned` as separate entries, and the catalogue squares. Kept apart,
// twenty-six states times nine expressions is two hundred and thirty-four faces out of
// thirty-five things to author.
//
// Each state declares the expression it wears by default; the product can override it
// without touching the state. `evaluating` with `keen` and `evaluating` with `concerned`
// are the same body doing the same thing with a different read on the answer.
//
// 🔴 EVERYTHING HERE IS A MULTIPLIER OR AN OFFSET, NEVER AN ABSOLUTE. The state has
// already decided how open the eyes are — `confusion` narrows them, `inactive` nearly
// shuts them. An expression that set heights outright would erase that and every state
// would end up with the same eyes.

import type { EyePose } from "./types";

export interface ExpressionDef {
  readonly label: string;
  readonly note: string;
  /** Multiplies the state's eye height. */
  readonly h: number;
  /** Multiplies the state's eye width. */
  readonly w: number;
  /** Added to the state's eye rise, in ry units. Negative is higher on the face. */
  readonly rise: number;
  /** Added to the state's eye tilt, degrees. Positive leans the tops together. */
  readonly tilt: number;
  /** Added to the state's asymmetry, degrees. */
  readonly asym: number;
  /**
   * How much the eye bows, -1..1. Positive arches it upward — the shape a person's eyes
   * make when they are pleased, and the one thing this face can do that reads as warmth
   * without a mouth. Negative bows it down, which reads as concern.
   */
  readonly curve: number;
}

export const EXPRESSIONS = {
  /** The face the character has when it is simply working. */
  neutral: { label: "Neutral", note: "Working. Nothing added.", h: 1, w: 1, rise: 0, tilt: 0, asym: 0, curve: 0 },

  /**
   * Pleased. The arch does all of it — there is no mouth and there will not be one, and
   * an arched eye is the one gesture that reads as warm at 18px.
   */
  bright: { label: "Bright", note: "Pleased. The eyes arch; nothing else moves.", h: 0.74, w: 1.08, rise: -0.02, tilt: 0, asym: 0, curve: 0.62 },

  /** A softer version of the same, for reassurance rather than delight. */
  soft: { label: "Soft", note: "Warm and unhurried. Half of bright.", h: 0.88, w: 1.03, rise: -0.01, tilt: 0, asym: 0, curve: 0.3 },

  /** Interested. Open and lifted — the face of paying close attention to you. */
  keen: { label: "Keen", note: "Interested. Open, lifted, steady.", h: 1.2, w: 0.97, rise: -0.035, tilt: 0, asym: 0, curve: 0 },

  /** Concentrating, or unconvinced. Narrow with the tops drawn together. */
  narrow: { label: "Narrow", note: "Concentrating, or unconvinced.", h: 0.55, w: 1.05, rise: 0.01, tilt: 9, asym: 0, curve: 0 },

  /** Caught off guard. The only expression that makes the eyes bigger in both axes. */
  wide: { label: "Wide", note: "Caught off guard.", h: 1.4, w: 1.16, rise: -0.03, tilt: 0, asym: 0, curve: 0 },

  /**
   * Playful. One eye doing something the other is not — the smallest possible amount of
   * mischief, and deliberately small: the brief rules out a character that mugs.
   */
  wry: { label: "Wry", note: "A little playful. One eye disagrees with the other.", h: 0.84, w: 1.04, rise: 0, tilt: 0, asym: 14, curve: 0.34 },

  /** Sorry to say it. The downward bow, used sparingly and never with a colour change. */
  concerned: { label: "Concerned", note: "Sorry to say it. Bowed, not angry.", h: 0.9, w: 1.02, rise: 0.02, tilt: -7, asym: 0, curve: -0.38 },

  /** Running out of attention. Lids low, sitting heavy. */
  weary: { label: "Weary", note: "Running low. Lids heavy.", h: 0.7, w: 1, rise: 0.05, tilt: 4, asym: 0, curve: -0.12 },
} as const satisfies Record<string, ExpressionDef>;

export type ExpressionId = keyof typeof EXPRESSIONS;
export const EXPRESSION_ORDER = Object.keys(EXPRESSIONS) as ExpressionId[];

/** Interpolates two expressions, for the morph when one replaces another. */
export function blendExpression(a: ExpressionDef, b: ExpressionDef, t: number): ExpressionDef {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    label: t < 0.5 ? a.label : b.label,
    note: t < 0.5 ? a.note : b.note,
    h: m(a.h, b.h),
    w: m(a.w, b.w),
    rise: m(a.rise, b.rise),
    tilt: m(a.tilt, b.tilt),
    asym: m(a.asym, b.asym),
    curve: m(a.curve, b.curve),
  };
}

/** Lays an expression over the eye pose a state produced. */
export function applyExpression(eye: EyePose, e: ExpressionDef): EyePose {
  return {
    ...eye,
    h: eye.h * e.h,
    w: eye.w * e.w,
    rise: eye.rise + e.rise,
    tilt: eye.tilt + e.tilt,
    asym: eye.asym + e.asym,
    curve: eye.curve + e.curve,
  };
}
