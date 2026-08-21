// Where the mascot is looking.
//
// GAZE IS THE CHARACTER'S STRONGEST BEHAVIOUR, so it gets its own module and its own
// rules rather than being a field somebody sets.
//
// Three things can aim it, and they compose in this order:
//
//   1. the state's own bias    (`reading` scans, `thinking` looks inward and down)
//   2. an external target      (the pointer, or a named part of the interface)
//   3. resting drift           (what is left over when nothing outside is commanding)
//
// 🔴 (2) REPLACES (1) IN ABSOLUTE TERMS, AND (3) IS ADDED AFTERWARDS. Both halves of
// that sentence are load-bearing. If the external target were expressed relative to
// the pose, every change of state would move the eyes even though the thing being
// looked at had not moved. And if drift were folded in BEFORE the mix, the mix would
// cancel it along with the pose bias, so a mascot tracking a pointer would be
// perfectly, unnaturally rigid — while a mascot with no pointer at all (touch, or the
// mouse gone from the window) would freeze the instant it was given a target.

import { approach, clamp01 } from "./easing";
import type { MascotFocus } from "./types";

/** An aim, in eye-travel units. `mix` says how much of the direction it commands. */
export interface Look {
  readonly x: number;
  readonly y: number;
  readonly mix: number;
}

export const NO_LOOK: Look = { x: 0, y: 0, mix: 0 };

/**
 * Where each named part of the interface sits, from the mascot's point of view.
 *
 * These are DIRECTIONS, not coordinates: the mascot is placed all over the product
 * and the composer is always below it, the source panel always to one side. A
 * placement that genuinely needs a measured position passes a pointer-style target
 * instead.
 */
const FOCUS: Record<MascotFocus, Look> = {
  /** The learner, i.e. straight out of the screen — with a touch of lift, which is
   *  what makes eye contact read as engaged rather than as a blank forward stare. */
  user: { x: 0, y: -0.12, mix: 0.85 },
  composer: { x: 0.05, y: 0.9, mix: 0.9 },
  canvas: { x: 0.78, y: -0.28, mix: 0.85 },
  source: { x: -0.86, y: -0.06, mix: 0.85 },
  /** Where the learner's answer appears — below and to the reading side. */
  response: { x: 0.34, y: 0.82, mix: 0.9 },
  none: NO_LOOK,
};

export const focusLook = (focus: MascotFocus): Look => FOCUS[focus];

/** Smooth saturation to ±1. Keeps a distant pointer from pinning the eyes. */
const soften = (v: number): number => v / Math.sqrt(1 + v * v);

/**
 * Turns a pointer position into an aim, and gives it inertia.
 *
 * WHY THIS IS NOT INSIDE THE ENGINE. The engine is a pure function of time; the
 * pointer is the one input that is not, because it arrives whenever the browser says
 * it does. So the tracker lives out here, absorbs that irregularity, and hands the
 * engine a plain `Look` — which the engine then eases toward on its own clock. The
 * engine stays replayable and the tracker stays trivial to reason about.
 *
 * THE POINTER IS NEVER CHASED. Two mechanisms, and they do different jobs. The
 * tracker smooths the TARGET with a time constant, so a fast flick across the screen
 * does not whip the eyes; the engine then morphs toward that target over
 * `LOOK_MORPH`, so the gaze is always a little behind a pointer that is still moving
 * and catches up the moment it stops. The result is a character that follows you
 * without ever appearing to hunt.
 */
export class PointerGaze {
  /** Pixels from the mascot at which the pointer pulls the eyes fully to one side. */
  private readonly falloff: number;
  private x = 0;
  private y = 0;
  private mix = 0;
  private targetX = 0;
  private targetY = 0;
  private targetMix = 0;
  private idle = 0;
  private lastT = 0;

  constructor(falloff = 300) {
    this.falloff = falloff;
  }

  /**
   * A pointer moved to `(px, py)`, with the mascot's centre at `(cx, cy)`.
   *
   * 🔴 REFUSES A NON-FINITE TARGET. A `getBoundingClientRect` on an element in a
   * hidden pane returns a zero-sized box, and the caller's centre becomes `0 / 0`.
   * A single NaN target takes up residence in the smoothing and the character never
   * looks at anything again — so the guard is here rather than in every caller.
   */
  point(px: number, py: number, cx: number, cy: number): void {
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(cx) || !Number.isFinite(cy)) {
      return;
    }
    this.targetX = soften((px - cx) / this.falloff);
    this.targetY = soften((py - cy) / this.falloff);
    this.targetMix = 1;
    this.idle = 0;
  }

  /**
   * The pointer left, or there never was one.
   *
   * The aim is KEPT and only the mix falls — the head stays turned where it was last
   * looking and resting drift takes back over, which is what a person does when they
   * stop tracking something. Zeroing the aim instead snaps the eyes forward, and on a
   * touch device (where this is the permanent state) it would mean the mascot could
   * never look anywhere but straight ahead.
   */
  release(): void {
    this.targetMix = 0.3;
    this.idle = 0;
  }

  /** Advances the smoothing to wall-clock time `now`, in seconds. */
  update(now: number): Look {
    const dt = this.lastT === 0 ? 0 : Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    this.idle += dt;

    // A pointer that has stopped moving is no longer commanding: the mix relaxes so
    // the character settles instead of holding a hard stare at a stationary cursor.
    const settled = this.idle > 0.85 ? 0.62 : 1;
    const wanted = this.targetMix * settled;

    this.x = approach(this.x, this.targetX, dt, 0.13);
    this.y = approach(this.y, this.targetY, dt, 0.13);
    this.mix = approach(this.mix, wanted, dt, 0.3);
    return { x: this.x, y: this.y, mix: clamp01(this.mix) };
  }
}

/** Blends two aims. Used when a focus and a pointer are both live. */
export function mergeLook(base: Look, over: Look): Look {
  if (over.mix <= 0) return base;
  if (base.mix <= 0) return over;
  const k = over.mix / (over.mix + base.mix);
  return {
    x: base.x + (over.x - base.x) * k,
    y: base.y + (over.y - base.y) * k,
    mix: Math.max(base.mix, over.mix),
  };
}
