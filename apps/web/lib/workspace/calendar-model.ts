// Calendar data model — verbatim port of desktop apps/desktop/src/app/calendar/model.ts
// (types, date math, grid builders, sanitize, agent/manual merge rule) with the
// storage layer swapped from the Electron `window.hermesDesktop` file-IPC bridge
// to localStorage. Same CalendarState JSON shape either way.
//
// The merge rule in saveCalendarEvents is the actual point of the feature: agent
// (Nemesis-authored) events are always re-read fresh from the store, never taken
// from the in-memory `localEvents` the UI passes in, so a manual save can never
// clobber a concurrent agent write. Preserved intact across the port.

export type CalendarEventKind = "assignment" | "exam" | "rotation" | "class" | "other";

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd, NO timezone — always parsed as LOCAL date. */
  date: string;
  time?: string;
  kind: CalendarEventKind;
  course?: string;
  note?: string;
  /** 'agent' events are read-only in the UI. */
  source?: "agent" | "manual";
}

export interface CalendarState {
  events: CalendarEvent[];
}

export const CALENDAR_STORAGE_KEY = "nemesis.web.calendar.v1";

const VALID_KINDS: readonly CalendarEventKind[] = ["assignment", "exam", "rotation", "class", "other"];

// A malformed entry is dropped, not fatal to the whole file.
function sanitizeEvent(raw: unknown): CalendarEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || e.id.length === 0) return null;
  if (typeof e.title !== "string" || e.title.length === 0) return null;
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;
  if (typeof e.kind !== "string" || !VALID_KINDS.includes(e.kind as CalendarEventKind)) return null;

  const event: CalendarEvent = { id: e.id, title: e.title, date: e.date, kind: e.kind as CalendarEventKind };
  if (typeof e.time === "string") event.time = e.time;
  if (typeof e.course === "string") event.course = e.course;
  if (typeof e.note === "string") event.note = e.note;
  if (e.source === "agent" || e.source === "manual") event.source = e.source;
  return event;
}

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

/** Web replacement for the Electron `readFileText(CALENDAR_FILE)` IPC call. */
export async function loadCalendarState(): Promise<CalendarState> {
  if (typeof window === "undefined") return { events: [] };
  try {
    const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY);
    return { events: parseCalendarEvents(raw ?? "") };
  } catch {
    return { events: [] };
  }
}

/** Web replacement for the Electron `writeTextFile(CALENDAR_FILE, ...)` IPC call. */
function writeCalendarState(state: CalendarState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify({ events: state.events }, null, 2));
  } catch {
    // Quota/private mode — the in-memory copy stays authoritative for the tab.
  }
}

/**
 * Saves the caller's local (manual + whatever agent events it happened to have
 * in memory) event list, but re-reads agent events fresh from storage first so
 * a manual edit can never overwrite an agent write that landed concurrently.
 */
export async function saveCalendarEvents(localEvents: CalendarEvent[]): Promise<CalendarState> {
  const disk = await loadCalendarState();
  const agentEvents = disk.events.filter((event) => event.source === "agent");
  const manualEvents = localEvents.filter((event) => event.source !== "agent");
  const next: CalendarState = { events: [...agentEvents, ...manualEvents] };
  writeCalendarState(next);
  return next;
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

export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
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
  return events
    .filter((event) => event.date >= fromKey && event.date <= toKey)
    .sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)));
}

export function dayEvents(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const key = dateKey(date);
  const onDate = events.filter((event) => event.date === key);
  const timed = onDate.filter((event) => event.time).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const untimed = onDate.filter((event) => !event.time);
  return [...timed, ...untimed];
}
