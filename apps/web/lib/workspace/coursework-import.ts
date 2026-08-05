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
import type { LmsScan, ScrapedCourse, ScrapedDocument, ScrapedKind } from "@nemesis/shared";

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

/** A document the student chose, with the Library folder it belongs in. */
export interface PlannedDocument {
  course: string;
  title: string;
  /** Full Library path, course first: "Pharmacology 4/Week 3/Lectures". */
  folderPath: string;
  kind: ScrapedDocument["kind"];
  fileType?: string;
  url?: string;
}

/**
 * The Library path a document belongs at. PURE.
 *
 * The course is always the outermost folder, then the portal's own folder
 * names beneath it. Segments are cleaned of slashes here as well as in the
 * sanitiser — this function is exported and someone will eventually call it
 * with something that did not come through the wire.
 */
export function documentFolderPath(course: string, folder: readonly string[]): string {
  const clean = (segment: string) => segment.replaceAll("/", " ").replaceAll("\\", " ").trim();
  return [clean(course), ...folder.map(clean)].filter(Boolean).join("/");
}

/**
 * Documents across the picked courses, each with the folder it lands in. PURE.
 *
 * `pickedDocuments` is a set of "course + NUL + title" keys. Absent means EVERY
 * document in the picked courses — which is what a student who never opened
 * the document list expects, rather than silently importing none.
 */
export function documentsFromScan(
  scan: LmsScan | null,
  pickedCourses: ReadonlySet<string>,
  pickedDocuments?: ReadonlySet<string>,
): PlannedDocument[] {
  if (!scan) return [];
  const out: PlannedDocument[] = [];
  for (const course of scan.courses) {
    if (!pickedCourses.has(course.name)) continue;
    for (const doc of course.documents ?? []) {
      if (pickedDocuments && !pickedDocuments.has(documentKey(course.name, doc.title))) continue;
      out.push({
        course: course.name,
        folderPath: documentFolderPath(course.name, doc.folder),
        kind: doc.kind,
        title: doc.title,
        ...(doc.fileType ? { fileType: doc.fileType } : {}),
        ...(doc.url ? { url: doc.url } : {}),
      });
    }
  }
  return out;
}

/** How a document is identified in the picker. A NUL separator, because a
 *  course or a title can contain any printable character a portal allows. */
export function documentKey(course: string, title: string): string {
  return `${course}\u0000${title}`;
}

/**
 * Courses grouped by the term the portal named, newest first. PURE.
 *
 * 🔴 THE PICKER NEEDS THIS OR IT IS UNUSABLE. A student partway through a
 * degree has every course they have ever enrolled in in that list — measured on
 * a real account, 31 entries. Without grouping, this semester's four courses
 * are somewhere in the middle of twenty-seven finished ones.
 *
 * The term itself is read in the extension (extension/src/lms/term.ts) from
 * what the portal already wrote, by position beside the year rather than from a
 * list of season names, so it works on a portal in any language. Here it is
 * only ever grouped and sorted — nothing re-derives it, so there is one
 * implementation and no chance of the two disagreeing.
 *
 * Courses with no term come last under `null`. That is a real answer, not a
 * failure: the caller names it, because a heading is a UI string.
 */
export function coursesByTerm(scan: LmsScan | null): Array<{ term: string | null; courses: ScrapedCourse[] }> {
  if (!scan) return [];
  const buckets = new Map<string | null, ScrapedCourse[]>();
  for (const course of scan.courses) {
    const term = course.term ?? null;
    const bucket = buckets.get(term);
    if (bucket) bucket.push(course);
    else buckets.set(term, [course]);
  }
  // Sorted on the YEAR inside the label, so "Fall 2026" lands above "Spring
  // 2025" instead of under it alphabetically. Same-year labels keep text order:
  // ranking seasons would mean decoding season names, which is exactly what the
  // extension refuses to do for good reason.
  const yearOf = (label: string) => Number(/\b(19[89]\d|20\d{2})\b/.exec(label)?.[1] ?? 0);
  return [...buckets.entries()]
    .map(([term, courses]) => ({ courses, term }))
    .sort((a, b) => {
      if (a.term === null) return 1;
      if (b.term === null) return -1;
      return yearOf(b.term) - yearOf(a.term) || a.term.localeCompare(b.term);
    });
}

/** The newest term's course names — what a picker should arrive already
 *  ticked. Falls back to every course when no course names a term, where there
 *  is no grouping to lean on and "all" is the only honest default. PURE. */
export function newestTermCourseNames(scan: LmsScan | null): string[] {
  const groups = coursesByTerm(scan);
  const newest = groups.find((group) => group.term !== null) ?? groups[0];
  return (newest?.courses ?? []).map((course) => course.name);
}

export interface ImportPlan {
  courses: string[];
  events: CalendarEvent[];
  /** Picked rows that carried no date and so cannot go on a calendar. */
  undated: number;
  syllabusLinks: Array<{ course: string; label: string; url: string }>;
  documents: PlannedDocument[];
  /**
   * Every Library folder the import needs, parents included and deduplicated.
   *
   * A document three folders deep needs all three to exist, and two documents
   * in the same folder must not ask for it twice.
   */
  folders: string[];
}

/** Every folder path an import touches, parents first so a creator that is not
 *  recursive still ends up with a valid tree. PURE. */
export function foldersFor(courses: readonly string[], documents: readonly PlannedDocument[]): string[] {
  const all = new Set<string>(courses.map((course) => course.replaceAll("/", " ").trim()).filter(Boolean));
  for (const doc of documents) {
    const parts = doc.folderPath.split("/").filter(Boolean);
    // Add each ancestor, not just the leaf: "A/B/C" needs "A" and "A/B" too.
    for (let i = 1; i <= parts.length; i += 1) all.add(parts.slice(0, i).join("/"));
  }
  // Shallowest first — a parent can never be created after its child.
  return [...all].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}

/** Everything an import will do, worked out before any of it happens, so the
 *  student can be told. PURE. */
export function planImport(
  scan: LmsScan | null,
  picked: ReadonlySet<string>,
  newId: () => string,
  pickedDocuments?: ReadonlySet<string>,
): ImportPlan {
  const courses = coursesFromScan(scan, picked);
  const events = eventsFromScan(scan, picked, newId);
  const documents = documentsFromScan(scan, picked, pickedDocuments);
  const undated = (scan?.courses ?? [])
    .filter((course: ScrapedCourse) => picked.has(course.name))
    .reduce((total, course) => total + course.items.filter((item) => !item.dueDate).length, 0);
  return {
    courses,
    documents,
    events,
    folders: foldersFor(courses, documents),
    syllabusLinks: syllabusLinksFromScan(scan, picked),
    undated,
  };
}

/** A plain sentence describing what is about to happen. PURE, and deliberately
 *  specific — "imports your coursework" tells a student nothing. */
export function describePlan(plan: ImportPlan): string {
  const parts: string[] = [];
  if (plan.folders.length > 0) {
    // Counts FOLDERS, not courses: once documents come in, a course brings its
    // own sub-folders and saying "9 folders" when 34 are about to appear is
    // the kind of small lie that makes a student distrust the whole import.
    parts.push(`${plan.folders.length} ${plan.folders.length === 1 ? "folder" : "folders"} in your Library`);
  }
  if (plan.documents.length > 0) {
    parts.push(`${plan.documents.length} ${plan.documents.length === 1 ? "document" : "documents"}`);
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
