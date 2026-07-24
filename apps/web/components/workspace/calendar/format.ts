// Calendar UI constants + formatting helpers — ported from the display-only
// half of desktop apps/desktop/src/app/calendar/index.tsx (everything that
// isn't the pure data model already lives in lib/workspace/calendar-model.ts).

import { addDays, parseDateKey, startOfWeek } from "@/lib/workspace/calendar-model";

export type CalendarViewMode = "day" | "week" | "month" | "year";

export interface CalendarViewOption {
  id: CalendarViewMode;
  label: string;
}

export const VIEW_OPTIONS: readonly CalendarViewOption[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

export const VIEW_UNIT_LABEL: Record<CalendarViewMode, string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MAX_CHIPS_PER_DAY = 4;
export const AGENDA_WINDOW_DAYS = 30;

export const CALENDAR_VIEW_STORAGE_KEY = "nemesis.calendar.view";

const VALID_VIEWS: readonly CalendarViewMode[] = ["day", "week", "month", "year"];

export function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return typeof value === "string" && (VALID_VIEWS as readonly string[]).includes(value);
}

export function formatEventDate(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short", weekday: "short" });
}

/** "14:30" → "2:30 PM"; falls back to the raw string if unparseable. */
export function formatEventTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return time;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function viewLabel(view: CalendarViewMode, cursor: Date): string {
  if (view === "day") {
    return cursor.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (view === "week") {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    const startLabel = start.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const endLabel = end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }
  if (view === "month") {
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return String(cursor.getFullYear());
}
