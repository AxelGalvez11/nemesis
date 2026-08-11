// Calendar data model — verbatim port of desktop apps/desktop/src/app/calendar/model.ts
// (types, date math, grid builders, sanitize) with the storage layer taken one step
// further: Electron file-IPC → localStorage (desktop-parity) → `calendar_events`
// cloud rows, one row per event (cloud-first phone spec §5). localStorage stays as
// an offline/warm cache — refreshed after every successful cloud read, and the
// ONLY source of truth in preview mode / while signed out (no Supabase calls
// there, matching sessions-store.ts and study-cloud-store.ts).
//
// The old whole-file "agent vs manual merge on save" rule is gone: per-event rows
// mean a manual save only ever touches its own row, so a concurrent agent write to
// a DIFFERENT row is never at risk. Agent-authored events (source: 'agent') stay
// read-only in the UI — calendar-workspace.tsx only ever routes them to the
// read-only view dialog, never to saveCalendarEvent/deleteCalendarEvent.

import { supabase } from "@/lib/supabase";

import { decodeCalendarEvent, encodeCalendarEvent } from "./calendar-codec";
import { fetchAllRows } from "./supabase-paging";

export type CalendarEventKind = "assignment" | "exam" | "rotation" | "class" | "other";

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd, NO timezone — always parsed as LOCAL date. */
  date: string;
  time?: string;
  endTime?: string;
  kind: CalendarEventKind;
  course?: string;
  note?: string;
  /** 'agent' events are read-only in the UI. */
  source?: "agent" | "manual";
  recurrence?: {
    /** 0 = Sunday … 6 = Saturday. */
    days: number[];
    /** Inclusive local yyyy-mm-dd end date. */
    until: string;
    /**
     * Dates the series does NOT meet: a cancelled lab, a reading week, a
     * lecture moved to a one-off row somewhere else.
     *
     * 🔴 This lives inside a jsonb column, so it survives only where it is
     * explicitly whitelisted — and there are TWO independent readers of that
     * column (`sanitizeEvent` here, `calendarEventFromRow` in
     * calendar-agent-range.ts). Both drop keys they do not name. Adding a field
     * to one and not the other loses it silently on that path, with no error
     * anywhere, so they move together and a test reads a row through both.
     */
    except?: string[];
  };
  /** UI-only identity for an expanded recurrence occurrence. */
  seriesId?: string;
}

export interface CalendarState {
  events: CalendarEvent[];
}

/** Context the caller (calendar-workspace.tsx) already has on hand from
 *  useAuth()/useWorkspacePreview() — this module needs no auth imports of its
 *  own beyond the Supabase client itself. */
export interface CalendarCloudCtx {
  userId: string | null;
  /** Dev-preview harness: pure-local behavior, no network calls (matches every
   *  other cloud store in the workspace). */
  preview: boolean;
}

// Legacy/preview key: unscoped by design. Preview mode keeps using it exactly
// as before (a single synthetic dev-preview session, no cross-account risk).
// It's ALSO where the one-time migration reads pre-cloud calendar data from —
// see migrateLocalCalendarToCloud below for why that key must be unscoped too.
export const CALENDAR_STORAGE_KEY = "nemesis.web.calendar.v1";
// Single GLOBAL flag — deliberately NOT per-uid. The legacy key above is
// itself global (pre-cloud calendar predates the idea of "whose" browser
// cache this is), so only the FIRST signed-in account on a given browser may
// ever claim it; migrateLocalCalendarToCloud deletes the legacy key the
// moment it's claimed, so no later account on the same device can read
// (or re-upload) another account's data. A per-uid flag would have left the
// legacy key sitting there for every subsequent sign-in to also claim.
const CALENDAR_CLOUD_MIGRATED_KEY = "nemesis.web.calendar.cloudmigrated.v1";
const CALENDAR_EVENT_COLUMNS = "id,title,date,time,end_time,kind,course,note,source,recurrence";

/** The ONGOING per-account warm-cache key — every signed-in user's cache
 *  lives at its own key, so switching accounts on the same browser can never
 *  read (or migrate) a different account's cached events. */
