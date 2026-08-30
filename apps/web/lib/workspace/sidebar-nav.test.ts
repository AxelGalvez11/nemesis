// The navigation rail's rows: what they are, and what the owner chose for them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { SIDEBAR_NAV, visibleNav } from "./sidebar-nav";

test("🔴 the plugins row wears the puzzle piece, and the rail icons carry the owner's tilt", () => {
  // Owner 2026-08-30, picking from four candidates drawn on the real row: `extensions`, with the
  // plug offered and passed over — the same day the plug was retired from the composer's apps
  // control (#915). The motion is "Tilt", chosen by feel from three candidates; web ChatGPT has no
  // such animation (its sidebar sprite is static and its stylesheets carry zero hover-transform
  // rules — measured 2026-08-30), so the motion is designed, not copied.
  const nav = SIDEBAR_NAV.find((item) => item.id === "plugins");
  assert.equal(nav?.codicon, "extensions", "the plugins row lost the owner's pick");
  assert.ok(!SIDEBAR_NAV.some((item) => item.codicon === "plug"), "the plug crept back into the rail");
  const sidebar = readFileSync(new URL("../../components/workspace/shell/chat-sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /nav-icon-tilt/, "the rail icons lost the tilt class");
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  // 🔴 THE TILT LIVES INSIDE THE REDUCED-MOTION GATE. Someone who asked the system to stop moving
  // gets a still icon and keeps the hover background. The slice runs gate-start → keyframes, so a
  // rule drifting out of the gate fails here rather than shipping.
  const gate = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"), css.indexOf("@keyframes nav-icon-tilt"));
  assert.match(gate, /\.nav-icon-tilt[\s\S]*?animation: nav-icon-tilt/, "the tilt fires outside the reduced-motion gate, or not at all");
  assert.match(css, /@keyframes nav-icon-tilt/, "the tilt keyframes are gone");
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
