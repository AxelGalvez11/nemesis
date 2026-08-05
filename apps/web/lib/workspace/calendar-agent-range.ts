// The pure half of the agent's calendar range read.
//
// The contract (owner 2026-08-05): `list_calendar_events(start, end)` means
// ALL the student's events in that range — past or future, one page or ten,
// recurring classes expanded into the dates they actually meet — and the model
// must never need to know pagination exists. The Supabase paging half lives in
// agent-tools.ts (fetchAllRows); everything decidable without a network sits
// here so the acceptance cases ("what do I have today", "show me everything
// this semester") are pinned by unit tests.
//
// Timezone: "today" is the student's LOCAL date (calendar-model's dateKey),
// never `toISOString().slice(0,10)` — the UTC version says tomorrow every
// evening in the Americas, which silently hid same-day deadlines from the
// agent between 7 PM and midnight CDT.

import {
  addDays,
  dateKey,
  expandRecurringEvents,
  parseDateKey,
  type CalendarEvent,
  type CalendarEventKind,
} from "./calendar-model";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_KINDS = new Set<CalendarEventKind>(["assignment", "exam", "rotation", "class", "other"]);

export function isDateKey(value: string): boolean {
  return DATE_KEY_RE.test(value);
}

/** One calendar_events row as Supabase returns it. */
export interface CalendarEventRow {
  id: unknown;
  title: unknown;
  date: unknown;
  time?: unknown;
  end_time?: unknown;
  kind?: unknown;
  course?: unknown;
  note?: unknown;
  source?: unknown;
  recurrence?: unknown;
}

/** Row → typed event; null for a malformed row (dropped, never fatal). */
export function calendarEventFromRow(row: CalendarEventRow): CalendarEvent | null {
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.title !== "string" || !row.title) return null;
  if (typeof row.date !== "string" || !DATE_KEY_RE.test(row.date)) return null;
  const kind = typeof row.kind === "string" && VALID_KINDS.has(row.kind as CalendarEventKind)
    ? (row.kind as CalendarEventKind)
    : "other";
  const event: CalendarEvent = { date: row.date, id: row.id, kind, title: row.title };
  if (typeof row.time === "string" && row.time) event.time = row.time;
  if (typeof row.end_time === "string" && row.end_time) event.endTime = row.end_time;
  if (typeof row.course === "string" && row.course) event.course = row.course;
  if (typeof row.note === "string" && row.note) event.note = row.note;
  if (row.source === "agent" || row.source === "manual") event.source = row.source;
  if (row.recurrence && typeof row.recurrence === "object") {
    const recurrence = row.recurrence as { days?: unknown; until?: unknown };
    const days = Array.isArray(recurrence.days)
      ? recurrence.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : [];
    if (days.length > 0 && typeof recurrence.until === "string" && DATE_KEY_RE.test(recurrence.until)) {
      event.recurrence = { days: [...new Set(days)], until: recurrence.until };
    }
  }
  return event;
}

/** The window a list call asked for, resolved deterministically.
 *  - explicit start/end win (either alone is honored);
 *  - otherwise days_ahead forward from local today (default 30, cap 366);
 *  - a start after its end is swapped rather than erroring — the model meant
 *    the range, not the order. */
export function resolveCalendarWindow(
  args: { start_date?: string; end_date?: string; days_ahead?: number },
  today: string,
): { from: string; to: string } {
  const start = typeof args.start_date === "string" && isDateKey(args.start_date.trim()) ? args.start_date.trim() : "";
  const end = typeof args.end_date === "string" && isDateKey(args.end_date.trim()) ? args.end_date.trim() : "";
  if (start || end) {
    const from = start || today;
    const to = end || dateKey(addDays(parseDateKey(from), 180));
    return from <= to ? { from, to } : { from: to, to: from };
  }
  const days = Number.isFinite(args.days_ahead) && (args.days_ahead as number) > 0
    ? Math.min(Math.floor(args.days_ahead as number), 366)
    : 30;
  return { from: today, to: dateKey(addDays(parseDateKey(today), days)) };
}

/** What the model receives per event. `id` is ALWAYS the real row id — a
 *  recurring occurrence reports its series' id plus `recurring: true`, so
 *  update/delete calls always have a handle that exists in the database. */
export interface AgentCalendarEvent {
  id: string;
  title: string;
  date: string;
  kind: string;
  time?: string;
  end_time?: string;
  course?: string;
  note?: string;
  recurring?: true;
}

/** Occurrences visible in [from, to], expanded and sorted. Recurring anchors
 *  whose own row date sits BEFORE the window still contribute their in-window
 *  occurrences — which is why the loader must fetch recurring rows from before
 *  the window's start (see loadCalendarRangeRows in agent-tools.ts). */
export function eventsInWindow(events: readonly CalendarEvent[], from: string, to: string): AgentCalendarEvent[] {
  const expanded = expandRecurringEvents([...events], parseDateKey(from), parseDateKey(to));
  return expanded
    .filter((event) => event.date >= from && event.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id))
    .map((event) => ({
      date: event.date,
      id: event.seriesId ?? event.id,
      kind: event.kind,
      title: event.title,
      ...(event.time ? { time: event.time } : {}),
      ...(event.endTime ? { end_time: event.endTime } : {}),
      ...(event.course ? { course: event.course } : {}),
      ...(event.note ? { note: event.note } : {}),
      ...(event.seriesId ? { recurring: true as const } : {}),
    }));
}

/** Local today — the ONLY way the agent's calendar code derives "now". */
export function localToday(): string {
  return dateKey(new Date());
}