function calendarCacheKey(userId: string): string {
  return `${CALENDAR_STORAGE_KEY}:${userId}`;
}

const VALID_KINDS: readonly CalendarEventKind[] = ["assignment", "exam", "rotation", "class", "other"];

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The ONE reader of the `recurrence` jsonb column.
 *
 * 🔴 There used to be two, hand-kept in step: `sanitizeEvent` below and
 * `calendarEventFromRow` in calendar-agent-range.ts. Both whitelisted keys and
 * dropped the rest, so a field added to one and missed in the other vanished on
 * that path with no error — the calendar page would honour a cancellation the
 * chat could not see, or the reverse. One function, imported by both.
 *
 * Anything malformed yields `null` rather than a half-parsed rule: a rule with
 * no days or no end is not a schedule, and expanding it would either produce
 * nothing or run forever.
 */
export function parseRecurrence(raw: unknown): CalendarEvent["recurrence"] | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const days = Array.isArray(value.days)
    ? value.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  if (days.length === 0) return null;
  if (typeof value.until !== "string" || !DATE_KEY.test(value.until)) return null;
  const except = Array.isArray(value.except)
    ? [...new Set(value.except.filter((date): date is string => typeof date === "string" && DATE_KEY.test(date)))].sort()
    : [];
  return {
    days: [...new Set(days)].sort(),
    until: value.until,
    ...(except.length > 0 ? { except } : {}),
  };
}

// A malformed entry is dropped, not fatal to the whole file.
/** 🔴 DELEGATES. This used to name every key itself, and `calendarEventFromRow` named them
 *  again for the cloud path — two lists that had to be kept in step by hand, and a field added
 *  to one and missed in the other vanished silently on that path. There is now ONE decoder.
 *  Do not re-inline this. */
const sanitizeEvent = decodeCalendarEvent;

function parseCalendarEvents(text: string): CalendarEvent[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { events?: unknown };
    if (!Array.isArray(parsed.events)) return [];
    return parsed.events.map(sanitizeEvent).filter((e): e is CalendarEvent => e !== null);
  } catch {
    return [];
  }
}

/** Keyed localStorage read — the same underlying storage serves three
 *  distinct scopes (see callers): the legacy/preview key, and each signed-in
 *  account's own per-uid warm-cache key. */
async function readLocalCalendarState(key: string): Promise<CalendarState> {
  if (typeof window === "undefined") return { events: [] };
  try {
    const raw = window.localStorage.getItem(key);
    return { events: parseCalendarEvents(raw ?? "") };
  } catch {
    return { events: [] };
  }
}

function writeLocalCalendarState(key: string, state: CalendarState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ events: state.events }, null, 2));
  } catch {
    // Quota/private mode — the in-memory copy stays authoritative for the tab.
  }
}

/** 🔴 DELEGATES, for the same reason the reader does — a writer that named its own columns
 *  could disagree with the decoder about what a field is called, and nothing would report it. */
function toCloudRow(event: CalendarEvent, userId: string, source: "agent" | "manual") {
  return encodeCalendarEvent(event, userId, source);
}

/** One-time upload of whatever was sitting in the legacy unscoped key before
 *  this browser had a cloud calendar — GLOBALLY flagged so only the FIRST
 *  signed-in account on this browser ever claims it. The legacy key is
 *  deleted the moment it's claimed (empty or not), so no later sign-in on the
 *  same device/browser can read, let alone re-upload, another account's data.
 *  Best-effort: a failed upload leaves BOTH the flag and the legacy key alone
 *  so the next load simply retries (the upsert is idempotent on id); it never
 *  blocks or fails the read that wraps it. */
