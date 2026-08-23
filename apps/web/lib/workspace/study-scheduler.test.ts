import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cardEase,
  formatDueIn,
  MINUTES_PER_DAY,
  predictSchedule,
  reviewLevel,
  scheduleStudyCard,
  STUDY_GRADES,
  type SchedulableCard,
  type StudyGrade,
} from "./study-scheduler";

// ── The incident, kept as data ──────────────────────────────────────────────
//
// Owner's real review history before the fix, 129 grades on real decks:
//
//     Again   19 presses   avg interval 1.00 days
//     Good    77 presses   avg interval 1.26 days
//     Hard    33 presses   avg interval 1.55 days
//
// Hard scheduled cards further out than Good. On a new card the old rules gave
// again → 1 day, hard → 2, good → 1, easy → 4: Again and Good identical, Hard
// the longest of the three. Every ordering test below fails against that code.

const NEW_CARD: SchedulableCard = { intervalDays: 0, lapses: 0, repetitions: 0 };
const REVIEW_CARD: SchedulableCard = { intervalDays: 10, lapses: 0, repetitions: 4 };
const LAPSED_CARD: SchedulableCard = { intervalDays: 10, lapses: 6, repetitions: 9 };
/** What a card looks like straight after "Again" — repetitions back to 0. */
const RELEARNING_CARD: SchedulableCard = { intervalDays: 1, lapses: 3, repetitions: 0 };

// ── The regression ──────────────────────────────────────────────────────────

test("on a new card the four buttons are strictly ordered", () => {
  // The exact state the owner spent a first session in, and the exact state the
  // old rules inverted: they returned again 1 day, hard 2 days, good 1 day.
  const p = predictSchedule(NEW_CARD);

  assert.ok(p.again.dueInMinutes < p.hard.dueInMinutes, `again ${p.again.dueInMinutes} !< hard ${p.hard.dueInMinutes}`);
  assert.ok(p.hard.dueInMinutes < p.good.dueInMinutes, `hard ${p.hard.dueInMinutes} !< good ${p.good.dueInMinutes}`);
  assert.ok(p.good.dueInMinutes < p.easy.dueInMinutes, `good ${p.good.dueInMinutes} !< easy ${p.easy.dueInMinutes}`);
});

test("no card in any reachable state can produce a tie or an inversion", () => {
  // The property, swept rather than sampled. The old code's fixed floors
  // (max(2, …) and max(4, …)) collided at short intervals once ease was damped
  // by lapses — base 1 with six lapses gave hard = 2 and good = 2.
  for (const intervalDays of [0, 1, 2, 3, 5, 8, 13, 21, 60, 180, 365]) {
    for (const repetitions of [0, 1, 2, 5, 20]) {
      for (const lapses of [0, 1, 3, 6, 12, 40]) {
        const p = predictSchedule({ intervalDays, lapses, repetitions });
        const order = STUDY_GRADES.map((g) => p[g].dueInMinutes);
        const sorted = [...order].sort((a, b) => a - b);
        assert.deepEqual(order, sorted, `not ascending at ${intervalDays}d/${repetitions}r/${lapses}l: ${order.join(",")}`);
        assert.equal(new Set(order).size, 4, `tie at ${intervalDays}d/${repetitions}r/${lapses}l: ${order.join(",")}`);
      }
    }
  }
});

// ── A controlled clock: the offsets become real due dates ───────────────────

test("graded against a fixed clock, the four due dates land in order", () => {
  const now = new Date("2026-08-06T14:00:00.000Z");
  const dueAt = (grade: StudyGrade, card: SchedulableCard) =>
    new Date(now.getTime() + scheduleStudyCard(card, grade).dueInMinutes * 60_000);

  assert.equal(dueAt("again", NEW_CARD).toISOString(), "2026-08-06T14:10:00.000Z");
  assert.equal(dueAt("hard", NEW_CARD).toISOString(), "2026-08-06T15:00:00.000Z");
  assert.equal(dueAt("good", NEW_CARD).toISOString(), "2026-08-07T14:00:00.000Z");
  assert.equal(dueAt("easy", NEW_CARD).toISOString(), "2026-08-10T14:00:00.000Z");
});

test("a failed card comes back inside the sitting, not tomorrow", () => {
  // The old rules gave "again" one day, so a card you had just failed could not
  // be seen again until the next calendar day. The review dialog hid that with
  // an in-session retry list that vanished on refresh.
  for (const card of [NEW_CARD, REVIEW_CARD, LAPSED_CARD, RELEARNING_CARD]) {
    assert.ok(scheduleStudyCard(card, "again").dueInMinutes < MINUTES_PER_DAY);
  }
});

// ── Each state, each grade ──────────────────────────────────────────────────

