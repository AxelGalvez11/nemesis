// The gestures: short things the character DOES to you, as opposed to how it feels.
//
// 🔴 NOT DRAWN, TIMED. Every one of these is built from faces that already exist — mostly the
// resting face with the head moved a few degrees — and what makes it a gesture is the
// schedule, not a new shape. That is deliberate and it is the cheapest thing in the whole
// character: a nod costs two faces and four numbers, and it says something no expression in
// the set can say.
//
// 🔴 AND NONE OF IT COMES FROM EITHER SOURCE PROJECT. The sixteen feelings and the ten
// routines were measured off references with licences attached; these are ours outright,
// which matters while the question over the imported set is open (see docs/character.md).
//
// 🔴 EVERY GESTURE STARTS AND ENDS AT REST, AND THAT IS A RULE RATHER THAN A HABIT. A "once"
// animation holds its last step for ever, so a gesture that ended tilted would leave the
// character tilted until something else was asked for. It also makes the seam free: the
// first step morphs FROM the last one, so beginning and ending on the same face means the
// entry is already correct whatever was on screen before.

import { EXPRESSIONS } from "./expressions";
import { SHUT_HEIGHT } from "./render";
import type { Animation, BodyPose, Face } from "./types";

const REST: Face = EXPRESSIONS.find((f) => f.id === "neutral")!;

/** The resting face with its head moved. Degrees, added to the pose it already holds. */
function turned(id: string, pitch: number, yaw: number, roll = 0, over: Partial<Face> = {}): Face {
  return {
    ...REST,
    id,
    head: { x: REST.head.x + pitch, y: REST.head.y + yaw, z: REST.head.z + roll },
    ...over,
  };
}

/** The resting face at a different size. Scaling is not "becoming a different drawing". */
const sized = (id: string, scale: number, pitch = 0): Face =>
  turned(id, pitch, 0, 0, { body: { scale, x: 0, y: 0, profile: null } satisfies BodyPose });

// ── The faces these need ────────────────────────────────────────────────────────

const NOD_DIP = -9;
const SHAKE_SWING = 11;
const GLANCE_YAW = 24;

const FACES: readonly Face[] = [
  turned("nodDown", NOD_DIP, 0),

  turned("shakeLeft", 0, -SHAKE_SWING),
  turned("shakeRight", 0, SHAKE_SWING),

  // 🔴 SHUT, NOT SHRUNK TO NOTHING. `drawEye` never takes an eye below `SHUT_HEIGHT`, so a
  // face authored at exactly that height is a drawn slit rather than a vanished eye — the
  // same shape a blink lands on, which is why the two never fight over the same eye.
  {
    ...REST,
    id: "restShut",
    left: { ...REST.left, height: SHUT_HEIGHT },
    right: { ...REST.right, height: SHUT_HEIGHT },
  },

  // Leaning in is a small pitch down and a body a little closer, held.
  sized("leanedIn", 1.06, -3),

  // The overshoot of something with mass arriving.
  sized("settleBig", 1.07),
  sized("settleSmall", 0.975),

  turned("glanceAway", -6, GLANCE_YAW),
];

// ── The gestures ────────────────────────────────────────────────────────────────

const blink = (firstMs: number, minGapMs: number, maxGapMs: number, durationMs: number) => ({
  firstMs,
  minGapMs,
  maxGapMs,
  durationMs,
});

const GESTURES: readonly Animation[] = [
  {
    // 🔴 THE ONE THE PRODUCT MOST OBVIOUSLY LACKS. Nothing in the other forty-nine means
    // "yes" or "got it" — the whole catalogue can be surprised, bored, angry and asleep, and
    // cannot acknowledge you. Down fast, up slow, twice: a nod that returns at the same speed
    // it left reads as a machine oscillating.
    id: "nod",
    mode: "once",
    steps: [
      { face: "nodDown", transitionMs: 140, holdMs: 0, ease: "snappy" },
      { face: "neutral", transitionMs: 190, holdMs: 0, ease: "smooth" },
      { face: "nodDown", transitionMs: 130, holdMs: 0, ease: "snappy" },
      { face: "neutral", transitionMs: 240, holdMs: 0, ease: "smooth" },
    ],
    blink: null,
  },
  {
    // The refusal, and the failure. Note there is no sad face in it: something going wrong is
    // an event, not a mood, and a character that looks miserable after every failed fetch
    // gets tiring long before the bug does.
    id: "shake",
    mode: "once",
    steps: [
      { face: "shakeLeft", transitionMs: 130, holdMs: 0, ease: "snappy" },
      { face: "shakeRight", transitionMs: 165, holdMs: 0, ease: "smooth" },
      { face: "shakeLeft", transitionMs: 165, holdMs: 0, ease: "smooth" },
      { face: "neutral", transitionMs: 210, holdMs: 0, ease: "smooth" },
    ],
    blink: null,
  },
  {
    // 🔴 THE SPEEDS ARE THE GESTURE. Snapping wide in an eighth of a second and easing back
    // over four times that is what makes it read as being caught by something. Equal speeds
    // in and out is a character deciding to look surprised.
    id: "doubleTake",
    mode: "once",
    steps: [
      { face: "surprised", transitionMs: 120, holdMs: 260, ease: "snappy" },
      { face: "neutral", transitionMs: 400, holdMs: 0, ease: "smooth" },
    ],
    blink: null,
  },
  {
    // Warmth, for the cost of one number. An ordinary blink here is 260ms; this is a shut
    // that takes 300, sits for 120, and opens over 300.
    id: "slowBlink",
    mode: "once",
    steps: [
      { face: "restShut", transitionMs: 300, holdMs: 120, ease: "smooth" },
      { face: "neutral", transitionMs: 300, holdMs: 0, ease: "smooth" },
    ],
    blink: null,
  },
  {
    // 🔴 A STATE, NOT A BEAT — SO IT LOOPS. The other gestures fire and are done; this one is
    // worn for as long as the learner is talking, and it has to keep blinking and drifting
    // while it is worn or it reads as a freeze.
    id: "leanIn",
    mode: "loop",
    steps: [{ face: "leanedIn", transitionMs: 420, holdMs: 2400, ease: "smooth" }],
    blink: blink(2200, 3000, 5600, 260),
  },
  {
    // Mass. The character currently stops dead when it walks to the middle of the screen,
    // and nothing with weight does that.
    id: "settle",
    mode: "once",
    steps: [
      { face: "settleBig", transitionMs: 170, holdMs: 0, ease: "snappy" },
      { face: "settleSmall", transitionMs: 150, holdMs: 0, ease: "smooth" },
      { face: "neutral", transitionMs: 240, holdMs: 0, ease: "bouncy" },
    ],
    blink: null,
  },
  {
    // 🔴 THE HOLD IS WHAT POINTS. Looking away and immediately back is a twitch; looking away,
    // STAYING there while the thing appears, and then coming back is the character telling
    // you where to look — which is the only way it can point, having no hands.
    //
    // This is the canonical version, turning right. The dock can aim it at a real target
    // through `aimAt`; the two want reconciling when this goes live.
    id: "glance",
    mode: "once",
    steps: [
      { face: "glanceAway", transitionMs: 260, holdMs: 620, ease: "smooth" },
      { face: "neutral", transitionMs: 340, holdMs: 0, ease: "smooth" },
    ],
    blink: null,
  },
];

export { FACES as GESTURE_FACES, GESTURES };

/** The seven, in the order they were proposed. */
export const GESTURE_IDS: readonly string[] = GESTURES.map((g) => g.id);
