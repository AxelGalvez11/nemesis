import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── The mark: three dots, two up and one down (owner, 2026-09-11) ──────────────────────────────────────
//
// The mark exists six times because each place needs a different kind of file: this app's component, its
// favicon, its home-screen icon and the raster script, and the marketing site's component and favicon. Six copies
// of one geometry drift one careless edit at a time, and the dot size is the one number that must not move: at a
// radius of 0.36 of the spacing circle every logo among the 3,459 in Simple Icons overlaps it under 50%, and dots
// that nearly touch are Asana's logo.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
type Dot = readonly [cx: number, cy: number, r: number];
const SPEC: readonly Dot[] = [[24.02, 35, 10.8], [75.98, 35, 10.8], [50, 80, 10.8]];
const circles = (src: string): Dot[] => [...src.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const);
const dots = (src: string): Dot[] => [...src.matchAll(/\{ cx: ([\d.]+), cy: ([\d.]+), r: ([\d.]+) \}/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const);

test("🔴🔴 every copy of the mark draws the same three dots", () => {
  assert.deepEqual(dots(read("../components/nemesis-mark.tsx")), SPEC, "components/nemesis-mark.tsx");
  assert.deepEqual(circles(read("../app/icon.svg")), SPEC, "app/icon.svg");
  assert.deepEqual(circles(read("../app/apple-icon.tsx")), SPEC, "app/apple-icon.tsx");
  assert.deepEqual(dots(read("../scripts/brand-raster.mts")), SPEC, "scripts/brand-raster.mts");
  assert.deepEqual(dots(read("../../../landing/components/NemesisMark.tsx")), SPEC, "the marketing site draws a different mark");
  assert.deepEqual(circles(read("../../../landing/app/icon.svg")), SPEC, "the marketing site's favicon draws a different mark");
});

test("🔴🔴 two dots up and one down, and the dots stay small enough to stay clear of Asana", () => {
  const [left, right, bottom] = SPEC as readonly [Dot, Dot, Dot];
  assert.equal(left[1], right[1], "the top pair must sit level");
  assert.ok(bottom[1] > left[1], "the single dot is the lower one");
  // The dots' centres sit on a circle of radius 30 around (50, 50).
  for (const [cx, cy] of SPEC) assert.ok(Math.abs(Math.hypot(cx - 50, cy - 50) - 30) < 0.01);
  for (const [, , r] of SPEC) assert.ok(r / 30 <= 0.36 + 1e-9, "bigger dots walk back toward Asana's logo");
});

test("🔴 the square is shared, and nothing still draws the old ovals", () => {
  for (const [file, needle] of [
    ["../components/nemesis-mark.tsx", 'MARK_VIEWBOX = "9.6 13.6 80.8 80.8"'],
    ["../app/icon.svg", 'viewBox="9.6 13.6 80.8 80.8"'],
    ["../app/apple-icon.tsx", 'viewBox="9.6 13.6 80.8 80.8"'],
    ["../scripts/brand-raster.mts", "{ x: 9.6, y: 13.6, w: 80.8, h: 80.8 }"],
  ] as const) {
    assert.ok(read(file).includes(needle), `${file} is not on the shared square`);
    assert.ok(!/<ellipse|rotate\(-36/.test(read(file)), `${file} still draws the three ovals`);
  }
});
