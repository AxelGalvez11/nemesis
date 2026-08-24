import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { COUNT_CAP, EMPTY_TODAY, isQuiet, loadToday, TODAY_ROWS, whenPhrase } from "./today";

// ── a reason to come back tomorrow (workstream D) ───────────────────────────────────────────
//
// Owner: *"Opening Nemesis shows the state of your studying: forty cards due, a canvas you left
// half finished, an exam in nine days. One tap into any of it."*
//
// 🔴🔴 THE TWO RULES THIS FILE EXISTS TO HOLD. First, it REPORTS and never RECOMMENDS: a front
// door that ordered the learner's work would be §38's banned mode selector wearing a dashboard's
// face, and deciding what to do next is the teaching policy's job (§18, §26). Second, it is
// SILENT when nothing is waiting: §19 asks for an interface that almost disappears, and a panel
// reporting three zeroes every morning trains the learner to stop looking at it.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const TODAY = strip(readFileSync(new URL("./today.ts", import.meta.url), "utf8"));
const STRIP = strip(readFileSync(new URL("../../components/workspace/learn/today-strip.tsx", import.meta.url), "utf8"));
const HOME = strip(readFileSync(new URL("../../components/workspace/learn/canvas-home.tsx", import.meta.url), "utf8"));

test("🔴🔴 an empty plate draws nothing at all", () => {
  assert.equal(isQuiet(EMPTY_TODAY), true);
  assert.match(STRIP, /if \(!loaded \|\| isQuiet\(today\)\) return null;/, "the strip can now paint an empty dashboard");
});

test("anything waiting makes it speak", () => {
  assert.equal(isQuiet({ ...EMPTY_TODAY, cardsDue: 1 }), false);
  assert.equal(isQuiet({ ...EMPTY_TODAY, unfinished: [{ id: "c", title: "T", updatedAt: "" }] }), false);
  assert.equal(isQuiet({ ...EMPTY_TODAY, dates: [{ id: "d", inDays: 2, statement: "Exam" }] }), false);
});

test("signed out is quiet, and costs no queries", async () => {
  assert.deepEqual(await loadToday(null), EMPTY_TODAY);
});

test("🔴🔴 it never ranks, recommends, or tells the learner what to do first", () => {
  // Calibration: add a "start here" row and the second assertion reddens.
  assert.ok(!/recommend|suggest|priorit|start here|do this first/i.test(TODAY), "the today reader started making decisions for the learner");
  assert.ok(!/recommend|suggest|priorit|Start here|Do this first/i.test(STRIP), "the strip started steering the session");
});

test("🔴 a date row is not a link, because there is nowhere for it to go", () => {
  // There is no "exam" object in this product. A row that looks pressable and does nothing is
  // this codebase's most-repeated defect.
  const dates = STRIP.slice(STRIP.indexOf("today.dates.map"), STRIP.indexOf("function Row"));
  assert.ok(dates.length > 0, "the date rows moved — this guard is pointed at nothing");
  assert.ok(!/<a\b|href=/.test(dates), "a date row became a link to nowhere");
});

test("🔴 the unfinished link uses learn-entry's own param name", () => {
  // `?canvas=` is silently ignored by learnSurface and lands the learner back on the home surface
  // they were already on, which reads as a dead link rather than a wrong one.
  assert.match(STRIP, /\/learn\?c=\$\{canvas\.id\}/, "the unfinished-canvas link stopped opening the canvas");
});

test("🔴 unstarted canvases are not 'unfinished'", () => {
  // A canvas someone opened and abandoned before a single lesson has nothing to return TO, and
  // listing it fills the front door with the learner's own false starts.
  const states = TODAY.slice(TODAY.indexOf("UNFINISHED_STATES"), TODAY.indexOf("function daysUntil"));
  assert.ok(!/"empty"|"sources_attached"/.test(states), "an unstarted canvas now counts as unfinished");
});

test("every section is capped, and a huge count stops being exact", () => {
  assert.equal(TODAY_ROWS, 3, "the front door started rendering a list instead of a summary");
  assert.ok(COUNT_CAP >= 100, "the count cap is low enough to misreport an ordinary backlog");
  assert.match(TODAY, /Math\.min\(count, COUNT_CAP\)/, "an unbounded count can reach the front door");
  assert.match(TODAY, /\.slice\(0, TODAY_ROWS\)/, "the dates list is no longer capped");
});

test("🔴 each read fails on its own, so one missing table cannot blank the front door", () => {
  // Deadlines live behind a migration the owner applies. A front door that fails to render
  // because a table is missing is worse than one with a section absent.
  assert.equal((TODAY.match(/} catch \{/g) ?? []).length, 2, "a query lost its own catch");
  assert.match(TODAY, /await Promise\.all\(\[/, "the three reads are no longer independent");
});

test("dates are said the way a person says them", () => {
  assert.equal(whenPhrase(0), "today");
  assert.equal(whenPhrase(-3), "today", "a date that slipped past reads as overdue rather than negative");
  assert.equal(whenPhrase(1), "tomorrow");
  assert.equal(whenPhrase(9), "in 9 days");
  assert.equal(whenPhrase(null), "", "an undated line invented a date");
  // Learner-facing copy: no em dashes (canvas-learner-copy.test.ts's rule).
  assert.ok(![whenPhrase(0), whenPhrase(1), whenPhrase(9)].some((phrase) => phrase.includes("—")));
});

test("🔴 the strip sits under the composer, not above it", () => {
  // The composer is the primary thing on this surface. Someone arriving to type must not have to
  // look past a wall of status to find the box.
  const composerAt = HOME.indexOf("<ComposerSend");
  const stripAt = HOME.indexOf("<TodayStrip");
  assert.ok(composerAt > 0 && stripAt > 0, "one of the two is no longer on the front door");
  assert.ok(stripAt > composerAt, "the today strip moved above the composer");
});
