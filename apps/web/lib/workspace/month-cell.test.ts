import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { type CellMetrics, fitEvents, orderForCell } from "./month-cell";

/** A cell with room for exactly five lines, the "+N more" row being shorter. */
const ROOM_FOR_5: CellMetrics = { contentHeight: 100, lineHeight: 20, moreHeight: 14 };

test("everything fits, so nothing is hidden and there is no link", () => {
  assert.deepEqual(fitEvents(3, ROOM_FOR_5), { hidden: 0, show: 3 });
  assert.deepEqual(fitEvents(5, ROOM_FOR_5), { hidden: 0, show: 5 });
});

test("🔴 the link costs a row, so six events show FOUR and not five", () => {
  // Calibration: 100px of room, 20px lines, a 14px link. Five lines fit on their
  // own (100/20). Add the link and only (100-14)/20 = 4 lines fit beside it.
  // Showing five AND a link is 114px in a 100px cell — the clipping this fixes.
  assert.deepEqual(fitEvents(6, ROOM_FOR_5), { hidden: 2, show: 4 });
});

test("a taller row shows more, which a constant could never do", () => {
  const tall: CellMetrics = { ...ROOM_FOR_5, contentHeight: 200 };
  // 200px of room at 20px a line is ten, so ten show with no link at all —
  // where the old constant would have drawn three and hidden seven.
  assert.deepEqual(fitEvents(10, tall), { hidden: 0, show: 10 });
  // Eleven needs the link, and then (200-14)/20 = 9 fit beside it.
  assert.deepEqual(fitEvents(11, tall), { hidden: 2, show: 9 });
});

test("a shorter row shows fewer, which is the half a constant got dangerously wrong", () => {
  // At 125% scaling a cell that held three lines holds two. The old code kept
  // promising three and let the third clip out of sight with no "+N more".
  const short: CellMetrics = { ...ROOM_FOR_5, contentHeight: 44 };
  assert.deepEqual(fitEvents(2, short), { hidden: 0, show: 2 });
  assert.deepEqual(fitEvents(5, short), { hidden: 4, show: 1 });
});

test("🔴 never '+6 more' and nothing else: one event always survives", () => {
  const sliver: CellMetrics = { ...ROOM_FOR_5, contentHeight: 6 };
  const fit = fitEvents(6, sliver);
  assert.equal(fit.show, 1, "a cell too short for a line still names one event");
  assert.equal(fit.hidden, 5);
});

test("hidden never swallows the last event", () => {
  // show is capped at total - 1 whenever anything is hidden, so "+0 more" — a
  // link that opens a list of nothing — cannot be produced.
  for (let total = 1; total <= 12; total += 1) {
    for (const contentHeight of [6, 20, 44, 100, 200]) {
      const fit = fitEvents(total, { ...ROOM_FOR_5, contentHeight });
      assert.equal(fit.show + fit.hidden, total, `total ${total} at ${contentHeight}px`);
      assert.ok(fit.hidden !== 0 ? fit.show < total : fit.show === total);
      assert.ok(fit.show >= 1);
    }
  }
});

test("an unmeasured cell shows everything rather than nothing", () => {
  // First render, or a display:none ancestor: the observer has not run. Drawing
  // no events at all would look like an empty calendar.
  assert.deepEqual(fitEvents(4, { contentHeight: 0, lineHeight: 0, moreHeight: 0 }), { hidden: 0, show: 4 });
});

test("no events, no link", () => {
  assert.deepEqual(fitEvents(0, ROOM_FOR_5), { hidden: 0, show: 0 });
});

test("deadlines lead the day, then everything by the clock", () => {
  const day = [
    { id: "lab", time: "13:00" },
    { id: "essay" },
    { id: "lecture", time: "09:00" },
    { id: "reading" },
  ];
  assert.deepEqual(orderForCell(day).map((e) => e.id), ["essay", "reading", "lecture", "lab"]);
});

test("ordering does not mutate what it was given", () => {
  const day = [{ id: "b", time: "13:00" }, { id: "a", time: "09:00" }];
  orderForCell(day);
  assert.deepEqual(day.map((e) => e.id), ["b", "a"]);
});

