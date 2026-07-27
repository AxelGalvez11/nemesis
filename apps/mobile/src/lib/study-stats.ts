// What the Study stats screen shows, computed from BOTH ways a student revises.
//
// The screen used to derive every number from flashcards alone — `attempts` was the
// sum of card repetitions — so a student who revises by taking practice tests saw an
// empty page telling them to go review cards. The test attempts were being written
// to the artifact payload the whole time; nothing read them.
//
// PURE, so the arithmetic is testable without a device. The rules that matter are
// the divide-by-zero guards: a student with no reviews and no attempts must see
// "no data yet", never 0% or NaN%, because 0% reads as "you got everything wrong".
//
// Cards and tests are reported SEPARATELY rather than blended into one number. Card
// retention (did it stick between reviews) and test accuracy (did you pick the right
// option) measure different things, and averaging them would produce a figure that
// means nothing and moves for the wrong reasons.

/** Only the fields these stats need — the screen passes its real rows straight in. */
export interface StatsCard {
  repetitions: number;
  lapses: number;
}

export interface StatsAttempt {
  at: string;
  score: number;
  total: number;
}

export interface StudyStats {
  /** Times a card was shown. */
  cardReviews: number;
  /** …of which were recalled without a lapse, as a percent, or null with no reviews. */
  cardRetention: number | null;
  /** Completed practice-test attempts. */
  testsTaken: number;
  /** Questions answered across every attempt. */
  testQuestions: number;
  /** Mean percent across attempts, or null when none were taken. */
  testAccuracy: number | null;
  /** Best single attempt as a percent, or null. */
  testBest: number | null;
  /** ISO timestamp of the most recent attempt, or null. */
  lastTestAt: string | null;
  /** Every question answered, cards and tests together — the honest "work done" figure. */
  totalAnswered: number;
}

/** A whole-number percent, guarding the empty case rather than reporting 0%. */
function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function computeStudyStats(cards: readonly StatsCard[], attempts: readonly StatsAttempt[]): StudyStats {
  let cardReviews = 0;
  let remembered = 0;
  for (const card of cards) {
    if (card.repetitions <= 0) continue;
    cardReviews += card.repetitions;
    // A lapse is a review that did NOT stick. Clamped because a card edited by hand
    // can carry more lapses than repetitions, and a negative would inflate retention.
    remembered += Math.max(0, card.repetitions - card.lapses);
  }

  // An attempt with total 0 is not a test that was taken — it is a malformed row, and
  // counting it would drag the average toward a score nobody sat.
  const real = attempts.filter((attempt) => attempt.total > 0);
  let score = 0;
  let questions = 0;
  let best: number | null = null;
  let lastTestAt: string | null = null;
  for (const attempt of real) {
    score += attempt.score;
    questions += attempt.total;
    const pct = Math.round((attempt.score / attempt.total) * 100);
    if (best === null || pct > best) best = pct;
    // String compare is correct for ISO-8601 in UTC and avoids a Date parse per row.
    if (lastTestAt === null || attempt.at > lastTestAt) lastTestAt = attempt.at;
  }

  return {
    cardRetention: percent(remembered, cardReviews),
    cardReviews,
    lastTestAt,
    testAccuracy: percent(score, questions),
    testBest: best,
    testQuestions: questions,
    testsTaken: real.length,
    totalAnswered: cardReviews + questions,
  };
}

/** "3 days ago" / "today" for the last-test line. `now` is injected so it is testable. */
export function relativeDay(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  return `${Math.floor(days / 7)} weeks ago`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
