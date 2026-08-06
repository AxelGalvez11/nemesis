// When a graded flashcard comes back.
//
// 🔴 THE BUG THIS EXISTS TO FIX — measured in the owner's own review history,
// not inferred. Across 129 real grades on real decks:
//
//     Again   19 presses   scheduled 1.00 days out on average
//     Good    77 presses   scheduled 1.26 days out
//     Hard    33 presses   scheduled 1.55 days out
//
// Hard sent cards FURTHER AWAY than Good. The buttons were not weak, they were
// inverted, and Again was indistinguishable from Good. A student pressing
// "Again" on something they had just failed was telling the app the card was
// hard and being scheduled as though they had passed it.
//
// The old rule set, in full:
//
//     again  →  1 day, always
//     hard   →  max(1, ceil(max(interval, 1) × 1.2))
//     good   →  new card → 1 day;  else max(2, ceil(interval × 2.5))
//     easy   →  new card → 4 days; else max(4, ceil(interval × 3.5))
//
// On a NEW card — the state a student spends an entire first session in —
// interval is 0, so: again → 1, hard → 2, good → 1, easy → 4. Again and Good
// were byte-identical, and Hard was scheduled LATER than Good. That is the
// whole reported symptom, and it lived exactly where it would be felt most.
//
// Two more things fell out of that table:
//   · `lapses` was incremented on every failure and then read by nothing. The
//     one signal that says "this card keeps beating me" was recorded and
//     discarded.
//   · The smallest expressible interval was ONE DAY, so "Again" could never
//     bring a card back within the sitting. The review dialog papered over this
//     with an in-session retry list that vanished on refresh.
//
// ── Why this needs no migration ─────────────────────────────────────────────
// The obvious reading is that sub-day scheduling requires a schema change,
// because `interval_days` is an integer. It does not. `due_at` is already a
// `timestamptz`; the only reason nothing sub-day could be scheduled is that the
// grading function always called `make_interval(days => …)`.
//
// So the two numbers are separated here, and mean different things:
//   · `dueInMinutes` — when the card actually comes back. Free-grained.
//   · `intervalDays` — the DAYS-SCALE memory of the card, which is the only
//     thing future scheduling multiplies. A relearning card is due in ten
//     minutes while carrying an interval of one day.
//
// ── The rule that replaces it ───────────────────────────────────────────────
// Strict ordering is enforced by CONSTRUCTION rather than hoped for: `good` is
// built as "at least a day beyond hard", `easy` as "at least a day beyond
// good". No combination of interval, ease and lapses can produce a tie, which
// is what the old `max(2, …)` / `max(4, …)` floors did at short intervals
// (base 1 with a damped ease gave hard = 2 and good = 2).

export type StudyGrade = "again" | "hard" | "good" | "easy";

