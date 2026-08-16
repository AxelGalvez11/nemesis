// How much of the learner's attention this sitting has already spent, and on what.
//
// 🔴🔴 THE THING THE WHOLE SELECTOR WAS MISSING, AND ITS ABSENCE WAS STRUCTURAL RATHER THAN AN
// OVERSIGHT. `docs/canvas-teaching-policy-audit.md` §3 measured it: a learner who keeps missing one
// objective is offered that same objective on every round, for ever, because **nothing anywhere in
// the learning layer represented cost**. No available time, no session length, no remaining
// material. With no cost term, "they do not know this perfectly, but moving on is worth more" is not
// a thought the system can have — which is why `advance` was only ever reachable from `correct`.
//
// 🔴 IT IS STATE, NOT A MODE. The owner's ruling: *"Do not create a large separate handcrafted cram
// mode. Time is part of the state."* A learner with twenty minutes and a learner with six hours meet
// the SAME controller reading the same fields; what differs is what those fields say. There is no
// branch anywhere that asks "are we cramming".
//
// 🔴 ACTIVE TIME, NEVER WALL CLOCK. `canvas-events.ts` already draws this line and states why:
// *"someone who opens a canvas and walks away for 25 minutes has not studied for 25 minutes"*. Every
// duration here is attention actually spent. A learner who leaves the tab open overnight must not
// come back to a system that believes they studied all night.
//
// PURE. `now` is a parameter. No clock is read in this file.

/** What a controller did, and when. 🔴 The RUNTIME's record of its own acts — never a claim about
 *  the learner, and never written to the evidence log. */
export interface TeachingAct {
  objectiveIdentityKey: string;
  /** The action type that was staged. Kept as a string so this file does not import the action
   *  union and create a cycle through `teaching-policy.ts`. */
  action: string;
  /** When it was staged, in epoch milliseconds. */
  atMs: number;
}

/**
 * What is left of this sitting.
 *
 * 🔴 `availableMs` IS `null` UNTIL SOMETHING REALLY SAYS SO, AND `null` IS NOT "UNLIMITED". The
 * owner's instruction was explicit: *"If no explicit study deadline exists, use the best available
 * session and scope signals rather than forcing the user through unnecessary setup questions."* So
 * there is no dialog asking how long you have. When a scheduled block covers the moment, that block
 * bounds the sitting; otherwise the controller is told the truth — nobody knows — and reasons from
 * how much material is left and how much attention has already gone.
 *
 * 🔴 A ZERO HERE WOULD BE A LIE OF THE EXACT KIND THIS REPO KEEPS PAYING FOR. "We did not observe a
 * deadline" and "you have no time left" are opposite facts, and `?? 0` turns the first into the
 * second.
 */
export interface AttentionBudget {
  /** Attention actually spent in this sitting, idle excluded. */
  activeMs: number;
  /** Attention this sitting is expected to have left, when a real signal bounds it. */
  availableMs: number | null;
}

/** A scheduled block, narrowed to the two fields this file needs. Structurally compatible with
 *  `study-blocks.ts`'s output and with a calendar event, so neither has to be imported. */
export interface ScheduledWindow {
  startMs: number;
  endMs: number;
}

/**
 * How much of a scheduled window is left, or `null` when none covers this moment.
 *
 * 🔴 ONLY A WINDOW THE LEARNER IS INSIDE. A block starting in three hours says nothing about how
 * long the current sitting has, and treating the gap until it as "available time" would tell the
 * controller it has hours when the learner is about to close the tab. Outside every window the
 * honest answer is that we do not know.
 */
export function availableFromWindows(
  windows: readonly ScheduledWindow[],
  nowMs: number,
): number | null {
  let soonestEnd: number | null = null;
  for (const window of windows) {
    if (nowMs < window.startMs || nowMs >= window.endMs) continue;
    if (soonestEnd === null || window.endMs < soonestEnd) soonestEnd = window.endMs;
  }
  return soonestEnd === null ? null : Math.max(0, soonestEnd - nowMs);
}

/**
 * How long this sitting has spent on one objective.
 *
 * 🔴 DERIVED FROM THE ACT LOG RATHER THAN TIMED SEPARATELY, so there is one record of what happened
 * and not two that can disagree. An act's cost is the gap until the NEXT act — which is what the
 * learner actually spent on it — and the most recent act is measured to `now`.
 *
 * 🔴 BOUNDED BY `maxIdleMs`, BECAUSE THE LAST GAP IS THE ONE THAT CAN CONTAIN A COFFEE BREAK. A
 * learner who answers, walks away for forty minutes, and comes back has not spent forty minutes on
 * that objective. Every gap is clipped, not just the trailing one: an interruption can land anywhere.
 */
export function msOnObjective(input: {
  objectiveIdentityKey: string;
  acts: readonly TeachingAct[];
  nowMs: number;
  maxIdleMs: number;
}): number {
  const ordered = [...input.acts].sort((a, b) => a.atMs - b.atMs);
  let total = 0;
  for (const [index, act] of ordered.entries()) {
    if (act.objectiveIdentityKey !== input.objectiveIdentityKey) continue;
    const next = ordered[index + 1];
    const until = next ? next.atMs : input.nowMs;
    total += Math.min(Math.max(0, until - act.atMs), input.maxIdleMs);
  }
  return total;
}

/**
 * The longest a single gap may count as attention.
 *
 * 🔴 A CLIP ON A DERIVATION, NOT A PEDAGOGICAL CONSTANT, WHICH IS WHY IT IS ALLOWED TO EXIST WHEN
 * the owner has ruled against accumulating tuned numbers. It decides nothing about teaching. It
 * answers one measurement question — "is this gap plausibly still the same act?" — and getting it
 * wrong makes a duration slightly wrong, never a decision wrong. Five minutes is longer than any
 * single answer this product has ever recorded (the slowest real production latency is 99.7 s) and
 * shorter than any real break.
 */
export const MAX_IDLE_MS = 5 * 60_000;

/**
 * How many acts this sitting has spent on one objective.
 *
 * 🔴 A COUNT AND A DURATION ARE DIFFERENT COSTS AND BOTH ARE REPORTED. Four quick attempts and one
 * long one spend comparable minutes and mean completely different things — the first is a learner
 * bouncing off something, the second is a learner working. A controller that saw only minutes could
 * not tell them apart.
 */
export function actsOnObjective(objectiveIdentityKey: string, acts: readonly TeachingAct[]): number {
  return acts.filter((act) => act.objectiveIdentityKey === objectiveIdentityKey).length;
}

/**
 * What share of this sitting's attention has gone to one objective, 0-1, or `null` when nothing has
 * been spent yet.
 *
 * 🔴 A SHARE, BECAUSE AN ABSOLUTE DURATION CANNOT ANSWER "IS THIS TOO MUCH". Three minutes is
 * nothing in an hour and is most of a ten-minute sitting. This is the one number that makes the same
 * controller behave differently under different budgets without a mode, and it is a plain division
 * over two measured quantities rather than a tuned coefficient.
 */
export function attentionShare(spentMs: number, budget: AttentionBudget): number | null {
  const total = budget.activeMs + (budget.availableMs ?? 0);
  if (total <= 0) return null;
  return Math.min(1, spentMs / total);
}
