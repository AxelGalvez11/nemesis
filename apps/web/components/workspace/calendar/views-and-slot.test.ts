import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  AGENDA_WINDOW_DAYS,
  FOUR_DAY_COLUMNS,
  isCalendarViewMode,
  VIEW_OPTIONS,
  VIEW_UNIT_LABEL,
  viewLabel,
  type CalendarViewMode,
} from "./format";

const GRID = readFileSync(new URL("./time-grid-view.tsx", import.meta.url), "utf8");
const WORKSPACE = readFileSync(new URL("./calendar-workspace.tsx", import.meta.url), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── The two views Google has and we did not ─────────────────────────────────
// Owner 2026-09-01: "the calendar is missing schedule view and 4 day view from
// Google Calendar."

test("every Google view is offered, in Google's order and Google's words", () => {
  assert.deepEqual(
    VIEW_OPTIONS.map((option) => option.label),
    ["Day", "Week", "Month", "Year", "Schedule", "4 days"],
  );
});

test("both new views survive a round trip through storage", () => {
  // `isCalendarViewMode` guards what comes back out of localStorage. A view it
  // does not recognise falls back silently, so a mode missing from that list is
  // a mode that cannot be remembered.
  for (const view of ["fourDay", "schedule"]) assert.ok(isCalendarViewMode(view), `${view} is not a known view`);
  assert.ok(!isCalendarViewMode("agenda"));
});

test("every view names its own unit, so the arrows can say what they step", () => {
  for (const option of VIEW_OPTIONS) {
    assert.ok(VIEW_UNIT_LABEL[option.id], `${option.id} has no unit label`);
  }
});

test("the header says the range each new view covers", () => {
  const cursor = new Date(2026, 8, 1);
  // 4 days is INCLUSIVE of the day you are on: Sep 1 through Sep 4, not Sep 5.
  assert.match(viewLabel("fourDay", cursor), /1 Sep|Sep 1/);
  assert.match(viewLabel("fourDay", cursor), /4 Sep|Sep 4/);
  // A schedule with no dates in its header looks like every event there is.
  assert.match(viewLabel("schedule", cursor), /1 Sep|Sep 1/);
  assert.match(viewLabel("schedule", cursor), /30 Sep|Sep 30/);
});

test("the arrows step each new view by its own window", () => {
  assert.equal(FOUR_DAY_COLUMNS, 4);
  assert.match(code(WORKSPACE), /view === "fourDay"\) return addDays\(prev, FOUR_DAY_COLUMNS \* delta\)/);
  assert.match(code(WORKSPACE), /view === "schedule"\) return addDays\(prev, AGENDA_WINDOW_DAYS \* delta\)/);
  assert.equal(AGENDA_WINDOW_DAYS, 30);
});

test("the 4-day grid starts on the cursor, not on a week boundary", () => {
  // That is the whole point of the view: it follows where you are looking. A
  // `startOfWeek` here would make it a worse Week.
  assert.match(code(WORKSPACE), /FOUR_DAY_COLUMNS \}, \(_, i\) => addDays\(cursor, i\)/);
});

// ── The block that vanished while you named it ──────────────────────────────
// Owner 2026-09-01: "when clicking on the calendar it gives editing event but
// the event disappears. Also happens when dragging a new event out."

test("🔴 the grid draws a block for the slot the create card is open on", () => {
  // `handlePointerUp` clears the gesture the instant you let go, so the drag
  // preview vanished at the exact moment the card asking for a title appeared.
  // A plain click never drew one at all.
  assert.match(code(GRID), /pendingSlot\?: \{ date: string; time\?: string; endTime\?: string \} \| null;/);
  assert.match(code(GRID), /const pending = \(\(\) => \{/);
  assert.match(code(GRID), /if \(preview\) return preview;/, "the drag preview stopped taking priority");
  assert.match(code(GRID), /\{pending && \(/, "the block is drawn from the gesture alone again");
});

test("🔴 it is ONE element for the drag and the pending slot", () => {
  // Two would cross over at pointer-up — one unmounting in the same commit the
  // other mounts — and a block removed and re-added is a block that flickers.
  assert.equal((code(GRID).match(/\{pending && \(/g) ?? []).length, 1);
  assert.doesNotMatch(code(GRID), /\{preview && \(/, "the old preview-only block is back alongside it");
});

test("every time grid gets the pending slot, not just the week", () => {
  // Day, 4 days and Week all mount the same component; a view that forgets the
  // prop is a view where the event still disappears.
  assert.equal((code(WORKSPACE).match(/pendingSlot=\{quickCreate\?\.draft \?\? null\}/g) ?? []).length, 3);
});

test("a slot with no time draws nothing rather than drawing at midnight", () => {
  // A month cell has no time to place. Inventing one would put a ghost block at
  // 00:00 on a grid the click never touched.
  assert.match(code(GRID), /if \(dayIndex < 0 \|\| startMinute === null\) return null;/);
});
