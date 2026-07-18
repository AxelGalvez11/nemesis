// Calendar agenda pure logic — parses the decrypted `kind: "calendar"` doc the
// Mac publishes and groups its events into the phone's agenda list.
// Dependency-free by design (Deno-testable, like library-sync.ts).

export type AgendaEventKind = "assignment" | "class" | "exam" | "other" | "rotation";

export interface AgendaEvent {
  id: string;
  title: string;
  /** yyyy-mm-dd, no timezone — always treated as a LOCAL date. */
  date: string;
  time?: string;
  kind: AgendaEventKind;
  course?: string;
  note?: string;
}

export interface CalendarDoc {
  v: 1;
  asOf: string;
  /** The tokenized ICS URL for the iPhone's built-in Calendar, or null. */
  feedUrl: null | string;
  events: AgendaEvent[];
}

const KINDS: ReadonlySet<string> = new Set(["assignment", "exam", "rotation", "class", "other"]);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanEvent(raw: unknown): AgendaEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" && value.id ? value.id : null;
  const title = typeof value.title === "string" && value.title ? value.title : null;
  const date = typeof value.date === "string" && DATE_KEY_RE.test(value.date) ? value.date : null;
  const kind = typeof value.kind === "string" && KINDS.has(value.kind) ? (value.kind as AgendaEventKind) : null;
  if (!id || !title || !date || !kind) return null;
  return {
    id,
    title,
    date,
    kind,
    ...(typeof value.time === "string" && value.time ? { time: value.time } : {}),
    ...(typeof value.course === "string" && value.course ? { course: value.course } : {}),
    ...(typeof value.note === "string" && value.note ? { note: value.note } : {}),
  };
}

/** Parse a decrypted calendar doc's `content`. Malformed events drop
 *  individually; a wrong envelope returns null. */
export function parseCalendarDoc(content: string): CalendarDoc | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || parsed.v !== 1) return null;
    const events = Array.isArray(parsed.events)
      ? parsed.events.map(cleanEvent).filter((event): event is AgendaEvent => event !== null)
      : [];
    return {
      v: 1,
      asOf: typeof parsed.asOf === "string" ? parsed.asOf : "",
      feedUrl: typeof parsed.feedUrl === "string" && parsed.feedUrl ? parsed.feedUrl : null,
      events,
    };
  } catch {
    return null;
  }
}

// --- agenda grouping -----------------------------------------------------------

export interface AgendaDay {
  key: string;
  label: string;
  events: AgendaEvent[];
}

/** Local yyyy-mm-dd for a Date. */
export function dayKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Shift a yyyy-mm-dd key by ±N days, rolling months/years over (Date normalizes
 *  out-of-range days for us). Powers the Day view's ‹ › paging. */
