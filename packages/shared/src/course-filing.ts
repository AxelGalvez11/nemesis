/**
 * Filing a new note under the course it is actually about.
 *
 * Owner, 2026-07-31: after a week of lectures everything landed in
 * `Nemesis/Recordings` and `Nemesis/Slides` — a pile, not a semester. A student
 * who records three courses gets one folder holding all of them, sorted by
 * nothing but time.
 *
 * 🔴 THE COURSE LIST IS THE STUDENT'S OWN. It comes from the `course` field on
 * their calendar events and from the folders they already made. There is no
 * table of subject names here and there must never be one: the moment this file
 * knows what "Pharmacology" is, it stops working for the machinist and the law
 * student, and the whole product is field-agnostic by rule. What makes it work
 * is that the student already told the app what they are taking — this only has
 * to notice which of THEIR names a piece of text is talking about.
 *
 * Scope, deliberately: this decides where NEW things are filed. It never moves
 * anything that already exists. A bulk reorganise of notes the student may have
 * arranged by hand is indistinguishable from data loss, and the chat can do it
 * on request through move_library_note if that is really what they want.
 */

import { contentWords, NAME_MIN_WORD } from "./word-overlap.ts";

/** Where things go when no course is a good enough match. Today's behaviour. */
export const FALLBACK_FOLDERS = {
  note: "Nemesis/Notes",
  recording: "Nemesis/Recordings",
  slides: "Nemesis/Slides",
} as const;

export type FiledKind = keyof typeof FALLBACK_FOLDERS;

/** What each course folder's subfolder is called, per kind of thing. */
const LEAF: Readonly<Record<FiledKind, string>> = {
  note: "Notes",
  recording: "Lectures",
  slides: "Slides",
};

/** A folder path is one segment per level; these characters would split it. */
function safeSegment(value: string): string {
  return value.trim().replace(/[\\/:]/g, "-").replace(/\s+/g, " ").slice(0, 60);
}

/**
 * How strongly a piece of text is about one course.
 *
 * A course name is often several words ("Introduction to Contract Law"), and
 * matching one of them is weak evidence while matching three is strong. So this
 * counts the course's OWN distinctive words that appear in the text, rather
 * than answering yes/no — that count is what lets two plausible courses be
 * compared instead of taking whichever was checked first.
 */
export function courseScore(text: string, course: string): number {
  const asked = contentWords(text, NAME_MIN_WORD);
  if (asked.size === 0) return 0;
  let hits = 0;
  for (const word of contentWords(course, NAME_MIN_WORD)) {
    if (asked.has(word)) hits += 1;
  }
  return hits;
}

export interface CourseMatch {
  course: string;
  score: number;
}

/**
 * The one course this text is about, or null when nothing is clear enough.
 *
 * Two rules do the real work, and both exist to make silence the default:
 *
 * - A TIE IS A REFUSAL. Two courses matching equally well means the text does
 *   not distinguish them, and filing it under whichever sorted first would be a
 *   coin toss the student cannot see. Nothing is worse here than confident
 *   misfiling: a note in the wrong course is harder to find than a note in the
 *   obvious pile, because they will not think to look.
 * - ONE SHARED WORD IS NOT ENOUGH when the course name has several. "Advanced
 *   Contract Law" and a transcript that happens to say "advanced" are not a
 *   match. A single-word course name ("Thermodynamics") is exempt, because one
 *   word is all it has.
 */
export function matchCourse(text: string, courses: readonly string[]): CourseMatch | null {
  const scored = courses
    .map((course) => course.trim())
    .filter((course) => course.length > 0)
    .map((course) => {
      const words = contentWords(course, NAME_MIN_WORD).size;
      const score = courseScore(text, course);
      // Multi-word names need at least two hits; a one-word name needs its word.
      const enough = words <= 1 ? score >= 1 : score >= 2;
      return { course, score: enough ? score : 0 };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  // A tie means the text did not choose, so neither do we.
  if (scored.length > 1 && scored[1]!.score === best.score) return null;
  return best;
}

/**
 * The folder a new item belongs in.
 *
 * `<Course>/<Lectures|Slides|Notes>` when a course is clear, and today's
 * `Nemesis/...` folder when it is not. The student's existing pile keeps
 * working exactly as it does now; only the recognisable things move out of it.
 */
export function folderForNewItem(
  kind: FiledKind,
  text: string,
  courses: readonly string[],
): string {
  const matched = matchCourse(text, courses);
  if (!matched) return FALLBACK_FOLDERS[kind];
  return `${safeSegment(matched.course)}/${LEAF[kind]}`;
}

/**
 * The student's courses, from the two places they have already named them.
 *
 * Calendar events carry a `course` field the syllabus import fills in, and the
 * Library's own top-level folders are the ones they made by hand. Both are
 * their words, which is the whole point. De-duplicated case-insensitively,
 * keeping the first spelling seen so the folder matches what they typed.
 */
export function knownCourses(
  calendarCourses: readonly (string | null | undefined)[],
  libraryTopFolders: readonly string[] = [],
): string[] {
  const seen = new Map<string, string>();
  for (const raw of [...calendarCourses, ...libraryTopFolders]) {
    const course = (raw ?? "").trim();
    if (!course) continue;
    // "Nemesis" is ours, not theirs — filing a lecture under it would be a
    // course named after the app.
    if (course.toLowerCase() === "nemesis") continue;
    const key = course.toLowerCase();
    if (!seen.has(key)) seen.set(key, course);
  }
  return [...seen.values()];
}
