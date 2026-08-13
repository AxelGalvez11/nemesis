// When something already demonstrated becomes askable again.
//
// 🔴 THIS IS THE WAY BACK, NOT A SCHEDULE. Before it, `correct` produced `advance`, `advance` was
// unselectable, and a demonstrated objective was not deprioritised — it was EXCLUDED. Measured: one
// objective answered correctly a year ago still returned `null`. There was no back of the queue
// because there was no queue. This adds a door; it does not decide how often anyone walks through it.
//
// 🔴 STATUS IS A FACT, ELIGIBILITY IS A POLICY OVER THE FACT, AND THE SEPARATION IS THE WHOLE POINT.
// `correct` staying `correct` is right — the learner DID demonstrate it, and nothing about elapsed
// time makes that untrue. So `projectLearnerState` is untouched, takes no clock, and must keep
// taking none: a projection that decayed its own status would be the forbidden
// `response → 1-4 → that IS learner state` arriving by a different road.
//
// 🔴 ONE NUMBER, AND IT IS DELIBERATELY CRUDE. There is exactly one value here and no second one.
// No difficulty term, no stability, no ease factor, no per-objective adjustment — every one of
// those is the beginning of a second spaced-repetition system invented inside the teaching policy,
// which is the specific thing this codebase was told not to grow. FSRS belongs DOWNSTREAM of
// evidence (`docs/canvas-cognitive-runtime.md`), and when it exists it supersedes this file rather
// than being negotiated with it.
//
// 🔴 THE VALUE IS A PRODUCT DECISION AND IT IS NOT RUNTIME'S. The MECHANISM is architecture; the
// TEMPO is the owner's.
//
// 🔴 AND THE CLAIM THAT USED TO SIT HERE — "ruling on tempo is a one-line change to a single
// constant" — WAS FALSE, WHICH IS WORTH LEAVING WRITTEN DOWN RATHER THAN QUIETLY CORRECTING.
// It was true of this file and false of the decision. `chooseNextTeachingAction` conjoins this
// interval with `ACT_AGAIN_AFTER_MS`, so what a learner actually waits is the LONGER of the two.
// Every value here above one hour was indistinguishable from every other, and the first ruling
// that landed below one hour changed nothing at all. Measured, not reasoned: the constant moved
// 60 min → 10 min and the decision table was byte-identical.
//
// The lesson generalises past this file. A number is only a knob if something downstream cannot
// out-vote it, and "one exported constant" is a statement about a file, not about a behaviour.
// Which is why the test for it is now a SWEEP OF THE DECISION rather than a read of this source.

/**
 * How long after a demonstration the same objective may be asked for again.
 *
 * 🔴 RULED BY THE OWNER, 2026-08-13: TEN MINUTES. The brief was "comes back within the same
 * sitting, after other material has intervened" — the short end of the escalated range. This is no
 * longer provisional and no longer a placeholder to be replaced later. It is the tempo, and the
 * interval a learner actually experiences must EQUAL it.
 *
 * The asymmetry that framed the escalation still holds, and it is why ten minutes is a floor to
 * defend rather than a starting point to shrink: erring long risks an objective not returning
 * within a sitting — visible, and recoverable. Erring short risks asking someone something they
 * answered minutes ago, which measures working memory and records it as learning — a false claim
 * about a person, stored durably, and invisible. Only one of those two mistakes cannot be seen.
 *
 * Not derived from anything. Not tuned. Not per-objective. One number.
 */
export const RETRIEVAL_ELIGIBLE_AFTER_MS = 10 * 60 * 1000;

/**
 * Is a demonstrated objective askable again?
 *
 * 🔴 IT ANSWERS ONLY "MAY IT BE ASKED", NEVER "SHOULD IT BE". What to do about an objective is
 * `chooseNextTeachingAction`'s decision and stays there; this is a gate the decision consults. A
 * predicate that started returning a priority, a score, or an ordering would be a scheduler wearing
 * a boolean's clothes.
 *
 * `lastEvidenceAt` of `null` means nothing has ever been observed, so there is no interval to have
 * waited out — the caller reaches this only for a state that HAS evidence, and `true` is the honest
 * answer for a fact nobody has seen rather than a reason to hold anything back.
 */
export function eligibleForRetrieval(input: {
  lastEvidenceAt: string | null;
  now: Date;
  /** Injected in tests, and the one place a different tempo could ever come from. */
  eligibleAfterMs?: number;
}): boolean {
  const after = input.eligibleAfterMs ?? RETRIEVAL_ELIGIBLE_AFTER_MS;
  if (!input.lastEvidenceAt) return true;
  return input.now.getTime() - Date.parse(input.lastEvidenceAt) >= after;
}
