import assert from "node:assert/strict";
import test from "node:test";

import { testPerformance } from "./study-stats";

const sat = (title: string, score: number, total: number, at: string) =>
  ({ attempts: [{ at, missed: [], score, total }], title });

test("test performance averages every attempt, newest first", () => {
  const result = testPerformance([
    sat("Cardio unit 1", 8, 10, "2026-07-20T10:00:00Z"),
    sat("Renal unit 2", 6, 10, "2026-07-25T10:00:00Z"),
  ]);

  assert.equal(result.averagePercent, 70);
  assert.equal(result.testsSat, 2);
  assert.equal(result.sittings[0]?.title, "Renal unit 2", "most recent sitting leads");
});

test("a retake counts as its own data point", () => {
  const result = testPerformance([
    { attempts: [{ at: "2026-07-20T10:00:00Z", missed: [], score: 4, total: 10 }, { at: "2026-07-26T10:00:00Z", missed: [], score: 9, total: 10 }], title: "Cardio" },
  ]);

  assert.equal(result.sittings.length, 2, "both attempts are visible, not just the best");
  assert.equal(result.testsSat, 1, "but it is still one test");
  assert.equal(result.averagePercent, 65);
});

// A created-but-never-sat test must not dilute the average with a phantom zero.
test("a test that was never sat contributes nothing", () => {
  const result = testPerformance([{ attempts: [], title: "Untouched" }]);
  assert.equal(result.averagePercent, null);
  assert.equal(result.testsSat, 0);
});

test("a zero-question test is skipped rather than divided by", () => {
  const result = testPerformance([sat("Empty", 0, 0, "2026-07-20T10:00:00Z")]);
  assert.equal(result.averagePercent, null);
  assert.equal(result.sittings.length, 0);
});