async function migrateLocalCalendarToCloud(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(CALENDAR_CLOUD_MIGRATED_KEY) === "1") return;
  } catch {
    return;
  }
  const legacy = await readLocalCalendarState(CALENDAR_STORAGE_KEY);
  if (legacy.events.length > 0) {
    const rows = legacy.events.map((event) => toCloudRow(event, userId, event.source === "agent" ? "agent" : "manual"));
    const { error } = await supabase.from("calendar_events").upsert(rows, { onConflict: "id" });
    if (error) return;
  }
  try {
    window.localStorage.removeItem(CALENDAR_STORAGE_KEY);
    window.localStorage.setItem(CALENDAR_CLOUD_MIGRATED_KEY, "1");
  } catch {
    // Private mode — migration retries every load; harmless since upsert is idempotent.
  }
}

/** Cloud-aware load: preview + signed-out stay pure-local, reading the shared
 *  legacy/preview key (see readLocalCalendarState). Signed-in reads
 *  `calendar_events`, refreshing THIS account's own per-uid warm-cache key on
 *  success; a network failure (offline) falls back to that same per-uid cache
 *  so the calendar still renders — never the legacy/preview key. */
export async function loadCalendarEvents(ctx: CalendarCloudCtx): Promise<CalendarState> {
  if (ctx.preview || !ctx.userId) return readLocalCalendarState(CALENDAR_STORAGE_KEY);
  const userId = ctx.userId;
  await migrateLocalCalendarToCloud(userId);
  const cacheKey = calendarCacheKey(userId);
  try {
    // Paged, and the sort ends in `id`: a syllabus import writes a whole term of
    // events sharing one date, so date alone could never split pages safely.
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("calendar_events")
        .select(CALENDAR_EVENT_COLUMNS)
        .eq("user_id", userId)
        .order("date", { ascending: true })
        .order("id")
        .range(from, to),
    );
    const events = (data ?? []).flatMap((row) => {
      const event = sanitizeEvent(row);
      return event ? [event] : [];
    });
    const state: CalendarState = { events };
    writeLocalCalendarState(cacheKey, state);
    return state;
  } catch {
    return readLocalCalendarState(cacheKey); // offline — last warm cache for THIS account
  }
}

/** Insert-or-update a single event row — the per-event replacement for the old
 *  whole-file saveCalendarEvents. Always writes source:'manual': the UI never
 *  routes an agent-authored event here (see openEvent's view/edit dispatch in
 *  calendar-workspace.tsx), and this is the second line of defense. */
export async function saveCalendarEvent(event: CalendarEvent, ctx: CalendarCloudCtx): Promise<CalendarEvent> {
  const manualEvent: CalendarEvent = { ...event, source: "manual" };
  if (ctx.preview || !ctx.userId) {
    const state = await readLocalCalendarState(CALENDAR_STORAGE_KEY);
    const next: CalendarState = { events: [...state.events.filter((e) => e.id !== manualEvent.id), manualEvent] };
    writeLocalCalendarState(CALENDAR_STORAGE_KEY, next);
    return manualEvent;
  }
  const row = toCloudRow(manualEvent, ctx.userId, "manual");
  const { data, error } = await supabase
    .from("calendar_events")
    .upsert(row, { onConflict: "id" })
    .select(CALENDAR_EVENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const saved = sanitizeEvent(data);
  if (!saved) throw new Error("The event was saved but returned an invalid response.");
  return saved;
}

/** Deletes a single event row. Same UI guarantee as saveCalendarEvent: only
 *  ever called on a manual (non-agent) event. */
export async function deleteCalendarEvent(id: string, ctx: CalendarCloudCtx): Promise<void> {
  if (ctx.preview || !ctx.userId) {
    const state = await readLocalCalendarState(CALENDAR_STORAGE_KEY);
    writeLocalCalendarState(CALENDAR_STORAGE_KEY, { events: state.events.filter((e) => e.id !== id) });
    return;
  }
  const { error } = await supabase.from("calendar_events").delete().eq("id", id).eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
}

// ── Date helpers ─────────────────────────────────────────────────────────────
// yyyy-mm-dd parses as UTC midnight in `new Date()`, which renders as the
// PREVIOUS day in negative UTC-offset zones — always construct/format LOCAL
// dates instead.

export function parseDateKey(key: string): Date {
  const [yearPart, monthPart, dayPart] = key.split("-").map(Number);
  // noUncheckedIndexedAccess makes the destructure `number | undefined` — `year`
  // is only ever missing for a malformed key (sanitizeEvent already gates the
  // regex shape before this runs), `month`/`day` keep the original's `|| 1`.
  const year = yearPart ?? 0;
  return new Date(year, (monthPart || 1) - 1, dayPart || 1);
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

export function addWeeks(date: Date, delta: number): Date {
  return addDays(date, delta * 7);
}

export function addMonths(date: Date, delta: number): Date {
  // Clamp day-of-month into the target month's range — new Date(y,1,31) in a
  // non-leap year silently rolls to March 3; clamping keeps "next month" from
  // Jan 31 sane.
  const first = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const lastDayOfTarget = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDayOfTarget));
}

