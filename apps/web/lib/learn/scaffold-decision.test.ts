// Does the trailing evidence justify asking at a narrower rung, and how far down?

import assert from "node:assert/strict";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import { scaffoldRungFor } from "./scaffold-decision";

let counter = 0;
function row(over: Partial<LearnerEvidence> = {}): LearnerEvidence {
  counter += 1;
  return {
    demonstrationObtained: true,
    id: `e${counter}`,
    objectiveIdentityKey: "o1",
    occurredAt: `2026-08-${String(10 + counter).padStart(2, "0")}T00:00:00.000Z`,
    verdict: "incorrect",
    ...over,
  };
}

const unresolved = () => row({ objectiveEvidence: "partial", verdict: "incorrect" });
const resolved = () => row({ demonstrationObtained: true, objectiveEvidence: "demonstrated", verdict: "strong" });
const notAddressed = () =>
  row({ demonstrationObtained: false, objectiveEvidence: "not_addressed", verdict: null });

test("no evidence at all asks at independent", () => {
  assert.deepEqual(scaffoldRungFor([]), { rung: "independent", streak: 0 });
});

test("one unresolved attempt is ordinary, not a pattern — still independent", () => {
  const decision = scaffoldRungFor([unresolved()]);
  assert.equal(decision.rung, "independent");
  assert.equal(decision.streak, 1);
});

test("🔴 two straight misses narrows the rung — the same bar next-action-value.ts already ruled real", () => {
  const decision = scaffoldRungFor([unresolved(), unresolved()]);
  assert.equal(decision.rung, "narrowed");
  assert.equal(decision.streak, 2);
});

test("three straight misses narrows further, to cued", () => {
  const decision = scaffoldRungFor([unresolved(), unresolved(), unresolved()]);
  assert.equal(decision.rung, "cued");
  assert.equal(decision.streak, 3);
});

test("four or more straight misses floors at recognition, never taught", () => {
  const four = scaffoldRungFor([unresolved(), unresolved(), unresolved(), unresolved()]);
  assert.equal(four.rung, "recognition");
  const nine = scaffoldRungFor(Array.from({ length: 9 }, unresolved));
  assert.equal(nine.rung, "recognition", "the ladder must not walk past recognition, however long the streak");
  assert.equal(nine.streak, 9, "the streak itself keeps counting even once the rung has floored");
});

test("🔴 a resolved attempt clears the streak, however many misses came before it", () => {
  // A learner who failed twice in March and passed in April must not be scaffolded in August
  // because of March. The most recent event is what the streak measures from.
  const decision = scaffoldRungFor([unresolved(), unresolved(), resolved()]);
  assert.deepEqual(decision, { rung: "independent", streak: 0 });
});

test("a miss AFTER a resolved attempt only counts itself, not what came before the resolution", () => {
  const decision = scaffoldRungFor([unresolved(), unresolved(), resolved(), unresolved()]);
  assert.deepEqual(decision, { rung: "independent", streak: 1 });
});

test("not_addressed rows are skipped, never treated as a resolution that clears the streak", () => {
  // A different objective's answer landing here is not a demonstration of THIS one and must not
  // reset a real losing streak — the same reasoning `projectLearnerState` applies to `attempts`.
  const decision = scaffoldRungFor([unresolved(), unresolved(), notAddressed()]);
  assert.deepEqual(decision, { rung: "narrowed", streak: 2 });
});

test("not_addressed rows do not themselves add to the streak", () => {
  const decision = scaffoldRungFor([notAddressed(), notAddressed()]);
  assert.deepEqual(decision, { rung: "independent", streak: 0 });
});
