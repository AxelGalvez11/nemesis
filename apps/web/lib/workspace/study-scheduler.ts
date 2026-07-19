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
}

/** Browser-preview mirror of grade_study_card. Production grading is atomic in Postgres. */
export function scheduleStudyCard(card: SchedulableCard, grade: StudyGrade): StudySchedule {
  let intervalDays: number;
  if (grade === "again") intervalDays = 1;
  else if (grade === "hard") intervalDays = Math.max(1, Math.ceil(Math.max(card.intervalDays, 1) * 1.2));
  else if (grade === "good") intervalDays = card.repetitions === 0 ? 1 : Math.max(2, Math.ceil(card.intervalDays * 2.5));
  else intervalDays = card.repetitions === 0 ? 4 : Math.max(4, Math.ceil(card.intervalDays * 3.5));
  return {
    intervalDays,
    repetitions: card.repetitions + 1,
    lapses: card.lapses + (grade === "again" ? 1 : 0),
  };
}

export function reviewLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}
