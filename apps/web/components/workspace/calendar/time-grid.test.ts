import assert from "node:assert/strict";
import { test } from "node:test";

import type { CalendarEvent } from "@/lib/workspace/calendar-model";

import {
  blockDetail,
  blockGeometry,
  DEFAULT_EVENT_MINUTES as DEFAULT_MINUTES,
  INLINE_MIN_PX,
  MIN_BLOCK_MINUTES,
  renderedBlockHeight,
  STACKED_MIN_PX,
  clockOf,
  DEFAULT_EVENT_MINUTES,
  FULL_DAY,
  HOUR_HEIGHT,
  hourLabels,
  layoutDay,
  minuteAtOffset,
  minutesOf,
  movedRange,
  nowOffset,
  offsetFor,
  rangeFromDrag,
  resizedRange,
  SCROLL_TO_HOUR,
  SNAP_MINUTES,
  snapMinute,
  windowHeight,
} from "./time-grid";

const event = (id: string, time?: string): CalendarEvent => ({
  date: "2026-09-11",
  id,
  kind: "class",
  title: id,
  ...(time ? { time } : {}),
});

const widthsById = (events: CalendarEvent[]) =>
  Object.fromEntries(layoutDay(events).timed.map((item) => [item.event.id, `${item.column}/${item.columns}`]));

// ── Untimed events are never invented onto the grid ──────────────────────────

test("events with no time go to the all-day strip, not onto the grid", () => {
  const layout = layoutDay([event("Essay due"), event("Lecture", "09:00")]);
  assert.deepEqual(layout.allDay.map((e) => e.id), ["Essay due"]);
  assert.deepEqual(layout.timed.map((item) => item.event.id), ["Lecture"]);
});

test("an unparseable time is treated as untimed rather than placed at a guessed hour", () => {
  const layout = layoutDay([event("Rounds", "sometime"), event("Clinic", "25:00")]);
  assert.equal(layout.timed.length, 0);
  assert.equal(layout.allDay.length, 2);
});

test("minutesOf accepts real times and rejects everything else", () => {
  assert.equal(minutesOf("00:00"), 0);
  assert.equal(minutesOf("09:30"), 570);
  assert.equal(minutesOf("23:59"), 1439);
  assert.equal(minutesOf("9:05"), 545);
  assert.equal(minutesOf("24:00"), null);
  assert.equal(minutesOf("09:60"), null);
  assert.equal(minutesOf("9am"), null);
  assert.equal(minutesOf(undefined), null);
});

// ── Overlap packing ──────────────────────────────────────────────────────────
// These check COLUMN ASSIGNMENT only. Width is blockGeometry's job, and it
// deliberately does NOT split evenly — see the block-geometry tests below.

test("events that do not overlap each get a single column", () => {
  assert.deepEqual(widthsById([event("a", "09:00"), event("b", "14:00")]), { a: "0/1", b: "0/1" });
});

test("two overlapping events are assigned two columns", () => {
  assert.deepEqual(widthsById([event("a", "09:00"), event("b", "09:15")]), { a: "0/2", b: "1/2" });
});

test("three overlapping events are assigned three columns", () => {
  const widths = widthsById([event("a", "09:00"), event("b", "09:10"), event("c", "09:20")]);
  assert.deepEqual(widths, { a: "0/3", b: "1/3", c: "2/3" });
});

// This is the reason columns are packed per-cluster rather than per-day: one
// morning clash must not narrow every unrelated event later on.
test("a morning collision does not narrow unrelated afternoon events", () => {
  const widths = widthsById([event("a", "09:00"), event("b", "09:15"), event("afternoon", "15:00")]);
  assert.equal(widths.a, "0/2");
  assert.equal(widths.b, "1/2");
  assert.equal(widths.afternoon, "0/1", "an unrelated later event should still be full width");
});

test("a freed column is reused rather than growing the cluster forever", () => {
  // a 09:00-09:45, b 09:15-10:00, c 09:50-10:35. By the time c starts, a has
  // finished, so c should take a's vacated column 0 rather than a third one.
  const layout = layoutDay([event("a", "09:00"), event("b", "09:15"), event("c", "09:50")]);
  const byId = Object.fromEntries(layout.timed.map((item) => [item.event.id, item]));
  assert.equal(byId.c?.column, 0, "should reuse the column a vacated");
  assert.equal(byId.c?.columns, 2, "the whole cluster shares one width");
  assert.equal(byId.a?.columns, 2);
});

