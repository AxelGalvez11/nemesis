// Conflict detection for calendar writes (owner 2026-08-03: "chat should be
// able to recognize, when uploading syllabus, if there are dates that
// conflict"). Pure functions — the syllabus importer and the chat's
// add_calendar_event tool both call these, so the two write paths cannot
// drift in what they consider a conflict.
//
// Two different findings, deliberately kept apart:
//   - a DUPLICATE (same name, same day) is almost always the same syllabus
//     imported twice — it is SKIPPED, because adding it again helps nobody;
//   - a CLASH (two timed things occupying the same clock time) is real life —
//     it is still saved, and FLAGGED, because whether to drop one is the
//     student's call, not the importer's.

import type { CalendarEvent } from "./calendar-model";

export interface CalendarClash {
  incoming: CalendarEvent;
  existing: CalendarEvent;
}

export interface CalendarConflictSplit {
  /** Already on the calendar (same name, same day) — do not save again. */
  duplicates: CalendarEvent[];
  /** Saved AND worth mentioning: they overlap something already scheduled. */
  clashes: CalendarClash[];
  /** Everything that should actually be written (includes the clashes). */
  toSave: CalendarEvent[];
}

const normalizeTitle = (title: string) => title.trim().toLowerCase().replace(/\s+/g, " ");

function minutesOf(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** How long an event without a stated end is assumed to occupy. An hour is the
 *  common class block; the exact number only affects how generously "same
 *  time" is read, never what gets saved. */
const DEFAULT_DURATION_MINUTES = 60;

/** Two events clash when they sit on the same date and their clock ranges
 *  cross. Events without a time (all-day rows, date-only deadlines) never
 *  clash — a due date does not occupy the hour. */
export function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  if (a.date !== b.date) return false;
  const aStart = minutesOf(a.time);
  const bStart = minutesOf(b.time);
  if (aStart === null || bStart === null) return false;
  const aEnd = minutesOf(a.endTime) ?? aStart + DEFAULT_DURATION_MINUTES;
  const bEnd = minutesOf(b.endTime) ?? bStart + DEFAULT_DURATION_MINUTES;
  return aStart < bEnd && bStart < aEnd;
}

export function isDuplicateEvent(event: CalendarEvent, existing: CalendarEvent): boolean {
  return event.date === existing.date && normalizeTitle(event.title) === normalizeTitle(existing.title);
}

export function splitCalendarConflicts(
  incoming: readonly CalendarEvent[],
  existing: readonly CalendarEvent[],
): CalendarConflictSplit {
  const duplicates: CalendarEvent[] = [];
  const clashes: CalendarClash[] = [];
  const toSave: CalendarEvent[] = [];

  for (const event of incoming) {
    if (existing.some((row) => isDuplicateEvent(event, row))) {
      duplicates.push(event);
      continue;
    }
    const hit = existing.find((row) => eventsOverlap(event, row));
    if (hit) clashes.push({ existing: hit, incoming: event });
    toSave.push(event);
  }

  return { clashes, duplicates, toSave };
}

/** One plain-English line about what was skipped or double-booked; empty when
 *  there is nothing to say. The callers append it to their own "Added N
 *  events" sentence. */
export function conflictSummary(split: CalendarConflictSplit): string {
  const parts: string[] = [];
  if (split.duplicates.length) {
    parts.push(`Skipped ${split.duplicates.length} already on your calendar`);
  }
  if (split.clashes.length) {
    const [first] = split.clashes;
    const example = first ? ` (for example ${first.incoming.title} overlaps ${first.existing.title} on ${first.existing.date})` : "";
    parts.push(`${split.clashes.length} land${split.clashes.length === 1 ? "s" : ""} at the same time as something already scheduled${example}`);
  }
  return parts.length ? `${parts.join(". ")}.` : "";
}

// ── Auditing what is ALREADY on the calendar ────────────────────────────────
// The split above guards one incoming batch. These look at the calendar as it
// stands, so the chat can answer "clean up my calendar" with findings instead
// of feelings. Owner 2026-08-05, verbatim requirements: distinguish an EXACT
// duplicate from a PROBABLE one, recognize CONFLICTING VERSIONS of the same
// academic event (the "old calendar says Exam 2 is Oct 12, newest syllabus
// says Oct 14" case), and never call two unrelated events at the same time
// duplicates — an overlap is real life, not a copy.

export interface CalendarIssueEventRef {
  id: string;
  title: string;
  date: string;
  kind: string;
  time?: string;
  course?: string;
}

function issueRef(event: CalendarEvent): CalendarIssueEventRef {
  return {
    date: event.date,
    id: event.id,
    kind: event.kind,
    title: event.title,
    ...(event.course ? { course: event.course } : {}),
    ...(event.time ? { time: event.time } : {}),
  };
}

