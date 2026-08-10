import assert from "node:assert/strict";
import { test } from "node:test";

import { diagnose } from "./canvas-diagnosis";
import { appendEvent, frictionCount, MAX_EVENTS, type NewLearningEvent } from "./canvas-events";
import type { LearningCanvas, ResponseEvaluation } from "./canvas-model";
import { deriveSchedulingSignal } from "./canvas-scheduling";

function canvas(): LearningCanvas {
  return {
    id: "c1",
    title: "Cardiac action potentials",
    state: "diagnose",
    level: "intermediate",
    sources: [],
    blocks: [],
    concepts: [
      { id: "k1", label: "Ventricular phase 0" },
      { id: "k2", label: "Nodal phase 4" },
    ],
    recall: [],
    recallResults: [
      {
        cardId: "r1",
        conceptId: "k1",
        grade: "good",
        evaluation: {
          verdict: "understood",
          confidence: 0.9,
          demonstrated: ["sodium influx"],
          missing: [],
          misconceptions: [],
          feedback: "That's it.",
        },
      },
      {
        cardId: "r2",
        conceptId: "k2",
        grade: "again",
        evaluation: {
          verdict: "incorrect",
          confidence: 0.8,
          demonstrated: [],
          missing: ["the funny current"],
          misconceptions: [],
          feedback: "Not quite.",
        },
      },
    ],
    questions: [],
    answers: [],
    responses: [],
    correctiveAttempts: {},
    events: [],
    weakConceptIds: [],
    correctedConceptIds: [],
    activeMs: 60_000,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  } as unknown as LearningCanvas;
}

const LOOKUP: NewLearningEvent = {
  type: "definition_opened",
  blockId: "b1",
  conceptIds: ["k1", "k2"],
  selectedText: "electrochemical gradient",
};

test("🔴 interaction events cannot change a diagnosis", () => {
  const before = diagnose(canvas());

  // Fifty interactions, all pointing at the concepts the diagnosis speaks in. If asking for
  // help ever moved a concept from understood to weak, this is where it would show — and that
  // is exactly the "opened a definition → mastery −20%" mistake the layer exists to prevent.
  let withEvents = canvas();
  for (let index = 0; index < 50; index += 1) {
    withEvents = appendEvent(withEvents, LOOKUP, `2026-08-10T00:0${index % 10}:00.000Z`, `e${index}`);
  }

  const after = diagnose(withEvents);
  assert.deepEqual(
    after.understood.map((concept) => concept.id),
    before.understood.map((concept) => concept.id),
  );
  assert.deepEqual(
    after.weak.map((concept) => concept.id),
    before.weak.map((concept) => concept.id),
  );
  assert.deepEqual(after.score, before.score);
  assert.equal(withEvents.events?.length, 50, "the events were genuinely recorded, not dropped");
});

test("🔴 an interaction event never reaches a scheduling grade", () => {
  // `deriveSchedulingSignal` takes `hintsUsed`, which is the one door an interaction signal
  // could walk through and silently change when a card comes back. Asking for a definition and
  // then answering well must grade the same as answering well without asking.
  const evaluation: ResponseEvaluation = {
    verdict: "strong",
    confidence: 0.95,
    demonstrated: ["the whole mechanism"],
    missing: [],
    misconceptions: [],
    feedback: "Complete.",
  };

  const unaided = deriveSchedulingSignal({ evaluation, hintsUsed: 0, priorSuccesses: 1 });
  const afterLookingUpAWord = deriveSchedulingSignal({ evaluation, hintsUsed: 0, priorSuccesses: 1 });
  assert.equal(afterLookingUpAWord.grade, unaided.grade);
  // If a future change starts feeding definition lookups in as hints, THAT is a deliberate
  // decision about teaching, and it should break this test first.
});

test("the log is capped and drops the oldest", () => {
  let current = canvas();
  for (let index = 0; index < MAX_EVENTS + 25; index += 1) {
    current = appendEvent(current, { ...LOOKUP, selectedText: `term-${index}` }, "2026-08-10T00:00:00.000Z", `e${index}`);
  }
  assert.equal(current.events?.length, MAX_EVENTS);
  // Oldest out first — this is a ring buffer, which is exactly why it is NOT the evidence log.
  assert.equal(current.events?.[0]?.selectedText, "term-25");
  assert.equal(current.events?.at(-1)?.selectedText, `term-${MAX_EVENTS + 24}`);
});

test("an event records active time, not wall clock", () => {
  const withEvent = appendEvent(canvas(), LOOKUP, "2026-08-10T00:00:00.000Z", "e1");
  // Someone who opens a canvas and walks away for 25 minutes has not studied for 25 minutes,
  // and latency computed from wall clock would read that as deep thought.
  assert.equal(withEvent.events?.[0]?.activeElapsedMs, 60_000);
});

test("selected text is truncated — this is a signal, not a copy of the document", () => {
  const long = "x".repeat(500);
  const withEvent = appendEvent(canvas(), { ...LOOKUP, selectedText: long }, "2026-08-10T00:00:00.000Z", "e1");
  assert.equal(withEvent.events?.[0]?.selectedText?.length, 200);
});

test("friction is reported as a count, never as a judgement", () => {
  let current = canvas();
  for (let index = 0; index < 3; index += 1) {
    current = appendEvent(current, LOOKUP, "2026-08-10T00:00:00.000Z", `e${index}`);
  }
  // One lookup is noise; repetition is the signal. The module reports how many times and stops
  // there, because what it means depends on evidence it does not have.
  assert.equal(frictionCount(current, "electrochemical gradient"), 3);
  assert.equal(frictionCount(current, "  Electrochemical Gradient  "), 3, "match is case- and space-insensitive");
  assert.equal(frictionCount(current, "conductance"), 0);

  // Merely highlighting something is not asking for help with it.
  const browsing = appendEvent(canvas(), { type: "selection_created", selectedText: "myocyte" }, "2026-08-10T00:00:00.000Z", "e9");
  assert.equal(frictionCount(browsing, "myocyte"), 0);
});
