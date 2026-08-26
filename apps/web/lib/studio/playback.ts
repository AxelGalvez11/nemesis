// Playing an authored animation.
//
// 🔴 `sampleAnimation(t)` IS A PURE FUNCTION OF TIME, for exactly the reason the mascot
// engine's own `sample(t)` is. The studio has to scrub a timeline backwards, freeze a
// step at 40% to look at the morph, render sixteen thumbnails at sixteen different
// instants on one page, and export a filmstrip from Node with no browser anywhere. All
// four of those are the same property, and all four are lost the moment anything here
// accumulates per frame.
//
// What that rules out, concretely: a "current step" counter advanced on each tick, a
// countdown to the next blink, and `Math.random()` for the blink jitter. The blink
// schedule is INDEXED and hashed the same way `face.ts` does it, so blink number `i` has
// a time that can be computed on its own, in any order.

import { EASINGS } from "@/lib/mascot/easing";
import { blendExpression, type ExpressionDef } from "@/lib/mascot/expressions";
import { maskBlink } from "@/lib/mascot/face";
import { hash01 } from "@/lib/mascot/noise";

import {
  animationDuration,
  toExpressionDef,
  type BlinkPlan,
  type StudioAnimation,
  type StudioExpression,
} from "./document";

/** What the animation is showing at one instant. */
export interface AnimationSample {
  /** The face to hand the engine as `expressionDef`. */
  readonly def: ExpressionDef;
  /** Lid closure, 1 = open. Hand to the engine as `lidOverride`. */
  readonly lid: number;
  /** Which step is on screen, for highlighting the timeline. */
  readonly step: number;
  /** 0..1 through the current step, morph included. */
  readonly progress: number;
  /** True while morphing INTO `step` rather than holding it. */
  readonly morphing: boolean;
  /** Name of the face being held, or of the one being morphed toward. */
  readonly label: string;
  /** True once a `once` animation has run out. The stage shows a replay control. */
  readonly ended: boolean;
}

/** Down fast, up slower — the asymmetry is what stops a blink reading as a shutter. */
function lidCurve(dt: number, dur: number): number {
  if (dt < 0 || dt > dur) return 1;
  const close = dur * 0.4;
  return dt < close
    ? 1 - EASINGS.outQuint(dt / close)
    : 1 - (1 - EASINGS.outSine((dt - close) / (dur - close)));
}

/**
 * Lid closure at `t` for an authored blink plan.
 *
 * 🔴 THE SCHEDULE IS WALKED FROM THE START RATHER THAN DIVIDED INTO WINDOWS. `face.ts`
 * can index straight to a window because its interval is a constant; here the author
 * sets a MIN and MAX and each gap is sampled independently, so blink `i`'s time depends
 * on every gap before it. Walking is the honest way to answer that, and it is bounded
 * below: the loop cannot run more times than `t / min`, and `min` has a floor of 0.4s in
 * `LIMITS`, so the worst case is a few hundred iterations for a very long animation.
 *
 * Two blinks are consulted around `t` and not one, because a blink that started just
 * before `t` can still be opening.
 */
export function blinkLidAt(plan: BlinkPlan | null, t: number): number {
  if (plan === null || !Number.isFinite(t) || t < 0) return 1;
  const span = Math.max(0, plan.max - plan.min);
  let at = plan.first;
  let lid = 1;
  for (let i = 0; at <= t + plan.dur; i++) {
    lid = Math.min(lid, lidCurve(t - at, plan.dur));
    if (lid <= 0) return 0;
    at += plan.min + hash01(i * 7717 + 19) * span;
    // 🔴 ONE BOUND, AND IT IS THIS ONE. A gap near zero makes the walk unbounded —
    // `min: 0, max: 0.001` needs ten million turns to reach a scrub at t=5000, which
    // locks the tab. `normaliseDoc` already clamps `min` to 0.4s, so no document can
    // arrive in that state; this is the backstop for a direct call, and the tests make
    // exactly that call.
    //
    // 🔴 AN EARLIER VERSION ALSO PUT A 50ms FLOOR ON THE GAP, and calibration showed it
    // was dead weight — removing the floor reddened nothing, because the count catches
    // every case the floor did. Two guards where one suffices is not caution, it is a
    // second thing to keep true; the floor is gone and this comment is what it left
    // behind. A schedule needing more than this many blinks to reach `t` is not one
    // anyone authored, and the honest answer for it is an open eye, not a frozen tab.
    //
    // 🔴 AND IT HAS TO BE INSIDE THE LOOP. Calibration removed this line and the test
    // process did not fail — it hung, past a 300-second ceiling, and had to be killed.
    // A synchronous loop blocks the event loop, so no outer timeout, test runner limit
    // or watchdog can reach it. In a browser that is a locked tab with no error.
    if (i > 20_000) break;
  }
  return lid;
}

