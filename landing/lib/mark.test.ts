import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// ── The mark: three dots, two up and one down (owner, 2026-09-11) ──────────────────────────────────────
//
// The site draws the mark in its component, its favicon and its home-screen icon, and the app draws it again. The
// dot size is the number that must not move: at 0.36 of the spacing circle every logo among the 3,459 in Simple
// Icons overlaps it under 50%, and dots that nearly touch are Asana's logo.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const SPEC = [[24.02, 35, 10.8], [75.98, 35, 10.8], [50, 80, 10.8]];
const circles = (src: string) => [...src.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => [+m[1], +m[2], +m[3]]);
const dots = (src: string) => [...src.matchAll(/\{ cx: ([\d.]+), cy: ([\d.]+), r: ([\d.]+) \}/g)].map((m) => [+m[1], +m[2], +m[3]]);

describe("the mark", () => {
  it("🔴🔴 the site, its favicon, its home-screen icon and the app draw the same three dots", () => {
    expect(dots(read("../components/NemesisMark.tsx"))).toEqual(SPEC);
    expect(circles(read("../app/icon.svg"))).toEqual(SPEC);
    expect(circles(read("../app/apple-icon.tsx"))).toEqual(SPEC);
    expect(dots(read("../../apps/web/components/nemesis-mark.tsx")), "the app draws a different mark").toEqual(SPEC);
  });

  it("🔴 nothing on the site still draws the old ovals", () => {
    for (const file of ["../components/NemesisMark.tsx", "../app/icon.svg", "../app/apple-icon.tsx", "../components/reference/StudyTools.tsx"]) {
      expect(read(file), `${file} still draws the three ovals`).not.toMatch(/<ellipse[^>]*rx="?\{?62|rotate\(-36/);
    }
  });
});
