/**
 * The two scrollers keep the SAME clearance, because there are two and I changed one.
 *
 * 🔴🔴 CAUGHT ON PRODUCTION, NOT IN REVIEW. The canvas has two scroll containers — the canvas-view
 * one (`absolute inset-0`) and the chat thread's (`relative h-full`, the default and the one
 * everybody actually sees). Both carried `pt-[64px]`. Asked to give the text more room, I changed
 * the first, shipped it, and measured the live page: still 64px, because the visible surface is the
 * OTHER one. A grep for the number found both; my edit had matched only one by its full class
 * string.
 *
 * So this asserts the property rather than the number: however much clearance the top needs, both
 * scrollers need the same amount, and the masthead must stop short of it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
/** Comments quote these numbers while explaining them; only real class attributes count. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("🔴🔴 both scrollers clear the header by the same amount", () => {
  const canvas = code(read("./learning-canvas.tsx"));
  const tops = [...canvas.matchAll(/overflow-y-auto[^"`]*pt-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(tops.length >= 2, `expected both scrollers to be found, saw ${tops.length}`);
  assert.equal(new Set(tops).size, 1, `the scrollers disagree about the top clearance: ${tops.join(" and ")}px`);
});

test("🔴 there is no masthead to reach into the text — the ground is on the controls", () => {
  // The band this used to measure was removed on 2026-09-03 after the owner reported it twice; see
  // the tombstone in `canvas-surface.tsx` and the full argument in `canvas-shell.test.ts`. The
  // clearance itself still matters and is still checked by the test below: the first line must
  // start below the floating controls.
  assert.ok(!/top-0 z-20 h-\[\d+px\]/.test(code(read("./canvas-surface.tsx"))), "a masthead band is back, and it will paint over the conversation");
});

test("🔴🔴 the PIN targets that same clearance, and 16px apart was visible on screen", () => {
  // 🔴 MEASURED, NOT REASONED: on /dev-preview/learn the first prompt of a conversation landed at
  // 48px from the top of the scroller and every prompt after it at 64. Nothing above the first turn
  // can be scrolled away, so `scrollTop` clamps at 0 and the pin cannot reach its own target: it
  // asked for -16 and got 0. Two numbers for one clearance, which is the exact failure this file is
  // named for; it simply had not been told the pin is the third place the number lives.
  const canvas = code(read("./learning-canvas.tsx"));
  const top = Number(/overflow-y-auto[^"`]*pt-\[(\d+)px\]/.exec(canvas)?.[1]);
  const pin = Number(/PIN_INSET_PX = (\d+)/.exec(canvas)?.[1]);
  assert.ok(Number.isFinite(top) && Number.isFinite(pin), "could not find the clearance or the pin inset");
  assert.equal(pin, top, `the pin aims at ${pin}px into a column that rests at ${top}px, so the first prompt cannot reach it`);
});

test("🔴 and the clearance still clears the controls, which are 12px in and 28px tall", () => {
  // Owner asked for the space back but also to leave the controls where they are. Text starting
  // above 40px would run under them.
  const canvas = code(read("./learning-canvas.tsx"));
  const top = Number(/overflow-y-auto[^"`]*pt-\[(\d+)px\]/.exec(canvas)?.[1]);
  assert.ok(top >= 40, `${top}px puts the first line under the header controls`);
  // 🔴🔴 CEILING RAISED TO 60 ON THE REFERENCE'S OWN NUMBER, 2026-09-03. It was 56, chosen when the
  // owner asked for the space back — but chosen without measuring anything. Owner the same day:
  // *"why don't you use ChatGPT for reference?"* Measured in his signed-in ChatGPT at 1470x779:
  // its header is 52px and the pinned prompt sits at 64 from the window, i.e. **12px below the
  // header**. Ours: controls at `top-[12px]`, 36px tall, bottom edge 48. 48 + 12 = 60.
  //
  // 🔴 THE CEILING STAYS TIGHT, which is the point of having one: 60 is four pixels of latitude,
  // not a licence. Anything larger is the "top block" the owner has now objected to three times.
  assert.ok(top <= 60, `${top}px is more breathing room than the gap needs`);
});

console.log("top-clearance-is-one-number.test.ts OK");
