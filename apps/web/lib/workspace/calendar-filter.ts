// Which kinds of event the calendar is currently showing.
//
// Google Calendar puts a checkbox beside every calendar in the left rail and
// unticking one hides it without deleting anything. This is the same idea over
// the one axis our events actually have — their kind.
//
// Stored as the set of HIDDEN kinds rather than the visible ones, on purpose.
// The default has to be "show everything", and a stored list of visible kinds
// silently hides any kind added later — a student who saved their preference in
// July would never see a category introduced in August, and nothing on screen
// would explain why. An empty hidden-set means everything shows, for good.
//
// PURE: no storage, no React. The component owns persistence.

import type { CalendarEvent, CalendarEventKind } from "@/lib/workspace/calendar-model";

export const CALENDAR_FILTER_STORAGE_KEY = "nemesis.calendar.hiddenKinds.v1";

const VALID_KINDS: readonly CalendarEventKind[] = ["assignment", "exam", "rotation", "class", "other"];

/** Only events whose kind is still switched on. */
export function visibleEvents(
  events: readonly CalendarEvent[],
  hidden: ReadonlySet<CalendarEventKind>,
): CalendarEvent[] {
  if (hidden.size === 0) return [...events];
  return events.filter((event) => !hidden.has(event.kind));
}

/** Flip one kind on or off, returning a new set. */
export function toggleKind(
  hidden: ReadonlySet<CalendarEventKind>,
  kind: CalendarEventKind,
): Set<CalendarEventKind> {
  const next = new Set(hidden);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  return next;
}

/**
 * Read a stored preference back.
 *
 * Anything unrecognised is dropped rather than trusted: this value comes from
 * localStorage, which another tab, an older build, or the student themselves
 * can have written. A junk entry here would hide events with no way to get
 * them back from the filter UI, because the UI only lists real kinds.
 */
export function parseHiddenKinds(raw: string | null): Set<CalendarEventKind> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is CalendarEventKind => VALID_KINDS.includes(value as CalendarEventKind)));
  } catch {
    return new Set();
  }
}

export function serializeHiddenKinds(hidden: ReadonlySet<CalendarEventKind>): string {
  // Sorted so the same selection always writes the same string — otherwise two
  // tabs with identical filters keep overwriting each other with reordered JSON.
  return JSON.stringify([...hidden].sort());
}

/** "All events", "Exams hidden", "3 kinds hidden" — the label on the control,
 *  so the student can see a filter is on without opening it. A filter you
 *  cannot tell is active is how events go missing. */
export function describeFilter(hidden: ReadonlySet<CalendarEventKind>, labelOf: (kind: CalendarEventKind) => string): string {
  if (hidden.size === 0) return "All events";
  if (hidden.size === 1) return `${labelOf([...hidden][0]!)} hidden`;
  return `${hidden.size} kinds hidden`;
}
