// What the canvas should DO about a performance.
//
// 🔴 THIS IS THE DECISION FSRS CANNOT MAKE. The scheduler answers one narrow question — when
// might this need retrieving again — and it is deliberately lossy: a forgotten term and a
// backwards causal model both come out as "again". They need opposite teaching. That difference
// lives here, reading the evidence the judge already produced.
//
// 🔴 AND IT IS DELIBERATELY NOT A MODEL CALL. The evaluation already says what was demonstrated,
// what was missing, what false belief appeared and how sure the reading was. Asking a second
// model "so what should happen now?" on every single answer would double the latency and the
// cost of the whole loop to re-derive what we are already holding. A model writes the new
// content once the action is chosen; it does not choose the action.
//
// Nothing here mutates anything. It returns an intention, and the caller turns that into
// validated operations — the same separation canvas-api.ts keeps between deciding and applying.

import type { ResponseEvaluation } from "./canvas-model";
import { verdictIsPass } from "./canvas-judge";

/** How many corrective rounds one objective gets before the canvas moves on.
 *
 *  🔴 Without a cap the loop never ends: partial → clarify → partial → clarify, on the same
 *  paragraph, indefinitely. Two targeted attempts that did not land is the point where more
 *  rephrasing of the same idea stops being likely to help. The concept stays weak either way, so
 *  nothing is lost — the scheduler brings it back later, with fresh material rather than the
 *  same wording a fourth time. */
export const MAX_CORRECTIVE_ATTEMPTS = 2;

/** Below this, the judge is telling us it could not really tell. Correcting "precisely" off a
 *  reading that uncertain produces a confident correction of the wrong thing, which is worse
 *  than an honest re-explanation. */
const CONFIDENT_ENOUGH_TO_AIM = 0.4;

export type CognitiveAction =
  /** Resolved, or not worth grinding on. Collapse what is finished and move to the next thing. */
  | { type: "advance"; because: string }
  /** They had most of it. Keep what they demonstrated, teach ONLY the gap, ask again. */
  | { type: "clarify_missing"; because: string; missing: string[] }
  /** Wrong, but we can see exactly where. Minimal correction, then a new attempt. */
  | { type: "correct"; because: string; missing: string[] }
  /** A specific false model to replace, then a reconstruction before moving on. */
  | { type: "repair_misconception"; because: string; misconceptions: string[] }
  /** Wrong, and we cannot see where. A fuller re-teach, then a new retrieval. */
  | { type: "retry"; because: string };

export interface PolicyInput {
  /** Null when no evidence was obtained — revealed, skipped, or a reading we could not use. */
  evaluation: ResponseEvaluation | null;
  /** Corrective rounds already spent on this objective. */
  attempts: number;
  revealed?: boolean;
}

/**
 * What to do next about this objective.
 *
 * 🔴🔴 THE MODEL DECIDES; THIS ENFORCES THE FEW THINGS IT CANNOT KNOW. Owner 2026-08-22: *"'policy
 * picks next move' is the wrong architecture, deepseek needs to pick the next move."*
 *
 * This used to be the decision: an `if` ladder over verdict, confidence and attempt count that
 * chose one of five actions. The thing that had actually READ the learner's words produced a rich
 * reading — what they demonstrated, what was missing, which false belief was visible, how settled
 * it was — and the ladder threw all of it away except two numbers and a label. Every judgement a
 * tutor makes in that gap died in the flattening.
 *
 * 🔴 WHAT SURVIVES IS NOT A SECOND OPINION. The four checks below are facts about the SESSION that
 * the judge cannot see from one answer, plus two consistency rules that stop a move being applied
 * with nothing to apply it to:
 *
 *   1. `revealed` — the answer was already on screen, so nothing was retrieved. Teaching against a
 *      non-performance invents a weakness at someone.
 *   2. no evaluation — there is no reading to act on.
 *   3. the attempt cap — the judge sees one answer and cannot know this is the fourth round on the
 *      same objective. Without this it can loop a learner on one idea indefinitely, and spaced
 *      review already exists to bring an unresolved objective back later. This is the guardrail
 *      that most earns its place.
 *   4. `repair_misconception` with no named misconception, and `clarify_missing`/`correct` with
 *      nothing to aim at — the teaching prompt interpolates those lists, so an empty one produces
 *      an instruction to fix nothing. Downgraded rather than refused.
 *
 * Anything else the model chose stands, including choices this ladder would have refused — a
 * `retry` on a high-confidence partial, an `advance` on something technically incomplete because
 * the learner is clearly done with it. Those are the judgements worth having.
 *
 * 🔴 AND THE OLD LADDER IS STILL HERE, as `legacyAction`, for the case where the model returned no
 * move at all. That is a real case — an older cached reply, a rescue call that came back thin — and
 * the honest fallback is the behaviour that shipped, not a refusal.
 */
