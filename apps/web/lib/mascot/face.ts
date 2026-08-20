// Signs of life.
//
// This is where "alive even when nearly stationary" comes from, and none of it is
// body movement. The mascot does not bob, breathe visibly, or float. What it does is
// blink, and let its gaze drift and flick — which is what a still, attentive thing
// actually does, and it costs the reader nothing because it happens inside a shape
// that is not moving.
//
// 🔴 EVERY FUNCTION HERE IS DRAWN FROM `t`, NEVER ACCUMULATED.
//
// The tempting shape for a blink is "count down to the next one, then pick a new
// delay". It is also unusable: scrub the timeline backwards and the character blinks
// somewhere else, so the frozen state board, the timeline previews and the tests all
// stop meaning anything. Instead the schedule is INDEXED — blink number `i` happens at
// a time derived by hashing `i` — so any `t` can be answered on its own, in any order,
// as many times as you like.

import { clamp01, EASINGS } from "./easing";
import { drift, hash01 } from "./noise";

/** Nominal seconds between blinks. The real interval is this ± the jitter below. */
const BLINK_PERIOD = 4.4;
const BLINK_JITTER = 2.4;
/** Down fast, up slower — a real lid does not close and open symmetrically. */
const LID_CLOSE = 0.075;
const LID_OPEN = 0.115;
/** How often a blink comes in a pair, and how long after the first the second lands. */
const DOUBLE_CHANCE = 0.22;
const DOUBLE_GAP = 0.155;

/** Lid closure of a single blink starting at `start`. 1 = open, 0 = shut. */
function lidOf(t: number, start: number): number {
  const dt = t - start;
  if (dt < 0 || dt > LID_CLOSE + LID_OPEN) return 1;
  return dt < LID_CLOSE
    ? 1 - EASINGS.outQuint(dt / LID_CLOSE)
    : 1 - (1 - EASINGS.outSine((dt - LID_CLOSE) / LID_OPEN));
}

/**
 * Where the lid is at `t`, 1 = open.
 *
 * Neighbouring windows are both consulted because a blink jittered late in window
 * `i` can still be closing when window `i + 1` has begun; taking only the current
 * window would cut it off mid-blink and the eye would snap open.
 *
 * `rate` slows the whole schedule down without changing which blinks are doubles —
 * `waiting` and `inactive` blink less, they do not blink differently.
 */
export function blinkLid(t: number, rate = 1): number {
  if (rate <= 0) return 1;
  const period = BLINK_PERIOD / rate;
  const idx = Math.floor(t / period);
  let lid = 1;
  for (let i = idx - 1; i <= idx + 1; i++) {
    const start = i * period + 0.6 + hash01(i * 131 + 7) * BLINK_JITTER;
    lid = Math.min(lid, lidOf(t, start));
    if (hash01(i * 977 + 43) < DOUBLE_CHANCE) {
      lid = Math.min(lid, lidOf(t, start + DOUBLE_GAP));
    }
  }
  return lid;
}

/**
 * Resting gaze, as an offset in eye-travel units.
 *
 * Two components, and the split matters. The DRIFT is a slow continuous wander — the
 * involuntary movement of an eye holding still. The SACCADE is a discrete jump to a
 * new resting point every few seconds, arriving on a fast ease-out. Drift alone reads
 * as swimming; saccades alone read as a machine ticking. Both together is what an
 * attentive animal does.
 */
/**
 * The lid, for a blink the engine forces rather than one the schedule produced.
 *
 * A big change of silhouette looks better if the character blinks across it — the eye
 * shutting is what makes the new shape read as a decision rather than as a glitch. The
 * trick is bloub's; the point is that the blink is CENTRED on the change, so the form is
 * at its least readable exactly while the eyes are closed.
 *
 * `dt` is time relative to the middle of the blink. Returns 1 outside it.
 */
export function maskBlink(dt: number): number {
  return lidOf(dt + BLINK_HALF, 0);
}

/** Half a blink. Callers need it to keep a forced blink inside its own state. */
export const BLINK_HALF = (LID_CLOSE + LID_OPEN) / 2;

export interface Liveliness {
  readonly dx: number;
  readonly dy: number;
  /** Tiny weight shift, in mark units. Sub-pixel at normal sizes. */
  readonly shift: number;
  /**
   * A breath, as a multiplier on the body's HEIGHT only.
   *
   * Half a percent, over three and a half seconds. Width deliberately does not move: a
   * form that swells in both axes reads as pulsing, which is a loading indicator; one
   * that only rises and falls reads as breathing.
   */
  readonly breath: number;
  readonly lid: number;
}

const SACCADE_PERIOD = 3.1;
const SACCADE_TRAVEL = 0.24;

function saccadeAt(t: number, axis: number): number {
  const idx = Math.floor(t / SACCADE_PERIOD);
  const from = hash01(idx * 7919 + axis * 31) * 2 - 1;
  const to = hash01((idx + 1) * 7919 + axis * 31) * 2 - 1;
  // The jump takes 0.16s of the window; the rest is spent holding the new point,
  // which is what makes it read as a decision rather than as a wobble.
  const k = clamp01((t - idx * SACCADE_PERIOD) / 0.16);
  return (from + (to - from) * EASINGS.gazeOut(k)) * SACCADE_TRAVEL;
}

/**
 * All the resting life at time `t`, scaled by how much the current state allows.
 *
 * `amount` is the pose's `liveliness`. At 0 the character is perfectly still and its
 * eyes are open — which is a stare, and `confusion` uses it deliberately.
 */
export function liveliness(t: number, amount: number): Liveliness {
  const a = clamp01(amount);
  if (a <= 0) return { dx: 0, dy: 0, shift: 0, breath: 1, lid: 1 };
  return {
    dx: (drift(t, 1) * 0.12 + saccadeAt(t, 0)) * a,
    dy: (drift(t, 2) * 0.09 + saccadeAt(t, 1) * 0.6) * a,
    // 0.22 mark units on a 116-unit figure — about a third of a pixel at 64px. It is
    // meant to be below the threshold of noticing and above the threshold of dead.
    shift: Math.sin(t * 0.61) * 0.22 * a,
    breath: 1 + Math.sin((t / 3.4) * Math.PI * 2) * 0.005 * a,
    lid: blinkLid(t, 0.4 + a * 0.6),
  };
}
