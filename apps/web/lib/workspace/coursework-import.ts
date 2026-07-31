// Turning a portal reading into things Nemesis already understands.
//
// WHERE THE MATERIAL ACTUALLY GOES, since that was not obvious from the outside:
//
//   every picked course  ->  a top-level folder in the Library
//   every dated item     ->  an event on the calendar, stamped with its course
//   syllabus files       ->  left as links for the student to open and import
//                            through the syllabus reader, which verifies dates
//                            against the document
//
// There is no courses table in this product. `knownCourses` in packages/shared
// works out what a student is taking by reading the top-level Library folders
// and the `course` field on their calendar events, so writing both is what
// makes a course exist — and what makes a future recording file itself
// correctly.
//
// PURE. The writing lives in the component; this is just the shaping, so both
// the first-run flow and the standalone import agree on what an import means
// rather than each having their own idea.

import type { CalendarEvent, CalendarEventKind } from "@/lib/workspace/calendar-model";
import type { LmsScan, ScrapedCourse, ScrapedKind } from "@nemesis/shared";

/** The scraped vocabulary is a subset of the calendar's, but the mapping is
 *  written out rather than cast, so adding a kind on either side is a type
 *  error here instead of a surprise on someone's calendar. */
const KIND: Record<ScrapedKind, CalendarEventKind> = {
  assignment: "assignment",
  class: "class",
  exam: "exam",
  other: "other",
};

/** The courses a student picked, in the order the portal listed them. PURE. */
export function coursesFromScan(scan: LmsScan | null, picked: ReadonlySet<string>): string[] {
  if (!scan) return [];
  return scan.courses.filter((course) => picked.has(course.name)).map((course) => course.name);
}

/** Every syllabus file across the picked courses, so the student can be pointed
 *  at them rather than left to find them again. PURE. */
export function syllabusLinksFromScan(
  scan: LmsScan | null,
  picked: ReadonlySet<string>,
): Array<{ course: string; label: string; url: string }> {
  if (!scan) return [];
  return scan.courses
    .filter((course) => picked.has(course.name))
    .flatMap((course) => course.syllabusLinks.map((link) => ({ course: course.name, ...link })));
}

/**
 * Calendar events for the picked courses. PURE.
 *
 * ONLY DATED ITEMS BECOME EVENTS. A portal row with no due date is still real
 * coursework, but a calendar cannot hold it without us inventing a day for it,
 * and a made-up deadline is worse than a missing one because the student cannot
 * see that it is wrong. Those rows are reported in the count so the difference
 * is visible rather than silent.
 *
 * `newId` is injected so tests are deterministic and callers keep control of
 * identity generation.
 */
export function eventsFromScan(
  scan: LmsScan | null,
  picked: ReadonlySet<string>,
  newId: () => string,
): CalendarEvent[] {
  if (!scan) return [];
  const events: CalendarEvent[] = [];
  for (const course of scan.courses) {
    if (!picked.has(course.name)) continue;
    for (const item of course.items) {
      if (!item.dueDate) continue;
      events.push({
        course: course.name,
        date: item.dueDate,
        id: newId(),
        kind: KIND[item.kind],
        // Says where it came from, in the student's own calendar, so a wrong
        // row is traceable to the portal rather than looking like ours.
        note: `Read from ${course.name} on your school portal`,
        title: item.title,
        ...(item.dueTime ? { time: item.dueTime } : {}),
      });
    }
  }
  return events;
}

export interface ImportPlan {
  courses: string[];
  events: CalendarEvent[];
  /** Picked rows that carried no date and so cannot go on a calendar. */
  undated: number;
  syllabusLinks: Array<{ course: string; label: string; url: string }>;
}

/** Everything an import will do, worked out before any of it happens, so the
 *  student can be told. PURE. */
export function planImport(scan: LmsScan | null, picked: ReadonlySet<string>, newId: () => string): ImportPlan {
  const courses = coursesFromScan(scan, picked);
  const events = eventsFromScan(scan, picked, newId);
  const undated = (scan?.courses ?? [])
    .filter((course: ScrapedCourse) => picked.has(course.name))
    .reduce((total, course) => total + course.items.filter((item) => !item.dueDate).length, 0);
  return { courses, events, syllabusLinks: syllabusLinksFromScan(scan, picked), undated };
}

/** A plain sentence describing what is about to happen. PURE, and deliberately
 *  specific — "imports your coursework" tells a student nothing. */
export function describePlan(plan: ImportPlan): string {
  const parts: string[] = [];
  if (plan.courses.length > 0) {
    parts.push(`${plan.courses.length} ${plan.courses.length === 1 ? "folder" : "folders"} in your Library`);
  }
  if (plan.events.length > 0) {
    parts.push(`${plan.events.length} ${plan.events.length === 1 ? "date" : "dates"} on your calendar`);
  }
  if (parts.length === 0) return "Nothing selected.";
  const tail =
    plan.undated > 0
      ? `. ${plan.undated} ${plan.undated === 1 ? "item has" : "items have"} no due date, so ${plan.undated === 1 ? "it stays" : "they stay"} off the calendar.`
      : ".";
  return `This adds ${parts.join(" and ")}${tail}`;
}
