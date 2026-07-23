// Anki-parity colored flags, ported from web's lib/workspace/study-flags.ts so
// a card flagged on the phone reads the same color on the website. 0 = no flag;
// 1-7 match Anki's palette and order. Stored in study_cards.flag; the legacy
// boolean `flagged` mirrors flag > 0 (see api/cloudStudy.ts's setStudyCardFlag).
//
// Colors are literal hex here rather than web's Tailwind class names — React
// Native has no utility classes, and these are fixed Anki colors, not theme
// tokens, so they're the same in light and dark.

export interface StudyFlagColor {
  value: number;
  name: string;
  hex: string;
}

export const STUDY_FLAG_COLORS: StudyFlagColor[] = [
  { value: 1, name: "Red", hex: "#ef4444" },
  { value: 2, name: "Orange", hex: "#fb923c" },
  { value: 3, name: "Green", hex: "#22c55e" },
  { value: 4, name: "Blue", hex: "#3b82f6" },
  { value: 5, name: "Pink", hex: "#f472b6" },
  { value: 6, name: "Turquoise", hex: "#22d3ee" },
  { value: 7, name: "Purple", hex: "#a78bfa" },
];

export function studyFlagColor(value: number): StudyFlagColor | null {
  return STUDY_FLAG_COLORS.find((flag) => flag.value === value) ?? null;
}

/** Clamp an untrusted stored value onto the 0-7 range (0 = unflagged). */
export function normalizeStudyFlag(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7 ? value : 0;
}

/** Anki calls a card that has lapsed this many times a "leech" — it keeps
 *  failing and is worth reviewing differently. Web's Browse filters on the same
 *  threshold. */
export const LEECH_LAPSE_THRESHOLD = 8;
