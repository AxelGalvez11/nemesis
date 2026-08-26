// The animations. Generated — see scripts/avatar-import.mts.
//
// A step is a MORPH followed by a HOLD: `transitionMs` easing from whatever was on screen
// into this face, then `holdMs` sitting on it. The list then loops.

import type { Animation } from "./types";

export const ANIMATIONS: readonly Animation[] = [
  {
    id: "gaze-sleeping",
    mode: "loop",
    steps: [
      { face: "eyesClosed", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "drowsyClosed", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "sleepySquint", transitionMs: 500, holdMs: 3600, ease: "smooth" },
    ],
    blink: { firstMs: 4800, minGapMs: 6500, maxGapMs: 9500, durationMs: 420 },
  },
  {
    id: "gaze-waking",
    mode: "loop",
    steps: [
      { face: "eyesClosed", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 1200, minGapMs: 1800, maxGapMs: 3600, durationMs: 220 },
  },
  {
    id: "gaze-idle",
    mode: "loop",
    steps: [
      { face: "upwardSideGlance", transitionMs: 500, holdMs: 5200, ease: "smooth" },
      { face: "curiousLeft", transitionMs: 500, holdMs: 5200, ease: "smooth" },
    ],
    blink: { firstMs: 2600, minGapMs: 3400, maxGapMs: 6200, durationMs: 280 },
  },
  {
    id: "gaze-listening",
    mode: "loop",
    steps: [
      { face: "attentiveLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "downwardGaze", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "gentleDownwardGaze", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 3200, minGapMs: 4800, maxGapMs: 7200, durationMs: 240 },
  },
  {
    id: "gaze-thinking",
    mode: "loop",
    steps: [
      { face: "curiousLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "angryLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "skepticalLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "playfulRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "skepticalRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-searching",
    mode: "loop",
    steps: [
      { face: "farRightGlance", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "asymmetricDownRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "surprisedLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "wideDownLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "wideDownwardGaze", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "asymmetricUpLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-working",
    mode: "loop",
    steps: [
      { face: "angryRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "angryLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "joyfulWide", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "attentiveLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-excited",
    mode: "loop",
    steps: [
      { face: "joyfulDownRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "playfulRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "surprisedWideLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "surprisedLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "joyfulWide", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 1200, minGapMs: 1800, maxGapMs: 3600, durationMs: 220 },
  },
  {
    id: "gaze-bored",
    mode: "loop",
    steps: [
      { face: "sleepySquint", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "drowsyClosed", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "upwardSideGlance", transitionMs: 500, holdMs: 3600, ease: "smooth" },
    ],
    blink: { firstMs: 4800, minGapMs: 6500, maxGapMs: 9500, durationMs: 420 },
  },
  {
    id: "gaze-suspicious",
    mode: "loop",
    steps: [
      { face: "skepticalLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "skepticalRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "suspiciousRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-angry",
    mode: "loop",
    steps: [
      { face: "angryRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "angryLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-drowsy",
    mode: "loop",
    steps: [
      { face: "sleepySquint", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "drowsyClosed", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "eyesClosed", transitionMs: 500, holdMs: 3600, ease: "smooth" },
    ],
    blink: { firstMs: 4800, minGapMs: 6500, maxGapMs: 9500, durationMs: 420 },
  },
  {
    id: "gaze-happy",
    mode: "loop",
    steps: [
      { face: "joyfulDownRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "joyfulWide", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "playfulRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "gentleDownwardGaze", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-curious",
    mode: "loop",
    steps: [
      { face: "surprisedLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "surprisedWideLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "upwardSideGlance", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "farRightGlance", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-confused",
    mode: "loop",
    steps: [
      { face: "skepticalLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "skepticalRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "curiousLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-surprised",
    mode: "loop",
    steps: [
      { face: "surprisedLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "surprisedWideLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 1200, minGapMs: 1800, maxGapMs: 3600, durationMs: 220 },
  },
  {
    id: "gaze-proud",
    mode: "loop",
    steps: [
      { face: "farRightGlance", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "curiousLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "joyfulDownRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-shy",
    mode: "loop",
    steps: [
      { face: "upwardSideGlance", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "shyDownward", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "eyesClosed", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-sad",
    mode: "loop",
    steps: [
      { face: "sleepySquint", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "eyesClosed", transitionMs: 500, holdMs: 3600, ease: "smooth" },
      { face: "drowsyClosed", transitionMs: 500, holdMs: 3600, ease: "smooth" },
    ],
    blink: { firstMs: 4800, minGapMs: 6500, maxGapMs: 9500, durationMs: 420 },
  },
  {
    id: "gaze-laughing",
    mode: "loop",
    steps: [
      { face: "joyfulDownRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "joyfulWide", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "playfulRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 1200, minGapMs: 1800, maxGapMs: 3600, durationMs: 220 },
  },
  {
    id: "gaze-scared",
    mode: "loop",
    steps: [
      { face: "surprisedLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "surprisedWideLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 1200, minGapMs: 1800, maxGapMs: 3600, durationMs: 220 },
  },
  {
    id: "gaze-playful",
    mode: "loop",
    steps: [
      { face: "joyfulDownRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "playfulRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "joyfulWide", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "curiousLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 2100, minGapMs: 2800, maxGapMs: 5000, durationMs: 260 },
  },
  {
    id: "gaze-celebrate",
    mode: "loop",
    steps: [
      { face: "joyfulDownRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "curiousLeft", transitionMs: 500, holdMs: 2300, ease: "smooth" },
      { face: "playfulRight", transitionMs: 500, holdMs: 2300, ease: "smooth" },
    ],
    blink: { firstMs: 1200, minGapMs: 1800, maxGapMs: 3600, durationMs: 220 },
  },
];

export const ANIMATION_BY_ID: ReadonlyMap<string, Animation> = new Map(ANIMATIONS.map((a) => [a.id, a]));
