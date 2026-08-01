// First-run onboarding — all of the decisions, none of the DOM.
//
// Everything here is pure so the rules can be tested without a browser: which
// step comes next, what counts as a course name, and — the one that actually
// matters — whether this account should see onboarding at all.
//
// FIELD-AGNOSTIC BY CONSTRUCTION. There is no subject list, no taxonomy, and no
// notion of a semester anywhere in this file. A course is whatever the student
// typed. "Contract Law", "Thermodynamics II", "Welding Fundamentals" and
// "18th-Century Portraiture" are all equally valid and none of them is checked
// against anything.

import type { CalendarEvent } from "@/lib/workspace/calendar-model";

/** Where the completion marker lives. Versioned so a future redesign can show
 *  the new flow without hunting down old keys. */
export const ONBOARDING_STORAGE_KEY = "nemesis.web.onboarding.v1";

/**
 * A generous ceiling, not a realistic course load.
 *
 * A full-time student takes three to eight classes. The cap exists so a paste
 * accident cannot create four hundred Library folders, not to tell anyone how
 * much they are allowed to study — someone doubling up on a summer term plus
 * audits should never hit it.
 */
export const MAX_COURSES = 24;

/** Long enough for "Introduction to Comparative Constitutional Law", short
 *  enough to stay a usable folder name. */
export const MAX_COURSE_NAME_CHARS = 80;

export const STEPS = ["courses", "syllabi", "coursework"] as const;

export type OnboardingStep = (typeof STEPS)[number];

/** How the flow ended. Both mean "do not show this again"; they are kept apart
 *  so we can tell a student who set up from one who bailed. */
export type OnboardingOutcome = "finished" | "skipped";

export interface StoredOnboarding {
  outcome: OnboardingOutcome;
  /** ISO timestamp, for working out later whether an old flow was ever seen. */
  at: string;
}

// ── Step order ───────────────────────────────────────────────────────────────

export function stepIndex(step: OnboardingStep): number {
  return STEPS.indexOf(step);
}

/** The step after this one, or null when this is the last. PURE. */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return STEPS[stepIndex(step) + 1] ?? null;
}

/** The step before this one, or null when this is the first. PURE. */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step);
  return index > 0 ? (STEPS[index - 1] ?? null) : null;
}

// ── Course names ─────────────────────────────────────────────────────────────

/**
 * The student's own words, tidied but never edited for meaning.
 *
 * 🔴 THIS DELIBERATELY DOES NOT DROP SHORT WORDS. A previous course-matching
 * change filtered tokens under four characters and silently turned "Contract
 * Law" into "Contract" — the word that carried the whole meaning was the one
 * thrown away. Whitespace is collapsed and characters that would break a
 * Library path are removed. Nothing else. If a student types "AI" that is the
 * course name.
 *
 * Returns null when there is nothing usable left, so callers never store an
 * empty folder name.
 */
export function cleanCourseName(raw: string): string | null {
  const stripped = raw
    // Control characters and slashes ONLY. A slash would split the name into
    // two Library folders; control characters break the path outright. They
    // become a space rather than nothing so "Physics/Lab" reads as
    // "Physics Lab" and not "PhysicsLab".
    //
    // Note how narrow this is, on purpose: hyphens, periods, ampersands,
    // colons and brackets all survive, because "18th-Century Portraiture",
    // "Physics (Honours)" and "Law & Society" are names people really type.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  return stripped.slice(0, MAX_COURSE_NAME_CHARS).trim() || null;
}

/** Case-insensitive identity for a course, used only to spot duplicates. The
 *  ORIGINAL casing is always what gets stored. */
function courseKey(name: string): string {
  return name.toLocaleLowerCase();
}

/**
 * Add a course to the list, ignoring blanks, duplicates and anything past the
 * cap. Returns a NEW array — the caller's list is never mutated. PURE.
 *
 * The first spelling wins: a student who types "Torts" and then "torts" keeps
 * "Torts", because that is the one they will recognise in their Library.
 */
export function addCourse(courses: readonly string[], raw: string): string[] {
  const cleaned = cleanCourseName(raw);
  if (!cleaned) return [...courses];
  if (courses.length >= MAX_COURSES) return [...courses];
  const key = courseKey(cleaned);
  if (courses.some((existing) => courseKey(existing) === key)) return [...courses];
  return [...courses, cleaned];
}

