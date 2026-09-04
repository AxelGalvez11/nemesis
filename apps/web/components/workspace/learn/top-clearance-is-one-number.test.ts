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

test("🔴 the masthead stops short of the text, or it paints over a line", () => {
  // `canvas-surface.tsx` states the rule in its own note: solid, and SHORTER than the content's
  // resting offset, so at rest it covers nothing and no row is half-painted.
  const canvas = code(read("./learning-canvas.tsx"));
  const top = Number(/overflow-y-auto[^"`]*pt-\[(\d+)px\]/.exec(canvas)?.[1]);
  // 🔴 REPOINTED 2026-09-03: it is `right-0` with a width now, not `inset-x-0` — see the note in
  // `canvas-shell.test.ts`. The rule it enforces, shorter than the resting offset, is unchanged.
  const mast = Number(/absolute right-0 top-0 z-20 h-\[(\d+)px\]/.exec(code(read("./canvas-surface.tsx")))?.[1]);
  assert.ok(Number.isFinite(top) && Number.isFinite(mast), "could not find the clearance or the masthead");
  assert.ok(mast < top, `the masthead (${mast}px) reaches into the text's resting offset (${top}px)`);
});

test("🔴 and the clearance still clears the controls, which are 12px in and 28px tall", () => {
  // Owner asked for the space back but also to leave the controls where they are. Text starting
  // above 40px would run under them.
  const canvas = code(read("./learning-canvas.tsx"));
  const top = Number(/overflow-y-auto[^"`]*pt-\[(\d+)px\]/.exec(canvas)?.[1]);
  assert.ok(top >= 40, `${top}px puts the first line under the header controls`);
  assert.ok(top <= 56, `${top}px is more breathing room than the gap needs`);
});

console.log("top-clearance-is-one-number.test.ts OK");
