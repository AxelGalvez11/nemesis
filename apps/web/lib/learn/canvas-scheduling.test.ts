import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveSchedulingSignal } from "./canvas-scheduling";
import type { ResponseEvaluation, Verdict } from "./canvas-model";

function evidence(verdict: Verdict, patch: Partial<ResponseEvaluation> = {}): ResponseEvaluation {
  return {
    verdict,
    confidence: 0.8,
    demonstrated: [],
    missing: [],
    misconceptions: [],
    feedback: "…",
    ...patch,
  };
}

test("the ordinary verdicts map onto the scheduler's vocabulary", () => {
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("understood") }).grade, "good");
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("partial") }).grade, "hard");
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("incorrect") }).grade, "again");
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("misconception") }).grade, "again");
});

test("a misconception and a plain miss get the SAME grade — the difference is not the scheduler's", () => {
  // The scheduler only answers "when". What makes a misconception different is what the canvas
  // does before then, which reads errorType and misconceptions, not this grade. If these two
  // ever diverge here, scheduling has started making a teaching decision.
  const missed = deriveSchedulingSignal({ evaluation: evidence("incorrect") });
  const wrongModel = deriveSchedulingSignal({
    evaluation: evidence("misconception", { misconceptions: ["thinks voltage falls when resistance rises"] }),
  });
  assert.equal(missed.grade, wrongModel.grade);
});

test("a strong answer straight after being taught is good, not easy", () => {
  // Repeating an explanation ninety seconds after reading it shows recall of the page, not of
  // the idea. Awarding Easy here pushes the next review out on evidence we do not have.
  const signal = deriveSchedulingSignal({ evaluation: evidence("strong") });
  assert.equal(signal.grade, "good");
  assert.match(signal.because, /immediately/i);
});

test("a strong answer earns easy once it is unaided AND delayed", () => {
  const delayed = deriveSchedulingSignal({
    evaluation: evidence("strong"),
    hintsUsed: 0,
    timeSinceLastExposureMs: 45 * 60_000,
  });
  assert.equal(delayed.grade, "easy");
});

test("a strong answer earns easy on a repeat visit even without a measured gap", () => {
  const repeated = deriveSchedulingSignal({
    evaluation: evidence("strong"),
    hintsUsed: 0,
    priorSuccesses: 2,
  });
  assert.equal(repeated.grade, "easy");
});

test("hints keep a strong answer off easy, however long the gap", () => {
  const hinted = deriveSchedulingSignal({
    evaluation: evidence("strong"),
    hintsUsed: 1,
    timeSinceLastExposureMs: 3 * 24 * 60 * 60_000,
    priorSuccesses: 5,
  });
  assert.equal(hinted.grade, "good");
});

test("revealing the answer is recorded as a retrieval we never obtained", () => {
  // §7: needing it shown is itself evidence, and better evidence than any self-report taken
  // straight after reading it.
  const signal = deriveSchedulingSignal({ evaluation: null, revealed: true });
  assert.equal(signal.grade, "again");
  assert.match(signal.because, /revealed/i);
});

test("no evaluation is not a failure — it is hard, not again", () => {
  // The learner answered; we could not read it. Grading "again" would punish them for our
  // failure, and "good" would retire a card on nothing at all.
  const signal = deriveSchedulingSignal({ evaluation: null });
  assert.equal(signal.grade, "hard");
});

test("every signal explains itself", () => {
  // The grade reaches the scheduler as a bare word. The reason is what makes a surprising
  // review interval debuggable later.
  for (const input of [
    { evaluation: evidence("strong") },
    { evaluation: evidence("partial") },
    { evaluation: null },
    { evaluation: null, revealed: true },
  ]) {
    assert.ok(deriveSchedulingSignal(input).because.length > 0);
  }
});
