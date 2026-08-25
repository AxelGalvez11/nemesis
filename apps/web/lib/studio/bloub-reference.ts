// The bloub reference set.
//
// PROVENANCE. Every number in this file is read off jeremy-prt/bloub (MIT), the vendored
// copy of which the product already ships at `packages/shared/src/bloub`. Owner's call,
// 2026-08-25: *"use the bloub GitHub repo for the animation timing and expression
// language since that one has MIT license."* The licence permits it and this file is the
// record of where the numbers came from, so a future reader does not have to guess.
//
// 🔴 WHAT IS TAKEN IS RATIOS AND DURATIONS, BECAUSE THAT IS ALL THAT CAN TRANSFER.
// bloub places its eyes on a SPHERE — each is a capsule on a tangent frame, positioned by
// a head yaw/pitch/roll, and its sizes are in units of ball radius. `lib/mascot` is flat:
// a radial profile with eyes cut out of it, sized as fractions of the body's own rx/ry.
// Pasting bloub's 0.505 into our `w` would be meaningless, because the two numbers are
// not measuring the same thing.
//
// What IS meaningful is the ratio of each state's eye to bloub's RESTING eye. That is
// dimensionless, it is exactly what our `ExpressionDef` wants (every field there is a
// multiplier or an offset), and it carries the thing worth carrying: the relative
// proportions that make bloub's `notify` read as notify.
//
// 🔴 ONE FACE PER STATE, NOT ONE FACE PER DISTINCT EYE. The first version of this file
// had seven faces and shared `rest` across the eight states that do not draw their own
// eyes — which is true of the EYES and false of the STATES, because those eight do not
// share a body: `sleep` is a circle, `exclaim` is an upright bar, `play` is a triangle.
// Sharing the face shared the silhouette with it, so most of the reference came out as a
// circle wearing someone else's timings. Owner, 2026-08-25: *"why isn't it circular like
// bloub?"* and *"why aren't the eye shapes correct?"* — both traced back to here.
//
// 🔴 THE EYE IS A CAPSULE, NOT OUR SILHOUETTE. bloub draws its eyes with `capsulePath` —
// a stadium, straight sides and exactly semicircular ends. Ours are the body's own
// superellipse at a small scale, which is fuller in the corners. The character carries
// `eyeShape: "capsule"` so the reference is drawn with the reference's eye; see
// `capsuleEyePath` in `lib/mascot/geometry.ts`.
//
// 🔴 ONE THING STILL DOES NOT SURVIVE, AND IT IS RECORDED RATHER THAN PAPERED OVER.
// bloub's `wink` gives its two eyes DIFFERENT WIDTHS (0.236 and 0.447) as well as
// different heights. Our expression model applies a single `w` to both eyes and expresses
// unevenness only through `asym`, which varies height and tilt. So the wink below matches
// the reference's height ratio and its mean width, and does not match its width split.
// Fixing that properly means a per-eye width in `EyePose`, which is an engine change and
// is not this file's business.

import type { EaseName } from "@/lib/mascot/easing";
import type { ShapeId } from "@/lib/mascot/shapes";
import type { MascotMode } from "@/lib/mascot/types";

import type { StudioAnimation, StudioCharacter, StudioExpression } from "./document";
import { DEFAULT_EYE, DEFAULT_EYE_DARK, DEFAULT_INK, DEFAULT_INK_DARK } from "./ink";

/** bloub's resting eye, in units of ball radius. `packages/shared/src/bloub/face.ts`. */
export const BLOUB_REST_W = 0.186;
export const BLOUB_REST_H = 0.412;

/**
 * bloub's resting head — and it is NOT facing straight ahead.
 *
 * `face.ts`: `REST_GAZE = { yaw: 28.49, pitch: 28.62, roll: -13 }`, with the comment that
 * it was "adjusted against the reference frames". That three-quarter view is a large part
 * of why the character reads as a solid thing with a personality rather than as a face
 * painted on a disc, and transcribing the eye sizes while leaving the head square-on
 * throws it away.
 *
 * 🔴 THE MAGNITUDES ARE TRANSCRIBED; THE SIGNS ARE MATCHED BY EYE. bloub's rotation
 * convention is its own — its yaw/pitch place eyes on a sphere through a tangent frame
 * built in that file, and nothing states which way positive points. So these are the
 * measured magnitudes in OUR convention (`eyeOnSphere`: +yaw looks to the character's
 * right, +pitch looks down, +roll rolls clockwise on screen), with the directions chosen
 * so the result is the same three-quarter view bloub actually renders. That is the
 * honest description of what was done, and it is why this constant is not covered by the
 * exact-match guards that cover the timings.
 */
export const BLOUB_REST_HEAD = { yaw: 28.49, pitch: 28.62, roll: -13 } as const;

/**
 * One state of the reference: its timing, its eye, and its silhouette.
 *
 * `hold` is bloub's `duration`, `morph` its `morph`, `blinkIn` its `blinkIn`. `w` and `h`
 * are that state's eye divided by the resting eye above — the raw numbers are in the
 * comment on each row so the arithmetic can be checked without opening the reference.
 */
