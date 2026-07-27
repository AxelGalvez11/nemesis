import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { computeStudyStats, relativeDay } from "./study-stats.ts";

const card = (repetitions: number, lapses = 0) => ({ lapses, repetitions });
const attempt = (score: number, total: number, at = "2026-07-20T10:00:00.000Z") => ({ at, score, total });

Deno.test("a student who ONLY takes tests is no longer invisible", () => {
  // The whole point: this used to report nothing at all, because every number came
  // from flashcards and this student has none.
  const s = computeStudyStats([], [attempt(8, 10), attempt(9, 10)]);
  assertEquals(s.testsTaken, 2);
  assertEquals(s.testQuestions, 20);
  assertEquals(s.testAccuracy, 85);
  assertEquals(s.testBest, 90);
  assertEquals(s.totalAnswered, 20);
});

Deno.test("a student who ONLY reviews cards still reads the same as before", () => {
  const s = computeStudyStats([card(4, 1), card(2, 0)], []);
  assertEquals(s.cardReviews, 6);
  assertEquals(s.cardRetention, 83); // (3 + 2) / 6
  assertEquals(s.testsTaken, 0);
  assertEquals(s.testAccuracy, null);
});

Deno.test("empty means 'no data yet', NOT 0% — 0% reads as 'you got everything wrong'", () => {
  const s = computeStudyStats([], []);
  assertEquals(s.cardRetention, null);
  assertEquals(s.testAccuracy, null);
  assertEquals(s.testBest, null);
  assertEquals(s.lastTestAt, null);
  assertEquals(s.totalAnswered, 0);
});

Deno.test("an unreviewed card contributes nothing, and cannot divide by zero", () => {
  const s = computeStudyStats([card(0), card(0)], []);
  assertEquals(s.cardReviews, 0);
  assertEquals(s.cardRetention, null);
});

Deno.test("more lapses than repetitions cannot push retention above 100", () => {
  // A hand-edited card can carry this; unclamped it would inflate the figure.
  const s = computeStudyStats([card(2, 5)], []);
  assertEquals(s.cardRetention, 0);
});

Deno.test("a malformed zero-question attempt is not a test that was taken", () => {
  const s = computeStudyStats([], [attempt(0, 0), attempt(5, 10)]);
  assertEquals(s.testsTaken, 1);
  assertEquals(s.testAccuracy, 50);
});

Deno.test("the most recent attempt wins regardless of array order", () => {
  const s = computeStudyStats([], [
    attempt(5, 10, "2026-07-01T09:00:00.000Z"),
    attempt(6, 10, "2026-07-25T09:00:00.000Z"),
    attempt(7, 10, "2026-07-10T09:00:00.000Z"),
  ]);
  assertEquals(s.lastTestAt, "2026-07-25T09:00:00.000Z");
});

Deno.test("cards and tests are counted together for work done, but never averaged", () => {
  const s = computeStudyStats([card(4, 1)], [attempt(9, 10)]);
  assertEquals(s.totalAnswered, 14);
  assertEquals(s.cardRetention, 75);
  assertEquals(s.testAccuracy, 90); // kept separate, not blended into one number
});

Deno.test("relativeDay reads like a person wrote it", () => {
  const now = new Date(2026, 6, 27, 12, 0, 0);
  assertEquals(relativeDay(new Date(2026, 6, 27, 8).toISOString(), now), "today");
  assertEquals(relativeDay(new Date(2026, 6, 26, 8).toISOString(), now), "yesterday");
  assertEquals(relativeDay(new Date(2026, 6, 24, 8).toISOString(), now), "3 days ago");
  assertEquals(relativeDay(new Date(2026, 6, 20, 8).toISOString(), now), "last week");
  assertEquals(relativeDay(new Date(2026, 6, 6, 8).toISOString(), now), "3 weeks ago");
  assertEquals(relativeDay("not a date", now), "");
});
