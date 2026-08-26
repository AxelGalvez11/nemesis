// The ten routines: the things the character DOES, as opposed to the things it feels.
//
// 🔴 EVERY ONE OF THESE RUNS ON THE SAME ENGINE AS THE OTHER THIRTY-NINE (owner 2026-08-25:
// *"i need one shared layer and engine"*). Six of the ten change the body — it becomes a
// dot, a bar, an egg, a hexagon, a bouncing pebble, a thing that scatters — and the honest
// options were to give a second engine a coat of paint, or to make one engine able to say
// all of it. The second is what happened: four numeric knobs on the solid (see
// `Surface.taper`), decor as part of the pose, and the face able to fade out. Nothing here
// is a special case in the renderer; it is all data, and it all morphs.
//
// The measurements are the reference's own, in body radii and seconds, converted once here.

import { RADIUS } from "./space";
import { TRACED, hullOfCircles, profileFromPolygon } from "./vendor/silhouettes";
import type { Animation, BodyPose, Dot, Face } from "./types";

/** Body radii to mark units. The body this was authored against has a radius of `RADIUS`. */
const R = RADIUS;

const REST: BodyPose = { scale: 1, x: 0, y: 0, profile: null };

const body = (over: Partial<BodyPose>): BodyPose => ({ ...REST, ...over });

interface Pose {
  readonly head: readonly [number, number, number];
  readonly split: number;
  readonly eyes: readonly [readonly [number, number], readonly [number, number]];
}

/** A routine's face. Same units and same conversion as `expressions.ts`. */
function act(
  id: string,
  pose: Pose | null,
  over: Partial<Face> = {},
): Face {
  const eyes = pose?.eyes ?? ([[0.186, 0.412], [0.186, 0.412]] as const);
  return {
    id,
    head: pose ? { x: pose.head[1], y: pose.head[0], z: pose.head[2] } : { x: 28.62, y: 28.49, z: 0 },
    spacing: (pose?.split ?? 15.46) * 2 * (Math.PI / 180) * R,
    left: { width: eyes[0][0] * R, height: eyes[0][1] * R, x: 0, y: 0, angle: 0 },
    right: { width: eyes[1][0] * R, height: eyes[1][1] * R, x: 0, y: 0, angle: 0 },
    eyeMotion: "none",
    bodyMotion: "none",
    ...over,
  };
}

// ── Thinking: the body becomes the middle of three dots ─────────────────────────
//
// 🔴 THE BALL DOES NOT SIT BESIDE THE DOTS, IT BECOMES ONE OF THEM. That is what makes the
// entry a morph instead of a swap, and it is why this needed a body that can shrink rather
// than a sprite that can be drawn on top. The face fades out while it happens; a pause for
// thought has no face.

/** Where the three dots sit, and how big they are. Measured. */
const DOT_X = [-0.557, -0.013, 0.532] as const;
const DOT_R = 0.165;
const DOT_PEAK = 1.25;
/** The wave takes this long to cross all three, and each dot is a third of a wave behind. */
const PULSE_MS = 1500;
const PULSE_LAG_MS = 500;

/** The reference's own pulse: a half cosine over the first half of the cycle, then nothing. */
function pulseAt(ms: number, index: number): number {
  const p = ((((ms - index * PULSE_LAG_MS) / PULSE_MS) % 1) + 1) % 1;
  const k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * Math.PI * 2) : 0;
  return Math.min(1, Math.max(0, k * 2));
}

const THINK_STEPS = 6;

const thinkFaces: Face[] = Array.from({ length: THINK_STEPS }, (_, i) => {
  const at = (i * PULSE_MS) / THINK_STEPS;
  const middle = pulseAt(at, 1);
  const dots: Dot[] = [0, 2].map((which) => {
    const k = pulseAt(at, which);
    return {
      // Relative to the body, because the body has moved to where the middle dot belongs
      // and everything drawn beside it travels with it.
      x: (DOT_X[which]! - DOT_X[1]!) * R,
      y: 0,
      r: DOT_R * (1 + (DOT_PEAK - 1) * k) * R,
      opacity: 0.55 + 0.45 * k,
    };
  });
  return act(`think${i}`, null, {
    body: body({ scale: DOT_R * (1 + (DOT_PEAK - 1) * middle), x: DOT_X[1]! * R }),
    eyeAlpha: 0,
    dots,
  });
});

// ── The rest of the poses ───────────────────────────────────────────────────────

const WINK: Pose = { head: [-5.37, 4.55, 6.7], split: 16.25, eyes: [[0.236, 0.464], [0.447, 0.089]] };

