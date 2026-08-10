import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blocksForConcepts,
  clearEvidenceForRetest,
  diagnose,
  masteryReached,
  summariseCompletion,
} from "./canvas-diagnosis";
import { emptyCanvas, type CanvasBlock, type LearningCanvas } from "./canvas-model";

const CONCEPTS = [
  { id: "k1", label: "Ion gradients" },
  { id: "k2", label: "Nodal phase 4 depolarisation" },
  { id: "k3", label: "Effective refractory period" },
];

function canvasWith(patch: Partial<LearningCanvas>): LearningCanvas {
  return { ...emptyCanvas("c1", "2026-08-06T00:00:00.000Z"), concepts: CONCEPTS, ...patch };
}

function question(id: string, conceptId: string | null) {
  return { id, format: "choice" as const, q: "?", options: ["a", "b"], answer: 0, why: "", conceptId };
}

test("a concept whose questions were all right is understood", () => {
  const result = diagnose(
    canvasWith({
      questions: [question("q1", "k1"), question("q2", "k1")],
      answers: [
        { questionId: "q1", picked: 0, correct: true },
        { questionId: "q2", picked: 0, correct: true },
      ],
    }),
  );
  assert.deepEqual(result.understood.map((c) => c.id), ["k1"]);
  assert.deepEqual(result.weak, []);
});