export function addYears(date: Date, delta: number): Date {
  return addMonths(date, delta * 12);
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

export interface MonthDay {
  date: Date;
  key: string;
  inMonth: boolean;
  isToday: boolean;
}

// 6x7 Sunday-first grid, padded with adjacent-month days (42 cells total).
export function monthGrid(year: number, month: number, today: Date): MonthDay[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const todayKey = dateKey(today);
  const days: MonthDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    days.push({ date, inMonth: date.getMonth() === month, isToday: dateKey(date) === todayKey, key: dateKey(date) });
  }
  return days;
}

export function weekGrid(anchor: Date, today: Date): MonthDay[] {
  const start = startOfWeek(anchor);
  const todayKey = dateKey(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, inMonth: true, isToday: dateKey(date) === todayKey, key: dateKey(date) };
  });
}

/** Expand a compact recurrence rule into UI-only occurrences. Stored rows stay
 * singular and editable; occurrence ids carry `seriesId` so the workspace can
 * open the original rule rather than creating dozens of independent events. */
export function expandRecurringEvents(events: CalendarEvent[], from?: Date, to?: Date): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      out.push(event);
      continue;
    }
    const start = parseDateKey(event.date);
    // Callers often pass a live `Date` carrying the current clock time. Work
    // entirely in local calendar days so an occurrence on the first/last day
    // is not dropped merely because midnight sorts before 3:42 PM.
    const requestedStart = from ? parseDateKey(dateKey(from)) : start;
    const hardEnd = addMonths(start, 18);
    const ruleEnd = parseDateKey(event.recurrence.until);
    const requestedEnd = to ? parseDateKey(dateKey(to)) : ruleEnd;
    const first = requestedStart > start ? requestedStart : start;
    const end = requestedEnd < ruleEnd ? requestedEnd : ruleEnd;
    const boundedEnd = end < hardEnd ? end : hardEnd;
    // A cancelled meeting is not a meeting. Kept as a Set so a term's worth of
    // holidays costs nothing per day.
    const skipped = new Set(event.recurrence.except ?? []);
    for (let cursor = new Date(first); cursor <= boundedEnd; cursor = addDays(cursor, 1)) {
      if (!event.recurrence.days.includes(cursor.getDay())) continue;
      const occurrenceDate = dateKey(cursor);
      if (skipped.has(occurrenceDate)) continue;
      out.push({
        ...event,
        date: occurrenceDate,
        id: `${event.id}@${occurrenceDate}`,
        seriesId: event.id,
      });
    }
  }
  return out;
}

export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of expandRecurringEvents(events)) {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  for (const list of map.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return map;
}

export function upcomingEvents(events: CalendarEvent[], from: Date, days: number): CalendarEvent[] {
  const fromKey = dateKey(from);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const toKey = dateKey(to);
  return expandRecurringEvents(events, from, to)
    .filter((event) => event.date >= fromKey && event.date <= toKey)
    .sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)));
}

export function dayEvents(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const key = dateKey(date);
  const onDate = expandRecurringEvents(events, date, date).filter((event) => event.date === key);
  const timed = onDate.filter((event) => event.time).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const untimed = onDate.filter((event) => !event.time);
  return [...timed, ...untimed];
}
