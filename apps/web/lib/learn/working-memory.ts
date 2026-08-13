// Has the answer left the learner's working memory yet?
//
// 🔴 §39 STRENGTHENED §34 INVARIANT 3, AND THIS IS THE STRENGTHENING. The invariant said *"do not
// immediately ask a question whose answer is still VISIBLE"*. §39 says **still in working memory** —
// *"a window AFTER it leaves the screen"*. Visibility is a fact about the surface and it ends when
// the screen changes; working memory is a fact about the learner and it does not.
//
// 🔴 AND IT IS MEASURED IN MATERIAL, NOT IN SECONDS. The owner's brief for the ten-minute tempo was
// *"comes back within the same sitting, AFTER OTHER MATERIAL HAS INTERVENED"* — two conditions, and
// only the clock half was ever built. Nothing in this codebase counted intervening items; `actedOn`
// is an unordered Set with no "since". This is that missing half.
//
// A gap measured in material is also the more honest instrument for the thing being protected.
// Displacement, not decay, is what clears a rehearsed item: one full retrieval episode — a question
// asked, an answer produced, a verdict read, the screen moved past — is a genuine interference task,
// not an idle second. Ten seconds of staring at the same screen displaces nothing.
//
// 🔴 NO NEW TIME CONSTANT. Ruled by Brain, 2026-08-13, and for a reason this repo has already paid
// for: `retrieval-eligibility.ts` records at length how a second interval made the owner's ruling
// inert, because the learner waited the LONGER of the two. Nothing here introduces a duration. The
// only clock this consults is `ACT_AGAIN_AFTER_MS`, which was already on the branch it guards, and
// it is consulted DISJUNCTIVELY — so this can only ever open the door earlier, never later.
//
// PURE. Session state in, boolean out. Nothing here is persisted and nothing here is evidence.

/**
 * How many OTHER objectives have been worked since this one was last acted on.
 *
 * @param actedOn every objective acted on this session, **oldest first**, one entry per act.
 *
 * 🔴 ORDERED, WHICH IS WHY IT IS A LIST AND NOT THE EXISTING SET. `actedOn` answers "has this been
 * seen?"; the question here is "what has happened SINCE this was seen?", and a Set cannot answer it.
 * They are not two sources of truth: `decideNext` derives its set from this list, so the ordering
 * and the membership cannot disagree.
 *
 * 🔴 COUNTED FROM THE LAST TIME THIS OBJECTIVE WAS ACTED ON, NOT FROM THE START. An objective the
 * learner has come back to three times has three entries; only the work after the most recent one
 * has displaced anything.
 *
 * 🔴 DISTINCT OBJECTIVES, WHICH IS THE CONSERVATIVE READING. Answering the same other fact three
 * times in a row is plausibly three interference episodes, and counting it as one can only ever
 * make this wait LONGER before re-asking. Erring in the direction of more separation is the safe
 * side: the cost is a slightly later return, and the cost of erring the other way is recording a
 * working-memory echo as a durable demonstration.
 *
 * Never acted on at all means nothing of this objective's is being held, so everything counts.
 */
export function interveningActs(objectiveId: string, actedOn: readonly string[]): number {
  const since = actedOn.lastIndexOf(objectiveId);
  const after = since === -1 ? actedOn : actedOn.slice(since + 1);
  return new Set(after.filter((id) => id !== objectiveId)).size;
}

/**
 * The least separation that counts as *"other material has intervened"*.
 *
 * 🔴 ONE, AND EVERY LARGER VALUE WOULD BE A GUESS NOBODY RULED. The owner's sentence draws exactly
 * one line — between re-asking IMMEDIATELY and re-asking after other material — and one is where
 * that line is. Two, three or five are tuning parameters, and inventing one here is the same move
 * as inventing an interval, which Brain refused for the same reason.
 *
 * 🔴 AND ONE OBJECTIVE IS NOT ONE SECOND. Acting on another objective means a question was asked,
 * the learner produced an answer, a judge read it, and they moved past the result. That is a full
 * retrieval episode standing between the exposure and the re-ask — the shape of an interference
 * task, not a pause.
 *
 * If the owner wants more separation than this, the knob is here and its value is theirs. What must
 * not happen is someone raising it to feel safer: a larger number delays the return of exactly the
 * material the learner just failed, which is §39's consequence 1 pointed the wrong way.
 */
export const INTERVENING_ACTS_REQUIRED = 1;

/**
 * Could the answer still be in working memory?
 *
 * `true` means re-asking now would measure whether the learner can still hear their own voice.
 *
 * 🔴 A DISJUNCTION, SO IT CAN ONLY EVER OPEN THE DOOR EARLIER. Either enough material has intervened
 * (displacement) or enough time has passed (decay) — whichever happens first clears it. A
 * CONJUNCTION would make the learner wait for the later of the two, which is precisely the defect
 * `retrieval-eligibility.ts` documents and precisely why no new constant appears here.
 *
 * 🔴 THE DECAY TERM REUSES `ACT_AGAIN_AFTER_MS`, THE NUMBER THAT WAS ALREADY ON THIS BRANCH. It is
 * named rather than passed as a bare number so the reuse is visible. It matters only where nothing
 * can intervene — a canvas holding a single objective — and there "sooner than a passed objective"
 * has nothing to be sooner than. Everywhere else displacement clears first, in seconds.
 */
export function answerStillHeld(input: {
  /** Other objectives worked since this one — see `interveningActs`. */
  readonly interveningActs: number;
  /** Milliseconds since this objective last produced evidence, or `Infinity` if it never has. */
  readonly sinceMs: number;
  /** The churn window already governing this branch. Named by the caller; never minted here. */
  readonly decayAfterMs: number;
}): boolean {
  if (input.interveningActs >= INTERVENING_ACTS_REQUIRED) return false;
  return input.sinceMs < input.decayAfterMs;
}