/** Remove one course by exact value. Returns a NEW array. PURE. */
export function removeCourse(courses: readonly string[], name: string): string[] {
  return courses.filter((existing) => existing !== name);
}

/**
 * Fold newly discovered course names into the list the student already has.
 *
 * Used when a syllabus import names its own course, and when the extension
 * comes back with a list from the school portal. Same rules as typing them by
 * hand, applied in order, so the cap and the de-duplication hold. PURE.
 */
export function mergeCourses(courses: readonly string[], incoming: readonly string[]): string[] {
  let out = [...courses];
  for (const candidate of incoming) out = addCourse(out, candidate);
  return out;
}

/**
 * Split one line of typed text into course names.
 *
 * Students paste their schedule in whatever shape it came in — one per line,
 * comma-separated, or both. Newlines and commas are the only separators; a
 * course name with a comma in it is rare enough, and losing "Ethics, Law and
 * Society" to a split is better than making everyone type one at a time.
 * PURE.
 */
export function splitCourseInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((part) => cleanCourseName(part))
    .filter((part): part is string => part !== null);
}

// ── Should this account see onboarding at all ────────────────────────────────

export interface AccountSignals {
  /** Anything on the calendar yet. */
  hasEvents: boolean;
  /** Anything in the Library yet. */
  hasLibrary: boolean;
  /** The completion marker read back from storage, or null if there is none. */
  stored: StoredOnboarding | null;
}

/**
 * Show the flow only to an account that has genuinely never been set up.
 *
 * Two independent guards, because the stored marker lives in this browser and
 * students use more than one:
 *
 *  - A stored outcome means they have already been through it here. Never
 *    show it again, finished or skipped.
 *  - Content in the account means they are not new, whatever this browser
 *    remembers. Someone who set up on their laptop must not be handed a
 *    "welcome, name your courses" screen when they open their phone.
 *
 * The second guard is what makes this safe without a database column: the
 * account itself is the durable record, and it is right on every device.
 * PURE.
 */
export function shouldShowOnboarding(signals: AccountSignals): boolean {
  if (signals.stored) return false;
  if (signals.hasEvents || signals.hasLibrary) return false;
  return true;
}

/** Parse whatever was in storage, tolerating anything. An unreadable or
 *  unrecognised value is treated as "never ran", which shows the flow again —
 *  the safe direction, since the emptiness check still suppresses it for
 *  anyone who has actually used the app. PURE. */
export function parseStoredOnboarding(raw: string | null): StoredOnboarding | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const outcome = (parsed as { outcome?: unknown }).outcome;
    if (outcome !== "finished" && outcome !== "skipped") return null;
    const at = (parsed as { at?: unknown }).at;
    return { at: typeof at === "string" ? at : "", outcome };
  } catch {
    return null;
  }
}

// ── Turning what we collected into things the app already understands ────────

/**
 * A course, in the two places Nemesis actually keeps them.
 *
 * There is no courses table. `knownCourses` in packages/shared reads the
 * `course` field on calendar events and the top-level Library folders, so a
 * course "exists" once one of those mentions it. Onboarding writes both:
 * a folder gives the student somewhere to put lecture notes on day one, and
 * the course field is what files future recordings correctly.
 */
export interface OnboardingResult {
  courses: string[];
  /** Events the student ticked in the syllabus review, already stamped with
   *  their course where we know it. */
  events: CalendarEvent[];
}

/**
 * Stamp imported events with a course name.
 *
 * A syllabus import names its own course; when it does not, and the student
 * has told us exactly one course, that is the only sensible owner. With two or
 * more we leave it blank rather than guess — a wrongly filed exam is worse
 * than an unfiled one, and the student can set it in a click.
 *
 * Returns NEW events. PURE.
 */
export function assignCourse(
  events: readonly CalendarEvent[],
  syllabusCourse: string | null,
  courses: readonly string[],
): CalendarEvent[] {
  const fallback = courses.length === 1 ? courses[0] : undefined;
  const course = cleanCourseName(syllabusCourse ?? "") ?? fallback;
  if (!course) return events.map((event) => ({ ...event }));
  return events.map((event) => ({ ...event, course: event.course ?? course }));
}
