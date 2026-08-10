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

  if (verdictIsPass(evaluation.verdict)) {
    return { type: "advance", because: "the performance covered what was expected" };
  }

  if (input.attempts >= MAX_CORRECTIVE_ATTEMPTS) {
    return {
      type: "advance",
      because: `${input.attempts} corrective attempts already spent here; moving on and letting it come back`,
    };
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
