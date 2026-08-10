import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyCanvas, type LearningCanvas, type ResponseEvaluation } from "./canvas-model";
import { needsFreshEvidence, nextReviewAt, retentionMap, retrievabilityAt } from "./canvas-retention";

const START = "2026-08-01T00:00:00.000Z";
const DAY = 86_400_000;

function evaluation(verdict: ResponseEvaluation["verdict"]): ResponseEvaluation {
  return { verdict, confidence: 0.9, demonstrated: [], missing: [], misconceptions: [], feedback: "" };
}

function at(days: number): string {
  return new Date(Date.parse(START) + days * DAY).toISOString();
}

function canvas(recallResults: LearningCanvas["recallResults"]): LearningCanvas {
  return {
    ...emptyCanvas("c1", START),
    concepts: [
      { id: "k1", label: "Resting potential" },
      { id: "k2", label: "Phase 0" },
    ],
    recallResults,
  };
}

test("retrievability falls with time and rises with stability", () => {
  const last = Date.parse(START);
  const day = (n: number) => retrievabilityAt(last, 5, last + n * DAY);

  assert.equal(day(0), 1, "just retrieved is certain");
  assert.ok(day(1) < day(0));
  assert.ok(day(10) < day(1));
  assert.ok(day(60) < day(10));
  assert.ok(day(60) > 0, "the curve flattens — it never reaches zero");

  // Same elapsed time, more stability, higher retrievability. This is the whole point of the
  // spacing effect and the one property that must never invert.
  assert.ok(retrievabilityAt(last, 20, last + 10 * DAY) > retrievabilityAt(last, 2, last + 10 * DAY));
});

test("🔴 nothing happens while the learner is away — the value is computed from timestamps", () => {
  // Monday's success, read on Friday. No job ran in between; the only inputs are two dates.
  const monday = canvas([
    { cardId: "r1", conceptId: "k1", at: at(0), grade: "good", evaluation: evaluation("understood") },
  ]);

  const sameDay = retentionMap(monday, new Date(Date.parse(START)))[0]!;
  const fourDaysLater = retentionMap(monday, new Date(Date.parse(START) + 4 * DAY))[0]!;

  assert.ok(sameDay.retrievability! > fourDaysLater.retrievability!, "four days of decay, zero compute");
  // Identical canvas both times: nothing was written, nothing was mutated.
  assert.deepEqual(monday.recallResults.length, 1);
});

test("🔴 an objective we have never dated is unknown, not forgotten", () => {
  // Null and zero are different claims. Zero would render as "you will certainly fail this",
  // which we have no basis for saying about material we have never assessed.
  const untested = retentionMap(canvas([]), new Date())[0]!;
  assert.equal(untested.retrievability, null);
  assert.equal(untested.lastRetrievalAt, null);
  assert.equal(untested.stabilityDays, null);
});

test("🔴 undated evidence is excluded rather than backfilled to now", () => {
  // Records written before we captured timestamps are honestly undated. Treating one as "now"
  // would make a months-old success look fresh — the exact error this module exists to avoid.
  const undated = canvas([
    { cardId: "r1", conceptId: "k1", grade: "good", evaluation: evaluation("understood") },
  ]);
  assert.equal(retentionMap(undated, new Date())[0]!.retrievability, null);
});

test("surviving a long gap is worth more than answering immediately", () => {
  const immediate = canvas([
    { cardId: "r1", conceptId: "k1", at: at(0), grade: "good", evaluation: evaluation("understood") },
    { cardId: "r2", conceptId: "k1", at: at(0.001), grade: "good", evaluation: evaluation("understood") },
  ]);
  const spaced = canvas([
    { cardId: "r1", conceptId: "k1", at: at(0), grade: "good", evaluation: evaluation("understood") },
    { cardId: "r2", conceptId: "k1", at: at(4), grade: "good", evaluation: evaluation("understood") },
  ]);

  const a = retentionMap(immediate, new Date(Date.parse(START) + 5 * DAY))[0]!;
  const b = retentionMap(spaced, new Date(Date.parse(START) + 5 * DAY))[0]!;
  assert.ok(b.stabilityDays! > a.stabilityDays!, "you cannot prove durability by answering at once");
});