export interface ReferenceState {
  readonly id: string;
  readonly label: string;
  readonly hold: number;
  readonly morph: number;
  readonly blinkIn: boolean;
  /** bloub's `minDuration`, or null. Carried for the record; nothing consumes it yet. */
  readonly minDuration: number | null;
  /** Eye size as a ratio of bloub's resting eye. */
  readonly w: number;
  readonly h: number;
  /** Height/tilt split between the two eyes. Only `wink` has one. */
  readonly asym: number;
  /** The catalogue silhouette closest to what bloub draws for this state. */
  readonly shape: ShapeId;
  /** The `lib/mascot` state whose deformation reads closest to bloub's. */
  readonly mode: MascotMode;
  readonly note: string;
}

/**
 * How bloub's bodies map onto our catalogue.
 *
 * bloub                     ours       why
 * ─────────────────────────────────────────────────────────────────────────────────
 * circle(1)                 circle     exact; `circle` was added for this
 * silhouette(egg)           drop       ours IS an egg: fuller at the bottom
 * silhouette(hexagon)       crystal    a softened hexagon
 * barUpright / barItalic    column     tall and narrow; the tilt comes from the state
 * spinningTriangle          triangle   added for this; softened so it survives 18px
 *
 * The three dots of `thinking` and the ribbons of `comet` are decor rather than
 * silhouette, and this engine draws its own — that part is not transcribable and is not
 * claimed to be.
 */
export const REFERENCE: readonly ReferenceState[] = [
  // Eyes: the resting 0.186 x 0.412, so both ratios are exactly 1.
  { id: "idle", label: "Idle", hold: 2.4, morph: 0.45, blinkIn: false, minDuration: null, w: 1, h: 1, asym: 0, shape: "circle", mode: "idle", note: "Resting. bloub's base pose, base face and a plain circle body." },
  { id: "thinking", label: "Thinking", hold: 2.6, morph: 0.4, blinkIn: true, minDuration: null, w: 1, h: 1, asym: 0, shape: "circle", mode: "thinking", note: "The body becomes the middle of three dots. Faceless in the reference." },
  // 0.236 x 0.464 and 0.447 x 0.089: mean w 1.836, mean h 0.671, height split 5.2 : 1.
  { id: "wink", label: "Wink", hold: 1.6, morph: 0.3, blinkIn: true, minDuration: null, w: 1.836, h: 0.671, asym: 33.9, shape: "circle", mode: "wink", note: "One eye a slit, the other slightly open. The reference also splits the two widths; this model cannot." },
  // 0.356 / 0.186 = 1.914, 0.875 / 0.412 = 2.124.
  { id: "wide", label: "Wide", hold: 1.8, morph: 0.55, blinkIn: true, minDuration: null, w: 1.914, h: 2.124, asym: 0, shape: "circle", mode: "listening", note: "Open a long way in both axes — the reference's most-open face." },
  { id: "alert", label: "Alert", hold: 2.4, morph: 0.45, blinkIn: false, minDuration: 2, w: 1, h: 1, asym: 0, shape: "column", mode: "alert", note: "A leaning bar. Faceless in the reference; the shape carries it." },
  // 0.505 / 0.186 = 2.715, 0.498 / 0.412 = 1.209.
  { id: "notify", label: "Notify", hold: 2.2, morph: 0.5, blinkIn: true, minDuration: null, w: 2.715, h: 1.209, asym: 0, shape: "circle", mode: "notice", note: "Very wide, only a little taller than rest. The width is the whole read." },
  { id: "exclaim", label: "Exclaim", hold: 2, morph: 0.45, blinkIn: false, minDuration: null, w: 1, h: 1, asym: 0, shape: "column", mode: "insight", note: "The body becomes an upright bar — a '!'. Faceless in the reference." },
  { id: "sleep", label: "Sleep", hold: 2.4, morph: 0.5, blinkIn: false, minDuration: null, w: 1, h: 1, asym: 0, shape: "circle", mode: "inactive", note: "A circle with drifting z's. Faceless in the reference." },
  // 0.164 / 0.186 = 0.882, 0.385 / 0.412 = 0.934.
  { id: "egg", label: "Egg", hold: 1.8, morph: 0.4, blinkIn: true, minDuration: null, w: 0.882, h: 0.934, asym: 0, shape: "drop", mode: "question", note: "Eyes a touch smaller than rest, over an egg." },
  // 0.177 / 0.186 = 0.952, 0.411 / 0.412 = 0.998.
  { id: "hexagon", label: "Hexagon", hold: 1.6, morph: 0.4, blinkIn: true, minDuration: null, w: 0.952, h: 0.998, asym: 0, shape: "crystal", mode: "evaluating", note: "Eyes within a hair of rest; the silhouette is the change." },
  // 0.18 / 0.186 = 0.968, 0.34 / 0.412 = 0.825.
  { id: "play", label: "Play", hold: 2, morph: 0.5, blinkIn: true, minDuration: null, w: 0.968, h: 0.825, asym: 0, shape: "triangle", mode: "teaching", note: "A spinning triangle, eyes slightly shorter than rest." },
  { id: "orbit", label: "Orbit", hold: 3.4, morph: 0.6, blinkIn: false, minDuration: 2.5, w: 0.968, h: 0.825, asym: 0, shape: "circle", mode: "generating-visual", note: "Six rings around a circle. Shares play's eye exactly in the reference." },
  { id: "swirl", label: "Swirl", hold: 1.3, morph: 0.3, blinkIn: true, minDuration: 1.3, w: 1, h: 1, asym: 0, shape: "circle", mode: "searching", note: "Three of orbit's six rings, and the resting face." },
  { id: "burst", label: "Burst", hold: 2.6, morph: 0.4, blinkIn: false, minDuration: 2.4, w: 1, h: 1, asym: 0, shape: "circle", mode: "ingesting", note: "The body scatters into particles and gathers again." },
  // 🔴 `searching`, NOT `retrieving`. `retrieving` is a NemesisActivity — the vocabulary
  // the product uses to tell the character what it is doing — not a MascotMode, which is
  // the vocabulary the engine draws. The two lists read alike and are not the same list.
  { id: "comet", label: "Comet", hold: 2.4, morph: 0.45, blinkIn: false, minDuration: 2.4, w: 1, h: 1, asym: 0, shape: "circle", mode: "searching", note: "A dot with ribbons, crossing and returning." },
];

