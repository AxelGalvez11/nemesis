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
