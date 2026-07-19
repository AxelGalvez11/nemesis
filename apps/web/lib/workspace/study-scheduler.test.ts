import assert from "node:assert/strict";

import { reviewLevel, scheduleStudyCard } from "./study-scheduler";

assert.deepEqual(scheduleStudyCard({ intervalDays: 0, repetitions: 0, lapses: 0 }, "good"), {
  intervalDays: 1, repetitions: 1, lapses: 0,
});
assert.deepEqual(scheduleStudyCard({ intervalDays: 8, repetitions: 4, lapses: 1 }, "easy"), {
  intervalDays: 28, repetitions: 5, lapses: 1,
});
assert.deepEqual(scheduleStudyCard({ intervalDays: 8, repetitions: 4, lapses: 1 }, "again"), {
  intervalDays: 1, repetitions: 5, lapses: 2,
});
assert.deepEqual([0, 1, 3, 6, 11].map(reviewLevel), [0, 1, 2, 3, 4]);

console.log("study-scheduler.test.ts OK");