test("a miss cuts stability but does not erase the history", () => {
  const lapsed = canvas([
    { cardId: "r1", conceptId: "k1", at: at(0), grade: "good", evaluation: evaluation("understood") },
    { cardId: "r2", conceptId: "k1", at: at(3), grade: "good", evaluation: evaluation("understood") },
    { cardId: "r3", conceptId: "k1", at: at(9), grade: "again", evaluation: evaluation("incorrect") },
  ]);
  const view = retentionMap(lapsed, new Date(Date.parse(START) + 10 * DAY))[0]!;
  assert.equal(view.successes, 2);
  assert.equal(view.failures, 1);
  assert.ok(view.stabilityDays! > 0, "relearning is faster than learning — not a reset to nothing");
  assert.ok(view.stabilityDays! < 3, "but the estimate has genuinely come down");
});

test("what needs fresh evidence comes back most-decayed first", () => {
  const mixed: LearningCanvas = {
    ...canvas([
      // Long ago, so well decayed.
      { cardId: "r1", conceptId: "k1", at: at(0), grade: "good", evaluation: evaluation("understood") },
      // Just now.
      { cardId: "r2", conceptId: "k2", at: at(29.9), grade: "good", evaluation: evaluation("understood") },
    ]),
  };
  const due = needsFreshEvidence(mixed, new Date(Date.parse(START) + 30 * DAY));
  assert.equal(due[0]?.objectiveId, "k1", "the most decayed is asked about first");
  assert.ok(!due.some((view) => view.objectiveId === "k2"), "one retrieved moments ago is not due");
});

test("🔴 no elapsed time produces a claim that anything was forgotten", () => {
  // §35. The whole surface of this module is checked, not one function: a century of silence
  // must still produce a number and a null, never a verdict.
  const old = canvas([
    { cardId: "r1", conceptId: "k1", at: at(0), grade: "good", evaluation: evaluation("understood") },
  ]);
  const century = new Date(Date.parse(START) + 36_500 * DAY);

  for (const view of retentionMap(old, century)) {
    assert.equal(typeof view.objectiveId, "string");
    // Every field is a number, a string or null. A boolean `forgotten` or a verdict string is
    // exactly what must never appear here, and would fail this.
    for (const [key, value] of Object.entries(view)) {
      assert.ok(
        value === null || typeof value === "number" || typeof value === "string",
        `${key} must not be a verdict`,
      );
      assert.notEqual(typeof value, "boolean", `${key} must not be a boolean claim about the learner`);
    }
  }

  const due = needsFreshEvidence(old, century);
  assert.equal(due.length, 1);
  assert.ok(due[0]!.retrievability! > 0, "even after a century it is a low probability, never zero");
});

test("the next review date is when it will cross the threshold, and inverts the curve", () => {
  const taught = canvas([
    { cardId: "r1", conceptId: "k1", at: at(0), grade: "good", evaluation: evaluation("understood") },
  ]);
  const view = retentionMap(taught, new Date(Date.parse(START)))[0]!;
  const due = nextReviewAt(view);
  assert.ok(due, "a dated objective has a due date");

  // Round-trip: at exactly that moment, retrievability should sit on the threshold.
  const atDue = retrievabilityAt(Date.parse(view.lastRetrievalAt!), view.stabilityDays!, Date.parse(due!));
  assert.ok(Math.abs(atDue - 0.9) < 0.001, `expected ~0.9 at the due date, got ${atDue}`);

  // Undatable in, undatable out — never a guessed date.
  assert.equal(nextReviewAt({ ...view, lastRetrievalAt: null }), null);
});
