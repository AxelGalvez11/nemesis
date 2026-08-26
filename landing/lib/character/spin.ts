// The turn the character does when you poke it.
//
// Owner, 2026-08-26: *"make him just spin around smoothly, remove the eye waggle"*.
//
// 🔴 IT IS NOT A NEW ANIMATION, AND THAT IS THE WHOLE REASON IT KEEPS THE CIRCLE. The engine
// already knows how to turn this character: the entrance sweeps the gaze a full `SPIN` (360°)
// and lets it fade to nothing, so the eyes cross the limb, vanish round the back, and come up
// the other side. The body is never touched — a featureless sphere rotating IS its face going
// round it — which is exactly why this is the one reply to a poke that cannot break the shape
// rule the owner set the day before. See `circle.ts`.
//
// It also lands right by construction rather than by tuning: -360° is the same angle as 0°, so
// however the curve below is shaped, the eyes finish precisely where the expression puts them.
//
// 🔴 WHAT THIS FILE OWNS IS THE PACING, NOT THE GEOMETRY. The 360 and the gaze maths are
// vendored (`lib/bloub/gaze.ts`). Pure and DOM-free so it can be tested, for the same reason
// `brow.ts` is.

import { clamp, easings } from "../bloub/math";

/**
 * How long one poke-turn takes, in scene seconds.
 *
 * 🔴 LONGER THAN THE ENTRANCE'S `TURN_TIME` (1.1s), DELIBERATELY. The entrance is an arrival —
 * it wants to be over, so the page can get on. This is a reply to somebody's click, and a
 * revolution that is finished before they have registered it starting reads as a glitch rather
 * than as a turn. At 1.5s the whole circuit is legible without becoming a wait.
 */
export const SPIN_TIME = 1.5;

/**
 * How much of the turn is done, 0 to 1, `elapsed` scene-seconds in.
 *
 * 🔴 `easeInOutCubic`, NOT THE ENTRANCE'S `easeOutQuint`, AND "SMOOTHLY" IS THE WHOLE REASON.
 * Quintic ease-out spends 67% of its travel in the first fifth of its time: as an arrival that
 * is right, because it snaps into place and settles. Run a 360° sweep on it and the character
 * whips most of the way round, then crawls — which is precisely what the owner did not ask for.
 * Cubic ease-in-out is slow at both ends and quickest through the middle, so the ball reads as
 * something with weight being turned rather than flicked.
 */
export function spinTour(elapsed: number): number {
  return easings.easeInOutCubic(clamp(elapsed / SPIN_TIME));
}
