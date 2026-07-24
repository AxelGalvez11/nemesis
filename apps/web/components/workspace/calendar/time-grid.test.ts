import assert from "node:assert/strict";
import { test } from "node:test";

import type { CalendarEvent } from "@/lib/workspace/calendar-model";

import {
  blockGeometry,
  DEFAULT_END_HOUR,
  DEFAULT_START_HOUR,
  hourLabels,
  hourWindow,
  layoutDay,
  minutesOf,
  nowOffset,
  offsetFor,
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

test("events that do not overlap each keep the full width", () => {
  assert.deepEqual(widthsById([event("a", "09:00"), event("b", "14:00")]), { a: "0/1", b: "0/1" });
});

test("two overlapping events split the column in half", () => {
  assert.deepEqual(widthsById([event("a", "09:00"), event("b", "09:15")]), { a: "0/2", b: "1/2" });
});

test("three overlapping events split into thirds", () => {
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

test("an ordinary day shows a working-day window, not 24 empty hours", () => {
  const window = hourWindow([layoutDay([event("a", "10:00")])]);
  assert.deepEqual(window, { endHour: DEFAULT_END_HOUR, startHour: DEFAULT_START_HOUR });
  assert.equal(hourLabels(window).length, DEFAULT_END_HOUR - DEFAULT_START_HOUR);
});

test("the window widens so an early rotation or a late deadline is never cut off", () => {
  const early = hourWindow([layoutDay([event("rounds", "06:30")])]);
  assert.equal(early.startHour, 6);
  const late = hourWindow([layoutDay([event("deadline", "23:00")])]);
  assert.equal(late.endHour, 24, "must not overflow past midnight");
});

test("the window spans every day shown, so a week's columns line up", () => {
  const window = hourWindow([layoutDay([event("a", "07:00")]), layoutDay([event("b", "21:30")])]);
  assert.equal(window.startHour, 7);
  // 21:30 plus the drawn 45 minutes runs to 22:15, so the window must reach 23
  // or the block would be clipped by the bottom edge.
  assert.equal(window.endHour, 23);
});

test("offsets and height agree with the window", () => {
  const window = { endHour: 20, startHour: 8 };
  assert.equal(offsetFor(8 * 60, window), 0);
  assert.equal(offsetFor(9 * 60, window), 48);
  assert.equal(windowHeight(window), 12 * 48);
});

// ── The "now" line ───────────────────────────────────────────────────────────

test("the now line is placed inside the window", () => {
  const window = { endHour: 20, startHour: 8 };
  assert.equal(nowOffset(new Date(2026, 8, 11, 9, 0), window), 48);
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
