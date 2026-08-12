// Turning a stored objective into something the learner is actually asked, and reading what came
// back as durable evidence.
//
// 🔴 THIS IS A BOUNDARY, WHICH IN THIS CODEBASE MEANS IT IS WHERE THINGS DIE SILENTLY. Six times
// now, structure computed correctly upstream has been dropped at the point where one shape became
// another, and every one of those passed the tests on both sides. The two crossings here are:
//
//     stored objective ─→ a question the learner sees
//     evaluator verdict ─→ a row in the append-only log
//
// Both are exercised by tests that reintroduce the specific defect, because a test that merely
// checks "a task was produced" or "a row was written" passes through every one of these deaths.

import type { LearnerResponse, ResponseEvaluation, RetrievalTask } from "./canvas-model";
import type { EvaluationInput } from "./canvas-prompts";
import type { LearningObjective, ObjectiveCapability } from "./learning-objective";
import type { EvidenceToRecord } from "./learner-store";

/** Which evaluator's judgement this is. Recorded on every row: evidence from a different judge is
 *  a different claim, and after the fact nothing else can tell them apart. */
export const EVALUATOR_VERSION = "canvas-judge/1";

/**
 * The one thing the learner is being asked right now.
 *
 * `id` is minted by the caller ONCE per policy decision and is the idempotency key for whatever
 * evidence comes back — see `evidenceFromEvaluation`.
 */
export interface RetrievalPrompt {
  id: string;
  objectiveIdentityKey: string;
  /** The sentence the canvas prints. */
  prompt: string;
  /** What a complete answer would be. 🔴 Never shown before the learner has committed. */
  expectedAnswer: string;
  task: RetrievalTask;
  /**
   * The cognitive operation this prompt demands.
   *
   * 🔴 CARRIED BY THE PROMPT SO BOTH OUTCOMES RECORD IT. An answered attempt and an admission of
   * not knowing are evidence about the same demand, and the demand is a property of what was
   * ASKED rather than of what came back. Reading it off the objective at write time would work on
   * the judged path and quietly be unavailable on the other.
   */
  operation: ObjectiveCapability;
  /**
   * How much assistance was available while this was attempted. 0 is the prompt and nothing else.
   *
   * 🔴 AN OBSERVATION ABOUT THE OPPORTUNITY, NEVER A JUDGEMENT ABOUT THE LEARNER. It counts what
   * the runtime offered, not whether anyone needed it.
   */
  scaffoldingLevel: number;
}

/**
 * Retrieval with nothing to lean on — the only demonstration this runtime currently stages.
 *
 * 🔴 RECORDED RATHER THAN LEFT ABSENT, BECAUSE IT WAS GENUINELY OBSERVED. No assist was on offer,
 * and that is a fact about the attempt, not a missing measurement. When a scaffolded interaction
 * ships it sets its own value and every row already written keeps meaning exactly what it meant.
 *
 * 🔴 AND IT IS NOT A LEVEL SYSTEM YET. One state exists; inventing a scale before the runtime can
 * distinguish its steps would produce numbers nothing measured.
 */
export const UNSUPPORTED_RETRIEVAL = 0;

/**
 * Word the question.
 *
 * 🔴 THE CUE COMES FROM THE OBJECTIVE, NOT FROM THE PAIR'S LEFT SIDE. Reaching into
 * `knowledge.pair.left` here would be correct for exactly one of the two objectives a pair mints
 * and silently wrong for the other: both directions would print the identical question while
 * carrying opposite identity keys. The reverse direction would then look "still unknown" in every
 * report — true, but only because it was never actually asked. `objectivesForKnowledge` resolves
 * roles to sides once; this reads that result.
 *
 * The wording is deliberately plain and carries no subject-matter vocabulary. `outputRole` is
 * whatever the source called its own column — "brand", "holding", "part number" — so naming it
 * reads correctly for a law student and a mechanical engineer without anything here knowing what
 * any of those words mean.
 */
export function objectivePromptText(objective: LearningObjective): string {
  const role = objective.parameters.outputRole;
  return role
    ? `What is the ${role} for ${objective.cue}?`
    : `Given ${objective.cue}, what goes with it?`;
}

export function retrievalPromptFor(objective: LearningObjective, id: string): RetrievalPrompt {
  return {
    expectedAnswer: objective.answer,
    id,
    objectiveIdentityKey: objective.identityKey,
    // 🔴 READ OFF THE OBJECTIVE, NOT HARD-CODED TO "recall". This surface only stages retrieval
    // today, so the two are the same value — and writing the literal here is precisely how they
    // would stay the same after `explain` ships, with every explanation recorded as a recall.
    operation: objective.capability,
    prompt: objectivePromptText(objective),
    scaffoldingLevel: UNSUPPORTED_RETRIEVAL,
    // An association asks for a term, not an explanation. The judge is told this so it checks the
    // production rather than marking a one-word answer down for being short.
    task: "name",
  };
}

