import assert from "node:assert/strict";
import test from "node:test";

import {
  answerStudyCard,
  describeDelay,
  FSRS_WEIGHTS,
  LEARNING_STEPS,
  previewAnswers,
  RELEARNING_STEPS,
  reviewLevel,
  scheduleStudyCard,
  type AnswerableCard,
} from "./study-scheduler";

/** A card that has never been graded. */
const FRESH = { difficulty: 0, intervalDays: 0, lapses: 0, repetitions: 0, stability: 0 };
const NEW_CARD: AnswerableCard = { ...FRESH, remainingSteps: 0, state: "new" };
/** A card with four reviews behind it, currently on an eight-day interval. */
/** 🔴 2.118 IS FSRS-6's NEUTRAL DIFFICULTY, D0(good), and it is NOT 4.5's 5.1618. The two versions
 *  put the same card at very different points on the difficulty scale, so a fixture carried over
 *  unchanged would be testing an unusually hard card while claiming to test an average one. */
const MATURE = { difficulty: 2.118103970459015, intervalDays: 8, lapses: 1, repetitions: 4, stability: 8 };

test("a first answer seeds the memory from the grade alone", () => {
  // The published FSRS-4.5 initial stabilities, straight through: again 0.49, hard 1.40, good 3.71,
  // easy 13.82 days. Nothing here reads an interval, because there is not one yet.
  assert.deepEqual(scheduleStudyCard(FRESH, "again"), { difficulty: 6.4133, intervalDays: 1, stability: FSRS_WEIGHTS[0] });
  assert.deepEqual(scheduleStudyCard(FRESH, "good"), { difficulty: 2.118103970459015, intervalDays: 2, stability: FSRS_WEIGHTS[2] });
  // 🔴 EASY CLAMPS THE DIFFICULTY TO THE FLOOR. FSRS-6's initial difficulty is exponential in the
  // grade, so D0(easy) computes below 1 and is clamped — a card you found easy on sight is as easy
  // as the scale can express.
  assert.deepEqual(scheduleStudyCard(FRESH, "easy"), { difficulty: 1, intervalDays: 8, stability: FSRS_WEIGHTS[3] });
});

test("🔴 the graduating interval is the published parameter, not a taste", () => {
  // The old fixed-multiplier scheduler gave every new card exactly one day whatever was pressed.
  // FSRS-4.5 said four days; FSRS-6, fitted on far more data, says two. Called out on its own line
  // because it is the number a learner notices first, and because it moved between versions.
  assert.equal(scheduleStudyCard(FRESH, "good").intervalDays, 2);
  assert.equal(scheduleStudyCard(FRESH, "easy").intervalDays, 8);
});

test("🔴🔴 the same answer on the same card is worth more when the card was overdue", () => {
  // THIS IS THE WHOLE REASON FSRS BEATS SM-2, and the fixed multipliers could not express it:
  // remembering something you were due to forget is stronger evidence than remembering it on time.
  const early = scheduleStudyCard(MATURE, "good", 4).intervalDays;
  const onTime = scheduleStudyCard(MATURE, "good", 8).intervalDays;
  const late = scheduleStudyCard(MATURE, "good", 30).intervalDays;
  assert.equal(early, 24);
  assert.equal(onTime, 35);
  assert.equal(late, 68);
  assert.ok(early < onTime && onTime < late, "the gap since the last review stopped being an input");
});

test("the four grades stay ordered, and a lapse never lengthens a memory", () => {
  const by = (grade: Parameters<typeof scheduleStudyCard>[1]) => scheduleStudyCard(MATURE, grade, 8);
  assert.deepEqual(
    [by("again").intervalDays, by("hard").intervalDays, by("good").intervalDays, by("easy").intervalDays],
    [1, 19, 35, 65],
  );
  assert.ok(by("again").stability <= MATURE.stability, "forgetting a card made its memory stronger");
});

test("difficulty rises on a lapse, falls on easy, and never leaves 1-10", () => {
  assert.ok(scheduleStudyCard(MATURE, "again", 8).difficulty > MATURE.difficulty);
  assert.ok(scheduleStudyCard(MATURE, "easy", 8).difficulty < MATURE.difficulty);
  // 🔴 THROUGH `answerStudyCard`, NOT THE MEMORY STEP ALONE. `scheduleStudyCard` no longer returns
  // `repetitions`, so spreading its result would leave the card looking permanently new and every
  // round would re-seed from scratch — a loop that tests nothing.
  let card: AnswerableCard = { ...NEW_CARD };
  for (let round = 0; round < 12; round += 1) card = { ...card, ...answerStudyCard(card, "again", card.intervalDays) };
  // 🔴 IT APPROACHES 10, IT DOES NOT LAND ON IT, and that is the linear damping rather than a
  // rounding artefact: each press moves difficulty by a share of the room LEFT, so the twelfth
  // failure moves it a hundredth of what the first did. Under 4.5's flat step it pinned at exactly
  // 10 and stayed there. Asserting equality here would be pinning the old algorithm's behaviour.
  assert.ok(card.difficulty > 9.9 && card.difficulty <= 10, `difficulty escaped its ceiling: ${card.difficulty}`);
  assert.ok(card.intervalDays >= 1, "a card became due in zero days and would never leave the queue");
});

