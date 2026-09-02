import assert from "node:assert/strict";
import { test } from "node:test";

import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { visibleEvents } from "@/lib/workspace/calendar-filter";

import { drawsAsBar } from "./kind-meta";
import { layoutDay } from "./time-grid";

// 🔴 AN EVENT THAT EXISTS MUST BE DRAWN SOMEWHERE.
//
// Owner 2026-09-01: "make sure the event doesn't disappear when editing it."
//
// The week grid sorts every event into one of two piles — the all-day strip or
// the timed column — and an event that falls between them is stored, saved and
// invisible. There is no error, no empty state, nothing to click: it is simply
// gone until a reload, and often after one too.
//
// The shapes below are every combination the editor can now produce, including
// the ones that only appear by accident: `allDay: false` with the time cleared,
// a half-typed time, a time the browser will hand over as "24:00". None of them
// may vanish.

const base: CalendarEvent = { date: "2026-09-02", id: "e", kind: "other", source: "manual", title: "T" };

const SHAPES: ReadonlyArray<readonly [string, CalendarEvent]> = [
  ["timed, start and end", { ...base, allDay: false, endTime: "11:00", time: "10:00" }],
  ["timed, start only", { ...base, allDay: false, time: "10:00" }],
  ["all day, said outright", { ...base, allDay: true }],
  ["all day, and nothing else", { ...base }],
  // 🔴 THE DANGEROUS ONE. Untick "All day" on an imported deadline and this is
  // exactly what you get: the flag says timed, and there is no time to place it.
  ["not all day, and no time", { ...base, allDay: false }],
  ["not all day, empty time string", { ...base, allDay: false, time: "" }],
  ["end before start", { ...base, allDay: false, endTime: "09:00", time: "11:00" }],
  ["end equal to start", { ...base, allDay: false, endTime: "10:00", time: "10:00" }],
  ["a time that is not a time", { ...base, allDay: false, time: "not-a-time" }],
  ["hour out of range", { ...base, allDay: false, time: "24:00" }],
  ["minute out of range", { ...base, allDay: false, time: "10:99" }],
  ["multi-day run", { ...base, allDay: true, endDate: "2026-09-05" }],
  ["multi-day run that starts at a time", { ...base, endDate: "2026-09-05", spanLength: 3, time: "10:00" }],
  ["midnight", { ...base, allDay: false, endTime: "01:00", time: "00:00" }],
  ["last minute of the day", { ...base, allDay: false, time: "23:59" }],
];

for (const [name, event] of SHAPES) {
  test(`the week grid places an event that is ${name}`, () => {
    const layout = layoutDay([event]);
    const placed = layout.allDay.length + layout.timed.length;
    assert.equal(placed, 1, `placed ${placed} times — 0 means it vanished, 2 means it is drawn twice`);
  });

  test(`the month grid can draw an event that is ${name}`, () => {
    // `drawsAsBar` is total over `string | undefined`, so this cannot throw —
    // the assertion is that it still ANSWERS, whatever the time looks like.
    assert.equal(typeof drawsAsBar(event.time), "boolean");
  });

  test(`no filter hides an event that is ${name} by default`, () => {
    // An empty hidden-set must mean "show everything", for every shape. The
    // colour filter keys on `colorId`, and a shape it does not recognise must
    // fall into the no-colour bucket rather than into nothing.
    assert.equal(visibleEvents([event], new Set()).length, 1);
  });
}

test("an unrecognised colour still shows, and still filters", () => {
  // A colour id from an older build, or a row hand-edited in the database, must
  // not make an event unreachable: it filters under "no colour", which is the
  // one bucket the control always offers.
  const odd: CalendarEvent = { ...base, colorId: "999" };
  assert.equal(visibleEvents([odd], new Set()).length, 1);
  assert.equal(visibleEvents([odd], new Set([""])).length, 0, "it did not fall into the no-colour bucket");
});