export interface ExactDuplicateGroup {
  date: string;
  title: string;
  /** 2+ rows with this exact title on this exact date — an import run twice. */
  events: CalendarIssueEventRef[];
}

export interface ProbableDuplicatePair {
  date: string;
  reason: string;
  first: CalendarIssueEventRef;
  second: CalendarIssueEventRef;
}

export interface ConflictingVersionsGroup {
  title: string;
  kind: string;
  /** The same named exam/assignment sitting on DIFFERENT dates — sources
   *  disagree, and the newest trustworthy one should win (or the student
   *  decides). Never auto-fixed; surfaced for reconciliation. */
  events: CalendarIssueEventRef[];
}

export interface OverlapPair {
  date: string;
  first: CalendarIssueEventRef;
  second: CalendarIssueEventRef;
}

export interface CalendarIssues {
  exact_duplicates: ExactDuplicateGroup[];
  probable_duplicates: ProbableDuplicatePair[];
  conflicting_versions: ConflictingVersionsGroup[];
  overlaps: OverlapPair[];
}

/** Words that make two titles comparable. 4+ chars keeps "Exam 2" vs "Lab 2"
 *  from matching on the bare digit. */
function titleWords(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter((word) => word.length >= 4));
}

/** Why two same-day titles look like the same event, or null when they don't. */
function similarTitleReason(a: string, b: string): string | null {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
    return "one title contains the other";
  }
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 || wb.size === 0) return null;
  let shared = 0;
  for (const word of wa) if (wb.has(word)) shared += 1;
  const smaller = Math.min(wa.size, wb.size);
  return shared >= 2 && shared * 2 >= smaller ? "their titles share most of their words" : null;
}

/** Only kinds where "the same name on two dates" means sources disagree.
 *  Classes and rotations legitimately repeat under one name every week. */
const VERSIONED_KINDS = new Set(["assignment", "exam"]);

/** How far apart two dates can sit and still plausibly be versions of one
 *  event rather than "Exam 2" this term and next term. */
const VERSION_SPAN_DAYS = 45;

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`));
  return Math.round(ms / 86_400_000);
}

/**
 * Classified findings over whatever rows the caller loaded. Pure. Feed it the
 * COMPLETE range being reconciled — findings over a partial load are partial.
 */
export function findCalendarIssues(events: readonly CalendarEvent[]): CalendarIssues {
  // Exact duplicates: same normalized title on the same date.
  const byDateTitle = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = `${event.date} ${normalizeTitle(event.title)}`;
    byDateTitle.set(key, [...(byDateTitle.get(key) ?? []), event]);
  }
  const exact_duplicates: ExactDuplicateGroup[] = [...byDateTitle.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ date: group[0]!.date, events: group.map(issueRef), title: group[0]!.title }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  // Probable duplicates and honest overlaps: pairwise within each date.
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  const probable_duplicates: ProbableDuplicatePair[] = [];
  const overlaps: OverlapPair[] = [];
  for (const sameDay of byDate.values()) {
    for (let i = 0; i < sameDay.length; i += 1) {
      for (let j = i + 1; j < sameDay.length; j += 1) {
        const a = sameDay[i]!;
        const b = sameDay[j]!;
        // Same-title pairs are already in exact_duplicates.
        if (normalizeTitle(a.title) === normalizeTitle(b.title)) continue;
        const reason = similarTitleReason(a.title, b.title);
        if (reason) {
          probable_duplicates.push({ date: a.date, first: issueRef(a), reason, second: issueRef(b) });
          continue; // A likely-same event is not ALSO an "unrelated overlap".
        }
        if (eventsOverlap(a, b)) overlaps.push({ date: a.date, first: issueRef(a), second: issueRef(b) });
      }
    }
  }
  probable_duplicates.sort((a, b) => a.date.localeCompare(b.date));
  overlaps.sort((a, b) => a.date.localeCompare(b.date));

  // Conflicting versions: one named exam/assignment on more than one date.
  // Course is part of the identity when both rows carry one — "Exam 2" in two
  // different courses is two real exams, not a disagreement.
  const byIdentity = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!VERSIONED_KINDS.has(event.kind)) continue;
    const key = `${normalizeTitle(event.title)} ${event.kind} ${(event.course ?? "").trim().toLowerCase()}`;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), event]);
  }
  const conflicting_versions: ConflictingVersionsGroup[] = [...byIdentity.values()]
    .flatMap((group) => {
      const dates = [...new Set(group.map((event) => event.date))].sort();
      if (dates.length < 2) return [];
      if (daysBetween(dates[0]!, dates[dates.length - 1]!) > VERSION_SPAN_DAYS) return [];
      return [{
        events: group.map(issueRef).sort((a, b) => a.date.localeCompare(b.date)),
        kind: group[0]!.kind,
        title: group[0]!.title,
      }];
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return { conflicting_versions, exact_duplicates, overlaps, probable_duplicates };
}
