import type { TestAttempt } from "./study-artifact-content";
import type { StudyReview } from "./study-cloud-store";

export interface RetentionPoint {
  day: string;
  label: string;
  retention: number | null;
  reviews: number;
}

export function retentionRate(reviews: Pick<StudyReview, "grade">[]): number | null {
  if (reviews.length === 0) return null;
  return Math.round((reviews.filter((review) => review.grade !== "again").length / reviews.length) * 100);
}

export function retentionSeries(reviews: StudyReview[], days = 30, now = new Date()): RetentionPoint[] {
  const byDay = new Map<string, StudyReview[]>();
  for (const review of reviews) {
    const day = review.reviewedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), review]);
  }
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const day = date.toISOString().slice(0, 10);
    const daily = byDay.get(day) ?? [];
    return {
      day,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      retention: retentionRate(daily),
      reviews: daily.length,
    };
  });
}

/** One test the student has actually sat, with every attempt on it. */
export interface AttemptedTest {
  title: string;
  attempts: readonly TestAttempt[];
}

export interface TestSitting {
  at: string;
  title: string;
  percent: number;
  score: number;
  total: number;
}

export interface TestPerformance {
  sittings: TestSitting[];
  /** Mean percentage across every attempt, or null when nothing has been sat. */
  averagePercent: number | null;
  /** Distinct tests attempted at least once — not tests merely created. */
  testsSat: number;
}

/**
 * Practice-test performance, to sit alongside flashcard retention.
 *
 * Attempts were already being recorded on the artifact row; nothing read them,
 * so the Stats page reflected only card reviews and a student who revised by
 * taking tests saw an empty page. Scored per attempt rather than per test so a
 * retake counts as its own data point — that is the trend worth seeing.
 *
 * `total` of zero is skipped rather than divided by.
 */
export function testPerformance(tests: readonly AttemptedTest[], limit = 10): TestPerformance {
  const sittings: TestSitting[] = [];
  const satTitles = new Set<string>();

  for (const test of tests) {
    for (const attempt of test.attempts) {
      if (!Number.isFinite(attempt.total) || attempt.total <= 0) continue;
      const percent = Math.round((attempt.score / attempt.total) * 100);
      sittings.push({ at: attempt.at, percent, score: attempt.score, title: test.title, total: attempt.total });
      satTitles.add(test.title);
    }
  }

  sittings.sort((a, b) => b.at.localeCompare(a.at));
  const averagePercent = sittings.length
    ? Math.round(sittings.reduce((sum, sitting) => sum + sitting.percent, 0) / sittings.length)
    : null;

  return { averagePercent, sittings: sittings.slice(0, limit), testsSat: satTitles.size };
}
