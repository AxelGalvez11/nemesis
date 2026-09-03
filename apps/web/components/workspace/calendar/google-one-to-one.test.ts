import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hourLabel } from "./format";
import { HOUR_HEIGHT } from "./time-grid";

// Guards the one-to-one match with Google Calendar (owner 2026-09-01: "it all
// needs to match one to one so we have a good calendar base to work from").
//
// Every number here is Google's own, measured off the live signed-in app and
// written down in `docs/google-calendar-reference.md`, converted to this app's
// 18px root by 18/16. `measure-calendar.mjs` re-checks the same values in a
// real browser; this file is the cheap half that runs on every commit.
//
// 🔴 THESE ARE NOT PREFERENCES. Two of them replaced figures that had been
// recorded in comments as measurements and were wrong: Google's hour row read
// as 24px when it is 48, and this app's root read as 20px when it is 18.

/** Google's px -> ours. Their root is 16px, `globals.css:530` puts ours at 18. */
const ratio = 18 / 16;
const view = readFileSync(new URL("./time-grid-view.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("./event-dialogs.tsx", import.meta.url), "utf8");

test("the hour row is Google's, converted", () => {
  assert.equal(HOUR_HEIGHT, 48 * ratio, "Google's --cal-timed-grid-cell-height is 48px");
  assert.equal(HOUR_HEIGHT, 54);
});

test("midday is a number, the way Google writes it", () => {
  // It was "Noon" (Apple's word). A single word in a column of numerals is the
  // one label the eye stops on.
  assert.equal(hourLabel(12).value, "12");
  assert.notEqual(hourLabel(12).value, "Noon");
});

test("the day heading is Google's SIZE, not its proportion", () => {
  // 🔴🔴 THE QUANTITY BEING COPIED CHANGED ON 2026-09-03 AND THIS GUARD CHANGED WITH IT. Owner:
  // *"the weekday row still feels a bit too big… just compare with Google Calendar please."*
  //
  // Everywhere else in this file, Google's pixels are converted by RATIO (x 18/16) so the grid
  // keeps its proportions at this app's larger root. That is right for the grid and wrong for
  // this row: measured on both sides, the band was 84px on Google and 85.5 here, but the label
  // was 12.375px against 11, the numeral 29.25 against 26, and the disc 51.75 against 46.58 —
  // a faithful proportion is a 12.5% bigger object, and an object is what the eye compares.
  //
  // So this block alone divides Google's pixels by OUR root: 11/18, 32/18, 26/18, 46/18. Band
  // measured after the change: 83.98 against Google's 84.
  assert.match(view, /size-\[2\.5556rem\]/, "today's disc left Google's 46px");
  assert.match(view, /text-\[1\.4444rem\]/, "the numeral left Google's 26px");
  assert.match(view, /text-\[0\.6111rem\][^"]*leading-\[1\.7778rem\]/, "the weekday label left Google's 11px/32px");
  // 🔴 AND THE RATIO CONVERSION MUST NOT COME BACK HERE. Calibration: put `2.875rem` back and
  // this reddens twice — once above, once here.
  assert.doesNotMatch(view, /size-\[2\.875rem\]|text-\[1\.625rem\]/, "the ratio-converted header is back");
});

test("the now indicator is thick enough to find", () => {
  // 2px line, 12px dot. It was 1px with a 6px dot and read as a stray hairline.
  assert.match(view, /border-t-2 border-\(--theme-primary\)/);
  assert.match(view, /size-\[0\.75rem\] rounded-full bg-\(--theme-primary\)/);
});

test("the grid is ruled at Google's weight, in one colour", () => {
  // Google draws every line on the surface in ONE colour at 1px: #dde3ea, 13%
  // dark on white. Our stroke scale is 18/12/8/5%, so `secondary` is the match;
  // it was `quaternary` at 5% and the grid barely read.
  assert.match(view, /const RULE = "border-\(--ui-stroke-secondary\)"/);
  assert.doesNotMatch(view, /border-\(--ui-stroke-quaternary\)/, "no line is left on the old 5% token");
});

test("the week does not close with a rule down its right edge", () => {
  // Google rules columns on the RIGHT and paints the last one's rule in the
  // page colour (`.BiKU4b.Qbfsob`).
  assert.match(view, /border-r[\s\S]{0,120}last:border-transparent|last:border-transparent[\s\S]{0,120}border-r/);
});

test("a block's text does not shrink with its box", () => {
  // Google sets every block at 12px whatever its height and changes only the
  // LAYOUT. Ours shrank the type too, so a short block was hardest to read
  // exactly when it had least room to explain itself.
  const tiers = view.match(/detail === "(stacked|inline|title)" && "[^"]*"/g) ?? [];
  assert.equal(tiers.length, 3, "all three tiers are still declared here");
  for (const tier of tiers) assert.match(tier, /text-\[0\.75rem\]/, `${tier} sets Google's 12px converted`);
});

test("the midnight label is not drawn", () => {
  // Google: `.XsRa1c:first-child > .wO6pL { display: none }`. It would be
  // labelling the top edge of the grid, and centring it there pushed half of
  // it up into the all-day strip.
  assert.match(view, /if \(index === 0\) return null;/);
});

test("the form cannot save an end before its start", () => {
  // Both time inputs were bare setState, so an event could be stored running
  // from 11:45 to 11:30. It DREW as a normal 45 minutes, because durationOf
  // only trusts an end when `end > start`, so nothing on screen disagreed with
  // itself and the impossible row survived a reload.
  assert.match(form, /onChange=\{\(e\) => moveStart\(e\.target\.value\)\}/, "the start field stopped going through moveStart");
  assert.match(form, /onChange=\{\(e\) => moveEnd\(e\.target\.value\)\}/, "the end field stopped going through moveEnd");
  assert.match(form, /setEndTime\(end > start \? next :/, "moveEnd no longer clamps an end that is not after the start");
});

test("moving the start carries the end, the way Google does", () => {
  // So dragging a lecture an hour later is one edit, not two.
  assert.match(form, /setEndTime\(clockOf\(Math\.min\(24 \* 60 - 1, end \+ \(to - from\)\)\)\)/);
});

const workspace = readFileSync(new URL("./calendar-workspace.tsx", import.meta.url), "utf8");

test("the week always starts on Sunday, with no control and no stored preference", () => {
  // Owner 2026-09-01: "remove the 'starts sunday', it should always start
  // Sunday." The button flipped Sunday/Monday, seeded from the browser locale
  // and remembered per device.
  assert.doesNotMatch(workspace, />Starts \{/, "the week-start toggle came back");
  assert.doesNotMatch(workspace, /localeWeekStart/, "the locale is choosing the first day again");
  assert.doesNotMatch(workspace, /setWeekStart/, "the first day is settable again");
  assert.match(workspace, /const weekStart: WeekStart = 0;/, "the week no longer starts on Sunday");
  // And the old value is cleared rather than merely ignored — a stale pin is
  // how `nemesis.canvas.view` hid history through three separate reports.
  assert.match(workspace, /removeItem\(WEEK_START_STORAGE_KEY\)/, "a browser pinned to Monday is left pinned");
  assert.doesNotMatch(workspace, /setItem\(WEEK_START_STORAGE_KEY/, "something is writing the preference again");
});

test("the Calendars control is gone, and its filter went with it", () => {
  // Owner 2026-09-01: "also remove the 'calendars'".
  assert.doesNotMatch(workspace, /CalendarList/, "the Calendars control came back");
  // `hidden` is a STORED column. A filter with no control can only lose events:
  // one ticked off before the control was removed would stay invisible forever.
  assert.doesNotMatch(workspace, /hiddenCalendars/, "a per-calendar filter no one can reach is back");
  assert.doesNotMatch(workspace, /primaryHidden/, "the primary calendar can be hidden with no way back");
  assert.match(workspace, /const shownEvents = useMemo\(\(\) => visibleEvents\(events, hiddenColors\), \[events, hiddenColors\]\);/);
});
