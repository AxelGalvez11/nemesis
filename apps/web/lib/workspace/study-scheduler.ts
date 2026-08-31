// When a card comes back, and what the answer is worth.
//
// 🔴🔴 THIS IS FSRS NOW, NOT FIXED MULTIPLIERS. What was here until 2026-08-30 multiplied the last
// interval by a constant per grade — again→1 day, hard→x1.2, good→x2.5, easy→x3.5 — which is a
// simplification of SM-2 with the one part of SM-2 that adapts (the per-card ease factor) left out.
// Every card in the collection therefore moved on exactly the same ladder, and nothing a learner
// did could make an easy card go faster or a hard one go slower. The scheduler could not learn.
//
// FSRS models a memory with two numbers instead:
//   • STABILITY  — how many days until recall of this card falls to 90%. This IS the interval.
//   • DIFFICULTY — 1 to 10, how much work this particular card is. Rises on a lapse, falls on easy.
// and a third that is computed rather than stored:
//   • RETRIEVABILITY — the chance you still know it right now, given how long it has been.
//
// 🔴🔴 THE THIRD ONE IS WHY THIS IS BETTER, AND IT IS THE PART SM-2 THROWS AWAY. Getting a card
// right when it was due yesterday is weak evidence; getting the SAME card right when it was due
// three weeks ago is strong evidence, because you held it far past the point the model expected you
// to forget. FSRS reads that gap and grows the interval accordingly. SM-2 multiplies by 2.5 either
// way. That is the single biggest difference a learner will feel.
//
// 🔴 HOW LONG THE LEARNER TOOK TO FLIP THE CARD IS NOT AN INPUT, AND THAT IS NOT AN OVERSIGHT.
// Owner asked directly (2026-08-30) whether the interval should depend on the time to reveal. It
// does not, in Anki or in FSRS: the hesitation is reported by WHICH BUTTON gets pressed, which is
// exactly what Hard means. Raw seconds conflate "I did not know this" with "this card is three
// lines long" and "somebody spoke to me". We record the duration anyway (`study_review_logs
// .duration_ms`) because a signal nobody collected can never be evaluated later, and nothing reads
// it. If it is ever promoted to an input, it happens HERE and in `grade_study_card` together.
//
// 🔴🔴 THIS FILE AND `grade_study_card` MUST AGREE TO THE DECIMAL. Production grading is atomic in
// Postgres; this runs for the signed-out preview lane AND as the optimistic update a learner sees
// before the round trip returns. Two implementations that disagree show a card as due in 6 days and
// then silently correct to 9. `study-scheduler.test.ts` pins the numbers on this side;
// `fsrs-agrees-with-postgres.test.ts` pins that the SQL carries the same weights and the same
// equations. Change one, change both, in the same commit.

export type StudyGrade = "again" | "hard" | "good" | "easy";

/** FSRS speaks in 1-4; the product speaks in words. One mapping, stated once. */
const RATING: Record<StudyGrade, number> = { again: 1, easy: 4, good: 3, hard: 2 };

/**
 * The FSRS-6 default parameters, as published by the algorithm's authors.
 *
 * 🔴🔴 FSRS-6, NOT 4.5, AND THE UPGRADE WAS NOT COSMETIC. We shipped 4.5 (seventeen parameters) on
 * 2026-08-30 and the owner immediately asked whether the defaults were the best ones. They were
 * two versions old. FSRS-6 is what Anki has shipped since 25.07, it is fitted on far more review
 * data, and — the part that matters here — it MODELS SAME-DAY REVIEWS, which is exactly what a
 * learning step is. Under 4.5 the ten-minute press inside a step was scored with the long-term
 * curve, which is not what it is.
 *
 * The three structural changes from 4.5:
 *   • DECAY IS A PARAMETER (w20) rather than a fixed -0.5, so the forgetting curve's shape is
 *     fitted rather than assumed.
 *   • INITIAL DIFFICULTY IS EXPONENTIAL in the grade, not linear.
 *   • THERE IS A SAME-DAY STABILITY FORMULA (w17-w19), used when a card is seen again inside the
 *     day instead of the recall/lapse curves.
 *
 * 🔴 DEFAULTS, NOT FITTED — AND SAYING SO MATTERS. FSRS's real advantage is that these numbers can
 * be re-fitted to one person's own review history, at which point the schedule is theirs rather
 * than the average of everyone's. That needs review volume we do not have yet. Until then these
 * are the population defaults, which are already better than fixed multipliers because the
 * EQUATIONS adapt even when the constants do not.
 *
 * 🔴 THE ORDER IS THE SPEC'S ORDER AND MUST NOT BE TIDIED. Index is meaning here: w[4] is the
 * initial difficulty intercept, w[15] is the hard penalty, w[20] is the decay. Sorting or renaming
 * these breaks the algorithm silently and in a way no type checker can see.
 */
