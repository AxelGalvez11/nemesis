// Deterministic pseudo-randomness.
//
// EVERYTHING HERE IS A FUNCTION OF ITS ARGUMENTS AND NOTHING ELSE. No `Math.random`,
// no seeded generator carrying state between calls, no `Date.now`. That is the single
// constraint the whole engine rests on: `sample(t)` has to return the same frame for
// the same `t` however many times it is asked, in whatever order, or the frozen state
// board, the timeline scrubber, the screenshots and the tests all become fiction.
//
// The specific consequence that bites: a blink schedule built by accumulating
// "time until the next blink" gives a DIFFERENT answer depending on how you got to
// `t`. Scrub backwards and the character blinks somewhere else. So the schedule is
// drawn from `t` by hashing the blink's index instead — see face.ts.

/** Integer hash → 0..1. Cheap, well-mixed enough for jitter and per-shard variance. */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Same, signed: -1..1. */
export const hashSigned = (n: number): number => hash01(n) * 2 - 1;

/**
 * Smooth wandering value in roughly -1..1, continuous in `t`.
 *
 * Two sines whose periods have no common multiple, so the sum never visibly repeats.
 * Chosen over value noise because it is C-infinity: the resting gaze drift is applied
 * to the eyes every frame, and any corner in the curve shows up as a flick.
 */
export function drift(t: number, seed = 0): number {
  const a = seed * 1.7;
  const b = seed * 0.9;
  return 0.62 * Math.sin(t * 0.37 + a) + 0.38 * Math.sin(t * 0.9137 + b + 1.7);
}