test("🔴 the month cell measures instead of counting to three", () => {
  const grid = readFileSync(new URL("../../components/workspace/calendar/month-grid.tsx", import.meta.url), "utf8");
  assert.ok(!/MAX_CHIPS_PER_DAY/.test(grid), "the hard-coded three-chip cap is back in the month grid");
  assert.match(grid, /ResizeObserver/, "nothing re-measures the cell when the window or the text size changes");
  assert.match(grid, /fitEvents/, "the month grid stopped asking what fits");

  const format = readFileSync(new URL("../../components/workspace/calendar/format.ts", import.meta.url), "utf8");
  // The EXPORT, not the word: format.ts carries a note explaining why the cap
  // went, and a bare name match would fail on its own gravestone.
  assert.ok(!/export const MAX_CHIPS_PER_DAY/.test(format), "the constant is back in format.ts for something else to find");
});

test("🔴 '+N more' opens the day, and the popover that re-listed it is gone", () => {
  const grid = readFileSync(new URL("../../components/workspace/calendar/month-grid.tsx", import.meta.url), "utf8");
  // The bug it replaces: the popover mapped `events`, so "+2 more" opened a list
  // of all five — the three already on the cell included — and dropped every
  // time while doing it. Option B answers it with the rail instead, so the
  // popover must not come back alongside it.
  assert.ok(!/Popover/.test(grid), "the overflow popover is back in the month grid");
  assert.match(grid, /MoreLink hidden=\{fit\.hidden\} onOpen=\{\(\) => onSelectDay\(day\.key\)\}/,
    "'+N more' stopped opening the day rail");

  const rail = readFileSync(new URL("../../components/workspace/calendar/day-rail.tsx", import.meta.url), "utf8");
  // The rail's whole reason to exist over a popover: it can say when you are
  // free, which no month cell can.
  assert.match(rail, /GAP_MINUTES/, "the rail stopped reporting free time");
  assert.match(rail, /layoutDay/, "the rail stopped reusing the day view's own layout");
});

test("🔴 exams do not take the accent colour any more", () => {
  const meta = readFileSync(new URL("../../components/workspace/calendar/kind-meta.ts", import.meta.url), "utf8");
  // It was `--theme-primary`: a neutral graphite by default, so an exam drew the
  // same as a lecture — and blue if the student picked the blue accent, which is
  // `--ui-blue`, which is what an assignment already is.
  const examBlock = /exam: \{[\s\S]*?\n  \},/.exec(meta)?.[0] ?? "";
  assert.ok(examBlock.length > 0, "the exam kind vanished from KIND_META");
  assert.ok(!/theme-primary/.test(examBlock), "exam is tied to the accent colour again");
  assert.match(examBlock, /--ui-exam/, "exam lost its own colour token");

  const css = readFileSync(new URL("../../app/styles/desktop-ui.css", import.meta.url), "utf8");
  // Both grounds, or it is unreadable on one of them.
  assert.equal((css.match(/--ui-exam:/g) ?? []).length, 2, "--ui-exam needs a light AND a dark value");
});

test("🔴 the year view stopped drawing one dot for every kind of day", () => {
  const year = readFileSync(new URL("../../components/workspace/calendar/year-grid.tsx", import.meta.url), "utf8");
  assert.match(year, /busyClass/, "the year view stopped shading by how full a day is");
  assert.match(year, /--ui-exam/, "an exam day is invisible in the year view again");
  // The letters, however they are derived. calendars.test.ts pins the stronger
  // fact: they come from the grid's own first week, so they cannot disagree with
  // the columns beneath them once the week can start on Monday.
  assert.match(year, /charAt\(0\)/, "the S M T W T F S letters are missing again");
});

test("🔴 weekends are not tinted, and no cell paints its own ground", () => {
  const grid = readFileSync(new URL("../../components/workspace/calendar/month-grid.tsx", import.meta.url), "utf8");
  // Owner 2026-09-01: "keep weekends untinted". Google does not tint them; the
  // tint was Apple's, and with it went the last of the three-ground rhythm.
  assert.ok(!/isWeekend/.test(grid), "the weekend tint is back in the month grid");
  assert.ok(!/getDay\(\) === 0/.test(grid), "something is testing for Saturday or Sunday again");
});
