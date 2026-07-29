// The list of steps a turn has been through, for the live reasoning block.
//
// Owner 2026-07-29: the preview should read like ChatGPT's — a pulsing status
// badge, "Analyzed X steps", a live token stream, all inside one collapsible
// block with a rule down its left edge.
//
// WHAT WAS ACTUALLY MISSING was this file. ThinkingLine already showed a real
// phase label and a live reasoning ticker, but each phase REPLACED the last with
// a cross-fade, so by the time the answer arrived the student could not see what
// the turn had actually done — only whatever it happened to be doing last. The
// steps were never kept anywhere. Keeping them is what turns a status line into
// a record of work.
//
// PURE so it is Deno-testable: the component cannot be, and this is the part
// with rules in it.

/** Longest run of steps kept. A turn that genuinely does more than this is
 *  pathological, and an unbounded array behind a 4-second animation is a leak
 *  nobody would look for. The COUNT keeps rising past the cap — a student
 *  reading "12 steps" is told the truth even though only the last few are
 *  listed. */
export const MAX_KEPT_STEPS = 8;

export interface StepTrail {
  /** Most recent last, capped at MAX_KEPT_STEPS. */
  readonly steps: readonly string[];
  /** Every step this turn has been through, including ones aged out of `steps`. */
  readonly count: number;
}

export const EMPTY_TRAIL: StepTrail = { count: 0, steps: [] };

/**
 * `trail` with `label` appended.
 *
 * IMMUTABLE — returns the SAME object reference when nothing changed, so a
 * component can use it directly in a dependency array without re-rendering on
 * every reasoning chunk. The phase label arrives many times a second while a
 * single step is running; only a genuine change should cost a render.
 *
 * Consecutive duplicates are dropped rather than counted. "Searching the web"
 * arriving thirty times in a row is one step that took a while, not thirty
 * steps — counting each would inflate the tally into nonsense, which is the one
 * thing a number on screen must not do.
 */
export function pushStep(trail: StepTrail, label: string): StepTrail {
  const clean = label.trim();
  if (!clean) return trail;
  if (trail.steps.length > 0 && trail.steps[trail.steps.length - 1] === clean) return trail;
  const next = [...trail.steps, clean];
  return {
    count: trail.count + 1,
    steps: next.length > MAX_KEPT_STEPS ? next.slice(next.length - MAX_KEPT_STEPS) : next,
  };
}

/**
 * The badge's trailing detail: "3 steps · 12s".
 *
 * Both halves are optional and the separator only appears when both are there,
 * so a turn with one step and no elapsed time reads as "" rather than " · ".
 * Seconds are hidden below 2 to keep a fast turn from flashing "0s" and gone.
 */
export function trailSummary(count: number, seconds: number): string {
  const parts: string[] = [];
  if (count > 1) parts.push(`${count} steps`);
  if (seconds >= 2) parts.push(`${seconds}s`);
  return parts.join(" · ");
}
