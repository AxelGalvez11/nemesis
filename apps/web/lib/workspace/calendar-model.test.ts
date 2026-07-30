import assert from "node:assert/strict";
import test from "node:test";

import { eventsByDate, expandRecurringEvents, type CalendarEvent } from "./calendar-model";

const series: CalendarEvent = {
  id: "series-1",
  title: "Lecture",
  date: "2026-08-24",
  time: "09:00",
  endTime: "09:50",
  kind: "class",
  recurrence: { days: [1, 3, 5], until: "2026-08-31" },
};

test("recurrence expands on the selected weekdays through the inclusive end date", () => {
  const occurrences = expandRecurringEvents([series]);
  assert.deepEqual(occurrences.map((event) => event.date), [
    "2026-08-24",
    "2026-08-26",
    "2026-08-28",
    "2026-08-31",
  ]);
  assert.ok(occurrences.every((event) => event.seriesId === "series-1"));
});

test("the month map receives expanded occurrences while the stored series stays singular", () => {
  const byDate = eventsByDate([series]);
  assert.equal(byDate.get("2026-08-26")?.[0]?.title, "Lecture");
  assert.equal(series.id, "series-1");
  assert.equal(series.date, "2026-08-24");
});