export interface SchedulableCard {
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface StudySchedule {
  intervalDays: number;
  repetitions: number;
  lapses: number;
  /** Minutes from the moment of grading until the card is due again. */
  dueInMinutes: number;
}

export const MINUTES_PER_DAY = 1_440;

/** A failed card comes back inside the sitting. */
export const RELEARN_MINUTES = 10;
/** "Hard" on a card that has not graduated yet: later than a failure, still today. */
export const HARD_LEARNING_MINUTES = 60;
/** Anki's graduating intervals, kept — Good on a new card is one day. */
const GRADUATING_DAYS = 1;
const EASY_GRADUATING_DAYS = 4;

const START_EASE = 2.5;
/** Each lapse permanently damps growth. This is what makes `lapses` mean something. */
const LAPSE_PENALTY = 0.15;
const MIN_EASE = 1.3;
const HARD_MULTIPLIER = 1.2;
const EASY_BONUS = 1.0;

/**
 * How much a card's interval grows on a pass, given how often it has been
 * forgotten. A card with no lapses grows 2.5×; one that has been failed eight
 * times or more grows 1.3× and no less — the floor stops a heavily-lapsed card
 * from being trapped at a one-day interval forever.
 */
export function cardEase(lapses: number): number {
  const failures = Number.isFinite(lapses) && lapses > 0 ? lapses : 0;
  return Math.max(MIN_EASE, START_EASE - LAPSE_PENALTY * failures);
}

/** The three passing intervals, in days, built so each is strictly beyond the last. */
function passingIntervals(card: SchedulableCard): { hard: number; good: number; easy: number } {
  const base = Math.max(Math.floor(card.intervalDays), 1);
  const ease = cardEase(card.lapses);
  const hard = Math.max(1, Math.ceil(base * HARD_MULTIPLIER));
  // 🔴 `hard + 1`, not a fixed floor. A constant floor is what let hard and
  // good collide at short intervals once ease was damped by lapses.
  const good = Math.max(hard + 1, Math.ceil(base * ease));
  const easy = Math.max(good + 1, Math.ceil(base * (ease + EASY_BONUS)));
  return { easy, good, hard };
}

/**
 * Grade a card. Mirrors `grade_study_card` in Postgres exactly — production
 * grading is atomic in the database, and this is the copy the browser preview
 * and the interval hints run on. The two are kept honest by
 * `study-scheduler.test.ts`, which asserts the ordering property both must hold.
 */
export function scheduleStudyCard(card: SchedulableCard, grade: StudyGrade): StudySchedule {
  const learning = card.repetitions === 0;

  if (grade === "again") {
    // Back to learning, due inside the sitting. A lapse is only counted against
    // a card that had actually graduated — fumbling a card you have never
    // successfully recalled is not forgetting it, and Anki does not score it as
    // one. Without that distinction a first session would permanently damp the
    // ease of every card the student found hard on first sight.
    return {
      dueInMinutes: RELEARN_MINUTES,
      intervalDays: 1,
      lapses: learning ? card.lapses : card.lapses + 1,
      repetitions: 0,
    };
  }

  if (learning) {
    // Still climbing. Hard stays inside the sitting; Good and Easy graduate.
    if (grade === "hard") {
      return { dueInMinutes: HARD_LEARNING_MINUTES, intervalDays: 1, lapses: card.lapses, repetitions: 0 };
    }
    const intervalDays = grade === "easy" ? EASY_GRADUATING_DAYS : GRADUATING_DAYS;
    return { dueInMinutes: intervalDays * MINUTES_PER_DAY, intervalDays, lapses: card.lapses, repetitions: 1 };
  }

  const intervals = passingIntervals(card);
  const intervalDays = intervals[grade];
  return {
    dueInMinutes: intervalDays * MINUTES_PER_DAY,
    intervalDays,
    lapses: card.lapses,
    repetitions: card.repetitions + 1,
  };
}

export const STUDY_GRADES: readonly StudyGrade[] = ["again", "hard", "good", "easy"];

/**
 * What each button would do to this card, so the interface can show the real
 * answer instead of a guess.
 *
 * 🔴 The four buttons used to carry hard-coded hints — "1 · soon", "2 · slower",
 * "3 · normal", "4 · longer". Those were the keyboard shortcut numbers dressed
 * up as scheduling information, and while Hard was being scheduled later than
 * Good they actively told the student the opposite of what was happening.
 */
export function predictSchedule(card: SchedulableCard): Record<StudyGrade, StudySchedule> {
  return {
    again: scheduleStudyCard(card, "again"),
    easy: scheduleStudyCard(card, "easy"),
    good: scheduleStudyCard(card, "good"),
    hard: scheduleStudyCard(card, "hard"),
  };
}

/** "10 min" · "1 hr" · "3 days" · "2 mo" — the shortest honest label for a delay. */
export function formatDueIn(minutes: number): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  if (safe < 60) return `${Math.max(1, safe)} min`;
  if (safe < MINUTES_PER_DAY) {
    const hours = Math.round(safe / 60);
    return `${hours} hr`;
  }
  const days = Math.round(safe / MINUTES_PER_DAY);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo`;
  const years = (days / 365).toFixed(days % 365 === 0 ? 0 : 1);
  return `${years} yr`;
}

export function reviewLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}
