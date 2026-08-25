// The bible-strong-avatar-lab reference set.
//
// PROVENANCE, AND THE LICENCE THAT SHAPED THE METHOD. smontlouis/bible-strong-avatar-lab
// is AGPL-3.0 — not Apache, as it was first described here. That is the strictest
// copyleft there is: incorporating its CODE into a service obliges us to publish all of
// Nemesis under the same terms. So none of its code is here.
//
// What is here is measurement. The repository is public, reading it is not what copyleft
// restricts, and the numbers below were read out of its own default document
// (`src/features/studio/defaultStudioDocument.json`) and converted. Values are facts
// about a design, not the expression of one, and this file is our own implementation of
// them against our own engine. Owner, 2026-08-25: *"look at the code again and look at
// the website to make it perfect."*
//
// 🔴 CONVERTED THROUGH THE GEOMETRY, NOT THROUGH THEIR NEUTRAL. Their eyes are ABSOLUTE —
// `widthLeft: 22.5` in a space where the body is 240 units across. Ours are multipliers on
// whatever the state already decided. The first conversion here divided by their neutral
// eye, which looked reasonable and was wrong: our resting eyes already sit wider apart
// than theirs (0.325 of the radius against 0.292), so every expression inherited that
// difference and the whole set rendered with the eyes pushed out to the rim. Caught by
// putting the two side by side on screen.
//
// The mapping is geometric instead, and it needs two facts about their units that the
// field names do not give you: their `width`/`height` are FULL dimensions where ours are
// HALF-extents, and their `spacing` is a half-separation. So a width of 20 is
// `20 / 2 / 120` of the radius, against our own resting `EYE_W` of 0.125. Their neutral
// comes out at w 0.67, h 0.89, spread 0.90 — near enough to 1 in all three to confirm the
// units, which is the check that settled it.
//
// 🔴 TWO AXES HAD TO BE ADDED TO OUR MODEL TO HOLD THIS FAITHFULLY. `spread` (how far
// apart the pair sits) and a per-eye horizontal offset. Without `spread` the set collapses
// — all 27 of their expressions move the eyes wider than the avatar's neutral, by between
// 45% and 103%, which is the single largest change across the whole set and the thing that
// makes surprise read as surprise. Measured while converting: not one of the 27 uses the
// per-eye horizontal offset, so that axis is carried for authors rather than for this.
//
// 🔴 THE HEAD AXES ARE INFERRED, AND THAT IS STATED RATHER THAN GLOSSED. Their expression
// stores `headX/headY/headZ` with no note on which way each points. `headY` is clearly
// yaw — `far-right-glance` carries the largest value in the set. `headX` is pitch
// INVERTED: six of the seven expressions whose names say "down" carry a negative headX,
// and the seventh (`shy-downward`) looks down with its eyes rather than its head. `headZ`
// is taken as roll. Six-of-seven is evidence, not proof, which is why this paragraph
// exists and why the head is not covered by the exact-match guards.

import type { StudioAnimation, StudioCharacter, StudioExpression } from "./document";
import { DEFAULT_EYE, DEFAULT_EYE_DARK, DEFAULT_INK, DEFAULT_INK_DARK } from "./ink";

/** Their neutral eye, from avatar "Strobi". Everything below is a ratio against it. */
export const BS_NEUTRAL = { w: 20, h: 50, spacing: 35, posY: -7, radius: 120 } as const;

/** One expression, already converted. */
export interface BsExpression {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly spread: number;
  readonly rise: number;
  readonly left: { w: number; h: number; dx: number; rise: number; tilt: number };
  readonly right: { w: number; h: number; dx: number; rise: number; tilt: number };
  readonly head: { yaw: number; pitch: number; roll: number };
  readonly eyeMotion: string;
  readonly bodyMotion: string;
}