test("an event starting exactly when another ends is a new cluster, not an overlap", () => {
  // a 09:00-09:45, b 09:45-10:30 — back to back, so both stay full width.
  const widths = widthsById([event("a", "09:00"), event("b", "09:45")]);
  assert.deepEqual(widths, { a: "0/1", b: "0/1" });
});

test("timed events come back in start order", () => {
  const layout = layoutDay([event("late", "16:00"), event("early", "08:00"), event("mid", "12:00")]);
  assert.deepEqual(layout.timed.map((item) => item.event.id), ["early", "mid", "late"]);
});

// ── The visible window ───────────────────────────────────────────────────────

test("THE GRID IS ALWAYS A WHOLE DAY, midnight to midnight", () => {
  // The window used to be computed from whatever events were on screen. That
  // made the grid change length as events moved, and left hours that could not
  // be scrolled to at all — so an event could not be created at 01:00 because
  // 01:00 was not drawn. A calendar is the full day; you scroll it.
  assert.deepEqual(FULL_DAY, { endHour: 24, startHour: 0 });
  assert.equal(hourLabels(FULL_DAY).length, 24);
});

test("every hour of the day has a label, including both edges", () => {
  const labels = hourLabels(FULL_DAY);
  assert.equal(labels[0], 0, "midnight is drawn");
  assert.equal(labels[23], 23, "11pm is drawn");
});

test("the full day is exactly 24 hour-heights tall", () => {
  assert.equal(windowHeight(FULL_DAY), 24 * HOUR_HEIGHT);
});

test("A LATE-NIGHT EVENT IS NEVER CUT OFF, which is why the day runs to midnight", () => {
  // 23:00 plus the drawn 45 minutes runs to 23:45 — inside the grid, where
  // before it forced the window to stretch.
  const layout = layoutDay([event("deadline", "23:00")]);
  const item = layout.timed[0];
  assert.ok(item, "the event is laid out");
  assert.ok(item.endMinute <= 24 * 60, "it ends within the drawn day");
  assert.ok(offsetFor(item.endMinute, FULL_DAY) <= windowHeight(FULL_DAY));
});

test("an early-morning event sits above the opening scroll position", () => {
  // 06:30 is real and reachable now; it simply starts out scrolled above.
  const layout = layoutDay([event("rounds", "06:30")]);
  const item = layout.timed[0];
  assert.ok(item, "the event is laid out");
  assert.equal(offsetFor(item.startMinute, FULL_DAY), 6.5 * HOUR_HEIGHT);
});

test("the opening scroll position lands on the working day, not midnight", () => {
  assert.equal(SCROLL_TO_HOUR, 8);
  assert.equal(offsetFor(SCROLL_TO_HOUR * 60, FULL_DAY), 8 * HOUR_HEIGHT);
});

test("offsets and height agree with the window", () => {
  const window = { endHour: 20, startHour: 8 };
  assert.equal(offsetFor(8 * 60, window), 0);
  // In terms of HOUR_HEIGHT, not a pinned 48: this asserts that an hour of
  // time is one hour of grid, which stays true when the density is retuned.
  assert.equal(offsetFor(9 * 60, window), HOUR_HEIGHT);
  assert.equal(windowHeight(window), 12 * HOUR_HEIGHT);
});

// ── The "now" line ───────────────────────────────────────────────────────────

test("the now line is placed inside the window", () => {
  const window = { endHour: 20, startHour: 8 };
  assert.equal(nowOffset(new Date(2026, 8, 11, 9, 0), window), HOUR_HEIGHT);
});

test("no now line is drawn when the time is outside the window", () => {
  const window = { endHour: 20, startHour: 8 };
  // Pinning it to an edge instead would claim it is 8am when it is 3am.
  assert.equal(nowOffset(new Date(2026, 8, 11, 3, 0), window), null);
  assert.equal(nowOffset(new Date(2026, 8, 11, 22, 0), window), null);
});

// ── Block geometry ───────────────────────────────────────────────────────────
// Equal-width columns were measured at 36px for a two-way overlap in a week
// view — about three characters, so every title rendered as "P…".

test("a lone block takes the whole column", () => {
  assert.deepEqual(blockGeometry(0, 1), { leftPct: 0, widthPct: 100, zIndex: 0 });
});

