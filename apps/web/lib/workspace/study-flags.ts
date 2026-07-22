// Anki-parity colored flags. 0 = no flag; 1-7 match Anki's palette and order.
// Stored in study_cards.flag; the legacy boolean `flagged` mirrors flag > 0
// so the phone app keeps working until it learns colors.

export interface StudyFlagColor {
  value: number;
  name: string;
  /** Icon tint (Tailwind text color utility). */
  className: string;
}

export const STUDY_FLAG_COLORS: StudyFlagColor[] = [
  { value: 1, name: "Red", className: "text-red-500" },
  { value: 2, name: "Orange", className: "text-orange-400" },
  { value: 3, name: "Green", className: "text-green-500" },
  { value: 4, name: "Blue", className: "text-blue-500" },
  { value: 5, name: "Pink", className: "text-pink-400" },
  { value: 6, name: "Turquoise", className: "text-cyan-400" },
  { value: 7, name: "Purple", className: "text-violet-400" },
];

export function studyFlagColor(value: number): StudyFlagColor | null {
  return STUDY_FLAG_COLORS.find((flag) => flag.value === value) ?? null;
}

/** Clamp an untrusted stored value onto the 0-7 range (0 = unflagged). */
export function normalizeStudyFlag(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7 ? value : 0;
}
