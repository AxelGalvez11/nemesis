// The navigation rail's rows: what they are, and what the owner chose for them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { SIDEBAR_NAV, visibleNav } from "./sidebar-nav";

test("🔴🔴 the rail is the canvas and the Library, and Apps and Calendar are gone", () => {
  // Owner, 2026-09-07: *"could you remove the calendar and the apps I mainly just want to focus on
  // the canvas right now for the live website"*. That reverses his own call from earlier the same
  // day (*"should only really have google calendar as a connector for now, so calendar stays"*),
  // and the reversal is the point: the live site is narrowed to one thing while the canvas is being
  // worked on daily.
  //
  // 🔴 WHAT CAME DOWN WITH THEM, NAMED SO A `git log -S` FINDS IT AT 1b528442 AND BEFORE: the
  // plugins row wore `extensions`, the puzzle piece, chosen by the owner on 2026-08-30 from four
  // candidates drawn on the real row, with the plug offered and passed over; both rows were GATED,
  // appearing only once something was connected, so that a Plugins page with no connections and a
  // Calendar with no calendar behind it were never destinations wearing a settings screen's
  // clothes; and `hasCalendar` read the app catalogue rather than testing the slug for the word
  // "calendar", because Outlook is one toolkit carrying mail AND nine event actions and a string
  // test answered "no calendar" for every Microsoft student.
  //
  // 🔴 `hasCalendar` AND `visibleNav` BOTH STILL EXIST AND ARE STILL TESTED (composio-apps.test.ts),
  // so putting either row back is one line each. Nothing about a learner's connections changed.
  const ids = SIDEBAR_NAV.map((item) => item.id);
  assert.deepEqual(ids, ["new-canvas", "library"], "the rail is no longer the canvas and the Library");
  // And they stay gone however much is connected, which is what "removed" has to mean.
  for (const connected of [[], ["outlook"], ["googlecalendar"], ["one_drive", "notion", "zoom"]]) {
    assert.deepEqual(visibleNav(SIDEBAR_NAV, connected).map((item) => item.id), ["new-canvas", "library"], `connecting ${connected.join(", ") || "nothing"} brought a row back`);
  }
});


test("🔴 the filter passes rows through, never reorders or rewrites them", () => {
  const all = visibleNav(SIDEBAR_NAV, ["googlecalendar"]);
  assert.deepEqual(all, SIDEBAR_NAV, "with a calendar connected every row shows, in the shared order");
});
