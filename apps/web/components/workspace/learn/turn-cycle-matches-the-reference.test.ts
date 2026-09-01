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

test("🔴 the actions under an answer are their 32px squares with 20px glyphs", () => {
  // Measured in the owner's account 2026-08-31: every action under an answer is a 32x32 box with an
  // 8px radius holding a 20px icon, the boxes sit FLUSH, and the strip starts 12px under the last
  // line of prose and 10px LEFT of the column.
  //
  // 🔴 THE OVERHANG IS DELIBERATE AND IS THE ONLY WAY THE GLYPHS LINE UP. A 20px icon centred in a
  // 32px box sits 6px in from its edge, so a box flush with the text column puts the glyph 6px
  // right of every line above it. Theirs hangs left so the ICON aligns, not the box.
  const ACTIONS = strip(read("./reply-actions.tsx"));
  assert.match(ACTIONS, /h-\[32px\] w-\[32px\]/, "the action buttons left the reference's 32px square");
  assert.match(ACTIONS, /rounded-\[8px\]/, "the action buttons left the reference's 8px radius");
  assert.match(ACTIONS, /size="20px"/, "the action glyphs left the reference's 20px");
  assert.match(ACTIONS, /-ml-\[10px\] mt-\[12px\]/, "the strip left the reference's 12px drop and 10px overhang");
  assert.ok(!/gap-0\.5/.test(ACTIONS), "the buttons are spaced again; theirs sit flush");
  // The rem trap, one more time: `mt-2` is 18px at this app's root, `px-1.5` is 6.75.
  assert.ok(!/\bmt-2\b/.test(ACTIONS), "mt-2 is back, which is 18px here against their 12");
});

test("🔴 a table in an answer is unboxed, the way theirs is", () => {
  // Measured in the owner's account 2026-08-31: NO wrapper border, NO radius, NO shaded header
  // band. 14px text, a firmer hairline under the header and a fainter one under each row, and the
  // first column flush with the prose — their 24px of cell gap is on the RIGHT, not both sides.
  // A bordered card with a grey header reads as a widget dropped into the answer; theirs reads as
  // part of the sentence that introduced it.
  const MD = strip(read("../../../lib/workspace/chat-markdown.tsx"));
  assert.match(MD, /className="aui-md-table my-2 max-w-full overflow-x-auto"/, "the table wrapper grew a border or radius again");
  assert.match(MD, /border-collapse text-\[14px\]/, "the table left the reference's 14px");
  assert.match(MD, /py-\[10px\] pr-\[24px\]/, "a cell left the reference's 10px/24px");
  assert.match(MD, /py-\[8px\] pr-\[24px\]/, "a header cell left the reference's 8px/24px");
  assert.ok(!/px-2\.5/.test(MD), "px-2.5 is back: 11.25px here, and it pads the left edge off the prose column");
  assert.ok(!/thead className="m-0 bg-/.test(MD), "the header band came back");
  // 🔴 THE SCROLL WRAPPER STAYS. A wide table must never make the whole answer scroll sideways.
  assert.match(MD, /overflow-x-auto/, "a wide table can now scroll the answer sideways");
});

test("🔴 a fenced code block wears the reference's header strip", () => {
  // Measured 2026-08-31 on a fence ChatGPT wrote to order: a strip carrying the language and a
  // copy control, then the code at 12.25px on a 20px line, 20px side padding, 12px underneath,
  // 6px radius, and NO border around the whole thing.
  const MD = strip(read("../../../lib/workspace/chat-markdown.tsx"));
  assert.match(MD, /function CodeBlock\(/, "the code block lost its header strip");
  assert.match(MD, /text-\[12\.25px\] leading-\[20px\]/, "the code left the reference's 12.25/20");
  assert.match(MD, /px-\[20px\] pb-\[12px\]/, "the code body left the reference's padding");
  assert.match(MD, /rounded-\[6px\]/, "the block left the reference's 6px radius");
  assert.match(MD, /navigator\.clipboard\.writeText/, "the copy control stopped copying");

  // 🔴 TWO DEFECTS THAT WERE ONLY VISIBLE ON SCREEN, AND BOTH ARE PINNED. The typography plugin
  // gives `pre` a margin, which opened a band between the strip and the code so one block read as
  // two; and its `prose-code:` rules dress INLINE code as a chip, which painted a lighter
  // background behind the fenced text, ending mid-line.
  assert.match(MD, /!my-0/, "the pre's own margin is back, which detaches the header from the code");
  assert.match(MD, /!bg-transparent !p-0/, "the inline-code chip styling is leaking onto fenced code again");
});