/**
 * The badge, and the bite taken out of the body behind it.
 *
 * 🔴 THE BADGE IS THE SAME COLOUR AS THE BODY, WHICH IS NOT WHAT THE REFERENCE DOES. There
 * it is a fixed blue. Here the character IS the accent (see `characterInk` in lib/accent.ts), and a
 * second colour that the learner did not choose, arguing with the one they did, is exactly
 * what that rule exists to prevent. The notch is what makes it read as a badge without one:
 * a disc taken out of the body leaves a ring of page between them, so the dot is plainly
 * outside the character rather than painted on it.
 */
const NOTIF_ANGLE = -42 * (Math.PI / 180);
const NOTIF_DIST = 1.003;
const NOTIF_R = 0.15;
const NOTIF_MARGIN = 0.054;

const notifFace = (id: string, size: number): Face =>
  act(id, { head: [-21.94, -5.82, -12.2], split: 18.89, eyes: [[0.505, 0.498], [0.505, 0.498]] }, {
    dots: [
      {
        x: Math.cos(NOTIF_ANGLE) * NOTIF_DIST * R,
        y: Math.sin(NOTIF_ANGLE) * NOTIF_DIST * R,
        r: NOTIF_R * size * R,
        opacity: 1,
      },
    ],
    notch: {
      x: Math.cos(NOTIF_ANGLE) * NOTIF_DIST * R,
      y: Math.sin(NOTIF_ANGLE) * NOTIF_DIST * R,
      r: (NOTIF_R * size + NOTIF_MARGIN) * R,
    },
  });

/**
 * The bar of an exclamation mark, built exactly as the source builds it.
 *
 * 🔴 THE SOURCE'S OWN GEOMETRY, NOT A DESCRIPTION OF IT. It is the convex hull of two
 * circles — radius 0.132 at the top and 0.075 at the bottom, so the glyph is thicker at the
 * top the way a printed one is — turned into a radial profile. The first version restated
 * that as a taper and a straight-sidedness of my own devising and came out close but wrong.
 * The builders are MIT and are vendored beside the traced tables.
 */
const BAR_TOP = 0.132;
const BAR_BOTTOM = 0.075;
/** Where the profile is measured from. The source's own centre for this shape. */
const BAR_CENTRE = -0.1875;

const EXCLAIM: BodyPose = body({
  profile: profileFromPolygon(hullOfCircles(0, -0.505, BAR_TOP, 0, 0.13, BAR_BOTTOM), 0, BAR_CENTRE),
  y: BAR_CENTRE * R,
});

/** The egg and the hexagon: traced off the reference video, frame by frame. Not modelled. */
const EGG: BodyPose = body({ profile: [...TRACED.egg] });
const HEX: BodyPose = body({ profile: [...TRACED.hexagon] });

const SLEEP_R = 0.1585;
const SLEEP_MID = 0.11;
const SLEEP_SWING = 0.19;

/**
 * The scatter.
 *
 * The body falls in on itself, five sparks spiral in BEHIND it and are swallowed, and it
 * grows back with its face returning last. The sparks spiral inward rather than flying out,
 * which is the whole difference between something pulling itself together and something
 * blowing up.
 */
const BURST_SMALL = 0.166;

const FACES: readonly Face[] = [
  ...thinkFaces,

  act("winkShut", WINK, { bodyMotion: "slowDrift" }),
  act("winkOpen", { ...WINK, eyes: [[0.236, 0.464], [0.236, 0.464]] }, { bodyMotion: "slowDrift" }),

  act("wideEyes", { head: [6.92, -21.96, 11.6], split: 18.43, eyes: [[0.356, 0.875], [0.356, 0.875]] }, {
    eyeMotion: "microSaccades",
    bodyMotion: "slowDrift",
  }),

  notifFace("notifySmall", 0.55),
  notifFace("notifyPop", 1.14),
  notifFace("notifyRest", 1),

  act("exclaim", null, {
    body: EXCLAIM,
    eyeAlpha: 0,
    dots: [{ x: -0.012 * R, y: 0.526 * R, r: 0.113 * R, opacity: 1 }],
  }),

  act("sleepHigh", null, { body: body({ scale: SLEEP_R, y: (SLEEP_MID - SLEEP_SWING) * R }), eyeAlpha: 0 }),
  act("sleepLow", null, { body: body({ scale: SLEEP_R, y: (SLEEP_MID + SLEEP_SWING) * R }), eyeAlpha: 0 }),

  // 🔴 THE SOURCE'S OWN ANGLES, UNCHANGED. An earlier pass halved them, because the
  // silhouette was then being shaped in the body's own frame and 17° of roll tipped the whole
  // egg over. The shape is applied in the picture now — where the source applies it — so the
  // roll leans the FACE and leaves the egg standing, and these are the measured numbers.
  act("egg", { head: [19.97, 26.01, -17.1], split: 11.07, eyes: [[0.164, 0.385], [0.164, 0.385]] }, {
    body: EGG,
    bodyMotion: "slowDrift",
  }),

  act("hexagon", { head: [23.11, 24.42, -13.3], split: 13.37, eyes: [[0.177, 0.411], [0.177, 0.411]] }, {
    body: HEX,
    bodyMotion: "slowDrift",
  }),

  act("burstIn", null, {
    body: body({ scale: BURST_SMALL }),
    eyeAlpha: 0,
    sparks: {
      count: 5,
      everyMs: 200,
      lifeMs: 620,
      from: 0.58 * R,
      // The reference shrinks the radius by three quarters every tenth of a second, which
      // over a whole second is this.
      pull: 0.75 ** 10,
      spinDegPerSec: 100,
      r0: 0.04 * R,
      r1: 0.068 * R,
      amount: 1,
    },
  }),
  act("burstOut", null, { bodyMotion: "slowDrift" }),
];

