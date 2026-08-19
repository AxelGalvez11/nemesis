"use client";

// How a Canvas screen that is not asking anything ENDS. Exactly one implementation, for every
// such screen.
//
// 🔴🔴 IT USED TO LIVE INSIDE `canvas-policy-view.tsx`, PRIVATE TO THAT FILE, AND THAT IS THE
// DEFECT THIS MOVE FIXES — for the second time. Its own history records the first: the timer sat
// inside `FeedbackScreen`, so only the VERDICT screen could end itself while `show_correction`,
// `teach` and `simplify` declared exactly the same `transient` exposition and had no timer at all.
// A wrong typed answer produced a one-line correction and then nothing: no Continue, no timer,
// surviving a reload. Hoisting it to `Frame` fixed every policy screen at once.
//
// The vanishing-Canvas work (owner, 2026-08-19) adds a screen that is not a policy screen. A
// conversational reply — *"Angiotensin-converting enzyme."*, *"Hey."* — now has to end itself in
// exactly the same way, and it renders outside `CanvasPolicyView` because it exists before the
// canvas has begun and on every presence, including the front door. So the hook moves one level
// out rather than being copied. A second auto-advance implementation is the same bug waiting in a
// different file, and it is the file nobody would think to look in.
//
// 🔴 IT IS A HOOK RATHER THAN A COMPONENT ON PURPOSE. The two callers frame their content
// completely differently — the policy view centres a full-height region, the reply sits in the
// reading column at the top of the sheet — and forcing one wrapper on both would make the shared
// thing the LAYOUT instead of the RULE. What has to be identical is when a screen stops existing.

import { useEffect, useRef, useState } from "react";

import { advancesItself, type Exposition } from "@/lib/learn/cognitive-mode";

/**
 * How a screen ends when it does NOT get the Continue button.
 *
 * 🔴 EVERY SCREEN CARRYING AN EXPOSITION MUST PASS THIS. A Continue and this hook are the only two
 * exits there are, and `continueOwner` gives the button to at most one region — so a screen with
 * neither is a canvas the learner cannot leave.
 *
 * 🔴 `blocked` STAYS IN THE GATE, AND DROPPING IT WOULD INVERT THE SAFE FAILURE. The policy's
 * `submit()` sets feedback BEFORE the evidence write finishes, so a timer alone could advance
 * mid-write and the learner could answer again with the answer still on screen — recording that
 * echo as a real demonstration. Advancing waits for the LATER of the two, so a bug here costs a
 * missed advance, never a fabricated one.
 */
export interface ScreenExit {
  readonly exposition: Exposition;
  /** Advancing is refused while true — e.g. the last answer's evidence is still being written. */
  readonly blocked: boolean;
  /** Overrides the exposition's own window. `0` when a queued screen owns the budget instead;
   *  `null`/absent means "use what was declared". */
  readonly holdMs?: number | null;
  readonly onAcknowledge: () => void;
}

/**
 * 🔴🔴 THE CALLER MUST GIVE THE SCREEN A `key`, AND THIS IS NOT A STYLE NOTE.
 *
 * The timer's effect depends on the duration. Two consecutive screens that compute the SAME
 * duration — two `micro` replies, or two association corrections, which is the common case rather
 * than an unlucky one — do not re-run it, so `held` is still `true` from the previous screen and
 * the new one is acknowledged on its first render. It would look like a reply that never appeared.
 *
 * `canvas-policy-view.tsx` has always been safe from this by accident of a different requirement:
 * its `Frame` is keyed by `screenKey(runtime)` so the component remounts per screen and this state
 * resets with it. Any second caller has to do the same, which is why `canvas-reply.tsx` is a
 * component keyed on its own text rather than a hook call in `learning-canvas.tsx`.
 */
export function useScreenExit(exit: ScreenExit | null): void {
  const latest = useRef(exit?.onAcknowledge);
  latest.current = exit?.onAcknowledge;
  const exposition = exit?.exposition ?? null;
  const blocked = exit?.blocked ?? false;
  // 🔴 THE DURATION IS DECLARED, WHICH IS WHY IT IS READ OFF THE UNION RATHER THAN DEFAULTED.
  // `exposureMs` exists only on the transient member, so there is no branch in which this hook
  // could supply a number nobody chose.
  const declared = exposition && exposition.mode === "transient" ? exposition.exposureMs : null;
  const holdMs = exit?.holdMs ?? declared;
  const selfAdvancing = exposition ? advancesItself(exposition) : false;

  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (holdMs === null) return;
    setHeld(false);
    const timer = window.setTimeout(() => setHeld(true), holdMs);
    return () => window.clearTimeout(timer);
  }, [holdMs]);

  useEffect(() => {
    if (!selfAdvancing || !held || blocked) return;
    latest.current?.();
  }, [blocked, held, selfAdvancing]);
}
