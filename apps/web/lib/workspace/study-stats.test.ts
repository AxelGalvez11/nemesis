import assert from "node:assert/strict";

import type { StudyReview } from "./study-cloud-store";
import { retentionRate, retentionSeries } from "./study-stats";

const reviews: StudyReview[] = [
  { id: "1", cardId: "a", grade: "good", reviewedAt: "2026-07-19T15:00:00.000Z" },
  { id: "2", cardId: "b", grade: "again", reviewedAt: "2026-07-19T16:00:00.000Z" },
  { id: "3", cardId: "c", grade: "easy", reviewedAt: "2026-07-20T15:00:00.000Z" },
];

assert.equal(retentionRate([]), null);
assert.equal(retentionRate(reviews), 67);

const series = retentionSeries(reviews, 3, new Date("2026-07-20T12:00:00.000Z"));
assert.deepEqual(series.map((point) => [point.day, point.retention, point.reviews]), [
  ["2026-07-18", null, 0],
  ["2026-07-19", 50, 2],
  ["2026-07-20", 100, 1],
]);

console.log("study-stats.test.ts OK");
