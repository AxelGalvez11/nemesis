import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_TEST_SESSION,
  hasTestProgress,
  parseTestSession,
  serializeTestSession,
  testQuestionIndex,
  testSessionKey,
} from "./test-session-state";

/** A four-question test, four options each. */
const FOUR = [4, 4, 4, 4];
const stored = (picks: number[], picked: number | null = null) => serializeTestSession({ picked, picks });

test("a half-finished sitting survives the round trip", () => {
  assert.deepEqual(parseTestSession(stored([2, 0], 3), FOUR), { picked: 3, picks: [2, 0] });
});

test("the question on screen is derived from the answers, never stored beside them", () => {
  // Two facts that can disagree is one fact too many: an index stored next to
  // the answers is the one that goes wrong.
  assert.equal(testQuestionIndex([], 4), 0);
  assert.equal(testQuestionIndex([1], 4), 1);
  assert.equal(testQuestionIndex([1, 2, 3], 4), 3);
  // The last question stays on screen once answered, so the finished sitting
  // can be scored there — it does not run off the end.
  assert.equal(testQuestionIndex([1, 2, 3, 0], 4), 3);
  assert.equal(testQuestionIndex([], 0), 0);
});

// 🔴 The defect a naive restore ships. The player writes an attempt the moment
// its answer count is complete, so restoring a complete sitting makes REOPENING
// a finished test silently record a second one.
test("🔴 a complete sitting restores as empty — reopening a finished test must not score it again", () => {
  assert.deepEqual(parseTestSession(stored([0, 1, 2, 3]), FOUR), EMPTY_TEST_SESSION);
  // And anything past the end, from a test that lost questions since.
  assert.deepEqual(parseTestSession(stored([0, 1, 2, 3, 0]), FOUR), EMPTY_TEST_SESSION);
});

test("an answer pointing at an option that no longer exists discards the sitting", () => {
  // A stored 3 against a question now offering two options would lock a button
  // that is not there, and the "was this correct" comparison would be
  // meaningless. Discarding beats restoring something subtly wrong.
  assert.deepEqual(parseTestSession(stored([3]), [2, 4, 4, 4]), EMPTY_TEST_SESSION);
  assert.deepEqual(parseTestSession(stored([-1]), FOUR), EMPTY_TEST_SESSION);
  assert.deepEqual(parseTestSession(stored([1.5]), FOUR), EMPTY_TEST_SESSION);
});

test("🔴 `picked` is bounded by ITS OWN question, not by any other", () => {
  // picked belongs to the question after the answered ones. Bounding it by the
  // wrong question is how a revealed answer lands on the wrong button.
  const counts = [4, 2, 4, 4];
  // One answer given, so `picked` is question 2 — which has only two options.
  assert.equal(parseTestSession(stored([0], 3), counts).picked, null, "3 is out of range for a two-option question");
  assert.equal(parseTestSession(stored([0], 1), counts).picked, 1);
});

test("unreadable storage restores an empty sitting instead of throwing into a render", () => {
  assert.deepEqual(parseTestSession(null, FOUR), EMPTY_TEST_SESSION);
  assert.deepEqual(parseTestSession("not json", FOUR), EMPTY_TEST_SESSION);
  assert.deepEqual(parseTestSession("[]", FOUR), EMPTY_TEST_SESSION);
  assert.deepEqual(parseTestSession('{"picks":[1]}', FOUR), EMPTY_TEST_SESSION, "no version is a stranger's shape");
  assert.deepEqual(parseTestSession('{"version":99,"picks":[1]}', FOUR), EMPTY_TEST_SESSION);
  // And before the questions have loaded there is nothing to validate against,
  // so nothing is restored — the same "do not act before the data arrives"
  // rule the flashcard sitting needed.
  assert.deepEqual(parseTestSession(stored([1]), []), EMPTY_TEST_SESSION);
});

test("the key is scoped to the account AND the test", () => {
  assert.equal(testSessionKey("user-1", "test-9"), "nemesis.web.test-session.user-1.test-9");
  // A shared browser must never restore one account's sitting into another's.
  assert.notEqual(testSessionKey("user-1", "test-9"), testSessionKey("user-2", "test-9"));
  assert.equal(testSessionKey(null, "test-9"), null);
  assert.equal(testSessionKey("user-1", null), null);
});

test("an untouched sitting is not worth writing", () => {
  assert.equal(hasTestProgress(EMPTY_TEST_SESSION), false);
  assert.equal(hasTestProgress({ picked: null, picks: [1] }), true);
  // Revealing an answer without advancing is progress too — it is the one
  // thing a refresh a second later would otherwise throw away.
  assert.equal(hasTestProgress({ picked: 2, picks: [] }), true);
});

console.log("test-session-state.test.ts OK");
