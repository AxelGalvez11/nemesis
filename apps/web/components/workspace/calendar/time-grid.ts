// Time-grid layout — the arithmetic behind a real week/day view: where an
// event block starts, how tall it is, and what happens when two overlap.
//
// This is the difference between a calendar and a list of labels. The old
// week view stacked text chips in a column; nothing showed that a 9am lecture
// and a 9:30 lab collide, or that one runs twice as long as the other.
//
// `calendar_events` stores a `date`, a free-text `time` and — since migration
// 20260724200000_calendar_end_time_recurrence.sql, which IS applied — an
// `end_time`. An event that carries one is drawn at its real length; anything
// without one still falls back to DEFAULT_EVENT_MINUTES, because most rows
// predate the column and syllabus imports rarely state an end.
//
// That column is what makes dragging out a time range possible at all: without
// somewhere to put the end, a drag could only ever produce a start.
//
// Events with no time at all (most syllabus deadlines: "due Friday") are NOT
// given a fake time. They go to a separate all-day strip above the grid, the
// way every real calendar handles them.
//
// Pure and DOM-free so the packing can be tested without rendering anything.

import { type CalendarEvent, isAllDay } from "@/lib/workspace/calendar-model";

/**
 * Height of one hour, in pixels. The single knob for grid density.
 *
 * 54: Google's 48px hour converted to this app's root (48 x 18/16). Owner
 * 2026-09-01, "it all needs to match one to one".
 *
 * It was 36 for a month, from 48 (owner 2026-07-31: "the calendar feels too
 * zoomed in at default 100%", pointing at Google Calendar). That instinct was
 * right and the number it produced was not, because the Google figure it was
 * aiming at had been read wrong:
 *
 * 🔴 THE MEASUREMENT THIS WAS BUILT ON WAS WRONG, TWICE. It used to read: "its
 * rows are 24px on a 16px root font ... this app's root is 20px, so the
 * like-for-like figure is 30px". Both numbers are false, and they compounded:
 *
 *   - Google's hour row is 48px, not 24. It is `--cal-timed-grid-cell-height`,
 *     re-measured on the live app 2026-09-01 and confirmed against the whole
 *     day's scroll height (24 x 48 = 1152px). The 24px figure came from a
 *     hidden duplicate of the hour labels that Google renders offscreen.
 *   - This app's root is 18px, not 20 (`globals.css:530`, `font-size: 112.5%`).
 *
 * The like-for-like figure is therefore 48 x (18/16) = 54px, not 30. Google's
 * own density ladder runs 40 / 48 / 60 / 72 / 80 / 96 / 116, so 36 was BELOW
 * even its compact setting once the root difference is taken out — which is
 * why blocks could not show their own titles.
 *
 * Everything measured, both sides, is in `docs/google-calendar-reference.md`,
 * and `measure-calendar.mjs` re-checks it against our grid. Change this number
 * there and here together, or the file rots.
 */
export const HOUR_HEIGHT = 54;
/** Drawn length of an event, until the data can say how long it really is. */
export const DEFAULT_EVENT_MINUTES = 45;
/** Never draw a block too short to read its title. */
export const MIN_BLOCK_MINUTES = 24;
/**
 * The grid always draws a WHOLE DAY, midnight to midnight (owner 2026-07-31,
 * pointing at Google Calendar).
 *
 * This replaced a window that started at the working day and stretched to fit
 * whatever lay outside it. That kept the page short, but it meant the grid
 * silently changed length as events moved, 01:00 simply did not exist until
 * something was already there, and a student could not scroll to a time to
 * create an event at it. A real calendar is the full day and you scroll.
 */
export const FULL_DAY: HourWindow = { endHour: 24, startHour: 0 };

/** Where the grid is scrolled to when it opens. Midnight is a wall of empty
 *  rows; every desktop calendar opens near the working day instead. */
