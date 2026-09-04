// The navigation rail's rows: what they are, and what the owner chose for them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { SIDEBAR_NAV, visibleNav } from "./sidebar-nav";

test("🔴 the plugins row wears the puzzle piece, and the rail icons do not move", () => {
  // Owner 2026-08-30, picking from four candidates drawn on the real row: `extensions`, with the
  // plug offered and passed over — the same day the plug was retired from the composer's apps
  // control (#915).
  const nav = SIDEBAR_NAV.find((item) => item.id === "plugins");
  assert.equal(nav?.codicon, "extensions", "the plugins row lost the owner's pick");
  assert.ok(!SIDEBAR_NAV.some((item) => item.codicon === "plug"), "the plug crept back into the rail");

  // 🔴🔴 THE TILT IS GONE, AND THIS ASSERTION USED TO REQUIRE IT. Owner, 2026-09-04: *"remove the
  // left sidebars animation of the icons."* The motion was his own pick, felt live on three
  // candidates (2026-08-30) — so this is a reversal after living with it, not a regression, and the
  // guard flips rather than being deleted: the next person to "restore the nice hover" has to read
  // this first.
  //
  // 🔴 BOTH RENDER PATHS, WHICH IS WHY THE ORIGINAL GUARD CHECKED TWO FILES. The nav draws twice —
  // chat-sidebar's expanded rows and nav-rail's collapsed rail — and #921 dressed only the first,
  // so production showed a still icon on the rail and a moving one in the list. Removing it from
  // one file would recreate that split with the states swapped.
  for (const file of ["chat-sidebar.tsx", "nav-rail.tsx"]) {
    const src = readFileSync(new URL(`../../components/workspace/shell/${file}`, import.meta.url), "utf8");
    assert.ok(!/nav-icon-tilt/.test(src), `${file}: the icon animation is back`);
  }
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.ok(!/@keyframes nav-icon-tilt/.test(css), "the tilt keyframes are back in the stylesheet");
  // 🔴 AND THE `no-preference` GATE WENT WITH IT, CORRECTLY. The tilt was the only rule inside it —
  // it existed to keep a hover animation away from anyone who asked the system to stop moving, and
  // with no animation there is nothing to gate. This is NOT the `reduce` block further up, which
  // `canvas-motion.test.ts` reads and which still carries the canvas's own motion.
  assert.ok(!/@media \(prefers-reduced-motion: no-preference\)/.test(css), "an empty no-preference gate came back");
  // 🔴 THE ROW'S HOVER BACKGROUND IS NOT PART OF THIS. It is how a row says it is under the
  // pointer; the owner asked for the ICONS to stop moving.
});

// 🔴🔴 WHAT THIS FILE GUARDS — owner ruling, 2026-08-30: "Why are there so many icons in the top
// left? ... they should only show up when they are actually needed." The two connection-borne
// rows appear WITH the first connection; the product's own destinations are never gated, because
// a hidden door with no other way in is this codebase's most-repeated defect.

test("🔴 with nothing connected, Plugins and Calendar are not offered", () => {
  const ids = visibleNav(SIDEBAR_NAV, []).map((item) => item.id);
  assert.ok(!ids.includes("plugins"), "a Plugins page with no connections is a settings screen in a destination's clothes");
  assert.ok(!ids.includes("calendar"), "a Calendar with nothing behind it is an empty grid");
});

test("🔴 the product's own destinations are NEVER gated", () => {
  const ids = visibleNav(SIDEBAR_NAV, []).map((item) => item.id);
  for (const core of ["new-canvas", "library", "projects"]) {
    assert.ok(ids.includes(core), `${core} must be reachable before anything is connected`);
  }
});

test("🔴 Outlook is a calendar, and the slug does not say so", () => {
  // The defect: the gate was `slug.toLowerCase().includes("calendar")`. Outlook is ONE toolkit
  // carrying mail and nine event actions, so a student whose entire timetable was connected got
  // false and never saw the destination that shows it. Half the universities in the world put
  // their students on Microsoft, so this was not an edge case.
  const ids = visibleNav(SIDEBAR_NAV, ["outlook"]).map((item) => item.id);
  assert.ok(ids.includes("calendar"), "a Microsoft student's timetable no longer reveals the Calendar row");
  assert.ok(ids.includes("plugins"), "a connection no longer reveals Plugins");
});

test("🔴 a file store is still not a calendar", () => {
  // The fix must not have become "anything connected shows the Calendar row", which would put an
  // empty grid behind a destination again.
  const ids = visibleNav(SIDEBAR_NAV, ["one_drive", "notion", "zoom"]).map((item) => item.id);
  assert.ok(!ids.includes("calendar"), "an app with no calendar now reveals the Calendar row");
  assert.ok(ids.includes("plugins"), "three connections did not reveal Plugins");
});

test("the first connection brings Plugins; a calendar brings Calendar", () => {
  const drive = visibleNav(SIDEBAR_NAV, ["googledrive"]).map((item) => item.id);
  assert.ok(drive.includes("plugins"), "a connected app has nowhere to be managed");
  assert.ok(!drive.includes("calendar"), "Drive is not a calendar");
  const both = visibleNav(SIDEBAR_NAV, ["googledrive", "GOOGLECALENDAR"]).map((item) => item.id);
  assert.ok(both.includes("calendar"), "the slug test must be case-insensitive");
});

test("🔴 the filter passes rows through, never reorders or rewrites them", () => {
  const all = visibleNav(SIDEBAR_NAV, ["googlecalendar"]);
  assert.deepEqual(all, SIDEBAR_NAV, "with a calendar connected every row shows, in the shared order");
});