test("overlapping blocks stagger instead of splitting evenly, so titles stay readable", () => {
  const first = blockGeometry(0, 2);
  const second = blockGeometry(1, 2);
  assert.equal(first.widthPct, 100, "the bottom block keeps the full width");
  assert.ok(second.widthPct > 50, `a staggered block should beat an even split, got ${second.widthPct}`);
  assert.ok(second.leftPct > 0, "it must be visibly offset or the overlap is invisible");
  assert.ok(second.zIndex > first.zIndex, "later blocks must paint on top");
});

test("a deep pile still leaves the last block readable", () => {
  for (const columns of [2, 3, 4, 6, 10]) {
    const last = blockGeometry(columns - 1, columns);
    assert.ok(last.widthPct >= 40, `${columns}-deep pile left ${last.widthPct}% — too narrow to read`);
    assert.ok(last.leftPct + last.widthPct <= 100.001, "a block must not run past the column");
  }
});

test("blocks in a pile are each offset from the one below", () => {
  const lefts = [0, 1, 2].map((column) => blockGeometry(column, 3).leftPct);
  assert.ok(lefts[0]! < lefts[1]! && lefts[1]! < lefts[2]!, `expected increasing offsets, got ${lefts}`);
});

// ── Pointer arithmetic ───────────────────────────────────────────────────────
// A drag cannot be driven by this project's browser tooling, so these are the
// only place the click-and-drag behaviour can actually be checked. Everything
// the components do is a call into the functions below.

const WINDOW = { endHour: 20, startHour: 8 };

test("clicking a pixel position gives back the hour that was drawn there", () => {
  // The exact inverse of offsetFor: paint 09:00 at some offset, click that
  // offset, get 09:00. If these two ever disagree, every created event lands
  // at a different time than the one the student pointed at.
  for (const minute of [8 * 60, 9 * 60, 13 * 60 + 30, 19 * 60 + 45]) {
    assert.equal(minuteAtOffset(offsetFor(minute, WINDOW), WINDOW), minute);
  }
});

test("a click lands on the nearest quarter hour, not on 9:07", () => {
  const sevenPastNine = offsetFor(9 * 60 + 7, WINDOW);
  assert.equal(minuteAtOffset(sevenPastNine, WINDOW), 9 * 60);
  const twentyPastNine = offsetFor(9 * 60 + 20, WINDOW);
  assert.equal(minuteAtOffset(twentyPastNine, WINDOW), 9 * 60 + 15);
});

test("a pointer dragged off the top or bottom of the grid stays inside the day", () => {
  // The browser keeps reporting coordinates after the cursor leaves the
  // element, so this is the ordinary case for a fast drag, not an edge case.
  assert.equal(minuteAtOffset(-500, WINDOW), WINDOW.startHour * 60);
  assert.equal(minuteAtOffset(99_999, WINDOW), WINDOW.endHour * 60);
});

test("snapMinute rounds to the quarter hour in both directions", () => {
  assert.equal(snapMinute(0), 0);
  assert.equal(snapMinute(7), 0);
  assert.equal(snapMinute(8), SNAP_MINUTES);
  assert.equal(snapMinute(541), 540);
});

test("clockOf writes a time minutesOf can read back", () => {
  for (const minute of [0, 9 * 60, 13 * 60 + 45, 23 * 60 + 59]) {
    assert.equal(minutesOf(clockOf(minute)), minute);
  }
  assert.equal(clockOf(9 * 60), "09:00", "single-digit hours must keep their leading zero");
});

test("a click with no drag creates an event the length the grid already draws", () => {
  // Anything else and the block visibly resizes the moment it is saved.
  const range = rangeFromDrag(9 * 60, 9 * 60);
  assert.deepEqual(range, { endTime: clockOf(9 * 60 + DEFAULT_EVENT_MINUTES), time: "09:00" });
});

test("dragging down picks out the range that was dragged", () => {
  assert.deepEqual(rangeFromDrag(9 * 60, 10 * 60 + 30), { endTime: "10:30", time: "09:00" });
});

test("dragging upward is a real gesture, not an inverted event", () => {
  assert.deepEqual(rangeFromDrag(14 * 60, 12 * 60), { endTime: "14:00", time: "12:00" });
});

test("a drag too short to be deliberate is treated as a click", () => {
  const range = rangeFromDrag(9 * 60, 9 * 60 + 5);
  assert.equal(range.time, "09:00");
  assert.equal(range.endTime, clockOf(9 * 60 + DEFAULT_EVENT_MINUTES));
});

