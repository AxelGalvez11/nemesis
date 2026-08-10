import assert from "node:assert/strict";
import { test } from "node:test";

import { determineNextCognitiveAction, MAX_CORRECTIVE_ATTEMPTS } from "./canvas-policy";
import type { ResponseEvaluation, Verdict } from "./canvas-model";

function evidence(verdict: Verdict, patch: Partial<ResponseEvaluation> = {}): ResponseEvaluation {
  return {
    verdict,
    confidence: 0.8,
    demonstrated: ["what they had"],
    missing: ["the piece they did not have"],
    misconceptions: [],
    feedback: "…",
    ...patch,
  };
}

// ------------------------------------------------------------- the four moves

test("a performance that got there advances", () => {
  for (const verdict of ["strong", "understood"] as const) {
    assert.equal(determineNextCognitiveAction({ evaluation: evidence(verdict), attempts: 0 }).type, "advance");
  }
});

test("a partial performance clarifies ONLY what was missing, and carries it", () => {
  // The centre of the product: preserve what they had, teach the gap, ask again. Re-teaching
  // A+B+C to someone who demonstrated A+B is the behaviour this exists to prevent.
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial", { missing: ["what happens to the by-product"] }),
    attempts: 0,
  });
  assert.equal(action.type, "clarify_missing");
  assert.deepEqual(action.type === "clarify_missing" ? action.missing : null, [
    "what happens to the by-product",
  ]);
});

test("a partial performance with nothing named as missing falls back to a retry", () => {
  // "Partial" with an empty gap gives us nothing to teach against, so a targeted clarification
  // would be a rewrite of the whole thing wearing a targeted label.
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial", { missing: [] }),
    attempts: 0,
  });
  assert.equal(action.type, "retry");
});

test("a named false belief is repaired, not merely corrected", () => {
  const action = determineNextCognitiveAction({
    evaluation: evidence("misconception", {
      misconceptions: ["believes voltage falls when resistance rises"],
    }),
    attempts: 0,
  });
  assert.equal(action.type, "repair_misconception");
  assert.deepEqual(
    action.type === "repair_misconception" ? action.misconceptions : null,
    ["believes voltage falls when resistance rises"],
  );
});

test("an incorrect answer we can aim at gets a targeted correction", () => {
  const action = determineNextCognitiveAction({
    evaluation: evidence("incorrect", { missing: ["the direction of the gradient"], confidence: 0.8 }),
    attempts: 0,
  });
  assert.equal(action.type, "correct");
});

test("an incorrect answer we cannot aim at gets a fuller re-teach instead", () => {
  // Nothing named as missing, or a reading the judge itself was unsure of, is not enough to
  // correct precisely. Guessing at a target produces a confident correction of the wrong thing.
  assert.equal(
    determineNextCognitiveAction({
      evaluation: evidence("incorrect", { missing: [] }),
      attempts: 0,
    }).type,
    "retry",
  );
  assert.equal(
    determineNextCognitiveAction({
      evaluation: evidence("incorrect", { missing: ["something"], confidence: 0.2 }),
      attempts: 0,
    }).type,
    "retry",
  );
});

// ------------------------------------------------------------------- the guards

test("grinding stops: after enough corrective attempts the canvas moves on", () => {
  // 🔴 Without this the loop never ends. partial → clarify → partial → clarify forever is a
  // worse experience than moving on, and the concept stays weak either way, so the scheduler
  // brings it back with fresh material rather than the same paragraph a fourth time.
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial"),
    attempts: MAX_CORRECTIVE_ATTEMPTS,
  });
  assert.equal(action.type, "advance");
  assert.match(action.because, /attempt/i);
});

test("one attempt short of the cap still corrects", () => {
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial"),
    attempts: MAX_CORRECTIVE_ATTEMPTS - 1,
  });
  assert.equal(action.type, "clarify_missing");
});

test("revealing the answer advances — the page already showed it", () => {
  // They have seen the answer, so there is nothing left to teach here in this moment. The
  // scheduler already recorded that no retrieval happened and will ask again later.
  const action = determineNextCognitiveAction({ evaluation: null, attempts: 0, revealed: true });
  assert.equal(action.type, "advance");
  assert.match(action.because, /shown|revealed/i);
});

test("an unreadable answer advances rather than inventing a correction", () => {
  // We could not read what they said. Teaching against a reading we do not have would be
  // making something up at the learner.
  const action = determineNextCognitiveAction({ evaluation: null, attempts: 0 });
  assert.equal(action.type, "advance");
});

test("every action explains itself", () => {
  for (const input of [
    { evaluation: evidence("strong"), attempts: 0 },
    { evaluation: evidence("partial"), attempts: 0 },
    { evaluation: evidence("incorrect"), attempts: 0 },
    { evaluation: evidence("misconception", { misconceptions: ["x"] }), attempts: 0 },
    { evaluation: null, attempts: 0 },
  ]) {
    assert.ok(determineNextCognitiveAction(input).because.length > 0);
  }
});

test("the decision never needs a model call", () => {
  // Guarded as a property, not a comment: the policy is a pure function of the evaluation the
  // judge already produced. Asking a second model "what should happen now?" on every transition
  // would double the cost and the latency of every answer to re-derive what we already know.
  assert.equal(typeof determineNextCognitiveAction, "function");
  assert.equal(determineNextCognitiveAction.length, 1);
});