test("🔴 a card from before FSRS keeps its place instead of restarting", () => {
  // Every card graded before 2026-08-30 has stability 0 and difficulty 0 until the migration's
  // backfill reaches it. Reading that as "brand new" would throw a learner's mature card back to
  // one day. Its old interval IS what the old scheduler meant by how long the memory lasts, so it
  // becomes the seed — the same rule the SQL backfill applies, which is why the two agree exactly.
  const legacy = { difficulty: 0, intervalDays: 8, lapses: 1, repetitions: 4, stability: 0 };
  assert.deepEqual(scheduleStudyCard(legacy, "good", 8), scheduleStudyCard(MATURE, "good", 8));
});

test("nothing is scheduled beyond a hundred years, or sooner than tomorrow", () => {
  let card: AnswerableCard = { ...NEW_CARD };
  for (let round = 0; round < 200; round += 1) card = { ...card, ...answerStudyCard(card, "easy", card.intervalDays) };
  assert.ok(card.intervalDays <= 36500, "an interval ran past the cap");
  assert.equal(scheduleStudyCard(FRESH, "again").intervalDays, 1);
});

test("reviewLevel buckets a day's review count for the heatmap", () => {
  assert.deepEqual([0, 1, 3, 6, 11].map(reviewLevel), [0, 1, 2, 3, 4]);
});


// ── The learning steps ────────────────────────────────────────────────────────
// The architecture is Anki's, read from rslib/src/scheduler/states/*. These pin the behaviour a
// learner actually feels, which is the half FSRS on its own does not provide.

const REVIEW_CARD: AnswerableCard = { ...MATURE, remainingSteps: 0, state: "review" };
const labels = (card: AnswerableCard, elapsed = 0) => {
  const preview = previewAnswers(card, elapsed);
  return { again: describeDelay(preview.again), easy: describeDelay(preview.easy), good: describeDelay(preview.good), hard: describeDelay(preview.hard) };
};

test("🔴🔴🔴 pressing Good on a new card costs ten minutes, not four days", () => {
  // THE WHOLE REASON THESE EXIST. Owner, 2026-08-30: *"just saying good and it disappears for,
  // like, three days. That's too much."* FSRS alone had no answer shorter than tomorrow, because a
  // day interval is all it produces. Anki's learning steps are what make the first pass feel like
  // studying rather than filing.
  const first = answerStudyCard(NEW_CARD, "good");
  assert.equal(first.state, "learning");
  assert.equal(first.dueInMinutes, 10, "a new card answered Good left the sitting");
  assert.deepEqual(labels(NEW_CARD), { again: "1m", easy: "8d", good: "10m", hard: "5.5m" });
});

test("a new card graduates on the SECOND Good, and only then takes days", () => {
  const stepped: AnswerableCard = { ...NEW_CARD, ...answerStudyCard(NEW_CARD, "good") };
  assert.equal(stepped.remainingSteps, LEARNING_STEPS.length - 1);
  const graduated = answerStudyCard(stepped, "good", 10 / 1440);
  assert.equal(graduated.state, "review");
  assert.equal(graduated.dueInMinutes, null, "a graduated card is still being scheduled in minutes");
  assert.equal(graduated.intervalDays, 2);
});

test("🔴 a new card is treated as a FAILED learning card, so it starts at the full step count", () => {
  // `normal.rs` says this outright, and it is why the first Good goes to the SECOND step (10m)
  // rather than repeating the first (1m).
  assert.equal(answerStudyCard(NEW_CARD, "again").remainingSteps, LEARNING_STEPS.length);
  assert.equal(answerStudyCard(NEW_CARD, "again").dueInMinutes, LEARNING_STEPS[0]);
});

test("Again resets to the first step; Hard repeats the step you are on", () => {
  const stepped: AnswerableCard = { ...NEW_CARD, ...answerStudyCard(NEW_CARD, "good") };
  const failed = answerStudyCard(stepped, "again", 10 / 1440);
  assert.equal(failed.dueInMinutes, 1, "Again did not go back to the first step");
  assert.equal(failed.remainingSteps, LEARNING_STEPS.length);

  // On the first step Hard sits between Again and Good — otherwise Hard and Again are one button.
  assert.equal(answerStudyCard(NEW_CARD, "hard").dueInMinutes, 5.5);
  // Further in it is 1.5x the current step, capped a day above it.
  assert.equal(answerStudyCard(stepped, "hard", 10 / 1440).dueInMinutes, 15);
});