test("a concept with a wrong answer is weak, and named", () => {
  const result = diagnose(
    canvasWith({
      questions: [question("q1", "k2")],
      answers: [{ questionId: "q1", picked: 1, correct: false }],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.label), ["Nodal phase 4 depolarisation"]);
});

test("weak concepts correspond to exactly the questions that were wrong", () => {
  // This is acceptance criterion 14, as a test.
  const result = diagnose(
    canvasWith({
      questions: [question("q1", "k1"), question("q2", "k2"), question("q3", "k3")],
      answers: [
        { questionId: "q1", picked: 0, correct: true },
        { questionId: "q2", picked: 1, correct: false },
        { questionId: "q3", picked: 1, correct: false },
      ],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.id).sort(), ["k2", "k3"]);
  assert.deepEqual(result.understood.map((c) => c.id), ["k1"]);
});

test("one miss out of many still marks the concept weak — the point is to catch gaps", () => {
  const result = diagnose(
    canvasWith({
      questions: [question("q1", "k1"), question("q2", "k1"), question("q3", "k1")],
      answers: [
        { questionId: "q1", picked: 0, correct: true },
        { questionId: "q2", picked: 0, correct: true },
        { questionId: "q3", picked: 1, correct: false },
      ],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.id), ["k1"]);
});

test("a failed recall card counts as evidence too, not only the test", () => {
  const result = diagnose(
    canvasWith({
      recallResults: [{ cardId: "r1", conceptId: "k3", grade: "again" }],
      questions: [],
      answers: [],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.id), ["k3"]);
});

test("a card graded hard is not treated as a failure", () => {
  const result = diagnose(
    canvasWith({ recallResults: [{ cardId: "r1", conceptId: "k3", grade: "hard" }] }),
  );
  assert.deepEqual(result.weak, []);
  assert.deepEqual(result.understood.map((c) => c.id), ["k3"]);
});

test("a concept nothing ever tested is neither understood nor weak", () => {
  const result = diagnose(
    canvasWith({
      questions: [question("q1", "k1")],
      answers: [{ questionId: "q1", picked: 0, correct: true }],
    }),
  );
  assert.deepEqual(result.untested.map((c) => c.id), ["k2", "k3"]);
});

test("an answer whose question carries no concept does not invent one", () => {
  const result = diagnose(
    canvasWith({
      questions: [question("q1", null)],
      answers: [{ questionId: "q1", picked: 1, correct: false }],
    }),
  );
  assert.deepEqual(result.weak, []);
  assert.equal(result.score.correct, 0);
  assert.equal(result.score.total, 1);
});

test("an answer referring to a question that is gone is ignored, not counted", () => {
  const result = diagnose(
    canvasWith({ questions: [], answers: [{ questionId: "ghost", picked: 0, correct: true }] }),
  );
  assert.equal(result.score.total, 0);
});

test("the score counts answers, not concepts", () => {
  const result = diagnose(
    canvasWith({
      questions: [question("q1", "k1"), question("q2", "k2")],
      answers: [
        { questionId: "q1", picked: 0, correct: true },
        { questionId: "q2", picked: 1, correct: false },
      ],
    }),
  );
  assert.deepEqual(result.score, { correct: 1, total: 2 });
});

test("a retest clears the recall evidence for the concepts it re-assesses", () => {
  // 🔴 The bug this exists for: recall evidence outlived the retest, so a learner who pressed
  // "Again" once on a card could answer that concept correctly forever and it would stay weak.
  // Relearn -> retest -> complete was unreachable; "Finish" never appeared.
  const before = canvasWith({
    recallResults: [
      { cardId: "r1", conceptId: "k2", grade: "again" },
      { cardId: "r2", conceptId: "k1", grade: "again" },
    ],
    weakConceptIds: ["k2"],
  });
  const after = clearEvidenceForRetest(before, ["k2"]);
  assert.deepEqual(after.recallResults.map((r) => r.conceptId), ["k1"]);
  assert.deepEqual(after.answers, []);
});

test("after a retest is answered correctly the concept is understood, not still weak", () => {
  const retesting = clearEvidenceForRetest(
    canvasWith({ recallResults: [{ cardId: "r1", conceptId: "k2", grade: "again" }], weakConceptIds: ["k2"] }),
    ["k2"],
  );
  const result = diagnose({
    ...retesting,
    questions: [question("q9", "k2")],
    answers: [{ questionId: "q9", picked: 0, correct: true }],
  });
  assert.deepEqual(result.weak, []);
  assert.deepEqual(result.understood.map((c) => c.id), ["k2"]);
});

test("a retest leaves evidence about concepts it is not re-assessing alone", () => {
  const after = clearEvidenceForRetest(
    canvasWith({ recallResults: [{ cardId: "r1", conceptId: "k3", grade: "again" }] }),
    ["k2"],
  );
  assert.equal(after.recallResults.length, 1);
});

test("a concept both missed on the test and passed on recall stays weak", () => {
  // Evidence of failure outranks evidence of success. Understanding is the higher bar.
  const result = diagnose(
    canvasWith({
      questions: [question("q1", "k1")],
      answers: [{ questionId: "q1", picked: 1, correct: false }],
      recallResults: [{ cardId: "r1", conceptId: "k1", grade: "easy" }],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.id), ["k1"]);
  assert.deepEqual(result.understood, []);
});

// ------------------------------------------------------------ targeted review

const BLOCKS: CanvasBlock[] = [
  { id: "b1", type: "heading", content: "Cardiac action potentials" },
  { id: "b2", type: "paragraph", content: "About gradients", conceptIds: ["k1"] },
  { id: "b3", type: "paragraph", content: "About nodal cells", conceptIds: ["k2"] },
  { id: "b4", type: "paragraph", content: "About both", conceptIds: ["k2", "k3"] },
  { id: "b5", type: "paragraph", content: "About nothing in particular" },
];

test("targeted review selects only the blocks that cover the weak concepts", () => {
  assert.deepEqual(blocksForConcepts(BLOCKS, ["k2"]).map((b) => b.id), ["b3", "b4"]);
});

test("a block covering several concepts is picked up by any of them", () => {
  assert.deepEqual(blocksForConcepts(BLOCKS, ["k3"]).map((b) => b.id), ["b4"]);
});

test("no weak concepts selects no blocks — not the whole lesson again", () => {
  assert.deepEqual(blocksForConcepts(BLOCKS, []), []);
});

// -------------------------------------------------------------------- mastery

test("mastery is reached when nothing is weak and something was actually tested", () => {
  assert.equal(masteryReached({ weak: [], understood: [{ id: "k1", label: "x" }] }), true);
});

test("mastery is not reached when a concept is still weak", () => {
  assert.equal(masteryReached({ weak: [{ id: "k2", label: "y" }], understood: [] }), false);
});

test("mastery is not claimed when nothing was tested at all", () => {
  assert.equal(masteryReached({ weak: [], understood: [] }), false);
});

test("the completion summary counts understood concepts and corrected weak areas", () => {
  const summary = summariseCompletion(
    canvasWith({
      correctedConceptIds: ["k2", "k3"],
      questions: [question("q1", "k1")],
      answers: [{ questionId: "q1", picked: 0, correct: true }],
      activeMs: 14 * 60_000,
    }),
  );
  assert.equal(summary.conceptsUnderstood, 1);
  assert.equal(summary.weakAreasCorrected, 2);
  assert.equal(summary.activeMinutes, 14);
});

test("under a minute of work still reads as one minute, never zero", () => {
  assert.equal(summariseCompletion(canvasWith({ activeMs: 4_000 })).activeMinutes, 1);
});

// ------------------------------------------------- free response as evidence

function freeQuestion(id: string, conceptId: string) {
  return {
    id,
    format: "free" as const,
    task: "explain" as const,
    q: "Why?",
    expectedEvidence: { acceptableClaims: ["the point"] },
    why: "",
    conceptId,
  };
}

function judged(verdict: "strong" | "understood" | "partial" | "incorrect" | "misconception", extra = {}) {
  return { verdict, confidence: 0.8, demonstrated: [], missing: [], misconceptions: [], feedback: "…", ...extra };
}

test("an explanation judged understood makes its concept understood", () => {
  const result = diagnose(
    canvasWith({
      questions: [freeQuestion("q1", "k1")],
      responses: [{ questionId: "q1", text: "…", via: "typed", evaluation: judged("understood") }],
    }),
  );
  assert.deepEqual(result.understood.map((c) => c.id), ["k1"]);
  assert.equal(result.weak.length, 0);
});

test("a partial explanation leaves the concept weak, not understood", () => {
  // The whole reason free response is worth having: "nearly" is a real state, and treating it
  // as a pass would retire a concept the learner only half has.
  const result = diagnose(
    canvasWith({
      questions: [freeQuestion("q1", "k1")],
      responses: [{ questionId: "q1", text: "…", via: "spoken", evaluation: judged("partial") }],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.id), ["k1"]);
});

test("an unjudged answer is not evidence in either direction", () => {
  // A judge that timed out must not mark the learner wrong, and must not mark them right.
  const result = diagnose(
    canvasWith({
      questions: [freeQuestion("q1", "k1")],
      responses: [{ questionId: "q1", text: "a real answer", via: "typed" }],
    }),
  );
  assert.equal(result.weak.length, 0);
  assert.equal(result.understood.length, 0);
  assert.deepEqual(result.untested.map((c) => c.id), ["k1", "k2", "k3"]);
  assert.equal(result.score.total, 0, "an unjudged answer must not count toward the total");
});

test("a misconception can name a second concept as weak", () => {
  const result = diagnose(
    canvasWith({
      questions: [freeQuestion("q1", "k1")],
      responses: [
        {
          questionId: "q1",
          text: "…",
          via: "typed",
          evaluation: judged("misconception", { misconceptions: ["believes X"], alsoWeakConceptIds: ["k3"] }),
        },
      ],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.id).sort(), ["k1", "k3"]);
});

test("a neighbouring concept named weak is never retired by a pass elsewhere", () => {
  // alsoWeak only ever ADDS weakness. The judge is inferring there, not assessing, and an
  // inference must not be able to outrank a concept's own assessment in the other direction.
  const result = diagnose(
    canvasWith({
      questions: [freeQuestion("q1", "k1"), freeQuestion("q2", "k2")],
      responses: [
        { questionId: "q1", text: "…", via: "typed", evaluation: judged("understood", { alsoWeakConceptIds: ["k2"] }) },
        { questionId: "q2", text: "…", via: "typed", evaluation: judged("understood") },
      ],
    }),
  );
  assert.deepEqual(result.weak.map((c) => c.id), ["k2"]);
  assert.deepEqual(result.understood.map((c) => c.id), ["k1"]);
});

test("a retest clears free responses along with answers", () => {
  // 🔴 The regression this file already documents, in its new form. A response judged weak in
  // the previous round would otherwise outlive the round, keep its concept permanently weak,
  // and make "Finish" unreachable all over again.
  const before = canvasWith({
    questions: [freeQuestion("q1", "k2")],
    responses: [{ questionId: "q1", text: "…", via: "typed", evaluation: judged("incorrect") }],
    recallResults: [{ cardId: "c1", conceptId: "k2", grade: "again" as const }],
  });
  const after = clearEvidenceForRetest(before, ["k2"]);
  assert.deepEqual(after.responses, []);
  assert.deepEqual(after.answers, []);
});