export const FSRS_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, // w0-w3: initial stability for again / hard / good / easy
  6.4133, 0.8334, // w4-w5: initial difficulty, and how steeply the first grade moves it
  3.0194, 0.001, // w6-w7: difficulty step per grade, and mean reversion toward the "easy" anchor
  1.8722, 0.1666, 0.796, // w8-w10: the success curve — gain, stability damping, retrievability lift
  1.4835, 0.0614, 0.2629, 1.6483, // w11-w14: the lapse curve
  0.6014, 1.8729, // w15-w16: the hard penalty and the easy bonus
  0.5425, 0.0912, 0.0658, // w17-w19: the SAME-DAY curve, which is what a learning step lands on
  0.1542, // w20: the decay, learnable in FSRS-6 where 4.5 fixed it at 0.5
] as const;

/**
 * The forgetting curve's shape.
 *
 * 🔴 BOTH ARE DERIVED, NOT PICKED. The decay is w[20] negated; the factor is the value that makes
 * retrievability exactly 0.9 when elapsed days equals stability, which is the DEFINITION of
 * stability. A hand-typed approximation would quietly redefine the unit the algorithm is expressed
 * in. In 4.5 this came out at 19/81; with a fitted decay it is a different number, and computing it
 * rather than typing it is what makes the version change safe.
 */
