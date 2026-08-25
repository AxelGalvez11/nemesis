// The faces, in the reference's own units. Generated — see scripts/avatar-import.mts.
//
// 🔴 THESE ARE RAW NUMBERS ON A 120-RADIUS FACE, NOT MULTIPLIERS. The first attempt at
// this converted them into the flat mascot engine's fractions-of-a-radius and lost a
// factor of two on the eye separation on the way — `spacing` is the FULL gap between the
// two eyes, and each eye sits at plus or minus half of it. Keeping the reference's own
// units means there is no conversion left to get wrong.

import type { Face } from "./types";

const face = (
  id: string,
  head: readonly [number, number, number],
  spacing: number,
  left: readonly [number, number, number, number, number],
  right: readonly [number, number, number, number, number],
  eyes: Face["eyeMotion"],
  body: Face["bodyMotion"],
): Face => ({
  id,
  head: { x: head[0], y: head[1], z: head[2] },
  spacing,
  left: { width: left[0], height: left[1], x: left[2], y: left[3], angle: left[4] },
  right: { width: right[0], height: right[1], x: right[2], y: right[3], angle: right[4] },
  eyeMotion: eyes,
  bodyMotion: body,
});

export const FACES: readonly Face[] = [
  face("upwardSideGlance", [7.3,27.8,-16.1], 54.3, [22.5,42.38,0,-20.5,0], [22.5,42.38,0,-20.5,0], "none", "none"),
  face("downwardGaze", [-15.06,0.14,-14.55], 57.7, [22.4,54.57,0,0,0], [22.4,54.57,0,0,0], "none", "none"),
  face("skepticalRight", [-16.53,-3.77,-13.73], 56.3, [23.09,57.68,0,0,0], [49.92,12.43,0,0,0], "none", "none"),
  face("smallAttentive", [-4.23,14.36,11.2], 50.9, [22.07,39.6,0,0,0], [22.07,39.6,0,0,0], "none", "none"),
  face("wideDownwardGaze", [-19.21,15.2,11.8], 69.5, [52.08,51.47,0,0,0], [53.11,52.19,0,0,0], "none", "none"),
  face("surprisedLeft", [2.95,-16.05,-20.92], 70.9, [51.68,51.74,0,0,0], [51.68,51.74,0,0,0], "none", "none"),
  face("sleepySquint", [3.4,13.23,8.98], 63.87, [51.78,13.03,0,0,0], [51.78,13.03,0,0,0], "none", "none"),
  face("angryRight", [8.06,17.63,-11.12], 52.06, [20.91,40.4,0,0,-30.87], [20.91,40.4,0,0,28.78], "none", "none"),
  face("curiousLeft", [-12.3,-17.6,5.91], 54.9, [20.61,47.77,0,0,23.52], [20.61,47.77,0,0,-24.04], "none", "none"),
  face("asymmetricDownRight", [-20.06,12.61,-12.7], 61.7, [42.5,41.8,0,0,0], [22.1,22.2,0,0,0], "none", "none"),
  face("attentiveLeft", [1.43,6.19,10.56], 56.8, [23.84,58.13,0,0,0], [23.84,58.13,0,0,0], "none", "none"),
  face("joyfulWide", [-2.09,-15.9,-14.47], 59.41, [34.2,85.33,0,0,0], [34.2,83.18,0,0,0], "none", "none"),
  face("eyesClosed", [-8.75,-8.74,-10.77], 69.28, [56.13,15.5,0,0,0], [56.13,15.16,0,0,0], "none", "none"),
  face("joyfulDownRight", [-15.29,15.01,12.79], 68.7, [31.25,76.72,0,0,0], [31.25,76.72,0,0,0], "none", "none"),
  face("skepticalLeft", [3.53,-7.08,9.83], 62.22, [24.31,59.28,0,0,0], [48.92,13.41,0,0,0], "none", "none"),
  face("farRightGlance", [0.32,35.31,-10.9], 53.9, [22.46,39.82,0,0,0], [22.46,39.82,0,0,0], "none", "none"),
  face("angryLeft", [-14.75,-19.35,5.63], 55.1, [19.6,48.64,0,0,-27.61], [19.6,48.64,0,0,26.15], "none", "none"),
  face("playfulRight", [-4.4,14.07,-16.13], 51.73, [19.05,43.37,0,0,26.29], [19.05,43.37,0,0,-20.25], "none", "none"),
  face("asymmetricUpLeft", [6.59,4.74,12.84], 60.4, [42.1,41.7,0,0,0], [22.2,22.1,0,0,0], "none", "none"),
  face("gentleDownwardGaze", [-6.08,-11.04,-13.97], 56.2, [23.05,58.69,0,0,0], [23.05,58.69,0,0,0], "none", "none"),
  face("wideDownLeft", [-17.13,18.07,13.89], 70.8, [35.45,79.1,0,0,0], [35.45,79.1,0,0,0], "none", "none"),
  face("surprisedWideLeft", [-5.43,-11.71,-13.47], 69, [51.4,50.1,0,0,0], [50.5,49.4,0,0,0], "none", "none"),
  face("drowsyClosed", [10.29,3.4,7.58], 68.42, [55.67,14.62,0,0,0], [55.67,14.62,0,0,0], "none", "none"),
  face("suspiciousRight", [-17.8,10,-10.89], 59.94, [23.97,55.89,0,-9.8,0], [53.56,13.33,0,-9.8,0], "none", "none"),
  face("shyDownward", [7.13,7.78,3.94], 51.2, [21.5,32,0,40,0], [23.2,33.5,0,40,0], "none", "none"),
  face("angryBrows", [10.47,5.09,4.7], 68.7, [27.13,63.03,0,0,-36.24], [27.13,63.03,0,0,27.73], "none", "shake"),
  face("uneasyLeft", [-12.3,-17.6,5.91], 54.9, [20.61,47.77,0,0,23.52], [20.61,47.77,0,0,-24.04], "shake", "slowDrift"),
];

export const FACE_BY_ID: ReadonlyMap<string, Face> = new Map(FACES.map((f) => [f.id, f]));
