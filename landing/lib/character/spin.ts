// The turn the character does when you poke it.
//
// Owner, 2026-08-26: *"make him just spin around smoothly, remove the eye waggle"*.
//
// 🔴 IT IS NOT A NEW ANIMATION, AND THAT IS THE WHOLE REASON IT KEEPS THE CIRCLE. The engine
// already knows how to turn this character: `Look.spin` is a number of degrees subtracted from
// the gaze's yaw, so sweeping it through 360 carries the eyes across the limb, round the back and
// up the other side. The body is never touched — a featureless sphere rotating IS its face going
// round it — which is exactly why this is the one reply to a poke that cannot break the shape
// rule the owner set the day before. See `circle.ts`.
//
// It also lands right by construction rather than by tuning: -360° is the same angle as 0°, so
// however the curve below is shaped, the eyes finish precisely where they set off.
//
// 🔴🔴 IT IS AN OFFSET ABOUT THE CURRENT ORIENTATION, NOT A REPLAY OF THE ARRIVAL. The first
// version reused the entrance by driving its `tour`, and `tour` also feeds `mix` — the blend
// between the pose's built-in gaze and the direction the head is actually holding. Driving it to
// 0 threw away the second, so a click snapped the head to a fixed orientation and turned from
// there (owner, 2026-08-26: *"the spin cuts off to a predetermined point, the spin should be able
// to spin him from where he is oriented currently"*). `BloubBot` now writes `spin` alone.
//
// 🔴 WHAT THIS FILE OWNS IS THE PACING, NOT THE GEOMETRY. The 360 and the gaze maths are
// vendored (`lib/bloub/gaze.ts`). Pure and DOM-free so it can be tested, for the same reason
// `brow.ts` is.

import { SPIN } from "../bloub/gaze";
import { clamp, easings } from "../bloub/math";

/**
 * How many revolutions one poke is worth. Owner, 2026-08-26: *"actually just make him double
 * spin"*.
 *
 * 🔴 IT IS A COUNT, NOT A BIGGER ANGLE, and that distinction is what keeps the landing exact.
 * The turn works because its two ends are the same angle: any WHOLE number of revolutions still
 * puts the eyes back precisely where they set off, so going from one to two costs nothing and
 * needs no re-tuning. A non-integer here would leave the character facing somewhere new every
 * time it was clicked.
 */
export const SPIN_TURNS = 2;

/**
 * How long the whole gesture takes, in scene seconds.
 *
 * 🔴 NOT DOUBLE THE SINGLE TURN'S 1.5s. Two revolutions at the old rate would run 3s, which stops
 * being a reply to a click and starts being something to wait out. 2.4s gives each revolution
 * 1.2s — a touch quicker than the single spin was, which is right: a double spin should read as
 * livelier than one, not as one played twice.
 *
 * 🔴 STILL LONGER THAN THE ENTRANCE'S `TURN_TIME` (1.1s), which is the floor. The entrance is an
 * arrival and wants to be over; a revolution finished before anybody registers it starting reads
 * as a glitch rather than as a turn.
 */
export const SPIN_TIME = 2.4;

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

/**
 * The yaw offset to subtract, in degrees, `elapsed` scene-seconds into a turn.
 *
 * 🔴 IT COUNTS DOWN TO ZERO RATHER THAN UP FROM IT, and that is not arbitrary. Zero is the value
 * the character rests at, so finishing there means the hand-back to normal tracking is exactly
 * continuous — nothing to smooth, nothing to wrap. The whole discontinuity is therefore at the
 * START, where it is free: `SPIN_TURNS * 360` is the same angle as 0, so landing it in one step
 * (see `SPIN_STEP`) is invisible.
 */
export function spinDegrees(elapsed: number): number {
  return SPIN_TURNS * SPIN * (1 - spinTour(elapsed));
}

/**
 * How long the engine is given to reach each frame's turn value: under one frame, so none.
 *
 * 🔴 THE TURN HAS TO BE SET INSTANTLY, AND THIS IS THE ONLY REASON THIS CONSTANT EXISTS. A full
 * revolution's two ends are the same ANGLE but not the same NUMBER — `spin` leaves 0, travels 360
 * and arrives back at 0 — and the engine's default 0.24s catch-up would interpolate straight
 * across the opening step, playing an entire extra revolution in a quarter of a second before the
 * intended one had started. Landing the 360 in one step is invisible, because -360° is the same
 * angle as 0°, and it leaves the eased curve above as the only thing on screen.
 *
 * 🔴 IT CANNOT BE ZERO. `BotEngine.lookAtTime` divides the elapsed time by this, and on the frame
 * a look is set that elapsed time is also zero: 0/0 is NaN, and one NaN in the gaze settles in
 * permanently — the engine keeps its last finite target and the character never looks anywhere
 * again. A millisecond is comfortably shorter than any frame and safely non-zero.
 */
export const SPIN_STEP = 0.001;
