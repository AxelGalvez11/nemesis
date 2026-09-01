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

// 🔴 `MAX_CHIPS_PER_DAY = 3` USED TO LIVE HERE AND IS GONE ON PURPOSE. It decided
// how many events a month cell showed, and it could not be right: the month grid
// stretches to fill the window, and Settings → Appearance resizes every piece of
// text in it, so the number that fits is a MEASUREMENT. It is taken at render
// time now — see lib/workspace/month-cell.ts and the ruler in month-grid.tsx.
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

/** Does this browser's locale write clock times as 3 PM rather than 15:00? */
const usesMeridiem = (): boolean =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? false;

export interface HourLabelParts {
  /** The number, or "Noon". */
  value: string;
  /** "AM"/"PM" where the locale uses one, so it can be set smaller. */
  suffix?: string;
}

/**
 * The label down the side of the week and day grids.
 *
 * Owner 2026-07-30: "the time stamps on the left look off too". They were
 * formatted with `formatEventTime`, which is built for an EVENT ("2:30 PM").
 * On an hour rule the ":00" is always zero, and at the app's text size the
 * extra three characters pushed "10:00 AM" onto two lines inside the gutter.
 * An hour marker only ever needs the hour.
 *
 * Locale-aware rather than hand-built: a 24-hour locale gets "15" and no
 * suffix. "Noon" is Apple's word for midday and only makes sense on a
 * 12-hour clock, so it is spelled out only there.
 */
export function hourLabel(hour: number): HourLabelParts {
  const meridiem = usesMeridiem();
  if (hour === 12 && meridiem) return { value: "Noon" };
  const formatted = new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" });
  const [value, ...rest] = formatted.split(" ");
  return { value: value ?? String(hour), ...(rest.length > 0 ? { suffix: rest.join(" ") } : {}) };
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
