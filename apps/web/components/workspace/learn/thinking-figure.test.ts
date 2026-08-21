// The thinking figure: a character standing over three dots, with the words beside them.
//
// 🔴🔴 THE ENGINE CANNOT DRAW THIS, WHICH IS WHY IT IS COMPOSED RATHER THAN ANIMATED. Owner,
// 2026-08-21: *"when thinking, the mascot should be on top of the three dots. the thinking words
// should be on the right of the three dots, the thinking words should be pulsing from left to
// right."* `lib/bloub/states.ts` is explicit that the `thinking` pose turns the body INTO the middle
// dot — "la boule DEVIENT le point du milieu" — and fades the eyes to zero while it does. So for a
// week the character WAS the three dots and there was no blob to stand over anything.
//
// 🔴 AND THE COLOURED VERSION LASTED ONE ROUND. The dots were tinted through the app's accents
// ("can you add a colorful pulsing as its thinking"); the owner's next message was "remove the
// 'colorful pulsing'". What was wanted was the WORDS moving, not the mark changing colour.
//
// 🔴 SOURCE GUARDS, WITH A REAL LIMIT. There is no DOM here, so nothing below proves a dot appears
// or that the band travels. What they prove is the composition — resting character, own dots, words
// to the right — and the one-character rule that a refactor would quietly undo.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FIGURE = readFileSync(new URL("./canvas-thinking-preview.tsx", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const DOCK = readFileSync(new URL("../../bloub/bloub-dock.tsx", import.meta.url), "utf8");
const BOT = readFileSync(new URL("../../bloub/bloub-bot.tsx", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

test("🔴 the character rests, so there is a blob to stand over the dots", () => {
  assert.match(FIGURE, /<BloubBot[^>]*state="idle"/s, "the figure plays `thinking` again, which IS the dots");
  assert.ok(!/state="thinking"/.test(FIGURE), "the pose that dissolves the body is back");
});

test("🔴 the dots belong to the figure, and sit under the character", () => {
  assert.match(FIGURE, /canvas-thinking-dot/, "the figure draws no dots of its own");
  // The character, then a row. A column with the row second is the whole of "on top of".
  const stack = FIGURE.slice(FIGURE.indexOf("function ThinkingMark"));
  assert.ok(
    stack.indexOf("<BloubBot") < stack.indexOf("canvas-thinking-dot"),
    "the dots are drawn before the character — the mascot is no longer on top",
  );
});

test("🔴 the words sit to the RIGHT of the dots, in one row", () => {
  const mark = FIGURE.slice(FIGURE.indexOf("function ThinkingMark"));
  assert.match(mark, /flex items-center gap-3/, "the dots and the words are no longer a row");
  // 🔴 THE CLASS ATTRIBUTES, NOT THE NAMES. Both names also appear in the comments explaining them,
  // and a comment moving would fail this test for a layout that never changed.
  const dots = mark.indexOf('className="canvas-thinking-dot');
  const words = mark.indexOf('className="canvas-thinking-word');
  assert.notEqual(dots, -1, "the dots lost their class");
  assert.notEqual(words, -1, "the caption lost its class");
  assert.ok(dots < words, "the caption is drawn before the dots — it is no longer to their right");
});

// 🔴 THE SWEEP IS THE HOUSE ONE. §20 asks for a single motion system — information forming from
// left to right — and a fourth speed would read as a fourth unrelated thing happening at once.
test("🔴 the words are lit left to right, at the same rate as everything else", () => {
  assert.match(CSS, /@keyframes canvas-thinking-word \{ from \{ background-position: 200% 0; \}/);
  assert.match(CSS, /\.canvas-thinking-word \{[\s\S]*?animation: canvas-thinking-word 1900ms linear infinite;/);
  // Same direction and duration as the two that were already there.
  for (const sibling of ["canvas-forming", "canvas-rewriting"]) {
    assert.match(CSS, new RegExp(`animation: ${sibling} 1900ms linear infinite`), `${sibling} drifted`);
  }
});

// 🔴 `color: transparent` MAKES A HELD FRAME DANGEROUS. Stopped mid-sweep with the gradient still
// clipped to the text, a badly-timed stop is an invisible sentence — so reduced motion has to put
// the words back to being ordinary text rather than merely stopping the animation.
test("🔴 reduced motion leaves the caption readable, not transparent", () => {
  const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.canvas-thinking-word \{[\s\S]*?color: var\(--ui-text-tertiary\)/);
  assert.match(reduced, /\.canvas-thinking-word \{[\s\S]*?background-image: none/);
  // And the dots hold their LIT frame; held dim they read as disabled.
  assert.match(reduced, /\.canvas-thinking-dot \{[^}]*opacity: 0\.85/);
});

// 🔴🔴 THE SIX-DOT RULE. That defect was never two renderers — it was two MOUNTS of one, both
// centred, both playing `thinking`. The fix was "the dock owns the character", so a surface that
// draws its own must take the dock away rather than hope they do not overlap.
test("🔴 exactly one character while the figure is on screen", () => {
  assert.match(DOCK, /hidden = false/, "the dock cannot be switched off any more");
  assert.match(DOCK, /if \(hidden\) return null;/);
  assert.match(CANVAS, /hidden=\{presence === "preparing"\}/, "two characters can now share the surface");
});

test("🔴 the character is one ink again", () => {
  assert.ok(!BOT.includes("pulseTint"), "the accent tint on the thinking dots is back");
});
