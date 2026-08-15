// Whether to narrow a retrieval, and how far — scaffolding as a DECISION, not a fallback.
//
// 🔴 §33 BUILT THE LADDER; NOTHING EVER CHOSE A RUNG ON IT. `scaffold-rung.ts` defines
// `independent > narrowed > cued > recognition > taught` and the partial order between them;
// `objective-task.ts`'s `promptTargeting` has accepted an optional `rung` since the ladder shipped,
// defaulting to `independent` because — in that file's own words — "this runtime has only ever
// staged unaided retrieval". `teaching-policy.ts`'s provisional-`correct` branch says outright that
// its own lower-rung path is "UNREACHABLE ON TODAY'S DATA... nothing yet stages a task below
// independent". A ladder with one rung ever used is not adaptive scaffolding, it is a type nobody
// constructs. This file is the missing chooser.
//
// 🔴 A DECISION, WITH A REASON, NOT A DEFAULT THAT FIRES WHEN NOTHING ELSE MATCHES. Scaffolding down
// is not what happens when the policy runs out of other ideas — it is what happens when the evidence
// says an unaided ask has already been tried and has not worked. `scaffoldRungFor` is a pure
// function of the SAME evidence `next-action-value.ts` reads, it returns a `streak` a caller can
// state in `because`, and it is exported precisely so a test can assert on the rung directly instead
// of on a side effect of it.
//
// 🔴 THE THRESHOLD IS THE SAME NUMBER `next-action-value.ts` ALREADY RULED, NOT A NEW ONE — but the
// FOLD is different, and that difference is the whole design. `unresolvedAttempts` there counts every
// unresolved row that ever happened, because a score should reflect the whole history. Scaffolding
// asks a narrower question — "has the CURRENT attempt at this objective already failed, more than
// once, without anything resolving it since?" — so this counts the TRAILING run of unresolved rows,
// stopping at the first one that resolved. A learner who failed twice in March and then passed in
// April must not be scaffolded down in August because of March.
//
// 🔴 THE FLOOR IS `recognition`, NEVER `taught`. Being told the answer is not a retrieval — it is
// what `show_correction` is for, chosen by a different branch of `chooseNextTeachingAction` for a
// different reason. A function that chooses HOW TO ASK must never choose to stop asking.
//
// 🔴 THIS FILE DOES NOT DECIDE WHETHER TO ASK. `chooseNextTeachingAction` already decided that —
// working memory cleared, the objective fell short, a real attempt is owed. This only decides, given
// that a retrieval IS happening, what shape it should take. Keeping the two separate is what stops
// scaffolding from becoming a second, competing "should we ask" rule that can disagree with the
// first one.

import type { LearnerEvidence } from "./learner-evidence";
import { isUnresolvedAttempt } from "./next-action-value";
import type { ScaffoldRung } from "./scaffold-rung";

/**
 * How many consecutive unresolved attempts justify moving one rung down.
 *
 * 🔴 INDEX 0 AND 1 ARE BOTH `independent` — ONE MISS IS NOT A PATTERN. This is the exact judgement
 * `next-action-value.ts`'s `PER_FAILED_ATTEMPT` modifier already made or the `failures > 1` gate
 * before it applies any weight: a single wrong answer is ordinary, and treating it as grounds to
 * change the QUESTION (not merely its score) on the very next attempt would narrow a task the
 * learner has barely had one real try at. Two straight misses is the same bar this codebase already
 * decided is real signal.
 *
 * 🔴 THE LAST ENTRY IS THE FLOOR, REPEATED BY `Math.min` RATHER THAN EXTENDED — see the file header
 * on why `taught` is never reached this way.
 */
const RUNG_BY_STREAK: readonly ScaffoldRung[] = ["independent", "independent", "narrowed", "cued", "recognition"];

export interface ScaffoldDecision {
  /** What the next retrieval should ask at. `"independent"` means: nothing to scaffold yet. */
  rung: ScaffoldRung;
  /** The trailing run of unresolved attempts this rung was read from — carried so a caller can say
   *  why in its own words, without recomputing the fold. */
  streak: number;
}

/**
 * The run of unresolved attempts at the END of the log, stopping at the first one that resolved.
 *
 * 🔴 `not_addressed` ROWS ARE SKIPPED, NEVER COUNTED AS A BREAK. A response that never mentioned
 * this objective is not an attempt at it and is not a resolution of it either — the same reasoning
 * `projectLearnerState` already applies when it filters `attempts`. Treating a skipped row as
 * "resolved" would let one answer to a DIFFERENT question quietly reset a real losing streak.
 *
 * 🔴 EVIDENCE IS READ NEWEST-LAST, THE CONVENTION EVERY CALLER OF THIS MODULE ALREADY HOLDS
 * (`TeachingPolicyInput.recentEvidence`), SO THE STREAK WALKS BACKWARD FROM THE END.
 */
function trailingUnresolvedStreak(evidence: readonly LearnerEvidence[]): number {
  let streak = 0;
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const row = evidence[index]!;
    if (row.objectiveEvidence === "not_addressed") continue;
    if (!isUnresolvedAttempt(row)) break;
    streak += 1;
  }
  return streak;
}

/**
 * What rung the next retrieval should ask at, and why.
 *
 * 🔴 PURE, LIKE EVERY OTHER TERM IN THIS DECISION LAYER. Same evidence in, same rung out — so
 * "why did this ask at a narrower scope?" is answerable by replaying it, the same guarantee
 * `next-action-value.ts` makes for the score itself.
 */
export function scaffoldRungFor(evidence: readonly LearnerEvidence[]): ScaffoldDecision {
  const streak = trailingUnresolvedStreak(evidence);
  const rung = RUNG_BY_STREAK[Math.min(streak, RUNG_BY_STREAK.length - 1)]!;
  return { rung, streak };
}
