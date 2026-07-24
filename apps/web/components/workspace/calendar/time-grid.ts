// Time-grid layout — the arithmetic behind a real week/day view: where an
// event block starts, how tall it is, and what happens when two overlap.
//
// This is the difference between a calendar and a list of labels. The old
// week view stacked text chips in a column; nothing showed that a 9am lecture
// and a 9:30 lab collide, or that one runs twice as long as the other.
//
// One honest limitation drives the whole design. `calendar_events` stores a
// single `date` and a free-text `time` — there is NO end time and no duration
// (supabase/migrations/20260720210000_cloud_chat_calendar.sql). So a block's
// height cannot be read from the data; it is drawn at DEFAULT_EVENT_MINUTES.
// The migration that adds `end_time` is written but not applied — when it is,
// only `durationOf` below needs to change.
//
// Events with no time at all (most syllabus deadlines: "due Friday") are NOT
// given a fake time. They go to a separate all-day strip above the grid, the
// way every real calendar handles them.
//
// Pure and DOM-free so the packing can be tested without rendering anything.

import type { CalendarEvent } from "@/lib/workspace/calendar-model";

/** Height of one hour, in pixels. The single knob for grid density. */
export const HOUR_HEIGHT = 48;
/** Drawn length of an event, until the data can say how long it really is. */
export const DEFAULT_EVENT_MINUTES = 45;
/** Never draw a block too short to read its title. */
export const MIN_BLOCK_MINUTES = 24;
/** The window shown when a day has no timed events — a working day, not 24
 *  hours of empty rows the student has to scroll past. */
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 20;

/** Minutes past midnight for "HH:MM", or null if it is not a time. Anything
 *  this rejects is treated as untimed and moved to the all-day strip, which is
 *  the safe direction: a mis-parsed time would put a block at the wrong hour. */
export function minutesOf(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** How long to draw an event. Reads a real end time when one exists, so this
 *  is the ONLY place that changes once the end_time column is applied. */
function durationOf(_event: CalendarEvent): number {
  return DEFAULT_EVENT_MINUTES;
}

export interface PositionedEvent {
  event: CalendarEvent;
  /** Minutes past midnight. */
  startMinute: number;
  endMinute: number;
  /** Which of `columns` side-by-side slots this block occupies. */
  column: number;
  columns: number;
}

export interface DayLayout {
  /** Events with a readable time, positioned and packed. */
  timed: PositionedEvent[];
  /** Everything else — shown in the all-day strip, never invented onto the grid. */
  allDay: CalendarEvent[];
}

/** Split a day's events into timed and untimed, and pack overlapping timed
 *  ones into side-by-side columns. */
export function layoutDay(events: readonly CalendarEvent[]): DayLayout {
  const allDay: CalendarEvent[] = [];
  const timed: PositionedEvent[] = [];

  for (const event of events) {
    const start = minutesOf(event.time);
    if (start === null) {
      allDay.push(event);
      continue;
    }
    const length = Math.max(durationOf(event), MIN_BLOCK_MINUTES);
    timed.push({ column: 0, columns: 1, endMinute: Math.min(start + length, 24 * 60), event, startMinute: start });
  }

  timed.sort((a, b) => (a.startMinute === b.startMinute ? a.endMinute - b.endMinute : a.startMinute - b.startMinute));
  packColumns(timed);
  return { allDay, timed };
}

/**
 * Assign side-by-side columns to overlapping blocks.
 *
 * Walks the sorted list building CLUSTERS — runs of events connected by
 * overlap. Within a cluster every block gets the leftmost column free at its
 * start, and then the whole cluster is told how many columns it needs, so all
 * blocks in one collision are the same width. Doing that per-cluster rather
 * than per-day is what stops a single 8am clash from narrowing every
 * unrelated event later in the day.
 */
function packColumns(positioned: PositionedEvent[]): void {
  let cluster: PositionedEvent[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    if (cluster.length === 0) return;
    const width = Math.max(...cluster.map((item) => item.column)) + 1;
    for (const item of cluster) item.columns = width;
    cluster = [];
  };

  for (const item of positioned) {
    // A gap with nothing running means the previous collision is over.
    if (item.startMinute >= clusterEnd) {
      closeCluster();
      clusterEnd = item.endMinute;
    } else {
      clusterEnd = Math.max(clusterEnd, item.endMinute);
    }
    // Lowest column not occupied by something still running at this moment.
    const busy = new Set(cluster.filter((other) => other.endMinute > item.startMinute).map((other) => other.column));
    let column = 0;
    while (busy.has(column)) column += 1;
    item.column = column;
    cluster.push(item);
  }
  closeCluster();
}

export interface HourWindow {
  startHour: number;
  endHour: number;
}

/**
 * The hour range to draw. Starts from a normal working day and widens to fit
 * anything outside it, so an 06:30 clinical or a 21:00 deadline is never
 * scrolled out of existence — but an ordinary week does not render a wall of
 * empty midnight hours either.
 */
export function hourWindow(days: readonly DayLayout[]): HourWindow {
  let earliest = DEFAULT_START_HOUR * 60;
  let latest = DEFAULT_END_HOUR * 60;
  for (const day of days) {
    for (const item of day.timed) {
      earliest = Math.min(earliest, item.startMinute);
      latest = Math.max(latest, item.endMinute);
    }
  }
  return { endHour: Math.min(24, Math.ceil(latest / 60)), startHour: Math.max(0, Math.floor(earliest / 60)) };
}

/** Vertical offset in pixels for a minute-of-day inside a window. */
export function offsetFor(minute: number, window: HourWindow): number {
  return ((minute - window.startHour * 60) / 60) * HOUR_HEIGHT;
}

/** Total grid height for a window. */
export function windowHeight(window: HourWindow): number {
  return (window.endHour - window.startHour) * HOUR_HEIGHT;
}

/** The hour labels down the gutter. */
export function hourLabels(window: HourWindow): number[] {
  return Array.from({ length: window.endHour - window.startHour }, (_, i) => window.startHour + i);
}

/** Where the "now" line sits, or null when the current time is outside the
 *  drawn window — in which case no line is drawn at all, rather than one
 *  pinned misleadingly to the top or bottom edge. */
export function nowOffset(now: Date, window: HourWindow): number | null {
  const minute = now.getHours() * 60 + now.getMinutes();
  if (minute < window.startHour * 60 || minute > window.endHour * 60) return null;
  return offsetFor(minute, window);
}
