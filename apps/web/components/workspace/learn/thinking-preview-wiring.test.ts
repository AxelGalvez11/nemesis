// The preview is driven by events, and by nothing else.
//
// 🔴🔴 Owner, 2026-08-21: *"Real tool activity should be authoritative. If Nemesis actually starts
// web search, document retrieval, image generation, calculation, etc., update the preview from that
// event. Never claim an action that did not happen."* `turn-preview.ts` proves the pure half — a
// stage that was not entered shows no line. These prove the half that pure code cannot see: that a
// stage is entered by the code that just did the thing, and never by a timer.
//
// 🔴 AND THAT THE RAW REASONING IS GONE FROM THE SURFACE. The first build put `reasoning_content`
// behind a "Show thinking" control under the answer; the owner asked for that to be removed and
// replaced by this. A guard is worth having because the transport still CAN carry it.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const CHAT = readFileSync(new URL("./canvas-chat.ts", import.meta.url), "utf8");
const SESSION = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const FIGURE = readFileSync(new URL("./canvas-thinking-preview.tsx", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

test("🔴 a stage is entered beside the thing it names, never on a clock", () => {
  // The search request going out.
  assert.match(CHAT, /enter\("searching"\);\s*\n\s*onSearching\?\.\(null\);/);
  // Results in hand.
  assert.match(CHAT, /onSearching\?\.\(sources\.length\);\s*\n\s*\/\/[^\n]*\n\s*enter\("reading"\);/);
  // Tools done.
  assert.match(CHAT, /enter\("finishing"\);/);
  // 🔴 AND NOTHING SCHEDULES ONE. A timer here would be the exact theatre `thinking-phases.ts` bans.
  for (const clock of ["setTimeout", "setInterval", "Date.now()"]) {
    assert.ok(!CHAT.includes(clock), `${clock} appeared on the turn path — a stage can now advance by waiting`);
  }
});

test("🔴 the milestones are reported when stated, not when the turn returns", () => {
  assert.match(CHAT, /onMilestones\?\.\(read\?\.milestones \?\? \[\]\)/);
  assert.match(SESSION, /setMilestones\(next\)/);
  assert.match(SESSION, /setMilestones\(\[\]\)/, "the preview outlives its turn");
});

// 🔴🔴 THE REGRESSION THIS WOULD HAVE SHIPPED WITH. `busy.kind !== null` is what DISABLES the
// composer, so routing a PubChem lookup through it locks the learner out of their own text box for
// the length of a third-party round trip — precisely the *"inert loading screen"* the owner asked
// this feature not to become. The caption and the lockout are two questions and had one answer.
test("🔴 naming a running step does not lock the composer", () => {
  assert.match(SESSION, /const \[work, setWork\] = useState<string \| null>\(null\)/);
  assert.match(SESSION, /\(label\) => setWork\(label\)\)/);
  assert.ok(
    !/setBusy\(label \?/.test(SESSION),
    "a step label is back on `busy`, which disables the composer while it runs",
  );
});

test("🔴 the raw chain of thought is off the surface entirely", () => {
  assert.equal(existsSync(new URL("./canvas-reasoning.tsx", import.meta.url)), false, "the disclosure is back");
  assert.ok(!CANVAS.includes("CanvasReasoning"), "the canvas still mounts the disclosure");
  assert.ok(!CANVAS.includes("Show thinking"), "the raw-thoughts control is back");
  assert.ok(!SESSION.includes("thinking: result"), "the aside is storing raw reasoning again");
  assert.ok(!CHAT.includes("onReasoning"), "the turn is capturing raw reasoning again");
});

// 🔴 THE PREVIEW MAKES WAY RATHER THAN VANISHING. Both it and the answer occupy the same region, so
// an instant swap reads as a flicker between two states.
test("🔴 the preview fades out when the answer starts", () => {
  assert.match(CSS, /@keyframes canvas-preview-out/);
  assert.match(CSS, /\.canvas-preview-out \{\s*animation: canvas-preview-out 220ms ease-out forwards;/);
  assert.match(FIGURE, /canvas-preview-out/);
  // 🔴 AND REDUCED MOTION SHORTENS IT RATHER THAN REMOVING IT. `forwards` holds the end state, so
  // `animation: none` would leave the preview sitting over the answer for ever — the one case where
  // stopping the animation is not the safe reading of the preference.
  const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.canvas-preview-out \{ animation-duration: 1ms; \}/);
});

// 🔴 THE ORDER IS "HOW SPECIFIC IS THE FACT", and every one of the three is work genuinely running.
// A milestone is preferred over all of them because it is the only one written for a learner.
test("🔴 the caption only ever holds work that is really happening", () => {
  assert.match(CANVAS, /busy\.kind !== null \? busy\.label : session\.work \?\? \(policy\.phase \? THINKING_COPY\[policy\.phase\] : null\)/);
  assert.match(CANVAS, /previewWorthShowing\(\{ milestones: session\.milestones, systemLabel \}\)/);
  assert.match(CANVAS, /previewLine\(\{ milestones: session\.milestones, stage: session\.stage, systemLabel \}\)/);
});
