/**
 * The phone's turn-routing surface.
 *
 * 🔴🔴 THIS FILE USED TO BE A SECOND COPY OF THE WEB CLASSIFIER, and that is exactly why it is now
 * five lines of re-export. It carried RESEARCH_PATTERN, CURRENT_PATTERN, EXPLICIT_WEB_PATTERN,
 * CHANGING_FACT_PATTERN, LIVE_SPORTS_PATTERN, EMERGING_ENTITY_PATTERN, LEARNING_PATTERN,
 * CASUAL_PATTERN, RECENT_YEAR_PATTERN, SAVE_ARTIFACT, SAVE_VERB, SAVE_TO_WORKSPACE and ACCEPTANCE —
 * the same thirteen the browser had, maintained by somebody remembering to edit both files.
 *
 * 🔴 THEY HAD ALREADY DRIFTED. The web CHANGING_FACT_PATTERN learnt to exclude "who are you", "who
 * is this" and "who is nemesis", because those bought a paid search and came back with an answer
 * about an unrelated person. This copy never got that fix, so the identical question behaved
 * differently on the phone, and nothing could have caught it: they were two files, each with its
 * own passing tests. That is the same shape of bug this repo has already fixed three times over
 * (the library `position` field, the calendar tool description, the writing voice).
 *
 * The reading now happens once, for the whole product, in `@nemesis/shared`.
 */

export {
  ATTACHMENT_ONLY_DECISION,
  DEFAULT_DECISION,
  decisionFromIntent,
  routeInstruction,
  type ChatModelAlias,
  type ChatRoute,
  type ChatRouteDecision,
} from "@nemesis/shared";

import { decisionFromIntent, type ChatIntent, type ChatRouteDecision } from "@nemesis/shared";

/**
 * The route for one turn, once the composer's Deep research toggle is taken into account.
 * `research` is the forced research decision when that toggle is on, and null when it isn't.
 *
 * A SAVE REQUEST BEATS THE TOGGLE. Deep research runs on the reasoner, which carries no tools — so
 * "make me flashcards on beta blockers" with the toggle left on would produce an essay and save
 * nothing, and the student would have no way to tell why. Deep research is a persistent toggle they
 * may have flipped days ago; "make me flashcards" is what they typed just now, so the fresher, more
 * specific instruction wins. The research route is still honoured for every turn that isn't asking
 * us to write something into their account.
 *
 * 🔴 WHAT COUNTS AS A SAVE IS NO LONGER `detectsSaveRequest`. It is the turn's own decision saying
 * the student asked for something of theirs to be written — read by a model rather than matched
 * against SAVE_ARTIFACT and SAVE_VERB, which between them knew "practice test" but not "test".
 *
 * Pure and separate from the caller so this precedence has a test rather than living as one
 * condition inside a 40-line send function.
 */
export function routeForTurn(intent: ChatIntent, research: ChatRouteDecision | null): ChatRouteDecision {
  if (research && intent.workspace !== "write") return research;
  return decisionFromIntent(intent);
}