export function determineNextCognitiveAction(input: PolicyInput): CognitiveAction {
  if (input.revealed) {
    // The answer is already on the screen. There is nothing left to teach in this moment, and
    // the scheduler has already recorded that no retrieval happened.
    return { type: "advance", because: "the answer was shown rather than retrieved" };
  }
  const evaluation = input.evaluation;
  if (!evaluation) {
    // Teaching against a reading we do not have would be inventing a weakness at the learner.
    return { type: "advance", because: "no usable reading of the answer" };
  }
  if (input.attempts >= MAX_CORRECTIVE_ATTEMPTS) {
    return {
      type: "advance",
      because: `${input.attempts} corrective attempts already spent here; moving on and letting it come back`,
    };
  }

  const chosen = evaluation.nextMove;
  if (!chosen) return legacyAction(evaluation, input);

  const because = evaluation.moveReason?.trim() || `the judge chose ${chosen}`;
  switch (chosen) {
    case "advance":
      return { type: "advance", because };
    case "repair_misconception":
      // Consistency, not second-guessing: the teaching prompt lists these back to the model, and
      // an empty list asks it to replace a belief nobody named.
      return evaluation.misconceptions.length > 0
        ? { type: "repair_misconception", because, misconceptions: evaluation.misconceptions }
        : {
            type: "retry",
            because: "a misconception repair was chosen with no misconception named",
          };
    case "clarify_missing":
    case "correct":
      return evaluation.missing.length > 0
        ? { type: chosen, because, missing: evaluation.missing }
        : { type: "retry", because: `${chosen} was chosen with nothing named to aim at` };
    case "retry":
      return { type: "retry", because };
  }
}

/**
 * The pre-2026-08-22 decision procedure, kept for replies that carry no move.
 *
 * 🔴 NOT DEAD CODE AND NOT A SECOND OPINION. It runs only when `nextMove` is absent, which is what
 * makes the change above shippable without a flag day. When every live reply carries a move this
 * can go — and the test that proves the model is being obeyed is the one that will catch it still
 * running.
 */
function legacyAction(evaluation: ResponseEvaluation, _input: PolicyInput): CognitiveAction {
  if (verdictIsPass(evaluation.verdict)) {
    return { type: "advance", because: "the performance covered what was expected" };
  }
  if (evaluation.verdict === "misconception" && evaluation.misconceptions.length > 0) {
    return {
      type: "repair_misconception",
      because: "a specific false belief is nameable, so the model itself is what needs replacing",
      misconceptions: evaluation.misconceptions,
    };
  }
  const aimable = evaluation.missing.length > 0 && evaluation.confidence >= CONFIDENT_ENOUGH_TO_AIM;
  if (evaluation.verdict === "partial") {
    return aimable
      ? {
          type: "clarify_missing",
          because: "most of it was demonstrated; only the gap needs teaching",
          missing: evaluation.missing,
        }
      : { type: "retry", because: "partial, but nothing specific enough to aim a clarification at" };
  }
  return aimable
    ? {
        type: "correct",
        because: "wrong, but the reading shows exactly where",
        missing: evaluation.missing,
      }
    : { type: "retry", because: "wrong, and the reading is not precise enough to correct against" };
}

/** Does this action rewrite part of the page, or just move on?
 *
 *  Kept next to the policy so a new action cannot be added without someone deciding which side
 *  of this line it falls on. */
export function actionMutatesCanvas(action: CognitiveAction): boolean {
  return action.type !== "advance";
}
