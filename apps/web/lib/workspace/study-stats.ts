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