const DECAY = -FSRS_WEIGHTS[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

/** How likely a learner is to still know a card at the moment it comes back. 0.9 is the Anki/FSRS
 *  default and the one every published parameter set is fitted against. */
export const DESIRED_RETENTION = 0.9;

/** Below this a "stability" is not a memory, it is noise; above it, nobody lives long enough. */
const MIN_STABILITY = 0.1;
const MAX_STABILITY = 36500;

const clampDifficulty = (value: number) => Math.min(10, Math.max(1, value));

/** What one review says about a card, in the terms the equations need. */
export interface SchedulableCard {
  intervalDays: number;
  repetitions: number;
  lapses: number;
  /** Days until recall falls to 90%. 0 on a card that has never been graded under FSRS. */
  stability: number;
  /** 1-10. 0 on a card that has never been graded under FSRS. */
  difficulty: number;
}

export interface StudySchedule {
  /** The REVIEW interval, in days. What the card gets once it is out of the learning steps.
   *  A card sitting in a step still carries this: it is where the card goes when it graduates,
   *  which is exactly what Anki's `card.interval` holds while `card.queue` says learning. */
  intervalDays: number;
  stability: number;
  difficulty: number;
}

/** Where a card's memory starts, from the very first answer. */
export function initialStability(grade: StudyGrade): number {
  return Math.max(MIN_STABILITY, FSRS_WEIGHTS[RATING[grade] - 1]!);
}

/** How hard the card looks after one answer. Easy starts easiest; Again starts hardest.
 *
 *  🔴 EXPONENTIAL IN THE GRADE, which is the FSRS-6 change. 4.5 moved difficulty by a fixed amount
 *  per grade step; the fitted curve says the gap between Good and Easy is far larger than the gap
 *  between Again and Hard, and pressing Easy on a new card now anchors it at the floor. */
export function initialDifficulty(grade: StudyGrade): number {
  return clampDifficulty(FSRS_WEIGHTS[4] - Math.exp(FSRS_WEIGHTS[5] * (RATING[grade] - 1)) + 1);
}

/**
 * The chance the learner still knows this card, `elapsedDays` after the last review.
 *
 * 🔴 THIS IS THE INPUT SM-2 NEVER HAD. A card answered correctly at R=0.95 (barely overdue) earns a
 * small stability gain; the same card answered correctly at R=0.6 (long overdue) earns a large one,
 * because surviving a longer gap is stronger evidence of a stronger memory.
 */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

/** How many days of stability buys `retention` worth of recall. At 0.9 this is exactly stability. */
export function intervalFor(stability: number, retention = DESIRED_RETENTION): number {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

/** Difficulty after a grade: one damped step, then pulled back toward the anchor. */
export function nextDifficulty(difficulty: number, grade: StudyGrade): number {
  const delta = -FSRS_WEIGHTS[6] * (RATING[grade] - 3);
  // 🔴 LINEAR DAMPING, THE FSRS-6 CHANGE: the same press moves an already-hard card less than an
  // easy one, because there is less room left. 4.5 applied the step flat and leaned entirely on the
  // mean reversion to stop it running away.
  const stepped = difficulty + (delta * (10 - difficulty)) / 9;
  // 🔴 MEAN REVERSION TOWARD D0(easy), NOT TOWARD THE MIDDLE. Without it a card that is failed a
  // few times pins at 10 forever and never recovers however well it is later known.
  return clampDifficulty(stepped + FSRS_WEIGHTS[7] * (initialDifficulty("easy") - stepped));
}

/** Stability after the learner remembered it. Grows; grows most when the card was most overdue. */
export function stabilityAfterRecall(difficulty: number, stability: number, recall: number, grade: StudyGrade): number {
  const hard = grade === "hard" ? FSRS_WEIGHTS[15] : 1;
  const easy = grade === "easy" ? FSRS_WEIGHTS[16] : 1;
  const gain =
    Math.exp(FSRS_WEIGHTS[8]) *
    (11 - difficulty) *
    Math.pow(stability, -FSRS_WEIGHTS[9]) *
    (Math.exp(FSRS_WEIGHTS[10] * (1 - recall)) - 1) *
    hard *
    easy;
  return stability * (1 + gain);
}

/**
 * Stability after seeing the card AGAIN INSIDE THE SAME DAY — a learning step, in other words.
 *
 * 🔴🔴 THIS IS THE FORMULA WE DID NOT HAVE, AND IT IS THE REASON THE VERSION MATTERS. FSRS-4.5 had
 * no notion of a same-day review, so a press ten minutes after the last one was scored with the
 * long-term curve at a retrievability of ~1.0. FSRS-6 models it directly, and what it says matches
 * what the Anki manual tells people: repeating a card within the day barely strengthens the memory
 * (a same-day Good comes out at roughly 1.00x) while FAILING one inside the day cuts it hard
 * (roughly 0.34x). So the steps stay honest — they catch a bad Good without inflating the schedule.
 *
 * 🔴 THE FLOOR AT 1 APPLIES ONLY TO PASSES. A same-day pass may never SHRINK the memory; a same-day
 * failure may, and must.
 */
export function stabilitySameDay(stability: number, grade: StudyGrade): number {
  const sinc = Math.exp(FSRS_WEIGHTS[17] * (RATING[grade] - 3 + FSRS_WEIGHTS[18])) * Math.pow(stability, -FSRS_WEIGHTS[19]);
  return stability * (RATING[grade] >= 2 ? Math.max(sinc, 1) : sinc);
}

/** Stability after the learner forgot it. Never larger than what they had: a lapse is not progress. */
export function stabilityAfterLapse(difficulty: number, stability: number, recall: number): number {
  const next =
    FSRS_WEIGHTS[11] *
    Math.pow(difficulty, -FSRS_WEIGHTS[12]) *
    (Math.pow(stability + 1, FSRS_WEIGHTS[13]) - 1) *
    Math.exp(FSRS_WEIGHTS[14] * (1 - recall));
  // 🔴 THE CEILING IS NOT `stability` ANY MORE. FSRS-6 caps a lapse at a fixed FRACTION of what the
  // memory was — `S / e^(w17 * w18)`, about 0.95x — rather than merely refusing to grow it. A
  // forgotten card must always come out weaker than it went in, and 4.5's `min(next, S)` allowed
  // "exactly as strong as before", which a lapse never is.
  return Math.min(next, stability / Math.exp(FSRS_WEIGHTS[17] * FSRS_WEIGHTS[18]));
}

/**
 * Grade one card.
 *
 * `elapsedDays` is the gap since the last review, which is the whole point — pass it. It is ignored
 * on a card's first answer, where there is no gap to read.
 *
 * 🔴 A CARD WITH NO FSRS STATE IS SEEDED, NOT CRASHED. Every card graded before 2026-08-30 has
 * stability 0 and difficulty 0 in the database until the backfill runs, and a card created by an
 * import has them at their defaults. Reading 0 as "brand new" would restart a learner's mature card
 * at one day, so a card that has been reviewed before takes its old interval as its stability —
 * which is what the interval MEANT under the old scheduler, and is the same rule the migration's
 * backfill applies. Both exist because either one alone leaves a hole.
 */
export function scheduleStudyCard(card: SchedulableCard, grade: StudyGrade, elapsedDays = 0): StudySchedule {
  const seen = card.repetitions > 0;
  const stability = card.stability > 0 ? card.stability : seen ? Math.max(MIN_STABILITY, card.intervalDays) : 0;
  const difficulty = card.difficulty > 0 ? card.difficulty : initialDifficulty("good");

  let nextStability: number;
  let nextDiff: number;
  if (!seen || stability <= 0) {
    nextStability = initialStability(grade);
    nextDiff = initialDifficulty(grade);
  } else {
    nextDiff = nextDifficulty(difficulty, grade);
    if (elapsedDays < 1) {
      // 🔴 SAME DAY IS ITS OWN CASE, which is the whole point of being on FSRS-6. A press inside a
      // learning step is not a test of long-term memory and must not be scored as one.
      nextStability = stabilitySameDay(stability, grade);
    } else {
      const recall = retrievability(elapsedDays, stability);
      nextStability =
        grade === "again"
          ? stabilityAfterLapse(nextDiff, stability, recall)
          : stabilityAfterRecall(nextDiff, stability, recall, grade);
    }
  }

  nextStability = Math.min(MAX_STABILITY, Math.max(MIN_STABILITY, nextStability));
  return {
    difficulty: nextDiff,
    // 🔴 AT LEAST ONE DAY, because this is the interval for a card that has LEFT the steps. Sub-day
    // scheduling is the learning steps' job (see `answerStudyCard`), not this function's, and that
    // separation is Anki's: FSRS returns a memory state and a day interval, and the step machine
    // decides whether the card's next appearance uses it or comes back in minutes.
    intervalDays: Math.min(36500, Math.max(1, Math.round(intervalFor(nextStability)))),
    stability: nextStability,
  };
}

// ── Learning steps: the part that answers in MINUTES ──────────────────────────
//
// 🔴🔴🔴 FSRS ALONE IS NOT A SCHEDULER, AND SHIPPING IT ALONE WAS A REAL DEFECT. Owner, 2026-08-30:
// *"the card is not supposed to be disappearing for days. It's supposed to be disappearing for,
// like, a couple minutes… just saying good and it disappears for three days, that's too much."*
// He is right, and reading Anki's own source (rslib/src/scheduler/states/*) settles what was
// missing: Anki runs TWO mechanisms, not one.
//
//   • FSRS produces a MEMORY STATE and a day interval. That is `scheduleStudyCard` above.
//   • LEARNING STEPS decide whether the card's next appearance uses that day interval at all, or
//     comes back in minutes. That is this section.
//
// A card only gets a day interval once it has GRADUATED out of the steps. Before that it walks
// 1 minute, then 10 minutes, inside the sitting. This is why Anki feels like Anki, and it is the
// half we did not have.
//
// 🔴 THE ARCHITECTURE IS ANKI'S, THE CODE IS NOT. Read from `states/learning.rs`, `states/steps.rs`,
// `states/relearning.rs`, `states/review.rs` and `states/normal.rs`:
//
//   1. A card carries a STATE (new / learning / review / relearning) and `remainingSteps`, which
//      counts DOWN. The index into the steps array is `total - remaining`.
//   2. Answering a NEW card behaves exactly like failing a learning card: it starts with
//      `remaining_for_failed()` = the full step count. (`normal.rs` says this in as many words.)
//   3. `good` moves to `steps[index + 1]`; when that is past the end the card GRADUATES.
//   4. `again` resets to `steps[0]` and restores the full remaining count.
//   5. `hard` repeats the current step. On the first step with a next step it uses the AVERAGE of
//      the first two; otherwise 1.5x the current step, capped at one day above it.
//   6. Failing a REVIEW card sends it to relearning at `relearnSteps[0]`, and only that counts as
//      a lapse. Fumbling a card that never graduated is not a lapse, in Anki or here.
//
// 🔴 NO FUZZ, DELIBERATELY. Anki scatters intervals by a few percent so cards stop arriving in the
// same order every day. It is worth having and it is not free to test against: every assertion
// becomes a range, and the two implementations here and in Postgres could then disagree without
// any test noticing. Left out until the schedule itself is trusted, and named here so it is a
// decision rather than an omission.

/** Where a card is in its life. Anki's `CardType`, minus the filtered-deck states we have no
 *  equivalent for. */
export type StudyCardState = "new" | "learning" | "review" | "relearning";

/**
 * The steps, in minutes, and Anki's own defaults.
 *
 * 🔴 THESE ARE THE SHIPPED ANKI DEFAULTS, read from `DeckConfig::default()`: `learn_steps` is
 * `[1.0, 10.0]` and `relearn_steps` is `[10.0]`. They are not a taste, and a learner who has used
 * Anki will recognise the rhythm immediately. Per-deck configuration is the obvious next step and
 * is deliberately not here yet: one collection-wide default that matches Anki beats a settings
 * screen nobody has asked for.
 */
export const LEARNING_STEPS: readonly number[] = [1, 10];
export const RELEARNING_STEPS: readonly number[] = [10];

/**
 * How far ahead a card may be pulled when nothing else is due.
 *
 * 🔴 WITHOUT THIS, A ONE-CARD DECK ENDS AFTER ONE PRESS. Press Good on a new card and it is due in
 * ten minutes; with a strict "due now" filter the screen would say "You're caught up" while the
 * card is plainly unfinished. Anki's answer is the learn-ahead limit (default twenty minutes), and
 * it applies ONLY when there is nothing genuinely due — see `buildReviewQueue`.
 */
export const LEARN_AHEAD_MINUTES = 20;

/** Anki's `get_index`: remaining counts down, so the index counts up. Bounded to the last step. */
function stepIndex(steps: readonly number[], remaining: number): number {
  return Math.min(Math.max(steps.length - remaining, 0), Math.max(steps.length - 1, 0));
}

/** Anki's `hard_delay_secs`, in minutes. Hard repeats the step you are on rather than advancing. */
function hardDelay(steps: readonly number[], remaining: number): number {
  const index = stepIndex(steps, remaining);
  const current = steps[index] ?? 1;
  // On the first step, sit between "again" and "good" instead of repeating the first step exactly —
  // otherwise Hard and Again are the same press.
  if (index === 0 && steps.length >= 2) return (steps[0]! + steps[1]!) / 2;
  return Math.min(current * 1.5, current + 24 * 60);
}

/** Anki's `good_delay_secs`. `null` means there is no next step, so the card graduates. */
function goodDelay(steps: readonly number[], remaining: number): number | null {
  const next = stepIndex(steps, remaining) + 1;
  return next >= steps.length ? null : steps[next]!;
}

export interface AnswerableCard extends SchedulableCard {
  state: StudyCardState;
  /** Steps left before graduating, counting down. Meaningless outside learning/relearning. */
  remainingSteps: number;
}

export interface StudyAnswer {
  state: StudyCardState;
  remainingSteps: number;
  /**
   * Minutes from now, when the card comes back inside the day. `null` means it is scheduled in
   * days and `intervalDays` is what to use.
   *
   * 🔴 THE TWO ARE NOT ALTERNATIVES TO PICK BETWEEN. `intervalDays` is ALWAYS set, because it is
   * the interval waiting for the card when it graduates. `dueInMinutes` says whether the card is
   * taking it yet.
   */
  dueInMinutes: number | null;
  intervalDays: number;
  stability: number;
  difficulty: number;
  repetitions: number;
  lapses: number;
}

/**
 * One press of one grade, all the way through: memory, then steps.
 *
 * This is the whole scheduler. `grade_study_card` mirrors it exactly, and
 * `fsrs-agrees-with-postgres.test.ts` is what keeps the two honest.
 */
export function answerStudyCard(card: AnswerableCard, grade: StudyGrade, elapsedDays = 0): StudyAnswer {
  // 🔴 THE MEMORY UPDATES ON EVERY PRESS, INCLUDING THE ONES INSIDE A STEP — that is what Anki does
  // with FSRS enabled. A ten-minute gap barely moves stability (retrievability is still ~1.0), so
  // walking the steps does not inflate the schedule; it just keeps the model current.
  const memory = scheduleStudyCard(card, grade, elapsedDays);
  const repetitions = card.repetitions + 1;
  const base = { difficulty: memory.difficulty, intervalDays: memory.intervalDays, repetitions, stability: memory.stability };

  /** Leaving the steps: the card takes the day interval FSRS just computed. */
  const graduate = (lapses: number): StudyAnswer => ({ ...base, dueInMinutes: null, lapses, remainingSteps: 0, state: "review" });
  /** Staying in the steps: the day interval is kept but not used yet. */
  const step = (state: StudyCardState, remainingSteps: number, minutes: number, lapses: number): StudyAnswer => ({
    ...base,
    dueInMinutes: minutes,
    lapses,
    remainingSteps,
    state,
  });

  if (card.state === "review") {
    // 🔴 THE ONLY PLACE A LAPSE IS COUNTED. Failing a card that never graduated is not a lapse in
    // Anki and must not be one here, or a learner fumbling new material would look like somebody
    // forgetting things they had learned.
    if (grade !== "again") return graduate(card.lapses);
    const lapses = card.lapses + 1;
    if (RELEARNING_STEPS.length === 0) return graduate(lapses);
    return step("relearning", RELEARNING_STEPS.length, RELEARNING_STEPS[0]!, lapses);
  }

  const relearning = card.state === "relearning";
  const steps = relearning ? RELEARNING_STEPS : LEARNING_STEPS;
  const state: StudyCardState = relearning ? "relearning" : "learning";
  // 🔴 A NEW CARD IS A FAILED LEARNING CARD. `normal.rs` says exactly this, and it is why a brand
  // new card starts at the FULL remaining count rather than at step one of two.
  const remaining = card.state === "new" || card.remainingSteps <= 0 ? steps.length : Math.min(card.remainingSteps, steps.length);

  // Easy always leaves the steps immediately, in every state.
  if (grade === "easy" || steps.length === 0) return graduate(card.lapses);
  if (grade === "again") return step(state, steps.length, steps[0]!, card.lapses);
  if (grade === "hard") return step(state, remaining, hardDelay(steps, remaining), card.lapses);

  const next = goodDelay(steps, remaining);
  if (next === null) return graduate(card.lapses);
  return step(state, remaining - 1, next, card.lapses);
}

/** Where a card lands after a press, as a wall-clock instant. */
export function nextDueAt(answer: StudyAnswer, now: Date): Date {
  const due = new Date(now);
  if (answer.dueInMinutes === null) due.setDate(due.getDate() + answer.intervalDays);
  else due.setTime(due.getTime() + answer.dueInMinutes * 60_000);
  return due;
}

/**
 * What each of the four buttons would actually do, so the buttons can say it.
 *
 * 🔴🔴 THIS IS THE FIX FOR THE COMPLAINT AS MUCH AS THE STEPS ARE. The buttons used to read
 * "1 · soon", "3 · normal" — words that describe a feeling rather than a schedule, so the only way
 * to find out that Good meant three days was to press it and lose the card. Anki prints the real
 * interval above every button and always has. Now so do we.
 */
export function previewAnswers(card: AnswerableCard, elapsedDays = 0): Record<StudyGrade, StudyAnswer> {
  return {
    again: answerStudyCard(card, "again", elapsedDays),
    easy: answerStudyCard(card, "easy", elapsedDays),
    good: answerStudyCard(card, "good", elapsedDays),
    hard: answerStudyCard(card, "hard", elapsedDays),
  };
}

/** "1m", "5.5m", "10m", "4d", "2mo", "1.2y" — Anki's own units, in Anki's own order. */
export function describeDelay(answer: StudyAnswer): string {
  if (answer.dueInMinutes !== null) {
    const minutes = answer.dueInMinutes;
    if (minutes < 60) return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}m`;
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }
  const days = answer.intervalDays;
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(days < 60 ? 1 : 0)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/** Days between two instants, as FSRS counts them: a real number, never negative. */
export function elapsedDaysBetween(from: string | null | undefined, to: Date): number {
  if (!from) return 0;
  const started = new Date(from).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, (to.getTime() - started) / 86_400_000);
}

export function reviewLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}