test("Easy leaves the steps immediately, from any of them", () => {
  const stepped: AnswerableCard = { ...NEW_CARD, ...answerStudyCard(NEW_CARD, "good") };
  for (const card of [NEW_CARD, stepped]) {
    const easy = answerStudyCard(card, "easy", 0);
    assert.equal(easy.state, "review");
    assert.equal(easy.dueInMinutes, null);
  }
});

test("🔴🔴 failing a graduated card sends it to relearning in ten minutes, not away for days", () => {
  const lapsed = answerStudyCard(REVIEW_CARD, "again", 8);
  assert.equal(lapsed.state, "relearning");
  assert.equal(lapsed.dueInMinutes, RELEARNING_STEPS[0]);
  assert.equal(lapsed.lapses, REVIEW_CARD.lapses + 1);
  // The day interval it will take when relearning finishes is carried, not applied yet.
  assert.equal(lapsed.intervalDays, 1);

  const relearning: AnswerableCard = { ...REVIEW_CARD, ...lapsed };
  const recovered = answerStudyCard(relearning, "good", 10 / 1440);
  assert.equal(recovered.state, "review");
  assert.equal(recovered.dueInMinutes, null);
});

test("🔴 fumbling a card that never graduated is NOT a lapse", () => {
  // Anki counts a lapse only on a review card. Counting learning failures would make a learner
  // struggling with new material look like somebody forgetting things they had already learned —
  // and lapses feed the leech threshold and the difficulty curve.
  assert.equal(answerStudyCard(NEW_CARD, "again").lapses, 0);
  const stepped: AnswerableCard = { ...NEW_CARD, ...answerStudyCard(NEW_CARD, "good") };
  assert.equal(answerStudyCard(stepped, "again", 0).lapses, 0);
  assert.equal(answerStudyCard(REVIEW_CARD, "again", 8).lapses, 2);
});

test("a graduated card keeps being scheduled in days", () => {
  assert.deepEqual(labels(REVIEW_CARD, 8), { again: "10m", easy: "2mo", good: "1.2mo", hard: "19d" });
});

test("🔴🔴 a second look inside the same day is scored as a same-day review, not a long-term one", () => {
  // THE REASON WE ARE ON FSRS-6 AT ALL. 4.5 had no same-day curve, so the press ten minutes into a
  // learning step was scored against the long-term forgetting curve — a test of memory the learner
  // had not had time to fail.
  //
  // What the fitted curve says is exactly what the Anki manual tells people: repeating a card
  // inside the day does NOT strengthen it (Good comes out at 1.00x), while failing one inside the
  // day cuts it hard. That is what makes a second learning step worth having: it is a DETECTOR for
  // a dishonest Good, not a way to make the memory stick faster.
  const seeded = { ...FRESH, ...scheduleStudyCard(FRESH, "good"), repetitions: 1 };
  const sameDayGood = scheduleStudyCard(seeded, "good", 10 / 1440);
  assert.equal(sameDayGood.stability, seeded.stability, "a same-day pass inflated the schedule");

  const sameDayAgain = scheduleStudyCard(seeded, "again", 10 / 1440);
  assert.ok(sameDayAgain.stability < seeded.stability * 0.4, "a caught bad Good cost almost nothing");
});

test("🔴 a lapse comes out strictly weaker than it went in, not merely no stronger", () => {
  // FSRS-6 caps a lapse at a FRACTION of the old stability. 4.5 used `min(next, stability)`, which
  // permitted "exactly as strong as before" — and a card you have just forgotten never is.
  const lapsed = scheduleStudyCard(MATURE, "again", 8);
  assert.ok(lapsed.stability < MATURE.stability, "forgetting a card left its memory intact");
});

test("every press advances the review count, including the ones inside a step", () => {
  // Anki logs every answer; the steps are reviews, not rehearsals.
  assert.equal(answerStudyCard(NEW_CARD, "good").repetitions, 1);
  assert.equal(answerStudyCard(REVIEW_CARD, "hard", 8).repetitions, 5);
});

test("the delay reads the way Anki writes it", () => {
  assert.equal(describeDelay({ dueInMinutes: 1 } as never), "1m");
  assert.equal(describeDelay({ dueInMinutes: 5.5 } as never), "5.5m");
  assert.equal(describeDelay({ dueInMinutes: 90 } as never), "1.5h");
  assert.equal(describeDelay({ dueInMinutes: null, intervalDays: 4 } as never), "4d");
  assert.equal(describeDelay({ dueInMinutes: null, intervalDays: 45 } as never), "1.5mo");
  assert.equal(describeDelay({ dueInMinutes: null, intervalDays: 400 } as never), "1.1y");
});