test("new: Good graduates at one day, Easy at four", () => {
  assert.deepEqual(scheduleStudyCard(NEW_CARD, "good"), {
    dueInMinutes: MINUTES_PER_DAY, intervalDays: 1, lapses: 0, repetitions: 1,
  });
  assert.deepEqual(scheduleStudyCard(NEW_CARD, "easy"), {
    dueInMinutes: 4 * MINUTES_PER_DAY, intervalDays: 4, lapses: 0, repetitions: 1,
  });
});

test("learning: Hard stays in the sitting and does not graduate the card", () => {
  const result = scheduleStudyCard(NEW_CARD, "hard");
  assert.equal(result.dueInMinutes, 60);
  assert.equal(result.repetitions, 0, "Hard must not graduate a card that is still being learned");
});

test("review: a graduated card grows by its ease", () => {
  const p = predictSchedule(REVIEW_CARD);
  assert.equal(p.hard.intervalDays, 12); // ceil(10 × 1.2)
  assert.equal(p.good.intervalDays, 25); // ceil(10 × 2.5)
  assert.equal(p.easy.intervalDays, 35); // ceil(10 × 3.5)
});

test("relearning: a card that just failed climbs again from one day", () => {
  const failed = scheduleStudyCard(REVIEW_CARD, "again");
  assert.equal(failed.repetitions, 0, "a failed card returns to learning");
  assert.equal(failed.intervalDays, 1);

  // …and the next pass graduates it, rather than resuming its old 25-day stride.
  const recovered = scheduleStudyCard({ ...REVIEW_CARD, ...failed }, "good");
  assert.equal(recovered.intervalDays, 1);
  assert.equal(recovered.repetitions, 1);
});

// ── Lapses stopped being dead data ──────────────────────────────────────────

test("a lapse is counted against a graduated card but not against a new one", () => {
  // Failing a card you have never successfully recalled is not forgetting it.
  // Counting it would damp the ease of every card a student found hard on sight.
  assert.equal(scheduleStudyCard(REVIEW_CARD, "again").lapses, 1);
  assert.equal(scheduleStudyCard(NEW_CARD, "again").lapses, 0);
});

test("every recorded lapse shortens the next interval", () => {
  // Before this, `lapses` was incremented on every failure and read by nothing.
  const intervals = [0, 2, 4, 8].map(
    (lapses) => scheduleStudyCard({ intervalDays: 20, lapses, repetitions: 6 }, "good").intervalDays,
  );
  const strictlyShrinking = intervals.every((value, i) => i === 0 || value < (intervals[i - 1] ?? Infinity));
  assert.ok(strictlyShrinking, `lapses did not damp growth: ${intervals.join(" → ")}`);
});

test("ease never falls below the floor, so a much-failed card still escapes", () => {
  assert.equal(cardEase(0), 2.5);
  assert.equal(cardEase(100), 1.3);
  assert.ok(scheduleStudyCard({ intervalDays: 30, lapses: 100, repetitions: 50 }, "good").intervalDays > 30);
});

// ── What the buttons are allowed to claim ───────────────────────────────────

test("the interval label is readable at every scale", () => {
  assert.equal(formatDueIn(10), "10 min");
  assert.equal(formatDueIn(60), "1 hr");
  assert.equal(formatDueIn(MINUTES_PER_DAY), "1 day");
  assert.equal(formatDueIn(12 * MINUTES_PER_DAY), "12 days");
  assert.equal(formatDueIn(90 * MINUTES_PER_DAY), "3 mo");
});

// ── The two schedulers must not drift ───────────────────────────────────────

test("the Postgres function carries the same constants as this module", () => {
  // 🔴 Production grading happens in `grade_study_card`, NOT here — this module
  // is the mirror the preview and the button hints run on. Nothing else checks
  // that they agree, and a silent divergence would show the student one
  // interval and schedule another.
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/20260806160000_study_scheduler_ordering.sql", import.meta.url),
    "utf8",
  );
  for (const marker of [
    "v_due_minutes := 10;",              // RELEARN_MINUTES
    "v_due_minutes := 60;",              // HARD_LEARNING_MINUTES
    "greatest(1.3, 2.5 - 0.15",          // ease, damped by lapses
    "greatest(v_hard + 1,",              // good is built beyond hard
    "greatest(v_good + 1,",              // easy is built beyond good
    "make_interval(mins =>",             // sub-day scheduling at all
  ]) {
    assert.ok(sql.includes(marker), `grade_study_card no longer contains: ${marker}`);
  }
});

test("reviewLevel buckets unchanged", () => {
  assert.deepEqual([0, 1, 3, 6, 11].map(reviewLevel), [0, 1, 2, 3, 4]);
});
