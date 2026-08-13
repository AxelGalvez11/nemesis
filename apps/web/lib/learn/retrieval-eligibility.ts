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
// TEMPO is the owner's. They are separated here so that ruling on tempo is a one-line change to a
// single constant rather than a rewrite — which is the only reason it is safe to ship a number
// nobody has ruled on yet.

/**
 * How long after a demonstration the same objective may be asked for again.
 *
 * 🔴 PROVISIONAL, AND CONSERVATIVE ON PURPOSE. Erring long risks an objective not returning within
 * a sitting; erring short risks asking someone something they answered minutes ago, which measures
 * working memory and records it as learning — a false claim about a person, stored durably. Only
 * one of those two mistakes is invisible, so the default leans away from it.
 *
 * Not derived from anything. Not tuned. Replace this one number when the owner rules on tempo.
 */
export const RETRIEVAL_ELIGIBLE_AFTER_MS = 60 * 60 * 1000;

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