export const SCROLL_TO_HOUR = 8;

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
function durationOf(event: CalendarEvent): number {
  const start = minutesOf(event.time);
  const end = minutesOf(event.endTime);
  if (start !== null && end !== null && end > start) return end - start;
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
    // 🔴 `isAllDay` RATHER THAN "HAS NO TIME". An event can now say outright that
    // it covers whole days, and a multi-day run belongs in the strip on every day
    // it covers even though its first day carries a start time.
    const start = isAllDay(event) || (event.spanLength ?? 1) > 1 ? null : minutesOf(event.time);
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

/** How far each overlapping block is pushed right of the one beneath it, as a
 *  fraction of the day column. See blockGeometry for why this is not an even
 *  split. */
const OVERLAP_INSET = 0.26;
/** The narrowest a staggered block may get, as a fraction of the column. */
const MIN_BLOCK_FRACTION = 0.4;

export interface BlockGeometry {
  /** Percentages of the day column. */
  leftPct: number;
  widthPct: number;
  /** Later columns paint over earlier ones. */
  zIndex: number;
}

/**
 * Where a packed block actually sits.
 *
 * Splitting a column into n EQUAL parts is the obvious approach and it fails in
 * practice: measured in a 7-day week at a normal window width, two overlapping
 * events came out 36px wide — about three characters, so every title rendered
 * as "P…". Instead each block is inset from the previous one and runs to the
 * right edge, so the topmost keeps the full width and the ones beneath stay
 * readable, with the overlap shown by the stagger. This is what Google Calendar
 * and Notion do, for the same reason.
 *
 * The inset shrinks as the pile deepens so the last block never falls below
 * MIN_BLOCK_FRACTION of the column.
 */
export function blockGeometry(column: number, columns: number): BlockGeometry {
  if (columns <= 1) return { leftPct: 0, widthPct: 100, zIndex: 0 };
  const inset = Math.min(OVERLAP_INSET, (1 - MIN_BLOCK_FRACTION) / (columns - 1));
  const leftPct = column * inset * 100;
  return { leftPct, widthPct: 100 - leftPct, zIndex: column };
}

// ── How much of an event a block is tall enough to show ──────────────────────

/**
 * 🔴 A BLOCK MUST NEVER RENDER MORE LINES THAN IT CAN HOLD.
 *
 * Owner-reported 2026-07-31, right after the grid density was retuned: a
 * 45-minute event drew its title and its time, and the box was too short for
 * both, so the second line was sliced through the middle of the glyphs. Text cut
 * horizontally with an ellipsis reads as deliberate; text cut horizontally
 * through its own letters reads as broken software.
 *
 * The old guard was a single `height > 26`, which was tuned when an hour was 48
 * pixels and silently became wrong at 36 — and it tested the LAYOUT height while
 * the box is actually rendered two pixels shorter, so it was answering a
 * slightly different question than the one that matters.
 *
 * The thresholds below are the rendered type, added up. At this app's 20px root
 * font: a title line is 0.6875rem at leading-tight, about 17px; the time line is
 * 0.625rem, about 16px; the border costs 2px; the padding differs per tier,
 * which is the point — a short block buys room by giving up padding rather than
 * by clipping.
 */
export type BlockDetail = "stacked" | "inline" | "title";

/** Title above the time, the roomy default: two line boxes + 10px padding + 2px
 *  border. */
export const STACKED_MIN_PX = 44;
/**
 * Title and time side by side on one line: a 17px line box + 5px padding + 2px
 * border is 24.2px, so 25 is the first height that holds it.
 *
 * Worth being exact rather than rounding up "for safety". An event with no end
 * time is drawn at DEFAULT_EVENT_MINUTES, which at this density renders at
 * exactly 25px — and every syllabus deadline and quick-created event has no end
 * time, so this is the COMMONEST block on the grid. A threshold one pixel
 * higher would have silently dropped the time from most of the calendar, which
 * is a worse bug than the clipping it was meant to prevent.
 */
export const INLINE_MIN_PX = 25;

/**
 * What a block of this rendered height can show without clipping.
 *
 * Takes the height the box is actually GIVEN, not the height the layout
 * computed — those differ, and the difference is exactly the gap the old guard
 * fell through. PURE.
 */
export function blockDetail(renderedHeightPx: number): BlockDetail {
  if (renderedHeightPx >= STACKED_MIN_PX) return "stacked";
  if (renderedHeightPx >= INLINE_MIN_PX) return "inline";
  return "title";
}

/** The height the block is actually drawn at, so the view and this module can
 *  never disagree about it. */
export function renderedBlockHeight(layoutHeightPx: number): number {
  return Math.max(layoutHeightPx - 2, 14);
}

export interface HourWindow {
  startHour: number;
  endHour: number;
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

// ── Pointer arithmetic ───────────────────────────────────────────────────────
// Everything below turns a pixel position into a time, which is what lets a
// student click 9am and get a 9am event instead of an untimed one.
//
// It lives here, apart from the components, for a practical reason: a drag
// cannot be driven by the browser tooling available to this project, so the
// only way any of it can be checked is as pure arithmetic. The DOM layer is
// deliberately thin — it reads a pointer offset and calls these.

/** Drags land on quarter hours, the way every desktop calendar behaves. Free
 *  positioning sounds more capable and produces events at 9:07. */
export const SNAP_MINUTES = 15;

/** Round a minute-of-day onto the snap grid. */
export function snapMinute(minute: number): number {
  return Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
}

/** "HH:MM" for a minute-of-day, in the shape `minutesOf` parses back and the
 *  `time` / `end_time` columns store. Minutes past the end of a day are wrapped
 *  by the caller, never here. */
export function clockOf(minute: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * The inverse of `offsetFor`: which minute a pixel position inside the grid
 * refers to, snapped, and held inside the drawn window.
 *
 * Clamping matters more than it looks. A pointer can travel above or below the
 * grid mid-drag — the browser keeps reporting coordinates after the cursor
 * leaves the element — and without this an upward overshoot produces a
 * negative minute, i.e. an event "before" the day.
 */
export function minuteAtOffset(offsetY: number, window: HourWindow): number {
  const raw = (offsetY / HOUR_HEIGHT) * 60 + window.startHour * 60;
  const snapped = snapMinute(raw);
  return Math.max(window.startHour * 60, Math.min(window.endHour * 60, snapped));
}

export interface TimeRange {
  time: string;
  endTime: string;
}

/**
 * The range a drag describes, from where it started to where the pointer is.
 *
 * Dragging UPWARD is a real gesture, not a mistake, so the two minutes are
 * ordered rather than assumed. A press with no movement — the ordinary click —
 * comes out as a DEFAULT_EVENT_MINUTES event starting where it was clicked,
 * which is both what Apple's calendar does and the length this grid already
 * draws an end-less event at, so the block does not resize the instant it saves.
 */
export function rangeFromDrag(anchorMinute: number, pointerMinute: number): TimeRange {
  const start = Math.min(anchorMinute, pointerMinute);
  const end = Math.max(anchorMinute, pointerMinute);
  const length = end - start < SNAP_MINUTES ? DEFAULT_EVENT_MINUTES : end - start;
  return { endTime: clockOf(Math.min(start + length, 24 * 60 - 1)), time: clockOf(start) };
}

/**
 * An event moved by `deltaMinutes`, keeping its length.
 *
 * Returns null for an event with no readable start — those live in the all-day
 * strip and have no position on the grid to move. The whole event is held
 * inside the day rather than the window: dragging must not be able to push a
 * class past midnight into a date the row does not claim.
 */
export function movedRange(event: CalendarEvent, deltaMinutes: number): TimeRange | null {
  const start = minutesOf(event.time);
  if (start === null) return null;
  const end = minutesOf(event.endTime);
  const length = end !== null && end > start ? end - start : DEFAULT_EVENT_MINUTES;
  const shifted = Math.max(0, Math.min(24 * 60 - 1 - length, snapMinute(start + deltaMinutes)));
  return { endTime: clockOf(shifted + length), time: clockOf(shifted) };
}

/**
 * An event whose end has been dragged to `pointerMinute`, keeping its start.
 *
 * The end can never cross the start: pulled above it, the event collapses to
 * one snap step rather than inverting into a negative-length block that
 * `layoutDay` would then sort incorrectly. A 15-minute event still DRAWS at
 * MIN_BLOCK_MINUTES, which is a floor on legibility, not on the stored data.
 */
export function resizedRange(event: CalendarEvent, pointerMinute: number): TimeRange | null {
  const start = minutesOf(event.time);
  if (start === null) return null;
  const end = Math.max(snapMinute(pointerMinute), start + SNAP_MINUTES);
  return { endTime: clockOf(Math.min(end, 24 * 60 - 1)), time: clockOf(start) };
}
