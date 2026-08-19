/**
 * Rebuild a controller's context from a traced decision — Nemesis Lab §12, §13 and §14.
 *
 * 🔴🔴 THIS FILE EXISTS BECAUSE THE REPLAY WAS NOT HANDING THE CONTROLLER WHAT PRODUCTION HANDS IT,
 * AND ONLY ONE ARM NOTICED. `TeachingContext.correctionsShown` and `.modelled` are `ReadonlySet`s.
 * The trace carries them as ARRAYS, deliberately — a case is saved to disk as JSON, and a `Set`
 * does not survive `JSON.stringify` (it serialises as `{}`), so a trace that kept the live objects
 * would produce regression cases that silently lost two inputs.
 *
 * Handing those arrays straight back to `controllerFor` threw `corrected.has is not a function` in
 * `nemesis_policy` and did NOT throw in `llm_teacher`, which reads them differently. So the
 * comparison rendered as "the structured policy refuses everything, the model arm works" — a
 * completely false result about the product, produced entirely by the harness. That is the exact
 * failure the owner's rule is about: if the Lab behaves differently from production, it is not
 * useful.
 *
 * 🔴 SO THE REBUILD IS ONE FUNCTION WITH ONE TEST, called by every replay site. Two call sites each
 * doing their own reconstruction is how one of them ends up subtly wrong again.
 *
 * PURE. No React, no I/O.
 */

import type { TeachingContext } from "@/lib/learn/teaching-strategy";

/** What the trace stores: the context with its Sets flattened and its Date as a string. */
export interface TracedContext extends Record<string, unknown> {
  now: string;
  correctionsShown: readonly string[];
  modelled: readonly string[];
}

export function isTracedContext(value: unknown): value is TracedContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TracedContext> & { objectives?: unknown };
  return (
    typeof candidate.now === "string" &&
    Array.isArray(candidate.correctionsShown) &&
    Array.isArray(candidate.modelled) &&
    Array.isArray(candidate.objectives)
  );
}

/**
 * The real `TeachingContext` again.
 *
 * `uid` and `signal` are supplied by the caller rather than restored: a session is not data, and an
 * `AbortSignal` from a call that finished minutes ago would abort nothing or everything.
 */
export function replayContext(
  traced: TracedContext,
  uid: string,
  signal: AbortSignal,
): TeachingContext {
  return {
    ...(traced as unknown as TeachingContext),
    // 🔴 SETS AGAIN, NOT ARRAYS. `nemesis_policy` calls `.has()` on both.
    correctionsShown: new Set(traced.correctionsShown),
    modelled: new Set(traced.modelled),
    // 🔴 THE ORIGINAL INSTANT, NOT THE CURRENT ONE. Retrievability and "minutes since last
    // evidence" are computed from it, so replaying with today's clock is replaying against a
    // different learner state and the comparison would not be the comparison the owner asked for.
    now: new Date(traced.now),
    signal,
    uid,
  };
}