/** The face a step shows, resolved through the character's expression list. */
function defFor(id: string, byId: ReadonlyMap<string, StudioExpression>): ExpressionDef | null {
  const e = byId.get(id);
  return e ? toExpressionDef(e) : null;
}

const NEUTRAL: ExpressionDef = {
  label: "Neutral",
  note: "",
  h: 1,
  w: 1,
  rise: 0,
  tilt: 0,
  asym: 0,
  curve: 0,
};

/**
 * The animation at time `t`, in seconds from its start.
 *
 * 🔴 A STEP'S MORPH IS TIME INSIDE THAT STEP, NOT BETWEEN STEPS. The alternative — a
 * gap between two steps during which neither is current — makes the timeline lie: the
 * bar the author sized to 2s would occupy 2s plus whatever the next step's morph is. So
 * a step owns `morph + hold`, spends the first part arriving from its predecessor, and
 * the timeline's widths are the truth.
 */
export function sampleAnimation(
  anim: StudioAnimation,
  expressions: readonly StudioExpression[],
  t: number,
): AnimationSample {
  const byId = new Map(expressions.map((e) => [e.id, e]));
  const steps = anim.steps;
  if (steps.length === 0) {
    return { def: NEUTRAL, lid: 1, step: -1, progress: 0, morphing: false, label: "No steps", ended: true };
  }

  const one = steps.reduce((sum, s) => sum + s.morph + s.hold, 0);
  const full = animationDuration(anim);
  let local = t;
  let ended = false;

  if (anim.playback === "once") {
    if (t >= full) {
      local = full - 1e-4;
      ended = true;
    }
  } else if (full > 0) {
    local = ((t % full) + full) % full;
  }

  // Ping-pong's second half is the first half walked backwards. Reflecting the CLOCK
  // rather than reversing the step list keeps every morph and hold the length the author
  // set, which reversing the list does not — step 0 has no predecessor to arrive from.
  let reversed = false;
  if (anim.playback === "pingpong" && local >= one) {
    local = Math.max(0, one * 2 - local);
    reversed = true;
  }

  let acc = 0;
  let index = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const len = s.morph + s.hold;
    if (local < acc + len || i === steps.length - 1) {
      index = i;
      break;
    }
    acc += len;
  }

  const step = steps[index]!;
  const into = Math.max(0, local - acc);
  const target = defFor(step.expressionId, byId) ?? NEUTRAL;

  // The step before, wrapped — a loop's first step arrives from the last one, which is
  // what makes a looping animation continuous rather than snapping at the seam.
  const prevIndex = index === 0 ? (anim.playback === "loop" ? steps.length - 1 : 0) : index - 1;
  const prev = defFor(steps[prevIndex]!.expressionId, byId) ?? NEUTRAL;

  let def = target;
  let morphing = false;
  if (step.morph > 0 && into < step.morph && !(index === 0 && anim.playback !== "loop")) {
    const k = EASINGS[step.ease] ? EASINGS[step.ease](into / step.morph) : into / step.morph;
    def = blendExpression(prev, target, k);
    morphing = true;
  }

  // 🔴 THE TWO BLINKS ARE COMBINED BY `min`, NOT BY PRECEDENCE. They are independent
  // events that can overlap, and whichever has the eye further shut is the one you see;
  // letting either win outright makes a schedule blink cancel an arrival blink that was
  // already halfway down, which reads as the eye popping open mid-change.
  //
  // Centred on the middle of the morph, so the form is at its least readable exactly
  // while the eyes are closed — that placement is the whole point of the effect.
  const scheduled = blinkLidAt(anim.blink, t);
  const arrival = step.blinkIn === true && step.morph > 0 ? maskBlink(into - step.morph / 2) : 1;

  return {
    def,
    lid: Math.min(scheduled, arrival),
    step: index,
    progress: (step.morph + step.hold) > 0 ? into / (step.morph + step.hold) : 0,
    morphing,
    label: reversed && morphing ? prev.label : def.label,
    ended,
  };
}
