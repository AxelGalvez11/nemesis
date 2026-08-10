// Turning answers into a diagnosis: which ideas are actually blocking this learner.
//
// 🔴 THIS IS THE PIECE NEMESIS COULD NOT DO BEFORE.
//
// A test result today records only which question NUMBER was missed — `{questionIndex, picked}`
// indexing that test's own array. There is no question id, no topic, no tag. So "you keep
// missing nodal phase 4" is not merely unimplemented, it is not expressible from the data.
// (And the answer shuffler permutes option order between generations, so even the index is
// not stable.)
//
// The fix here is deliberately small: a canvas carries its own concept list, questions and
// recall cards name a concept, and this file rolls the evidence up. No global mastery model,
// no new algorithm — just enough for §13's output to be true rather than decorative.

import { verdictIsPass } from "./canvas-judge";
import type { CanvasBlock, CanvasConcept, LearningCanvas } from "./canvas-model";

export interface Diagnosis {
  understood: CanvasConcept[];
  weak: CanvasConcept[];
  /** Declared by the lesson but never assessed. Named separately so the page never implies a
   *  concept was passed when nothing asked about it. */
  untested: CanvasConcept[];
  score: { correct: number; total: number };
}

export function diagnose(
  canvas: Pick<LearningCanvas, "concepts" | "questions" | "answers" | "responses" | "recallResults">,
): Diagnosis {
  const byQuestion = new Map(canvas.questions.map((question) => [question.id, question]));

  // A concept is weak if ANY evidence says it failed, and understood only if it was assessed
  // and never failed. Failure outranks success: understanding is the higher bar, and a
  // learner who got it right once and wrong once has not got it.
  const failed = new Set<string>();
  const passed = new Set<string>();
  let correct = 0;
  let total = 0;

  for (const answer of canvas.answers) {
    const question = byQuestion.get(answer.questionId);
    // An answer to a question that no longer exists is stale bookkeeping, not evidence.
    if (!question) continue;
    total += 1;
    if (answer.correct) correct += 1;
    if (!question.conceptId) continue;
    (answer.correct ? passed : failed).add(question.conceptId);
  }

  for (const response of canvas.responses ?? []) {
    const question = byQuestion.get(response.questionId);
    if (!question) continue;
    // An answer we could not judge is not evidence in either direction. Counting it as a failure
    // would punish the learner for a model that returned malformed JSON; counting it as a pass
    // would retire a concept nobody assessed. It simply does not appear.
    if (!response.judgement) continue;
    total += 1;
    const understood = verdictIsPass(response.judgement.verdict);
    if (understood) correct += 1;
    if (question.conceptId) (understood ? passed : failed).add(question.conceptId);
    // §4: one explanation can show that a NEIGHBOURING idea is shaky — "they have the mechanism
    // but their grasp of the underlying pathway is rough". Only ever adds weakness, never
    // removes it: the judge is inferring here rather than assessing, and inference is not
    // strong enough evidence to retire a concept.
    for (const id of response.judgement.alsoWeakConceptIds ?? []) failed.add(id);
  }

  for (const result of canvas.recallResults) {
    if (!result.conceptId) continue;
    // "Again" means it did not come back. Hard means it did, slowly — that is not a failure.
    (result.grade === "again" ? failed : passed).add(result.conceptId);
  }

  const understood: CanvasConcept[] = [];
  const weak: CanvasConcept[] = [];
  const untested: CanvasConcept[] = [];

  for (const concept of canvas.concepts) {
    if (failed.has(concept.id)) weak.push(concept);
    else if (passed.has(concept.id)) understood.push(concept);
    else untested.push(concept);
  }

  return { understood, weak, untested, score: { correct, total } };
}

/** Clear the evidence a retest is about to replace.
 *
 *  🔴 WHY THIS HAS TO EXIST. `diagnose` lets failure outrank success, which is right WITHIN one
 *  round — a learner who got something right once and wrong once has not got it. It is wrong
 *  ACROSS rounds. Answers were already wiped when a retest was generated, but recall results
 *  were not, so one "Again" on a card made that concept permanently weak: the learner could
 *  answer it correctly on every retest and the diagnosis would still name it, `correctedConceptIds`
 *  would stay empty, and "Finish" would never appear. Relearn → retest → complete — the arc the
 *  whole pilot exists to test — was unreachable.
 *
 *  A retest is newer evidence about exactly these concepts, so the older evidence about them
 *  goes. Evidence about everything else is untouched. */
export function clearEvidenceForRetest<
  T extends Pick<LearningCanvas, "recallResults" | "answers" | "responses">,
>(canvas: T, conceptIds: readonly string[]): T {
  const retested = new Set(conceptIds);
  return {
    ...canvas,
    recallResults: canvas.recallResults.filter(
      (result) => !result.conceptId || !retested.has(result.conceptId),
    ),
    answers: [],
    // Free responses go with the answers, and for the same reason. They belong to questions the
    // retest is about to replace, so keeping them would let a judged-weak explanation from the
    // last round outlive the round that produced it — the precise failure described above,
    // which made "Finish" unreachable. A new kind of evidence needs a new line here.
    responses: [],
  };
}

/** The blocks that teach a given set of concepts. This is what makes targeted relearning
 *  cheap: the 400-word lesson is written from these blocks, not from the original 2,200. */
export function blocksForConcepts(
  blocks: readonly CanvasBlock[],
  conceptIds: readonly string[],
): CanvasBlock[] {
  if (conceptIds.length === 0) return [];
  const wanted = new Set(conceptIds);
  return blocks.filter((block) => block.conceptIds?.some((id) => wanted.has(id)));
}

/** A provisional threshold, as §15 permits — nothing weak, and something actually assessed.
 *  Deliberately not an invented mastery algorithm. */
export function masteryReached(diagnosis: Pick<Diagnosis, "weak" | "understood">): boolean {
  return diagnosis.weak.length === 0 && diagnosis.understood.length > 0;
}

export interface CompletionSummary {
  conceptsUnderstood: number;
  weakAreasCorrected: number;
  activeMinutes: number;
}

export function summariseCompletion(
  canvas: Pick<
    LearningCanvas,
    "concepts" | "questions" | "answers" | "responses" | "recallResults" | "correctedConceptIds" | "activeMs"
  >,
): CompletionSummary {
  return {
    conceptsUnderstood: diagnose(canvas).understood.length,
    weakAreasCorrected: canvas.correctedConceptIds.length,
    // Any real work rounds up: reporting "0 min active learning" to someone who just finished
    // a session reads as a bug, not as precision.
    activeMinutes: canvas.activeMs > 0 ? Math.max(1, Math.round(canvas.activeMs / 60_000)) : 0,
  };
}
