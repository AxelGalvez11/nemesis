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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
    events: (byDay.get(key) ?? [])
      .slice()
      .sort((a, b) =>
        a.time && b.time ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : a.title.localeCompare(b.title),
      ),
  }));
}
