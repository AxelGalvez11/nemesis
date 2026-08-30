// What a poke does: the character bursts apart and puts itself back together.
//
// Owner, 2026-08-30, on the offer to bring it back: *"yes, the mascot bursts, but I need it to do
// it faster, because when you click on the mascot it's going to lag before it actually does the
// burst"*. Both halves of that sentence are answered here, and they are two different problems —
// see `BURST_PACE` for the speed and `pace` in `BloubBot` for the delay.
//
// ── THIS IS AN EXCEPTION TO THE SHAPE RULE, AND IT IS THE ONLY ONE ────────────
//
// 🔴 `burst` IS THE STATE `body.ts` REFUSES HARDEST. It fails that rule twice over: `baseBody`
// is false, so it draws its own silhouette, and it throws off `dots`. It is the reason the rule
// samples across a state's whole duration instead of at t=0 — burst is a clean shape for its
// opening frames and only then collapses and sprays.
//
// 🔴 SO THE RULE IS NOT WEAKENED, IT IS SCOPED. Read what the owner was actually objecting to on
// 2026-08-25: the body morphing THROUGH THE IDLE CYCLE, unprompted, while he watched the page —
// an egg, then a hexagon, then a spray of dots, none of it asked for. A click is the opposite
// case. It is the visitor asking for a reaction, and a reaction that cannot be told from the
// resting animation is not much of a reaction.
//
// The line is therefore: **the cycle keeps one shape; a poke may break it.** `CYCLE` in `body.ts`
// is still checked by `keepsItsShape`, still refuses all six states cut that day, and the dev-time
// throw in `Mascot.tsx` still fires if one is added to it. What changed is that a SECOND door
// exists beside the cycle, it holds exactly one state, and `poke.test.ts` asserts that the state
// behind it does break the rule — so nobody can later mistake this for an oversight.
//
// 🔴 IF THE OWNER REVERSES AGAIN, DELETE THIS FILE — do not quietly move `burst` into `BEATS`.
// The distinction between "the cycle does this on its own" and "this happens when you click" is
// the whole content of the exception, and it is invisible once the state is in the list.
//
// ── AND IT DOES NOT REPLACE THE TURN ──────────────────────────────────────────
//
// The double spin (`spin.ts`) still runs, from the same click, starting on the same frame. They
// are not the same gesture competing for one slot: the burst is the body and the turn is the
// gaze, and burst hides the eyes for most of its length anyway (`eyeAlpha` is 0 until 1.85s of
// its own 2.6s). Timed as they are, the burst finishes first and the character re-forms with the
// last of the turn still to run — so his face swings home after he pulls himself back together,
// which is the one arrangement where you actually see both.
//
// Pure and DOM-free so it can be tested, for the same reason `brow.ts` and `spin.ts` are.

import { STATE_BY_ID, type StateId } from "../bloub/states";

/**
 * The reaction a click asks for.
 *
 * Named here rather than typed as a literal at the call site so that the exception above has
 * exactly one address, and so `poke.test.ts` and `Mascot.tsx` cannot disagree about which state
 * the exception is for.
 */
export const POKE: StateId = "burst";

/** How long the burst runs on screen, in seconds. Its measured length is longer — see below. */
export const BURST_TIME = 1.6;

/**
 * The state's own measured length, straight from the vendored table.
 *
 * 🔴 READ, NOT COPIED. Writing `2.6` here would be a second copy of a number that lives upstream,
 * and the vendored folder is re-copied wholesale when it moves — a hand-typed duration would
 * silently stop matching the animation it is supposed to be pacing.
 */
export const BURST_MEASURED = STATE_BY_ID.get(POKE)!.duration;

/**
 * How much faster than measured the burst plays. Owner: *"I need it to do it faster"*.
 *
 * 🔴 THE MEASURED PACE IS RIGHT FOR A SEQUENCE AND WRONG FOR A REPLY. Every duration in the
 * vendored table was taken off the original reference video, where states play one after another
 * and nobody is waiting on any of them. A click is a different contract: somebody has just
 * touched the thing and is watching for it to answer. 2.6s of collapse, drift and re-forming is a
 * clip; 1.6s is an answer.
 *
 * 🔴 IT IS ALSO WHAT PUTS THE BURST INSIDE THE TURN. `SPIN_TIME` is 2.4s, so at this pace the
 * body is whole again with about 0.8s of turning left — which is the difference between two
 * gestures that overlap and one gesture that hides the other.
 *
 * 🔴 AND IT DOES NOT TOUCH THE VENDORED TABLE. The pose function is upstream's, unedited; only
 * the clock it is read on is ours. `BloubBot` does that by re-stamping the state's start each
 * frame, which is the same public setter the sequence player uses.
 */
export const BURST_PACE = BURST_MEASURED / BURST_TIME;