export const BS_EXPRESSIONS: readonly BsExpression[] = [
  { id: "upward-side-glance", w: 0.75, h: 0.7514, spread: 1.3923, rise: -0.1125, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 27.8, pitch: -7.3, roll: -16.1 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "downward-gaze", w: 0.7467, h: 0.9676, spread: 1.4795, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 0.143, pitch: 15.0578, roll: -14.5492 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "skeptical-right", w: 1.2169, h: 0.6216, spread: 1.4436, rise: 0.0583, left: { w: 0.6325, h: 1.6454, dx: 0, rise: 0, tilt: 0 }, right: { w: 1.3675, h: 0.3546, dx: 0, rise: 0, tilt: 0 }, head: { yaw: -3.768, pitch: 16.5285, roll: -13.7297 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "small-attentive", w: 0.7356, h: 0.7021, spread: 1.3051, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 14.3621, pitch: 4.2324, roll: 11.2043 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "wide-downward-gaze", w: 1.7533, h: 0.9189, spread: 1.7821, rise: 0.0583, left: { w: 0.9902, h: 0.993, dx: 0, rise: 0, tilt: 0 }, right: { w: 1.0098, h: 1.007, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 15.2, pitch: 19.2086, roll: 11.8 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "surprised-left", w: 1.7228, h: 0.9174, spread: 1.8179, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: -16.0512, pitch: -2.9469, roll: -20.916 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "sleepy-squint", w: 1.7258, h: 0.231, spread: 1.6378, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 13.2258, pitch: -3.4, roll: 8.977 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "angry-right", w: 0.6969, h: 0.7163, spread: 1.3349, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: -30.8656 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 28.7816 }, head: { yaw: 17.6266, pitch: -8.0637, roll: -11.1168 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "curious-left", w: 0.6869, h: 0.847, spread: 1.4077, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 23.523 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: -24.0426 }, head: { yaw: -17.6012, pitch: 12.3035, roll: 5.9109 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "asymmetric-down-right", w: 1.0767, h: 0.5674, spread: 1.5821, rise: 0.0583, left: { w: 1.3158, h: 1.3062, dx: 0, rise: 0, tilt: 0 }, right: { w: 0.6842, h: 0.6937, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 12.6074, pitch: 20.0582, roll: -12.7 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "attentive-left", w: 0.7946, h: 1.0307, spread: 1.4564, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 6.1941, pitch: -1.4336, roll: 10.5602 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "joyful-wide", w: 1.14, h: 1.4939, spread: 1.5234, rise: 0.0583, left: { w: 1, h: 1.0128, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 0.9872, dx: 0, rise: 0, tilt: 0 }, head: { yaw: -15.8996, pitch: 2.093, roll: -14.4699 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "eyes-closed", w: 1.8711, h: 0.2718, spread: 1.7763, rise: 0.0583, left: { w: 1, h: 1.0112, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 0.9888, dx: 0, rise: 0, tilt: 0 }, head: { yaw: -8.7434, pitch: 8.7523, roll: -10.7738 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "joyful-down-right", w: 1.0418, h: 1.3603, spread: 1.7615, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 15.0066, pitch: 15.2871, roll: 12.7879 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "skeptical-left", w: 1.2205, h: 0.6444, spread: 1.5953, rise: 0.0583, left: { w: 0.6638, h: 1.6311, dx: 0, rise: 0, tilt: 0 }, right: { w: 1.3362, h: 0.3689, dx: 0, rise: 0, tilt: 0 }, head: { yaw: -7.0766, pitch: -3.5293, roll: 9.8301 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "far-right-glance", w: 0.7487, h: 0.706, spread: 1.3821, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 35.3074, pitch: -0.3191, roll: -10.9043 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "angry-left", w: 0.6534, h: 0.8624, spread: 1.4128, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: -27.6066 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 26.1484 }, head: { yaw: -19.35, pitch: 14.7508, roll: 5.6316 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "playful-right", w: 0.6348, h: 0.769, spread: 1.3264, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 26.2922 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: -20.2492 }, head: { yaw: 14.0727, pitch: 4.3953, roll: -16.1262 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "asymmetric-up-left", w: 1.0717, h: 0.5656, spread: 1.5487, rise: 0.0583, left: { w: 1.3095, h: 1.3072, dx: 0, rise: 0, tilt: 0 }, right: { w: 0.6905, h: 0.6928, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 4.7371, pitch: -6.5855, roll: 12.8402 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "gentle-downward-gaze", w: 0.7682, h: 1.0405, spread: 1.441, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: -11.0352, pitch: 6.0777, roll: -13.9656 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "wide-down-left", w: 1.1818, h: 1.4026, spread: 1.8154, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 18.0707, pitch: 17.1277, roll: 13.8918 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "surprised-wide-left", w: 1.6983, h: 0.8821, spread: 1.7692, rise: 0.0583, left: { w: 1.0088, h: 1.007, dx: 0, rise: 0, tilt: 0 }, right: { w: 0.9912, h: 0.993, dx: 0, rise: 0, tilt: 0 }, head: { yaw: -11.7133, pitch: 5.4281, roll: -13.4723 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "drowsy-closed", w: 1.8557, h: 0.2591, spread: 1.7543, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 3.3992, pitch: -10.2926, roll: 7.5832 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "suspicious-right", w: 1.2922, h: 0.6137, spread: 1.537, rise: -0.0233, left: { w: 0.6183, h: 1.6148, dx: 0, rise: 0, tilt: 0 }, right: { w: 1.3817, h: 0.3852, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 10, pitch: 17.8, roll: -10.8949 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "shy-downward", w: 0.745, h: 0.5807, spread: 1.3128, rise: 0.3917, left: { w: 0.962, h: 0.9771, dx: 0, rise: 0, tilt: 0 }, right: { w: 1.038, h: 1.0229, dx: 0, rise: 0, tilt: 0 }, head: { yaw: 7.7828, pitch: -7.1316, roll: 3.9355 }, eyeMotion: "none", bodyMotion: "none" },
  { id: "angry-brows", w: 0.9042, h: 1.1175, spread: 1.7615, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: -36.2445 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: 27.7301 }, head: { yaw: 5.0873, pitch: -10.474, roll: 4.6983 }, eyeMotion: "none", bodyMotion: "shake" },
  { id: "uneasy-left", w: 0.6869, h: 0.847, spread: 1.4077, rise: 0.0583, left: { w: 1, h: 1, dx: 0, rise: 0, tilt: 23.523 }, right: { w: 1, h: 1, dx: 0, rise: 0, tilt: -24.0426 }, head: { yaw: -17.6012, pitch: 12.3035, roll: 5.9109 }, eyeMotion: "shake", bodyMotion: "slowDrift" },
];

/** Their 23 sequences, with the millisecond timings converted to seconds. */
export interface BsSequence {
  readonly id: string;
  readonly steps: readonly { readonly e: string; readonly hold: number; readonly morph: number }[];
  readonly blink: { readonly first: number; readonly min: number; readonly max: number; readonly dur: number } | null;
}

export const BS_SEQUENCES: readonly BsSequence[] = [
  { id: "sleeping", steps: [{ e: "eyes-closed", hold: 3.6, morph: 0.5 }, { e: "drowsy-closed", hold: 3.6, morph: 0.5 }, { e: "sleepy-squint", hold: 3.6, morph: 0.5 }], blink: { first: 4.8, min: 6.5, max: 9.5, dur: 0.42 } },
  { id: "waking", steps: [{ e: "eyes-closed", hold: 2.3, morph: 0.5 }], blink: { first: 1.2, min: 1.8, max: 3.6, dur: 0.22 } },
  { id: "idle", steps: [{ e: "upward-side-glance", hold: 5.2, morph: 0.5 }, { e: "curious-left", hold: 5.2, morph: 0.5 }], blink: { first: 2.6, min: 3.4, max: 6.2, dur: 0.28 } },
  { id: "listening", steps: [{ e: "attentive-left", hold: 2.3, morph: 0.5 }, { e: "downward-gaze", hold: 2.3, morph: 0.5 }, { e: "gentle-downward-gaze", hold: 2.3, morph: 0.5 }], blink: { first: 3.2, min: 4.8, max: 7.2, dur: 0.24 } },
  { id: "thinking", steps: [{ e: "curious-left", hold: 2.3, morph: 0.5 }, { e: "angry-left", hold: 2.3, morph: 0.5 }, { e: "skeptical-left", hold: 2.3, morph: 0.5 }, { e: "playful-right", hold: 2.3, morph: 0.5 }, { e: "skeptical-right", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "searching", steps: [{ e: "far-right-glance", hold: 2.3, morph: 0.5 }, { e: "asymmetric-down-right", hold: 2.3, morph: 0.5 }, { e: "surprised-left", hold: 2.3, morph: 0.5 }, { e: "wide-down-left", hold: 2.3, morph: 0.5 }, { e: "wide-downward-gaze", hold: 2.3, morph: 0.5 }, { e: "asymmetric-up-left", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "working", steps: [{ e: "angry-right", hold: 2.3, morph: 0.5 }, { e: "angry-left", hold: 2.3, morph: 0.5 }, { e: "joyful-wide", hold: 2.3, morph: 0.5 }, { e: "attentive-left", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "excited", steps: [{ e: "joyful-down-right", hold: 2.3, morph: 0.5 }, { e: "playful-right", hold: 2.3, morph: 0.5 }, { e: "surprised-wide-left", hold: 2.3, morph: 0.5 }, { e: "surprised-left", hold: 2.3, morph: 0.5 }, { e: "joyful-wide", hold: 2.3, morph: 0.5 }], blink: { first: 1.2, min: 1.8, max: 3.6, dur: 0.22 } },
  { id: "bored", steps: [{ e: "sleepy-squint", hold: 3.6, morph: 0.5 }, { e: "drowsy-closed", hold: 3.6, morph: 0.5 }, { e: "upward-side-glance", hold: 3.6, morph: 0.5 }], blink: { first: 4.8, min: 6.5, max: 9.5, dur: 0.42 } },
  { id: "suspicious", steps: [{ e: "skeptical-left", hold: 2.3, morph: 0.5 }, { e: "skeptical-right", hold: 2.3, morph: 0.5 }, { e: "suspicious-right", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "angry", steps: [{ e: "angry-right", hold: 2.3, morph: 0.5 }, { e: "angry-left", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "drowsy", steps: [{ e: "sleepy-squint", hold: 3.6, morph: 0.5 }, { e: "drowsy-closed", hold: 3.6, morph: 0.5 }, { e: "eyes-closed", hold: 3.6, morph: 0.5 }], blink: { first: 4.8, min: 6.5, max: 9.5, dur: 0.42 } },
  { id: "happy", steps: [{ e: "joyful-down-right", hold: 2.3, morph: 0.5 }, { e: "joyful-wide", hold: 2.3, morph: 0.5 }, { e: "playful-right", hold: 2.3, morph: 0.5 }, { e: "gentle-downward-gaze", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "curious", steps: [{ e: "surprised-left", hold: 2.3, morph: 0.5 }, { e: "surprised-wide-left", hold: 2.3, morph: 0.5 }, { e: "upward-side-glance", hold: 2.3, morph: 0.5 }, { e: "far-right-glance", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "confused", steps: [{ e: "skeptical-left", hold: 2.3, morph: 0.5 }, { e: "skeptical-right", hold: 2.3, morph: 0.5 }, { e: "curious-left", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "surprised", steps: [{ e: "surprised-left", hold: 2.3, morph: 0.5 }, { e: "surprised-wide-left", hold: 2.3, morph: 0.5 }], blink: { first: 1.2, min: 1.8, max: 3.6, dur: 0.22 } },
  { id: "proud", steps: [{ e: "far-right-glance", hold: 2.3, morph: 0.5 }, { e: "curious-left", hold: 2.3, morph: 0.5 }, { e: "joyful-down-right", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "shy", steps: [{ e: "upward-side-glance", hold: 2.3, morph: 0.5 }, { e: "shy-downward", hold: 2.3, morph: 0.5 }, { e: "eyes-closed", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "sad", steps: [{ e: "sleepy-squint", hold: 3.6, morph: 0.5 }, { e: "eyes-closed", hold: 3.6, morph: 0.5 }, { e: "drowsy-closed", hold: 3.6, morph: 0.5 }], blink: { first: 4.8, min: 6.5, max: 9.5, dur: 0.42 } },
  { id: "laughing", steps: [{ e: "joyful-down-right", hold: 2.3, morph: 0.5 }, { e: "joyful-wide", hold: 2.3, morph: 0.5 }, { e: "playful-right", hold: 2.3, morph: 0.5 }], blink: { first: 1.2, min: 1.8, max: 3.6, dur: 0.22 } },
  { id: "scared", steps: [{ e: "surprised-left", hold: 2.3, morph: 0.5 }, { e: "surprised-wide-left", hold: 2.3, morph: 0.5 }], blink: { first: 1.2, min: 1.8, max: 3.6, dur: 0.22 } },
  { id: "playful", steps: [{ e: "joyful-down-right", hold: 2.3, morph: 0.5 }, { e: "playful-right", hold: 2.3, morph: 0.5 }, { e: "joyful-wide", hold: 2.3, morph: 0.5 }, { e: "curious-left", hold: 2.3, morph: 0.5 }], blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 } },
  { id: "celebrate", steps: [{ e: "joyful-down-right", hold: 2.3, morph: 0.5 }, { e: "curious-left", hold: 2.3, morph: 0.5 }, { e: "playful-right", hold: 2.3, morph: 0.5 }], blink: { first: 1.2, min: 1.8, max: 3.6, dur: 0.22 } },
];

/** Which of our states each sequence is previewed over. */
const MODE_FOR: Record<string, string> = {
  "idle": "idle",
  "sleeping": "inactive",
  "waking": "greeting",
  "listening": "listening",
  "thinking": "thinking",
  "searching": "searching",
  "working": "writing",
  "excited": "success",
  "bored": "waiting",
  "suspicious": "evaluating",
  "angry": "incorrect",
  "drowsy": "inactive",
  "happy": "correct",
  "curious": "curious",
  "confused": "confusion",
  "surprised": "notice",
  "proud": "complete",
  "shy": "partial",
  "sad": "incorrect",
  "laughing": "success",
  "scared": "alert",
  "playful": "wink",
  "celebrate": "success"
};

/** Their eight 3D surfaces, mapped to the flat catalogue counterparts added for them. */
/**
 * 🔴 `cone` MAPS TO `drop`, NOT TO `triangle`, AND THE SITE IS WHY. The name says cone and
 * the obvious flat counterpart is a triangle; their avatar "Citrus" actually renders as a
 * rounded teardrop — narrow at the top, full and round at the bottom — because the cone is
 * a 3D solid with a rounded tip and base seen head-on. `drop` is that silhouette. Checked
 * against the running site rather than inferred from the type name.
 */
export const BS_SURFACE: Record<string, string> = {
  "sphere": "circle",
  "cube": "square",
  "cone": "drop",
  "capsule": "capsule",
  "cylinder": "cylinder",
  "diamond": "diamond",
  "mickey": "circle",
  "cursor": "drop"
};

/** Their ten avatars: name, surface and colours, as read from the same document. */
export const BS_AVATARS = [
  {
    "name": "Strobi",
    "surface": "sphere",
    "w": 240,
    "h": 240,
    "round": 1,
    "nodes": 0,
    "colors": {
      "body": "#5b7fe5",
      "eyes": "#111316"
    }
  },
  {
    "name": "Freddy",
    "surface": "cube",
    "w": 174.732421875,
    "h": 149.474609375,
    "round": 0.7621875,
    "nodes": 3,
    "colors": {
      "body": "#e6855c",
      "eyes": "#ffffff"
    }
  },
  {
    "name": "Citrus",
    "surface": "cone",
    "w": 252.708984375,
    "h": 274.9671875,
    "round": 0,
    "nodes": 0,
    "colors": {
      "body": "#ffcf24",
      "eyes": "#000000"
    }
  },
  {
    "name": "Nova",
    "surface": "capsule",
    "w": 205,
    "h": 270,
    "round": 1,
    "nodes": 0,
    "colors": {
      "body": "#55b6c3",
      "eyes": "#111316"
    }
  },
  {
    "name": "Grok bot",
    "surface": "sphere",
    "w": 240,
    "h": 240,
    "round": 1,
    "nodes": 0,
    "colors": {
      "body": "#000000",
      "eyes": "#ffffff"
    }
  },
  {
    "name": "Sunee",
    "surface": "sphere",
    "w": 182.95728256225593,
    "h": 185.5484375,
    "round": 1,
    "nodes": 8,
    "colors": {
      "body": "#e69a5c",
      "eyes": "#111316"
    }
  },
  {
    "name": "Kirby",
    "surface": "sphere",
    "w": 240,
    "h": 240,
    "round": 1,
    "nodes": 2,
    "colors": {
      "body": "#ffc2e9",
      "eyes": "#3e4e65"
    }
  },
  {
    "name": "Cloudee",
    "surface": "sphere",
    "w": 159.787109375,
    "h": 159.787109375,
    "round": 1,
    "nodes": 4,
    "colors": {
      "body": "#c9cbcf",
      "eyes": "#111316"
    }
  },
  {
    "name": "Cubee",
    "surface": "cube",
    "w": 191.49921875,
    "h": 191.49921875,
    "round": 0.73265625,
    "nodes": 0,
    "colors": {
      "body": "#e65c5c",
      "eyes": "#111316"
    }
  },
  {
    "name": "Onee",
    "surface": "cone",
    "w": 250,
    "h": 182.006640625,
    "round": 0,
    "nodes": 0,
    "colors": {
      "body": "#dbe2f5",
      "eyes": "#111316"
    }
  }
] as const;

function faces(): StudioExpression[] {
  return BS_EXPRESSIONS.map((e) => {
    const seq = BS_SEQUENCES.find((s) => s.steps.some((st) => st.e === e.id));
    return {
      id: e.id,
      name: e.id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
      h: e.h,
      w: e.w,
      rise: e.rise,
      tilt: 0,
      asym: 0,
      curve: 0,
      spread: e.spread,
      // 🔴 ALWAYS UNLINKED, even where the two eyes agree. Nine of the twenty-seven have a
      // genuine left/right split — `skeptical-right` is a normal eye beside a flat one —
      // and carrying the pair explicitly everywhere keeps one shape for the whole set
      // rather than a rule about when it applies.
      left: { w: e.left.w, h: e.left.h, rise: e.left.rise, tilt: e.left.tilt, dx: e.left.dx },
      right: { w: e.right.w, h: e.right.h, rise: e.right.rise, tilt: e.right.tilt, dx: e.right.dx },
      ink: null,
      eyeInk: null,
      motion: { eyes: "still" as const, body: "still" as const },
      head: { ...e.head },
      mode: (MODE_FOR[seq?.id ?? "idle"] ?? "idle") as StudioExpression["mode"],
      shape: "circle",
      shapeMix: 1,
      note: `Read from bible-strong-avatar-lab's ${e.id}.`,
    } as StudioExpression;
  });
}

function animations(): StudioAnimation[] {
  return BS_SEQUENCES.map((s) => ({
    id: s.id,
    name: s.id.replace(/^./, (c) => c.toUpperCase()),
    steps: s.steps.map((st) => ({
      expressionId: st.e,
      hold: st.hold,
      morph: st.morph,
      // Every step in their whole document uses the same arrival, which is worth noting
      // rather than parameterising: twenty-three sequences, one curve.
      ease: "inOutSine" as const,
      blinkIn: false,
    })),
    playback: "loop" as const,
    blink: s.blink,
  }));
}

/** The reference as a studio character. */
export function bibleStrongReferenceCharacter(id: string): StudioCharacter {
  return {
    id,
    name: "Bible Strong reference",
    // Their default avatar "Strobi": a blue sphere with near-black eyes.
    ink: "#5b7fe5",
    inkDark: "#5b7fe5",
    eye: "#111316",
    eyeDark: "#111316",
    body: {
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
    // Their eyes are rounded rectangles at roundness 1 — a capsule, same as bloub's.
    eyeShape: "capsule",
    parts: [],
    partBlend: 0.3,
    expressions: faces(),
    animations: animations(),
  };
}
