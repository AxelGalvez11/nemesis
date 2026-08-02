// First-run onboarding for the web app.
//
// 🔴 THE RULES THEMSELVES NOW LIVE IN packages/shared/src/onboarding.ts.
// They moved there when the phone grew its own first-run flow: a student who
// names a course on their laptop and then opens their phone has to get the SAME
// answer about whether they are new, and the same tidying applied to the same
// typed words. Copying the file would have made that true on the day it was
// copied and progressively less true afterwards — which is how this repo already
// has fourteen same-named modules quietly diverging between apps/web/lib and
// apps/mobile/src/lib.
//
// This file stays as the web app's door to those rules, for two reasons worth
// keeping: every existing web import (`@/lib/workspace/onboarding`) keeps
// working untouched, and the ONE genuinely per-platform value — where the
// completion marker is written — stays with the platform that owns it.
//
// Add web-only helpers here. Add anything a phone would also ask to the shared
// file.

export {
  addCourse,
  assignCourse,
  cleanCourseName,
  MAX_COURSE_NAME_CHARS,
  MAX_COURSES,
  mergeCourses,
  nextStep,
  parseStoredOnboarding,
  previousStep,
  removeCourse,
  shouldShowOnboarding,
  splitCourseInput,
  STEPS,
  stepIndex,
  storedOnboarding,
} from "@nemesis/shared";

export type {
  AccountSignals,
  OnboardingOutcome,
  OnboardingStep,
  StoredOnboarding,
} from "@nemesis/shared";

import type { CalendarEvent } from "@/lib/workspace/calendar-model";

/** Where the completion marker lives IN THIS BROWSER. Versioned so a future
 *  redesign can show the new flow without hunting down old keys.
 *
 *  Deliberately NOT shared: the phone writes its own key to its own store, and
 *  the two must never collide. The durable, cross-device record is the ACCOUNT
 *  being non-empty — see shouldShowOnboarding, where that is the guard that
 *  actually matters. */
export const ONBOARDING_STORAGE_KEY = "nemesis.web.onboarding.v1";

/**
 * A course, in the two places Nemesis actually keeps them.
 *
 * There is no courses table. `knownCourses` in packages/shared reads the
 * `course` field on calendar events and the top-level Library folders, so a
 * course "exists" once one of those mentions it. Onboarding writes both:
 * a folder gives the student somewhere to put lecture notes on day one, and
 * the course field is what files future recordings correctly.
 *
 * Typed to the web's own CalendarEvent. The shared `assignCourse` is generic
 * over anything carrying a `course` field, which is what let the rule move
 * without dragging this app's calendar model along with it.
 */
export interface OnboardingResult {
  courses: string[];
  /** Events the student ticked in the syllabus review, already stamped with
   *  their course where we know it. */
  events: CalendarEvent[];
}
