import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hourLabel } from "./format";
import { calendarColorOf } from "@/lib/workspace/calendar-colors";
import { PRIMARY_CALENDAR } from "@/lib/workspace/calendars";
import { colourOfDay, paintForEvent } from "@/lib/workspace/event-colors";
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

/**
 * Source with its comments taken out.
 *
 * 🔴 GUARDS MUST READ CODE, NOT PROSE, and this file learned it the hard way on 2026-09-03: the
 * year-view guard below asserts `kind === "exam"` is gone, and it reddened on the COMMENT that
 * says the check used to be `kind === "exam"`. Every note in these files names the thing it
 * replaced — that is the point of them — so an absence asserted against raw text fails on the
 * explanation of the fix rather than on the fix coming undone.
 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const view = readFileSync(new URL("./time-grid-view.tsx", import.meta.url), "utf8");
const month = readFileSync(new URL("./month-grid.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("./event-dialogs.tsx", import.meta.url), "utf8");

test("🔴 the hour row is Google's COMPACT rung, and every rung it could be is Google's", () => {
  // `--cal-timed-grid-cell-height` is the one density knob on Google's whole grid, so this single
  // number sets how zoomed in a week reads. It was 54 (Google's 48 converted by 18/16), then 48
  // (Google's default), and is now 40 — the rung BELOW default on Google's own ladder, selected
  // there by `body.Defj0e`. Owner, 2026-09-03: *"especially with the week, the day view, it's
  // still a bit big."*
  const LADDER = [40, 48, 60, 72, 80, 96, 116]; // section 6 of the reference
  assert.ok(LADDER.includes(HOUR_HEIGHT), `${HOUR_HEIGHT} is not a rung on Google's density ladder`);
  assert.equal(HOUR_HEIGHT, 40);
  assert.notEqual(HOUR_HEIGHT, 54, "the ratio conversion is back on the one number that scales the grid");
});

test("🔴🔴 the corner labels FIT the gutter, which is what narrowing it broke", () => {
  // Owner, 2026-09-03, with a screenshot of the top-left corner: *"the GMT thing, it's cutting off
  // in the calendar."* I caused it the day before, narrowing `GUTTER_WIDTH` from 57.4 to Google's
  // 51.1 without re-measuring the widest thing standing in it. "GMT-05" is wider than "12 AM".
  //
  // 🔴🔴 AND MY FIRST FIX WAS ALSO WRONG, WHICH IS THE PART WORTH KEEPING. I verified it with
  // `scrollWidth` — an integer that CLAMPS to the box, so a clipped label reports exactly the
  // width it was clipped to and reads as a perfect fit. Measured properly with a Range in real
  // Chrome, "GMT+05:30" at 9px sets 53.92px against 46.59 of room: still 7px over, while the probe
  // said it fitted. Measure the glyphs, never the box they are in.
  //
  // Measured after (Range, Chrome, both zones): GMT-04 @10px 41.25 in 46.59; GMT+5:30 @8px 42.98;
  // "All day" @9px 40.05. All three clear.
  assert.match(view, /gmtZone\.length > 6 \? "text-\[8px\]" : "text-\[10px\]"/, "the long timezone label lost its smaller size");
  assert.match(view, /const gmtZone = gmtLabel\(\);/, "the class and the text can now disagree about the label");
  // 🔴 THE LABEL ITSELF LOST ITS LEADING ZERO, which is Google's spelling AND two pixels this box
  // cannot spare: "GMT+5:30", not "GMT+05:30".
  assert.match(view, /const hours = rest \? String\(Math\.floor\(abs \/ 60\)\) : String\(Math\.floor\(abs \/ 60\)\)\.padStart\(2, "0"\);/, "the half-hour label went back to a leading zero");
  assert.doesNotMatch(view, /pr-2 text-\[11px\] font-medium tracking-\[0\.01em\]/, "the timezone label is back at the size that clipped");
});

test("🔴🔴 the year view paints by COLOUR, not by a retired kind", () => {
  // Owner, 2026-09-03: *"make sure all of it… also has the colouring too."* Every other view had
  // been moved off kinds on 2026-09-01; the year view still ran
  // `events.some((event) => event.kind === "exam")` and painted `--ui-exam`. A warm orange for a
  // field nothing on screen shows is a colour nobody can change and nobody can filter on — the
  // exact thing that ruling removed.
  const year = code(readFileSync(new URL("./year-grid.tsx", import.meta.url), "utf8"));
  assert.match(year, /const dayHex = colourOfDay\(events, calendarHex\);/, "the year view stopped colouring days");
  assert.doesNotMatch(year, /kind === "exam"/, "the year view paints by kind again");
  assert.doesNotMatch(year, /--ui-exam/, "the retired exam colour is back on the year view");
  // 🔴 ONE COLOUR ONLY WHEN THE DAY'S EVENTS AGREE. A 16px disc cannot show three, and picking the
  // first would make the year disagree with the month about what a Tuesday looks like.
  assert.equal(colourOfDay([{ calendarId: "", colorId: "11" }, { calendarId: "" }], () => "#4986e7"), null);
  assert.equal(colourOfDay([], () => "#4986e7"), null, "an empty day claimed a colour, so an empty year is solid blue");
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
  // 🔴 REPOINTED: the size moved into the shared ramp on 2026-09-03 (see the date-ramp test).
  // What this still owns is that the cell DRAWS one, and that its padding stayed off.
  assert.match(month, /MONTH_DATE\.disc/, "the month cell stopped drawing the shared date size");
  // 🔴 REPOINTED: the label moved into the shared ramp on 2026-09-03, so this checks the month
  // USES it — the date-ramp test owns the string itself.
  assert.match(month, /WEEKDAY_LABEL,/, "the weekday band left the shared 11px on a 20px line");
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

test("🔴 the view title is the frame's title, in Google's toolbar order", () => {
  // Until 2026-09-04 this pinned Google's 22px. That day the owner asked for consistent spacing
  // across the workspace pages and named the calendar, so the date range now wears the ONE title
  // string every page uses (`shell/page-frame.tsx`, 24px on the product's five-step scale). The
  // ORDER is still Google's — Today, arrows, range, controls right — which is what "copy it
  // entirely" was about; the type is Nemesis's own, which it always was (their blue never came).
  const header = readFileSync(new URL("./calendar-header.tsx", import.meta.url), "utf8");
  assert.match(header, /<h1 className=\{cn\("min-w-0 truncate", FRAME_TITLE_TEXT\)\}>\{viewLabel\(view, cursor\)\}<\/h1>/, "the view title left the frame's one title string");
  assert.doesNotMatch(header, /text-\[22px\]|text-\[1\.375rem\]/, "a page-private title size is back");
  // And the order: Today, then the arrows, then the range, then the right-hand group.
  const order = ["Today", "Previous ${VIEW_UNIT_LABEL[view]}", "Next ${VIEW_UNIT_LABEL[view]}", "viewLabel(view, cursor)", "ml-auto"];
  const positions = order.map((needle) => header.indexOf(needle));
  assert.ok(positions.every((at) => at !== -1), `a toolbar piece is missing: ${order[positions.indexOf(-1)]}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "the toolbar left Google's order");
});

test("midday is a number, the way Google writes it", () => {
  // It was "Noon" (Apple's word). A single word in a column of numerals is the
  // one label the eye stops on.
  assert.equal(hourLabel(12).value, "12");
  assert.notEqual(hourLabel(12).value, "Noon");
});

test("🔴🔴🔴 the date ramp is ONE ramp, and this is the row that left Google", () => {
  // 🔴 FOURTH REVERSAL OF ONE ROW, AND THE FIRST THAT DOES NOT MOVE TOWARD THE REFERENCE:
  //   - 2026-08-02  "these numbers are too big"                   -> 1.125rem in 2.125rem, unmeasured
  //   - 2026-09-01  "it all needs to match one to one"            -> Google's PROPORTION, 1.625/2.875
  //   - 2026-09-03  "smaller, better fitted, compare with Google" -> Google's SIZE, 26px in 46
  //   - 2026-09-03  "the day headers, I think those are the biggest problem… make sure the sizing
  //                  is consistent throughout all the different views" -> 18px in 30
  //
  // 🔴🔴 THE PATTERN ACROSS THOSE FOUR IS THE FINDING. Every earlier pass moved this row CLOSER to
  // Google and he came back. Google draws 26px in its week header and 12px in a month cell — more
  // than double, by their design, because their header is one numeral per column with a band to
  // itself. Matching that faithfully is what kept producing the object he keeps asking to shrink.
  // What he is comparing it against is not Google; it is the month view he was looking at a minute
  // before. So this one quantity is OURS, and `day-numeral.ts` says so at length.
  const ramp = code(readFileSync(new URL("./day-numeral.ts", import.meta.url), "utf8"));
  assert.match(ramp, /YEAR_DATE: DateSize = \{ disc: "size-\[18px\]", text: "text-\[10px\]" \}/, "the year rung moved");
  assert.match(ramp, /MONTH_DATE: DateSize = \{ disc: "size-\[24px\]", text: "text-\[12px\]" \}/, "the month rung moved");
  assert.match(ramp, /HEADER_DATE: DateSize = \{ disc: "size-\[30px\]", text: "text-\[18px\]" \}/, "the header rung moved");
  // 🔴🔴 THE RING IS A RULE, AND THIS ASSERTION CAUGHT ME GETTING IT WRONG. I wrote the module
  // claiming "a constant 12px of ring" and this failed on the year rung, which rings at 8 — seven
  // mini-months to a ~130px card, where a 22px disc makes the numerals touch. The claim was wrong,
  // not the number; both now say "12 where it fits, tighter in the thumbnail".
  const rungs = [...ramp.matchAll(/disc: "size-\[(\d+)px\]", text: "text-\[(\d+)px\]"/g)].map(([, d, t]) => Number(d) - Number(t));
  assert.equal(rungs.length, 3, "a rung was added or removed without this guard noticing");
  assert.deepEqual(rungs, [8, 12, 12], "a rung stopped ringing its numeral by the stated amount");

  // 🔴🔴 AND ALL THREE VIEWS READ IT. "The sizes match today" passes just as well in a build where
  // each view writes its own, which is the state this replaced — 26 / 12 / 10 with nothing tying
  // them together.
  const monthSrc = code(readFileSync(new URL("./month-grid.tsx", import.meta.url), "utf8"));
  const yearSrc = code(readFileSync(new URL("./year-grid.tsx", import.meta.url), "utf8"));
  const viewSrc = code(view);
  for (const [name, source, rung] of [["time-grid-view", viewSrc, "HEADER_DATE"], ["month-grid", monthSrc, "MONTH_DATE"], ["year-grid", yearSrc, "YEAR_DATE"]] as const) {
    assert.match(source, /from "\.\/day-numeral"/, `${name}: stopped importing the shared date ramp`);
    assert.match(source, new RegExp(`${rung}\\.disc`), `${name}: writes its own disc size again`);
    assert.match(source, new RegExp(`${rung}\\.text`), `${name}: writes its own numeral size again`);
  }
  // 🔴 THE RATIO-CONVERTED HEADER MUST NOT COME BACK. Calibration: restore `2.5556rem` and this
  // reddens.
  assert.doesNotMatch(viewSrc, /size-\[2\.5556rem\]|text-\[1\.4444rem\]|size-\[2\.875rem\]|text-\[1\.625rem\]/, "the week header went back to Google's numeral");

  // 🔴 THE WEEKDAY LABEL IS ONE STRING TOO. The month and the week had converged on 11/500/20 by
  // different routes, which is exactly how two rows part again.
  assert.match(ramp, /WEEKDAY_LABEL = "text-\[11px\] font-medium uppercase leading-\[20px\] tracking-\[0\.05em\]"/, "the shared weekday label moved");
  for (const [name, source] of [["time-grid-view", viewSrc], ["month-grid", monthSrc]] as const) {
    assert.match(source, /WEEKDAY_LABEL,/, `${name}: writes its own weekday label again`);
  }
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
