import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hourLabel } from "./format";
import { calendarColorOf } from "@/lib/workspace/calendar-colors";
import { PRIMARY_CALENDAR } from "@/lib/workspace/calendars";
import { paintForEvent } from "@/lib/workspace/event-colors";
import { HOUR_HEIGHT } from "./time-grid";

// Guards the one-to-one match with Google Calendar (owner 2026-09-01: "it all
// needs to match one to one so we have a good calendar base to work from").
//
// Every number here is Google's own, measured off the live signed-in app and written down in
// `docs/google-calendar-reference.md`. `measure-calendar.mjs` re-checks the same values in a real
// browser; this file is the cheap half that runs on every commit.
//
// 🔴🔴 THEY ARE GOOGLE'S PIXELS NOW, AND THEY USED TO BE GOOGLE'S REMS CONVERTED BY 18/16. The old
// rule kept the grid's proportions at this app's larger root, and drew a calendar a ninth bigger
// than the thing it is meant to match. It had already been reversed once, for the week's day
// heading alone (below), when the owner said that row was too big; on 2026-09-03 he said it of the
// whole surface — *"I want the calendar to be smaller… it feels like I'm a bit too zoomed into
// it"* — so the exception became the rule and `ratio` is gone. Section 13 of the reference.
//
// 🔴 THESE ARE NOT PREFERENCES. Two of them replaced figures that had been
// recorded in comments as measurements and were wrong: Google's hour row read
// as 24px when it is 48, and this app's root read as 20px when it is 18.

const view = readFileSync(new URL("./time-grid-view.tsx", import.meta.url), "utf8");
const month = readFileSync(new URL("./month-grid.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("./event-dialogs.tsx", import.meta.url), "utf8");

test("🔴 the hour row is Google's 48px, not 48 converted", () => {
  // `--cal-timed-grid-cell-height` is 48px and the one density knob on Google's whole grid, so
  // this single number sets how zoomed in a week reads. It was 54.
  assert.equal(HOUR_HEIGHT, 48);
  assert.notEqual(HOUR_HEIGHT, 54, "the ratio conversion is back on the one number that scales the grid");
});

test("🔴🔴 the month cell spends its height on events, not on its own chrome", () => {
  // Owner, 2026-09-03: *"I want the calendar to be smaller… especially when you have a lot of
  // events. It feels like I'm a bit too zoomed into it."*
  //
  // 🔴 THE CHIPS WERE NEVER THE PROBLEM — measured, ours are 20px against Google's 24. What ate
  // the cell was everything around them: 9px of padding on all four sides, a 9px gap, and a
  // 15.75px numeral in a 31.5px disc against Google's 12px in ~24. A cell gave its events 87px
  // where Google gives ~116, which is why a day with four events showed "+2 more".
  //
  // Measured after, at 1470x835 on /dev-preview/calendar-app: the stack went 87px -> 106px, and
  // the 16th drew all four.
  assert.match(month, /flex flex-col gap-0\.5 border-b border-r [^"]*p-1 /, "the month cell went back to 9px padding");
  assert.match(month, /grid size-\[24px\][^"]*text-\[12px\] font-medium tabular-nums/, "the day numeral left Google's 12px in a 24px box");
  assert.match(month, /text-\[11px\] font-medium uppercase leading-\[20px\]/, "the weekday band left Google's 11px on a 20px line");
  // 🔴 CALIBRATION, AS ABSENCES: each of these is what it was, and any one coming back undoes it.
  assert.doesNotMatch(month, /size-7 cursor-pointer/, "the 31.5px date disc is back");
  assert.doesNotMatch(month, /gap-1 border-b border-r/, "the 9px cell gap is back");
});

test("🔴🔴 an event nobody has coloured takes its CALENDAR's colour, the way Google does", () => {
  // Owner, 2026-09-03: *"make sure that Google Calendar's colours actually map onto the colours in
  // Nemesis… so that it looks more colourful."* Every event on the surface was grey, and the reason
  // was not the palette — both of Google's palettes are here, with Google's own ids and hexes.
  //
  // 🔴 THE CHAIN WAS BUILT AND COULD NOT FINISH. `paintForEvent` is the event's colour, then its
  // calendar's, then a fallback — Google's own order. Step two had nothing to say: no calendar had
  // ever been given a colour, because nothing creates one and `PRIMARY_CALENDAR` carried none. So
  // every event fell through to `DEFAULT_PAINT`, which is `--ui-text-tertiary` grey by the
  // 2026-09-01 ruling that retired kinds.
  const hex = (id: string | undefined) => calendarColorOf(id)?.hex ?? null;
  assert.equal(PRIMARY_CALENDAR.colorId, "16", "the primary calendar lost its colour, so the grid is grey again");
  assert.equal(hex(PRIMARY_CALENDAR.colorId), "#4986e7", "the primary's colour is not Google's Blueberry");
  // 🔴 AND THE PAINT ACTUALLY RESOLVES. Asserting the constant alone passes in a build where the
  // lookup cannot see it, which is exactly the bug underneath this one.
  const paint = paintForEvent({ calendarId: "" }, (id) => hex(id === "" ? PRIMARY_CALENDAR.colorId : undefined));
  assert.equal(paint?.dot.backgroundColor, "#4986e7", "an uncoloured event resolves to no paint again");
  // An event the student HAS coloured still wins: Google's precedence, unchanged.
  const own = paintForEvent({ calendarId: "", colorId: "11" }, () => "#4986e7");
  assert.equal(own?.dot.backgroundColor, "#d50000", "a per-event colour stopped overriding the calendar's");
});

test("🔴🔴 the colour lookup searches the list the PRIMARY calendar is actually in", () => {
  // 🔴 THIS IS THE LINE THAT MADE THE FIX REAL, AND IT IS EASY TO MISS. The stored list holds only
  // calendars a student has MADE; the primary one is never stored and is prepended by
  // `calendarList`. Looking an event up in `calendars` means looking it up in a list it is never
  // in — so giving `PRIMARY_CALENDAR` a colour changes nothing at all until this reads
  // `allCalendars`.
  const workspace = readFileSync(new URL("./calendar-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /allCalendars\.find\(\(entry\) => entry\.id === \(calendarId \?\? ""\)\)/, "the colour lookup cannot see the primary calendar");
  assert.doesNotMatch(workspace, /calendars\.find\(\(entry\) => entry\.id === calendarId\)/, "the lookup went back to the stored-only list");
});

test("🔴 the view title is Google's 22px, not 22 converted", () => {
  // Measured on the live app 2026-09-03: 22px / 400 / "Google Sans". Ours was `1.375rem`, which is
  // 24.75 at this root — the same ninth section 13 of the reference took off the grid, and a title
  // is the one piece of chrome big enough for it to read.
  const header = readFileSync(new URL("./calendar-header.tsx", import.meta.url), "utf8");
  assert.match(header, /truncate text-\[22px\] font-normal/, "the view title left Google's 22px");
  assert.doesNotMatch(header, /text-\[1\.375rem\]/, "the ratio-converted title is back");
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
  assert.match(view, /size-\[12px\] rounded-full bg-\(--theme-primary\)/);
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
  for (const tier of tiers) assert.match(tier, /text-\[12px\]/, `${tier} sets Google's 12px`);
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
