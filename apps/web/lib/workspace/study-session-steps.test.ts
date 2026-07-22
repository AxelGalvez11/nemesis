import assert from "node:assert/strict";
import { test } from "node:test";

import { decideSessionGrade } from "./study-session-steps";

test("new card climbs two Good passes before it graduates", () => {
  const first = decideSessionGrade({ inRetry: false, progress: 0, repetitions: 0 }, "good");
  assert.deepEqual(first, { progress: 1, requeue: true, write: false });
  const second = decideSessionGrade({ inRetry: true, progress: 1, repetitions: 0 }, "good");
  assert.deepEqual(second, { progress: 0, requeue: false, write: true });
});

test("failing a new card resets its steps without writing a lapse", () => {
  const decision = decideSessionGrade({ inRetry: true, progress: 1, repetitions: 0 }, "again");
  assert.deepEqual(decision, { progress: 0, requeue: true, write: false });
});

test("failing a due review writes the lapse once, then relearns session-only", () => {
  const lapse = decideSessionGrade({ inRetry: false, progress: 0, repetitions: 3 }, "again");
  assert.deepEqual(lapse, { progress: 0, requeue: true, write: true });
  const secondFail = decideSessionGrade({ inRetry: true, progress: 0, repetitions: 4 }, "again");
  assert.deepEqual(secondFail, { progress: 0, requeue: true, write: false });
  const recovery = decideSessionGrade({ inRetry: true, progress: 0, repetitions: 4 }, "good");
  assert.deepEqual(recovery, { progress: 0, requeue: false, write: true });
});

test("hard repeats the step for learning cards but finishes due reviews", () => {
  const learning = decideSessionGrade({ inRetry: true, progress: 1, repetitions: 0 }, "hard");
  assert.deepEqual(learning, { progress: 1, requeue: true, write: false });
  const review = decideSessionGrade({ inRetry: false, progress: 0, repetitions: 5 }, "hard");
  assert.deepEqual(review, { progress: 0, requeue: false, write: true });
});

test("easy graduates immediately from any state", () => {
  assert.deepEqual(decideSessionGrade({ inRetry: false, progress: 0, repetitions: 0 }, "easy"), { progress: 0, requeue: false, write: true });
  assert.deepEqual(decideSessionGrade({ inRetry: true, progress: 1, repetitions: 0 }, "easy"), { progress: 0, requeue: false, write: true });
});
