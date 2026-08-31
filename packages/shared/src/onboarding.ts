// First-run onboarding — all of the decisions, none of the screen.
//
// Everything here is pure so the rules can be tested without a browser or a
// phone: which step comes next, what counts as a course name, and — the one
// that actually matters — whether this account should see onboarding at all.
//
// 🔴 THIS LIVES IN packages/shared BECAUSE BOTH APPS ASK THE SAME QUESTIONS.
// It began as apps/web/lib/workspace/onboarding.ts. When the phone grew its own
// first-run flow the choice was to copy this file or to move it; copying is how
// this repo already ended up with fourteen same-named modules drifting apart in
// apps/web/lib and apps/mobile/src/lib. A student who names a course on their
// laptop and opens their phone must get the SAME answer about whether they are
// new, and the same tidying applied to the same typed words. One file is the
// only way that stays true.
//
// FIELD-AGNOSTIC BY CONSTRUCTION. There is no subject list, no taxonomy, and no
// notion of a semester anywhere in this file. A course is whatever the student
// typed. "Contract Law", "Thermodynamics II", "Welding Fundamentals" and
// "18th-Century Portraiture" are all equally valid and none of them is checked
// against anything.

/** A generous ceiling, not a realistic course load.
 *
 *  🔴 PREFIXED because lms-import.ts already exports MAX_COURSES (60) and
 *  MAX_COURSE_NAME_CHARS (200) for a DIFFERENT job — capping what the browser
 *  extension pulls out of a school portal, which is untrusted input from a page
 *  we do not control. These two cap what a student TYPES. Same words, different
 *  numbers, different threat model; `export *` from both would have silently
 *  collided in the shared index. The web app re-exports these under the short
 *  names its own callers already use.
 *
 *  A full-time student takes three to eight classes. The cap exists so a paste
 *  accident cannot create four hundred Library folders, not to tell anyone how
 *  much they are allowed to study — someone doubling up on a summer term plus
 *  audits should never hit it. */
export const ONBOARDING_MAX_COURSES = 24;

/** Long enough for "Introduction to Comparative Constitutional Law", short
 *  enough to stay a usable folder name. */
export const ONBOARDING_MAX_COURSE_NAME_CHARS = 80;

/**
 * 🔴 `connect` IS LAST, AND THE ORDER IS THE ARGUMENT. Asking for access to
 * someone's mail and calendar before showing them anything is how a first run
 * gets abandoned: at that moment the request is all cost and no reason. By the
 * end of this flow the student has typed their courses and watched Nemesis pull
 * dates out of a syllabus, so "connect your calendar and these land in it" is a
 * sentence about their own work rather than a permissions demand.
 *
 * It also means the step can be walked past. The footer's finish button lives on
 * the last step, so a student who wants nothing connected presses it and is done.
 */
export const STEPS = ["courses", "syllabi", "coursework", "connect"] as const;

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
  return stripped.slice(0, ONBOARDING_MAX_COURSE_NAME_CHARS).trim() || null;
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
  if (courses.length >= ONBOARDING_MAX_COURSES) return [...courses];
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
 * Two independent guards, because the stored marker is per-device and students
 * use more than one:
 *
 *  - A stored outcome means they have already been through it HERE. Never
 *    show it again, finished or skipped.
 *  - Content in the account means they are not new, whatever this device
 *    remembers. Someone who set up on their laptop must not be handed a
 *    "welcome, name your courses" screen when they open their phone.
 *
 * The second guard is what makes this safe without a database column: the
 * ACCOUNT is the durable record, and it is right on every device. The stored
 * marker is only ever an optimisation on top of it.
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

/** The value to persist when the flow ends. Kept beside the parser so the two
 *  can never disagree about the shape. PURE — the caller supplies the clock, so
 *  a test does not need to freeze time. */
export function storedOnboarding(outcome: OnboardingOutcome, now: Date): StoredOnboarding {
  return { outcome, at: now.toISOString() };
}

// ── Turning what we collected into things the app already understands ────────

/**
 * Stamp imported events with a course name.
 *
 * A syllabus import names its own course; when it does not, and the student
 * has told us exactly one course, that is the only sensible owner. With two or
 * more we leave it blank rather than guess — a wrongly filed exam is worse
 * than an unfiled one, and the student can set it in a click.
 *
 * GENERIC over the event shape on purpose: web and phone each have their own
 * calendar event type, and the only field this rule touches is `course`. Typing
 * it to one app's model is what would have forced this file to stay in that app.
 *
 * Returns NEW events. PURE.
 */
export function assignCourse<E extends { course?: string }>(
  events: readonly E[],
  syllabusCourse: string | null,
  courses: readonly string[],
): E[] {
  const fallback = courses.length === 1 ? courses[0] : undefined;
  const course = cleanCourseName(syllabusCourse ?? "") ?? fallback;
  if (!course) return events.map((event) => ({ ...event }));
  return events.map((event) => ({ ...event, course: event.course ?? course }));
}
