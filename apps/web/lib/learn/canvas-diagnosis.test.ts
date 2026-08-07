import assert from "node:assert/strict";
import { test } from "node:test";

import { blocksForConcepts, diagnose, masteryReached, summariseCompletion } from "./canvas-diagnosis";
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
  return { id, q: "?", options: ["a", "b"], answer: 0, why: "", conceptId };
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
