import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { inkFor } from "./character/look";

// 🔴🔴 ONE COLOUR, TWO SURFACES — OWNER, 2026-08-23: "the send button and the mascot should be
// following the same accent color." A chosen accent already reaches both through one table
// (accent.ts writes --ui-action inline; inkFor returns the same hex — accent.test.ts guards that
// pair). This file pins the DEFAULT, which used to disagree: the character wore its neutral ink
// while the send button kept a green of its own (#37614a / #9fc4ae, retired). The stylesheet
// cannot import inkFor, so this is the only place the two definitions meet.

const CSS = readFileSync(new URL("../app/styles/desktop-ui.css", import.meta.url), "utf8");

test("🔴🔴 the default action IS the character's ink, in both themes", () => {
  assert.match(CSS, new RegExp(`--ui-action:\\s*${inkFor("default", "light")};`), "light default drifted from inkFor");
  assert.match(CSS, new RegExp(`--ui-action:\\s*${inkFor("default", "dark")};`), "dark default drifted from inkFor");
});

test("🔴 the retired green is gone, not lingering somewhere for one surface to rediscover", () => {
  for (const green of ["#37614a", "#9fc4ae"]) {
    assert.ok(!CSS.includes(green), `${green} is back in the stylesheet`);
  }
});

test("🔴 the glyph token has stylesheet defaults, so the Default accent is not a broken pill", () => {
  // accentProperties() writes --ui-action-glyph only when an accent is CHOSEN; before this file's
  // change the token had no CSS definition at all, so every text-(--ui-action-glyph) consumer
  // (the clarify card's Submit) inherited whatever colour surrounded it on the Default accent.
  const defaults = CSS.match(/--ui-action-glyph:/g) ?? [];
  assert.equal(defaults.length, 2, "expected exactly a light and a dark default for --ui-action-glyph");
});

test("🔴 an empty composer clears its inline height rather than measuring nothing", () => {
  // Measured 2026-08-23 (owner screenshot): hydration recovery re-mounted the composer before
  // flex sized it, the placeholder wrapped in a zero-width box, and the empty input was stamped
  // height:160px — a tall blank pill until the first keystroke. The fix is structural: empty
  // value → no inline height at all.
  const composer = readFileSync(
    new URL("../components/workspace/learn/canvas-composer.tsx", import.meta.url),
    "utf8",
  ).replace(/\/\/.*$/gm, "");
  const guard = composer.indexOf('element.style.height = "";');
  const measure = composer.indexOf('element.style.height = "auto";');
  assert.notEqual(guard, -1, "the empty-clears-height branch is gone");
  assert.ok(guard < measure, "the empty branch no longer runs before the measurement");
});