export function shiftDayKey(key: string, delta: number): string {
  const date = parseDayKey(key);
  return dayKeyFromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = WEEKDAYS.map((day) => day.slice(0, 3));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today" / "Tomorrow" / "Friday, Jul 24" — the agenda's day headers. */
export function labelForDay(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  const date = parseDayKey(key);
  const today = parseDayKey(todayKey);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 1) return "Tomorrow";
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// --- month grid ----------------------------------------------------------------

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthCell {
  /** yyyy-mm-dd for this cell. */
  key: string;
  day: number;
  /** false for the leading/trailing days that belong to the neighbouring month. */
  inMonth: boolean;
  isToday: boolean;
  /** How many events fall on this day (drives the dot markers). */
  eventCount: number;
  /** The dominant event kind on the day, for the dot color (exam > assignment > rest). */
  topKind: AgendaEventKind | null;
}

export interface MonthView {
  year: number;
  month: number;
  label: string;
  /** Rows of exactly 7 cells, Sunday-first, covering the whole month. */
  weeks: MonthCell[][];
}

const KIND_RANK: Record<AgendaEventKind, number> = { exam: 5, assignment: 4, rotation: 3, class: 2, other: 1 };

/** Build a Sunday-first calendar grid for one month, with each in-month day
 *  annotated by how many events land on it (and the highest-priority kind for
 *  the marker color). Pure — the caller passes today's key so "today" is
 *  deterministic. Leading/trailing cells fill out whole weeks. */
export function monthMatrix(year: number, month: number, events: AgendaEvent[], todayKey: string): MonthView {
  const byDay = new Map<string, AgendaEvent[]>();
  for (const event of events) {
    const list = byDay.get(event.date) ?? [];
    list.push(event);
    byDay.set(event.date, list);
  }

  const first = new Date(year, month, 1);
  const leadPad = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((leadPad + daysInMonth) / 7) * 7;

  const cells: MonthCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leadPad;
    const date = new Date(year, month, dayOffset + 1);
    const key = dayKeyFromDate(date);
    const dayEvents = byDay.get(key) ?? [];
    const topKind = dayEvents.reduce<AgendaEventKind | null>(
      (best, event) => (best === null || KIND_RANK[event.kind] > KIND_RANK[best] ? event.kind : best),
      null,
    );
    cells.push({
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: key === todayKey,
      eventCount: dayEvents.length,
      topKind,
    });
  }

  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { year, month, label: `${MONTHS_FULL[month]} ${year}`, weeks };
}

/** Step a (year, month) pair by ±1 month, rolling the year over. */
export function stepMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Time-sorted within a day, untimed events last, alphabetical tiebreak — the one
 *  comparator every per-day view (agenda list, week, day) shares. Pure: returns a
 *  new array, never mutates the input. */
function sortDayEvents(events: AgendaEvent[]): AgendaEvent[] {
  return events
    .slice()
    .sort((a, b) =>
      a.time && b.time ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : a.title.localeCompare(b.title),
    );
}

/** Upcoming events (today → today + horizon), grouped by day, day-sorted, and
 *  time-sorted within a day (untimed last). */
export function agendaDays(events: AgendaEvent[], todayKey: string, horizonDays = 90): AgendaDay[] {
  const today = parseDayKey(todayKey);
  const horizon = dayKeyFromDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + horizonDays));

  const byDay = new Map<string, AgendaEvent[]>();
  for (const event of events) {
    if (event.date < todayKey || event.date > horizon) continue;
    const list = byDay.get(event.date) ?? [];
    list.push(event);
    byDay.set(event.date, list);
  }

  return [...byDay.keys()].sort().map((key) => ({
    key,
    label: labelForDay(key, todayKey),
    events: sortDayEvents(byDay.get(key) ?? []),
  }));
}

/** One day's events, time-sorted (untimed last). The Day view's list. */
export function eventsForDay(events: AgendaEvent[], dayKey: string): AgendaEvent[] {
  return sortDayEvents(events.filter((event) => event.date === dayKey));
}

// --- week grid -------------------------------------------------------------------

export interface WeekDay {
  /** yyyy-mm-dd for this day. */
  key: string;
  /** Short weekday label, e.g. "Mon". */
  label: string;
  day: number;
  isToday: boolean;
  /** This day's events, time-sorted (untimed last). */
  events: AgendaEvent[];
}

/** The Sunday-first week containing `dateKey`, each day carrying its own
 *  time-sorted events. Pure — `todayKey` decides which cell is "today", same
 *  contract as monthMatrix. The Week view renders all 7 days, always (even the
 *  empty ones), so the week never looks like it's missing days. */
export function weekDays(events: AgendaEvent[], dateKey: string, todayKey: string): WeekDay[] {
  const anchor = parseDayKey(dateKey);
  const sunday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());

  return Array.from({ length: 7 }, (_, i) => {
    const cellDate = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    const key = dayKeyFromDate(cellDate);
    return {
      key,
      label: WEEKDAY_SHORT[cellDate.getDay()],
      day: cellDate.getDate(),
      isToday: key === todayKey,
      events: eventsForDay(events, key),
    };
  });
}