test("moving an event keeps its length", () => {
  const moved = movedRange({ ...event("Lecture", "09:00"), endTime: "10:30" }, 60);
  assert.deepEqual(moved, { endTime: "11:30", time: "10:00" });
});

test("an event with no end time keeps the length it was drawn at when moved", () => {
  const moved = movedRange(event("Lecture", "09:00"), 120);
  assert.deepEqual(moved, { endTime: clockOf(11 * 60 + DEFAULT_EVENT_MINUTES), time: "11:00" });
});

test("an event cannot be dragged off the end of its own day", () => {
  // The row claims one date. Sliding past midnight would put it on a day the
  // data does not say it belongs to.
  const moved = movedRange({ ...event("Lecture", "22:00"), endTime: "23:00" }, 10 * 60);
  assert.ok(moved);
  assert.equal(moved.endTime, "23:59");
  assert.equal(moved.time, "22:59");
});

test("an all-day event has no position to move", () => {
  assert.equal(movedRange(event("Essay due"), 60), null);
});

test("resizing changes the end and leaves the start alone", () => {
  const resized = resizedRange(event("Lab", "13:00"), 15 * 60 + 30);
  assert.deepEqual(resized, { endTime: "15:30", time: "13:00" });
});

test("an end dragged above its start collapses instead of inverting", () => {
  // A negative-length block sorts wrongly in layoutDay and paints upward.
  const resized = resizedRange(event("Lab", "13:00"), 9 * 60);
  assert.deepEqual(resized, { endTime: clockOf(13 * 60 + SNAP_MINUTES), time: "13:00" });
});

test("a dragged-out range is one layoutDay reads back at the same length", () => {
  // The round trip that matters: drag it, store it, draw it. HOUR_HEIGHT is
  // the shared scale, so a 90-minute drag must come back 90 minutes tall.
  const range = rangeFromDrag(9 * 60, 10 * 60 + 30);
  const [placed] = layoutDay([{ ...event("Seminar", range.time), endTime: range.endTime }]).timed;
  assert.ok(placed);
  assert.equal(placed.endMinute - placed.startMinute, 90);
  assert.equal(offsetFor(placed.endMinute, WINDOW) - offsetFor(placed.startMinute, WINDOW), HOUR_HEIGHT * 1.5);
});

// ── A block never renders more lines than it can hold ────────────────────────

test("the rendered height is what the box is actually given", () => {
  // The old guard compared the LAYOUT height against its threshold while the box
  // was drawn two pixels shorter. Two pixels is exactly the width of the gap a
  // 45-minute event fell through.
  assert.equal(renderedBlockHeight(40), 38);
  assert.equal(renderedBlockHeight(4), 14, "never smaller than the floor");
});

test("a tall block stacks the title and the time", () => {
  assert.equal(blockDetail(STACKED_MIN_PX), "stacked");
  assert.equal(blockDetail(90), "stacked");
});

test("THE REPORTED BUG: a default-length event does not try to stack", () => {
  // Owner screenshot 2026-07-31: an event at 10:00 with no end time drew its
  // title AND its time, and the second line was sliced through the glyphs.
  // At 54px an hour a 45-minute event is 40.5px laid out, 38.5px rendered —
  // room for one line, not two. (It was 36px an hour until 2026-09-01, when
  // the grid was matched to Google; the tier the event lands in is unchanged.)
  const laidOut = (DEFAULT_MINUTES / 60) * HOUR_HEIGHT;
  const box = renderedBlockHeight(laidOut);
  assert.ok(box < STACKED_MIN_PX, `a default event is ${box}px, which cannot stack`);
  assert.equal(blockDetail(box), "inline");
});

test("the shortest block a layout can produce shows only the title", () => {
  const box = renderedBlockHeight((MIN_BLOCK_MINUTES / 60) * HOUR_HEIGHT);
  assert.equal(blockDetail(box), "title");
});

test("every tier boundary is decided, with no gap between them", () => {
  assert.equal(blockDetail(STACKED_MIN_PX - 1), "inline");
  assert.equal(blockDetail(INLINE_MIN_PX), "inline");
  assert.equal(blockDetail(INLINE_MIN_PX - 1), "title");
  assert.equal(blockDetail(0), "title");
});
