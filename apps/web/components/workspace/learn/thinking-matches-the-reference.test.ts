// The thinking caption: where it stands, and how it pulses.
//
// Owner, 2026-08-31: *"the thinking doesn't actually match how ChatGPT does the pulsing... the
// thinking is stuck to the top left, and it should only be like that when it's in chat mode, not
// when it's in Canvas mode. Canvas mode should just have the thinking below the mascot."*
//
// 🔴 THE RECIPE BELOW WAS READ OFF chatgpt.com SIGNED IN, WITH THE SHIMMER ACTUALLY RUNNING, from
// the computed style of the live `.loading-shimmer-tertiary` span and the `loading-shimmer`
// keyframes in their stylesheet. It is a measurement, not a preference, which is why it is pinned:
//
//   animation          loading-shimmer 1.4s infinite
//   @keyframes         0% { background-position: -100% top }  100% { 250% top }
//   background-size    50% 200%        background-repeat: no-repeat
//   background-color   #8f8f8f (their text-tertiary)
//   band               rgba(255, 255, 255, 0.75) light · rgba(0, 0, 0, 0.6) dark
//   type               16px / 24px / 400
//
// Everything but the band already matched to the byte. The band did not: ours dropped the glyphs
// toward TRANSPARENT at 35%, theirs washes them toward the PAGE at 75%.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CSS = readFileSync("app/globals.css", "utf8");
const CANVAS = readFileSync("components/workspace/learn/learning-canvas.tsx", "utf8");
const DOCK = readFileSync("components/character/character-dock.tsx", "utf8");

test("🔴🔴 the sweep is the reference's, to the number", () => {
  assert.match(
    CSS,
    /@keyframes canvas-thinking-word \{ from \{ background-position: -100% top; \} to \{ background-position: 250% top; \} \}/,
    "the sweep range moved off the reference's -100% → 250%",
  );
  assert.match(CSS, /animation: canvas-thinking-word 1400ms ease infinite;/, "the period moved off their --cot-shimmer-duration");
  // 🔴 A 50%-WIDE BAND ON A NO-REPEAT IMAGE IS WHAT MAKES IT A SWEEP AND THEN A REST, rather than a
  // continuous churn. Widen it or let it repeat and the words never sit plain between passes.
  assert.match(CSS, /background-size: 50% 200%;/, "the band is no longer half the width of the line");
  assert.match(CSS, /background-repeat: no-repeat;/, "the band repeats, so there is no rest between sweeps");
  // 🔴 AND THE RESTING COLOUR IS CARRIED BY `background-color`: everywhere the no-repeat image is
  // not, the glyphs are painted by what is underneath it. Drop it and the words vanish between
  // sweeps.
  assert.match(CSS, /background-color: var\(--ui-text-tertiary\);/, "the words will disappear between sweeps");
});

test("🔴🔴 the band washes toward the page, not toward transparent", () => {
  // The one thing that did not match. 35% of the ink was still there where the band passed, against
  // about 25% of theirs, so the pulse read shallower than the reference's.
  // 🔴 THE CLASS RULE, NOT THE KEYFRAMES OF THE SAME NAME — which come first in the file.
  const at = CSS.indexOf(".canvas-thinking-word {");
  assert.notEqual(at, -1, "the shimmer rule is gone");
  const rule = CSS.slice(at, at + 3000);
  // 🔴 THE DECLARATIONS, NOT THE PROSE. The rule's own note quotes the reference's `rgba(255,255,
  // 255,.75)` to record what was measured, and the guard below bans that literal — so a comment
  // explaining the fix would fail the test for the fix. Third time this shape has bitten today;
  // strip the comments and assert on what the browser actually reads.
  const declarations = rule.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    rule,
    /color-mix\(in srgb, var\(--ui-bg-editor\) 75%, var\(--ui-text-tertiary\)\) 40%/,
    "the band stopped washing toward the page colour at the reference's 75%",
  );
  assert.ok(!/35%, transparent\) 40%/.test(declarations), "the band is fading to transparent again");
  // 🔴 THE PAGE TOKEN, NOT A LITERAL. Their light band is white and their dark band is black — one
  // gesture named twice because their themes are two stylesheets. `--ui-bg-editor` is the page
  // under these words in either theme, so one rule covers both and cannot drift from the surface.
  assert.ok(!/#fff|#ffffff|rgba\(255, ?255, ?255/.test(declarations), "the band hard-codes a light theme");
});

test("🔴🔴 chat view puts it in the thread; canvas view puts it under the character", () => {
  // Measured before this split, mid-turn on production: the caption sat at y=343 with the character
  // at y=676 — 333px apart, at opposite ends of the screen, in the view where there is no
  // conversation for it to sit under.
  assert.match(CANVAS, /caption=\{threadOpen \? null : preparingLabel\}/, "the two views draw the caption the same way again");
  // 🔴 THE `preparing` HALF IS GATED ON AN EMPTY THREAD SINCE 2026-09-01 — the ladder is told
  // `blocks`, never the thread, so a REOPENED conversation reported itself empty and re-ran this
  // line on every open. What this test is about is untouched: `threadOpen` still scopes the line
  // to chat view, so the two views cannot both draw a caption.
  assert.match(
    CANVAS,
    /\{threadOpen && \(turnInFlight \|\| \(presence === "preparing" && thread\.length === 0\)\) && !replyText\.trim\(\) && \(/,
    "the thread's line is no longer scoped to chat view — canvas view would draw two captions",
  );
  // 🔴 UNDER, NOT BESIDE, AND THE STATION IS WHAT DECIDES IT. The dock places its caption under the
  // character at the centre and beside it in the corner; the station line sends the character to
  // the centre exactly when the thread is closed and something is running. So "below the mascot"
  // is what the existing dock draws — all that was missing was being handed the words.
  assert.match(
    CANVAS,
    /station=\{handedOver \|\| \(!threadOpen && \(turnInFlight \|\| presence === "preparing"\)\) \? "centre" : "corner"\}/,
    "the character no longer stands at the centre while canvas view is working, so its caption would sit beside it",
  );
  assert.match(
    DOCK,
    /station === "centre" \? " left-1\/2 top-full" : " left-full top-1\/2"/,
    "the dock stopped placing its caption UNDER the character at the centre",
  );
});