/**
 * The evaluation task for one retrieval, in the shape the existing judge already reads.
 *
 * 🔴 `conceptId` IS NULL ON PURPOSE. A canvas concept is a per-canvas grouping; this objective is
 * durable and belongs to no canvas. Passing a fabricated id would make the judge's
 * `alsoWeakConceptIds` check accept a name that means nothing outside this session — and the
 * whole point of the objective layer is that identity does not come from a canvas.
 */
export function objectiveAsTask(
  objective: LearningObjective,
  prompt: RetrievalPrompt,
  response: LearnerResponse,
): Omit<EvaluationInput, "concepts"> {
  return {
    expectedEvidence: { referenceAnswer: prompt.expectedAnswer },
    objective: { conceptId: null, label: objective.label },
    prompt: prompt.prompt,
    response,
    task: prompt.task,
  };
}

/**
 * What one judged performance means for the durable record.
 *
 * 🔴 THE EVALUATOR DECIDES, NOT THE BUTTON. Nothing here reads "submitted", "checked" or "task
 * completed" — those say an interaction happened, not that a capability was shown. String equality
 * against `expectedAnswer` is the same mistake in a cheaper disguise: it would call a correct
 * answer wrong for a capital letter and cannot tell a wrong answer from a specific competing one.
 *
 * 🔴 AND THE TWO FACTS STAY SEPARATE. `demonstrationObtained` says whether anything usable came
 * back; `verdict` says what it showed and is NULL whenever nothing did. A judged answer always
 * obtained a demonstration — even `incorrect` is a demonstration, of the wrong thing.
 */
export function evidenceFromEvaluation(input: {
  objectiveRowId: string;
  prompt: RetrievalPrompt;
  response: LearnerResponse;
  evaluation: ResponseEvaluation;
  canvasId: string | null;
  occurredAt: string;
}): EvidenceToRecord {
  const { evaluation, prompt } = input;
  return {
    canvasId: input.canvasId,
    confidence: evaluation.confidence,
    demonstrationObtained: true,
    evaluatorVersion: EVALUATOR_VERSION,
    misconceptions: evaluation.misconceptions,
    objectiveRowId: input.objectiveRowId,
    occurredAt: input.occurredAt,
    // 🔴 THE IDEMPOTENCY KEY IS THE TASK, NOT A FRESH UUID. One policy decision produces one
    // prompt, and one prompt is at most one demonstration however many times the submission
    // reaches the server — a double click, a retry, a replayed effect. Minting an id at submit
    // time would defeat the unique index entirely and inflate `demonstrationCount`, which is what
    // the policy reads to decide whether something has been shown repeatedly.
    responseId: prompt.id,
    // 🔴 THE THREE OBSERVATIONS, AND NOT ONE INTERPRETATION AMONG THEM. No band, no threshold, no
    // "fast"/"slow". A rule like `tookMs > 10_000 → weak` written here would be unreviewable and
    // unrevisable for ever: rows recorded under it mean something different from rows recorded
    // after it changes, and nothing can recover what was actually measured. What it means is the
    // projection's job, and the projection can be rewritten.
    operation: prompt.operation,
    responseLatencyMs: input.response.tookMs,
    responseText: input.response.text,
    scaffoldingLevel: prompt.scaffoldingLevel,
    taskId: prompt.id,
    verdict: evaluation.verdict,
  };
}

/**
 * An opportunity that produced nothing usable.
 *
 * 🔴 NOT A WRONG ANSWER, AND THE DIFFERENCE IS THE POINT OF TWO COLUMNS. Giving up, revealing, and
 * a reply the judge returned but could not be read all mean the same thing: we still do not know.
 * Recording any of them as `incorrect` is absence of evidence stored as negative evidence.
 */
export function unobtainedEvidence(input: {
  objectiveRowId: string;
  prompt: RetrievalPrompt;
  responseText: string | null;
  canvasId: string | null;
  occurredAt: string;
  /**
   * How long the attempt took, when anything measured it.
   *
   * 🔴 ABSENT IS A REAL AND DIFFERENT CASE. Someone who typed "I don't know" spent time doing it,
   * and that is worth keeping. Someone who revealed the answer through a control typed nothing, so
   * nothing was measured — and a 0 there would assert an instant answer that never happened.
   */
  tookMs?: number;
}): EvidenceToRecord {
  return {
    canvasId: input.canvasId,
    demonstrationObtained: false,
    evaluatorVersion: EVALUATOR_VERSION,
    objectiveRowId: input.objectiveRowId,
    occurredAt: input.occurredAt,
    // 🔴 THE SAME OBSERVATIONS AS A JUDGED ATTEMPT. What differs between this and an answer is
    // whether a demonstration was obtained — not what was seen of the attempt. Recording these only
    // on the judged path would make "I don't know" look like a demonstration nobody observed at
    // all, and the two are different facts about the same opportunity.
    operation: input.prompt.operation,
    responseId: input.prompt.id,
    responseLatencyMs: input.tookMs,
    responseText: input.responseText,
    scaffoldingLevel: input.prompt.scaffoldingLevel,
    taskId: input.prompt.id,
    verdict: null,
  };
}
