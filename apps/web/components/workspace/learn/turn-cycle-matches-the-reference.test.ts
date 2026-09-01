import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the send-and-answer cycle, measured against the reference ─────────────────────────────────
//
// Owner, 2026-08-31: *"it's all about send a prompt and then receive an output ... literally it
// should be one to one."*
//
// Every number below was read out of the reference in his own account that day, at a 1440px
// window, signed in, dark theme — not remembered, and not taken from a screenshot.
//
// 🔴 THE REM TRAP IS WHY THESE ARE PIXELS. This app sets `html { font-size: 112.5% }`, so Tailwind's
// scale steps are 1.125x what their names suggest: `px-4` is 18px here, `py-2.5` is 11.25px,
// `leading-relaxed` is 26px, `pb-4` is 18px. Every one of those was a near-miss against a
// reference number expressed in pixels. Where a number is theirs, it is written in pixels.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// 🔴 STRIPPED, because the note explaining why `leading-relaxed` is wrong contains the words
// `leading-relaxed`, and a guard that reads its own explanation fails on a correct file.
const BUBBLE = strip(read("./learner-utterance.tsx"));
const COMPOSER = read("./canvas-composer.tsx");
const SURFACE = read("./canvas-surface.tsx");
const CSS = read("../../../app/globals.css");

test("🔴 the learner's bubble is their 10/16 on a 24px line", () => {
  // Measured: padding 10px 16px, line-height 24px, radius 22px, max-width 70%. The last two already
  // matched; the first three were 11.25px, 18px and 26px — the rem trap, three times.
  assert.match(BUBBLE, /px-\[16px\] py-\[10px\]/, "the bubble's padding drifted off the reference's 10/16");
  assert.match(BUBBLE, /leading-\[24px\]/, "the bubble's line-height drifted off 24px");
  assert.ok(!/leading-relaxed/.test(BUBBLE), "leading-relaxed is back, which is 26px at this app's root");
  assert.match(BUBBLE, /rounded-\[22px\]/, "the bubble's radius left 22px");
  assert.match(BUBBLE, /max-w-\[70%\]/, "the bubble's max width left 70%");
});

test("🔴 the composer sits 24px off the bottom", () => {
  // `pb-4` is 18px at this app's root. Theirs is 24.
  assert.match(COMPOSER, /bottom-0 z-20 flex justify-center px-4 pb-\[24px\]/, "the composer's bottom gap left 24px");
});

test("🔴🔴 the column STEPS the way theirs does, and it is a container query", () => {
  // Their live class list: [--thread-content-max-width:40rem]
  // @[53.5rem]/main:[--thread-content-max-width:48rem] — 640px of text under an 856px area, 768
  // at or above. Two honest measurements of this disagreed (768 on 2026-08-26, 640 today) because
  // neither had the whole rule.
  assert.match(SURFACE, /CANVAS_COLUMN_PX = "822px"/, "the wide step left 822 (768 of text)");
  assert.match(SURFACE, /CANVAS_COLUMN_NARROW_PX = "694px"/, "the narrow step left 694 (640 of text)");
  assert.match(SURFACE, /CANVAS_COLUMN_STEP_PX = 856/, "the step moved off the reference's 53.5rem");
  assert.match(SURFACE, /data-canvas-surface=""/, "the surface lost the handle its query hangs on");

  // 🔴 A CONTAINER QUERY, NOT A MEDIA QUERY, and that is not a style preference: this surface
  // narrows for the reading pane (#913), so a viewport query would hold the wide column while the
  // pane squeezed the text into two thirds of it.
  const rule = CSS.slice(CSS.indexOf("[data-canvas-surface] {"));
  assert.ok(rule.length > 0, "the canvas surface has no container rule");
  assert.match(rule, /container-type: inline-size;/, "the surface stopped being a container");
  assert.match(rule, /@container canvasarea \(max-width: 855px\)/, "the column's step left the reference's boundary");
  assert.ok(!/@media[^{]*\(max-width: 85[0-9]px\)/.test(rule), "the step became a viewport query, which the reading pane defeats");

  // 🔴 THE VARIABLE LANDS ON THE CHILDREN. A container cannot be styled by its own query, and the
  // surface sets `--canvas-column` inline, which no rule on that same element could beat.
  assert.match(rule, /\[data-canvas-surface\] > \* \{\s*--canvas-column: 694px;/, "the narrow step stopped reaching the children that read it");
});