const blink = (firstMs: number, minGapMs: number, maxGapMs: number, durationMs: number) => ({
  firstMs,
  minGapMs,
  maxGapMs,
  durationMs,
});

const ANIMATIONS: readonly Animation[] = [
  {
    // The one that plays when nothing is happening. It is the resting face plus the
    // wandering, the drifting and the blinking that the engine adds to any held pose — the
    // reference's own idle is exactly that and nothing else.
    id: "idle",
    mode: "loop",
    steps: [{ face: "neutral", transitionMs: 450, holdMs: 1950, ease: "smooth" }],
    blink: blink(2600, 3400, 6200, 280),
  },
  {
    id: "thinking",
    mode: "loop",
    steps: thinkFaces.map((f) => ({
      face: f.id,
      transitionMs: PULSE_MS / THINK_STEPS,
      holdMs: 0,
      ease: "smooth" as const,
    })),
    blink: null,
  },
  {
    // 🔴 A REAL WINK, NOT A HELD ONE. The reference holds the shut eye for the whole block
    // and lets the next block take it away, because there it always has a next block. Here
    // an animation can be asked for and left running, and an eye that stays shut for a
    // minute is not a wink, it is a squint.
    id: "wink",
    mode: "loop",
    steps: [
      { face: "winkShut", transitionMs: 160, holdMs: 820, ease: "snappy" },
      { face: "winkOpen", transitionMs: 260, holdMs: 520, ease: "smooth" },
    ],
    blink: null,
  },
  {
    id: "wide",
    mode: "loop",
    steps: [{ face: "wideEyes", transitionMs: 550, holdMs: 1800, ease: "smooth" }],
    blink: blink(3000, 4200, 7000, 240),
  },
  {
    id: "notify",
    mode: "loop",
    steps: [
      { face: "notifySmall", transitionMs: 140, holdMs: 0, ease: "smooth" },
      { face: "notifyPop", transitionMs: 170, holdMs: 0, ease: "snappy" },
      { face: "notifyRest", transitionMs: 190, holdMs: 1700, ease: "smooth" },
    ],
    blink: blink(1400, 2600, 4800, 240),
  },
  {
    id: "exclaim",
    mode: "loop",
    steps: [{ face: "exclaim", transitionMs: 450, holdMs: 1550, ease: "snappy" }],
    blink: null,
  },
  {
    id: "sleep",
    mode: "loop",
    steps: [
      { face: "sleepHigh", transitionMs: 300, holdMs: 0, ease: "smooth" },
      { face: "sleepLow", transitionMs: 300, holdMs: 0, ease: "smooth" },
    ],
    blink: null,
  },
  {
    id: "egg",
    mode: "loop",
    steps: [{ face: "egg", transitionMs: 400, holdMs: 1400, ease: "smooth" }],
    blink: blink(2200, 3000, 5200, 260),
  },
  {
    id: "hexagon",
    mode: "loop",
    steps: [{ face: "hexagon", transitionMs: 400, holdMs: 1200, ease: "smooth" }],
    blink: blink(2000, 2800, 5000, 260),
  },
  {
    id: "burst",
    mode: "loop",
    steps: [
      { face: "burstIn", transitionMs: 700, holdMs: 1000, ease: "snappy" },
      { face: "burstOut", transitionMs: 700, holdMs: 200, ease: "snappy" },
    ],
    blink: null,
  },
];

export { FACES as ROUTINE_FACES, ANIMATIONS as ROUTINES };

/** The ten, in the order the owner picked them. */
export const ROUTINE_IDS: readonly string[] = ANIMATIONS.map((a) => a.id);