/** bloub's morph curve. Its `easings.easeOutCubic` is this engine's `gazeOut`. */
const REFERENCE_EASE: EaseName = "gazeOut";

/** One face per state, wearing that state's own eye and silhouette. */
function faces(): StudioExpression[] {
  return REFERENCE.map((s) => ({
    id: s.id,
    name: s.label,
    h: s.h,
    w: s.w,
    rise: 0,
    tilt: 0,
    asym: s.asym,
    curve: 0,
    // bloub's eye separation is a constant `EYE_SPLIT` across every state — the pair never
    // moves apart — so the spread is left at the identity for all fifteen.
    spread: 1,
    mode: s.mode,
    left: null,
    right: null,
    ink: null,
    eyeInk: null,
    // 🔴 STILL, NOT OUR IDLE LIFE. Same argument as the absent blink schedule: the
    // reference is bloub's measured pose, and laying our own drift and breath over it
    // would leave nobody able to tell which half they were looking at.
    motion: { eyes: "still", body: "still" },
    head: { ...BLOUB_REST_HEAD },
    shape: s.shape,
    // 1, not a blend: the reference's silhouette is the reference's silhouette. A partial
    // mix would be our character showing through a transcription.
    shapeMix: 1,
    note: s.note,
  }));
}

/**
 * One animation per reference state, each a single step at that state's own timing.
 *
 * 🔴 ONE STEP, NOT A SEQUENCE, because that is what the reference is. A bloub state is an
 * arrival followed by a hold — `morph` then `duration` — and it loops. Inventing a
 * multi-step sequence would be authoring something new and calling it a transcription.
 */
function animations(): StudioAnimation[] {
  return REFERENCE.map((s) => ({
    id: s.id,
    name: s.label,
    steps: [{ expressionId: s.id, hold: s.hold, morph: s.morph, ease: REFERENCE_EASE, blinkIn: s.blinkIn }],
    playback: "loop" as const,
    // 🔴 NO IDLE BLINK SCHEDULE ON THE REFERENCE STATES. bloub's blinking is the arrival
    // blink above and nothing else; adding a schedule would be putting our own idle life
    // on top of a transcription and then being unable to tell them apart. The Nemesis
    // character keeps its schedule; this one is the reference as measured.
    blink: null,
  }));
}

/** The reference as a studio character, ready to drop into a document. */
export function bloubReferenceCharacter(id: string): StudioCharacter {
  return {
    id,
    name: "Bloub reference",
    ink: DEFAULT_INK,
    inkDark: DEFAULT_INK_DARK,
    eye: DEFAULT_EYE,
    eyeDark: DEFAULT_EYE_DARK,
    body: {
      // Each face carries its own silhouette, so the character-level one is only the
      // fallback for a face that does not — which, here, is none of them.
      shape: "circle",
      shapeMix: 1,
      scale: 1,
      stretch: 1,
      squash: 1,
      tilt: 0,
      taper: 0,
      pinch: 0,
      ripple: 0,
    },
    eyeShape: "capsule",
    // 🔴 NO COMPOUND PARTS, AND THAT IS THE TRANSCRIPTION BEING FAITHFUL. bloub's bodies
    // are single primitives — a circle, an egg, a bar, a triangle — one per state. Giving
    // the reference a multi-part body would be authoring something bloub does not have.
    parts: [],
    partBlend: 0.3,
    expressions: faces(),
    animations: animations(),
  };
}
