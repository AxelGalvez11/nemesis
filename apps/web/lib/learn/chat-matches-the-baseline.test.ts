// The chat, measured against the three products it is judged beside.
//
// Owner, 2026-09-04: *"can you make sure chatgpt ui/ux matches 1 to 1 in nemesis as a baseline?
// for the chats"*, then *"actually investigate wondering.app, https://claude.ai/new, chatgpt, and
// gemini for their chat interfaces to come to common baseline"*.
//
// 🔴 EVERY NUMBER BELOW WAS READ OFF THE LIVE PRODUCTS IN THE OWNER'S SIGNED-IN CHROME on
// 2026-09-04 at a 1470px viewport, by asking all four the SAME question and measuring the result
// with getComputedStyle and getBoundingClientRect. The full table is
// docs/chat-baseline-reference.md; this file holds only the two numbers that were WRONG, so they
// cannot drift back. Wondering has no chat of its own, its conversation is the canvas board, so it
// contributes card numbers rather than thread numbers.
//
// What the measurement found is that the chat already matched ChatGPT on everything that had been
// measured against it before: a 768px column, 16px text on a 26px line, the question bubble at
// radius 22 with 10 and 16 padding capped at 70%, and the in-thread composer at 768 by 52 with a
// 28px radius. Two things were off, and both are pinned here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (name: string) => readFileSync(new URL(`../../components/workspace/${name}`, import.meta.url), "utf8");
const canvas = read("learn/learning-canvas.tsx");
const toggle = read("board/front-door-toggle.tsx");

test("🔴 the question sits 40px above its answer, the way the reference does", () => {
  // MEASURED on production before the fix: 90px, against ChatGPT's 40 and Claude's 52. It was
  // three separate things, and finding only one of them would have left the hole almost as big:
  //
  //   36px  the "Edit message" control, sitting IN THE FLOW under the bubble
  //   18px  `mb-4` on the learner's row
  //   36px  `pt-8` on the answer container (rem is 18px here, so `pt-8` is 36, not 32)
  //
  // 🔴 THE `rem` TRAP IS WHY THE THIRD ONE HID. `html { font-size: 112.5% }`, so every rem-based
  // Tailwind step in this app renders 12.5% larger than it reads. `pt-8` looks like 32px in the
  // source and paints 36. Write px.
  assert.match(
    canvas,
    /group\/said relative mx-auto mb-\[40px\] flex w-full max-w-\(--canvas-column\) flex-col items-end/,
    "the learner's row lost the measured 40px gap, or the group the edit control hangs from",
  );
  assert.ok(
    !/max-w-\(--canvas-column\) px-6 pt-8/.test(canvas),
    "an answer container grew its 36px of top padding back, which puts the hole at 76px again",
  );
});

test("🔴 the edit control costs no height, because the reference's does not", () => {
  // ChatGPT and Claude both reveal it on hover, over the space below the bubble. Ours reserved a
  // 32px button plus a 4px gap on every turn, whether or not anyone ever pointed at it.
  assert.match(
    canvas,
    /absolute right-0 top-full[^"]*opacity-0[^"]*group-hover\/said:opacity-100/,
    "the edit control is back in the flow, so it pushes every answer down again",
  );
  // 🔴 AND IT IS STILL REACHABLE WITHOUT A MOUSE. Hover alone would hide an edit control from a
  // keyboard for good, which is a worse defect than the gap this fixed.
  assert.match(canvas, /group-focus-within\/said:opacity-100/, "the edit control is now mouse-only");
});

test("🔴 the Chat | Canvas switch is the reference's 228px track, not 256", () => {
  // ChatGPT's Chat | Work control: track 228.6 x 36, two halves of 114.3, a 123.3 pill under the
  // active one. Ours copied its 8/44 and 8/36 label insets literally, and "Canvas" is six letters
  // where "Work" is four, so an equal-column grid took the wider half twice and the control
  // measured 256 on production: 27px past the thing it was copied from.
  assert.match(toggle, /grid h-\[36px\] w-\[228px\] grid-cols-2 rounded-full/, "the switch is no longer a fixed 228px of two equal halves");
  assert.ok(!/pl-\[44px\] pr-\[36px\]/.test(toggle), "the reference's asymmetric label padding is back, which is what made it 256");
  assert.match(toggle, /left-\[-0\.5px\]/, "the thumb lost its measured resting position");
  assert.match(toggle, /left-\[calc\(100%-122\.5px\)\]/, "the thumb no longer lands where the reference's does");
});

console.log("chat-matches-the-baseline.test.ts OK");
