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
  parseRecurrence,
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
  // Shared with the calendar page's own reader on purpose — see parseRecurrence.
  const recurrence = parseRecurrence(row.recurrence);
  if (recurrence) event.recurrence = recurrence;
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

/** How much of an event's note travels with it.
 *
 *  Owner 2026-08-05, acceptance test 3: every syllabus-imported event carries a
 *  note that opens "From your syllabus: …" and runs for hundreds of characters
 *  of surrounding page text. Ninety-two of them serialized past 20,000
 *  characters on their own, which is what forced the tool result to be clipped.
 *  A note is context, not content — enough to recognise the event is enough. */
export const EVENT_NOTE_PREVIEW_CHARS = 90;

/** First line-ish of a note, ellipsised, so the payload stays a list of events
 *  rather than a transcript of the syllabus it came from. */
export function notedPreview(note: string): string {
  const flat = note.replace(/\s+/g, " ").trim();
  return flat.length <= EVENT_NOTE_PREVIEW_CHARS ? flat : `${flat.slice(0, EVENT_NOTE_PREVIEW_CHARS).trimEnd()}…`;
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
      ...(event.note ? { note: notedPreview(event.note) } : {}),
      ...(event.seriesId ? { recurring: true as const } : {}),
    }));
}

/** Local today — the ONLY way the agent's calendar code derives "now". */
export function localToday(): string {
  return dateKey(new Date());
}

// ── How far back Nemesis can honestly speak ─────────────────────────────────
//
// Owner 2026-08-05, Phase 2 item 3: "Do not fake support for the impossible
// pre-year-1 query. Define the actual data boundary and return an explicit
// partial-coverage response when Nemesis lacks records for that period."
//
// The audit tool used to open its window at `0001-01-01` and close it at
// `9999-12-31`, then report that window back in its result. Both dates are
// fiction. Nothing was scanned from year 1, because nothing exists there — but
// a model reading `{"window":{"from":"0001-01-01"}}` has been told, in the most
// literal channel it has, that the whole of history came back clean. Asked
// "have I ever double-booked?", the honest answer is "here is what I have, and
// it starts in January" — not silence dressed as completeness.

/** What the account can actually answer for, and what was asked. */
export interface CalendarCoverage {
  /** Earliest date Nemesis holds for this student; null when nothing exists. */
  earliest_record: string | null;
  /** Latest, counting where repeating rules run to. */
  latest_record: string | null;
  /** The window the audit actually walked. */
  from: string;
  to: string;
  /** True when the caller asked for a period Nemesis has no records for. */
  partial: boolean;
  /** Plain English for the model to repeat, rather than infer. */
  note: string;
}

/**
 * Resolve an audit window against the records that exist.
 *
 * A request reaching before `earliest_record` is not an error and not an empty
 * result — it is a request Nemesis can answer for part of, and it says which
 * part. With no records at all there is no boundary to state, so it says that
 * instead of inventing a range.
 */
export function calendarCoverage(
  events: readonly CalendarEvent[],
  requested: { from?: string; to?: string },
): CalendarCoverage {
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const event of events) {
    if (earliest === null || event.date < earliest) earliest = event.date;
    if (latest === null || event.date > latest) latest = event.date;
    if (event.recurrence && (latest === null || event.recurrence.until > latest)) latest = event.recurrence.until;
  }

  const askedFrom = requested.from && isDateKey(requested.from) ? requested.from : "";
  const askedTo = requested.to && isDateKey(requested.to) ? requested.to : "";

  if (earliest === null || latest === null) {
    const today = localToday();
    return {
      earliest_record: null,
      from: askedFrom || today,
      latest_record: null,
      note: "This student has no calendar events at all yet, so there is nothing to audit — say that plainly rather than reporting a clean calendar.",
      partial: false,
      to: askedTo || today,
    };
  }

  const from = askedFrom && askedFrom > earliest ? askedFrom : earliest;
  const to = askedTo && askedTo < latest ? askedTo : latest;
  const partial = Boolean(askedFrom && askedFrom < earliest) || Boolean(askedTo && askedTo > latest);
  const shortfall: string[] = [];
  if (askedFrom && askedFrom < earliest) shortfall.push(`nothing before ${earliest}`);
  if (askedTo && askedTo > latest) shortfall.push(`nothing after ${latest}`);

  return {
    earliest_record: earliest,
    from,
    latest_record: latest,
    note: partial
      ? `Checked ${from} to ${to}. The student asked about a wider period, but Nemesis holds ${shortfall.join(" and ")} — say so rather than implying those years were checked and were clean.`
      : `Checked ${from} to ${to}, which is every calendar record this student has.`,
    partial,
    to,
  };
}
