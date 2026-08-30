// The navigation rail's rows: what they are, and what the owner chose for them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { SIDEBAR_NAV } from "./sidebar-nav";

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
