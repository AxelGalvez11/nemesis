import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyCanvas, type LearningCanvas } from "./canvas-model";
import { canStart, canTransition, nextAction, stateAfterSourceAttached } from "./canvas-state";

function canvasIn(state: LearningCanvas["state"], patch: Partial<LearningCanvas> = {}): LearningCanvas {
  return { ...emptyCanvas("c1", "2026-08-06T00:00:00.000Z"), state, ...patch };
}

test("an empty canvas becomes sources_attached the moment material lands", () => {
  assert.equal(stateAfterSourceAttached(canvasIn("empty")), "sources_attached");
});

test("attaching another source to a canvas already being read does not throw it back to the start", () => {
  // Adding a second lecture mid-lesson must not wipe the lesson.
  assert.equal(stateAfterSourceAttached(canvasIn("learn")), "learn");
  assert.equal(stateAfterSourceAttached(canvasIn("recall")), "recall");
});

test("the arc runs forward through every state in the brief", () => {
  const arc: LearningCanvas["state"][] = [
    "empty",
    "sources_attached",
    "orient",
    "learn",
    "recall",
    "test",
    "diagnose",
    "targeted_relearn",
    "retest",
    "complete",
  ];
  for (let i = 0; i < arc.length - 1; i += 1) {
    const from = arc[i] as LearningCanvas["state"];
    const to = arc[i + 1] as LearningCanvas["state"];
    assert.equal(canTransition(from, to), true, `${from} -> ${to}`);
  }
});

test("a retest that goes well finishes; a retest that goes badly loops back to diagnosis", () => {
  assert.equal(canTransition("retest", "complete"), true);
  assert.equal(canTransition("retest", "diagnose"), true);
});

test("the learner can always go back to reading, from any working state", () => {
  // "explain this again" must never be refused because of where the state machine is.
  for (const from of ["recall", "test", "diagnose", "retest", "complete"] as const) {
    assert.equal(canTransition(from, "learn"), true, `${from} -> learn`);
  }
});

test("a canvas cannot skip straight from empty to a lesson", () => {
  assert.equal(canTransition("empty", "learn"), false);
  assert.equal(canTransition("empty", "test"), false);
});

test("recall cannot be jumped to before there is anything to recall", () => {
  assert.equal(canTransition("sources_attached", "recall"), false);
});

test("a state never transitions to itself", () => {
  assert.equal(canTransition("learn", "learn"), false);
});

test("canStart refuses a lesson with no material and no topic", () => {
  assert.equal(canStart(canvasIn("empty")).ok, false);
});

test("canStart accepts a canvas with a source attached", () => {
  const canvas = canvasIn("sources_attached", {
    sources: [{ id: "s1", title: "Lecture", kind: "pdf", excerpts: [{ id: "s1:e1", label: null, text: "x" }] }],
  });
  assert.equal(canStart(canvas).ok, true);
});

test("canStart accepts a topic-first canvas with a title but no sources", () => {
  assert.equal(canStart(canvasIn("sources_attached", { title: "Anticoagulation" })).ok, true);
});

const CARD = { id: "r1", front: "f", back: "b", conceptId: "k1" };
const QUESTION = {
  id: "q1",
  format: "choice" as const,
  q: "?",
  options: ["a", "b"],
  answer: 0,
  why: "",
  conceptId: "k1",
};

test("nextAction names the move the learner should make in each state", () => {
  assert.equal(nextAction(canvasIn("learn", { blocks: [{ id: "b1", type: "paragraph", content: "x" }] }))?.to, "recall");
  assert.equal(
    nextAction(canvasIn("recall", { recall: [CARD], recallResults: [{ cardId: "r1", conceptId: "k1", grade: "good" }] }))?.to,
    "test",
  );
  assert.equal(
    nextAction(canvasIn("test", { questions: [QUESTION], answers: [{ questionId: "q1", picked: 0, correct: true }] }))?.to,
    "diagnose",
  );
  assert.equal(nextAction(canvasIn("complete")), null);
});

test("a test still in progress offers no way forward", () => {
  // Otherwise one stray click on the header ends the paper and diagnoses from one answer,
  // marking every unasked concept weak.
  assert.equal(nextAction(canvasIn("test", { questions: [QUESTION, { ...QUESTION, id: "q2" }], answers: [] })), null);
  assert.equal(
    nextAction(canvasIn("test", { questions: [QUESTION, { ...QUESTION, id: "q2" }], answers: [{ questionId: "q1", picked: 0, correct: true }] })),
    null,
  );
});

test("a recall deck still in progress offers no way forward", () => {
  assert.equal(nextAction(canvasIn("recall", { recall: [CARD, { ...CARD, id: "r2" }], recallResults: [] })), null);
});

test("a finished retest goes to a fresh diagnosis, not straight to done", () => {
  assert.equal(
    nextAction(canvasIn("retest", { questions: [QUESTION], answers: [{ questionId: "q1", picked: 0, correct: true }] }))?.to,
    "diagnose",
  );
  assert.equal(nextAction(canvasIn("retest", { questions: [QUESTION], answers: [] })), null);
});

test("the move out of diagnosis is targeted relearning only when something is actually weak", () => {
  assert.equal(nextAction(canvasIn("diagnose", { weakConceptIds: ["k1"] }))?.to, "targeted_relearn");
  // Nothing weak means the work is finished — not a relearn of nothing.
  assert.equal(nextAction(canvasIn("diagnose", { weakConceptIds: [] }))?.to, "complete");
});

test("a lesson with no blocks yet offers no way forward", () => {
  assert.equal(nextAction(canvasIn("learn", { blocks: [] })), null);
});
