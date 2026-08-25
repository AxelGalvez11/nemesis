// The part being asked about can be found, and the quiz can be reached.
//
// 🔴🔴🔴 OWNER, 2026-08-25, WITH A SCREENSHOT OF A LABELLED HEART UNDER FOURTEEN IDENTICAL DARK
// RECTANGLES: *"when user is being asked to recall occlusion, it should be yellow or more
// distinctive because i had trouble finding which part it was covering."*
//
// It WAS marked, and the marking was invisible. The target already took a heavier stroke in
// `hsl(var(--destructive))`, which `globals.css` resolves to `hsl(8 62% 47%)`: a dark brick red,
// two and a half pixels wide, drawn on a `#52525b` dark grey fill. Two dark colours against each
// other at the size a mask actually renders. The course lane had the same defect wearing a
// different token: `ring-2 ring-(--ui-learner)` around a cover the same colour as its neighbours.
//
// And: *"when the quiz is created, it should fit the canvas… that way users do not have to scroll
// down."*

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { OCCLUSION_COVER_FILL, OCCLUSION_TARGET_FILL, OCCLUSION_TARGET_STROKE } from "@nemesis/shared";

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (file: string) => strip(readFileSync(new URL(file, import.meta.url), "utf8"));

const STUDY_CARD = read("../study/occlusion-card.tsx");
const COURSE_LANE = read("./figure-occlusion.tsx");
const CHECK = read("./canvas-check.tsx");
const CANVAS = read("./learning-canvas.tsx");

/** Relative luminance, the thing that decides whether two colours can be told apart at a glance. */
const luminance = (hex: string): number => {
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
};

test("🔴🔴🔴 the asked-about cover is a DIFFERENT COLOUR from its neighbours, not a border on the same one", () => {
  assert.notEqual(OCCLUSION_TARGET_FILL, OCCLUSION_COVER_FILL, "the target is painted like every other cover again");
  // 🔴 THE NUMBER THAT WAS MISSING. The old marking was a dark red on dark grey, which is about 1.3
  // to 1: invisible. Anything a learner is expected to spot without hunting has to clear 4.5.
  const apart = contrast(OCCLUSION_TARGET_FILL, OCCLUSION_COVER_FILL);
  assert.ok(apart >= 4.5, `the target is only ${apart.toFixed(2)}:1 against its neighbours, which is a hunt`);
});

test("🔴🔴 it is still a COVER, so the part underneath is still hidden", () => {
  // The colour says "this one". It must never say "here is the answer".
  assert.match(OCCLUSION_TARGET_FILL, /^#[0-9a-f]{6}$/i, "the target fill went transparent");
  assert.ok(!/rgba|opacity|\/\s*\d/.test(OCCLUSION_TARGET_FILL), "the target fill is see-through");
  // And its outline reads against it, so the box has an edge rather than bleeding into the picture.
  assert.ok(contrast(OCCLUSION_TARGET_FILL, OCCLUSION_TARGET_STROKE) >= 3, "the target has no readable edge");
});

test("🔴🔴🔴 BOTH lanes use it, because they had already drifted into two ideas of 'the one being asked'", () => {
  assert.match(STUDY_CARD, /OCCLUSION_TARGET_FILL/, "the study deck went back to its own colour");
  assert.match(COURSE_LANE, /OCCLUSION_TARGET_FILL/, "the course lane went back to its own colour");
  // 🔴 THE OLD MARKINGS, BY NAME, SO NEITHER COMES BACK.
  assert.ok(!/hsl\(var\(--destructive\)\)/.test(STUDY_CARD), "the invisible dark-red outline is back");
  assert.ok(!/ring-2 ring-\(--ui-learner\)/.test(COURSE_LANE), "the invisible accent ring is back");
});

test("🔴🔴🔴 the quiz brings itself into view, so nobody has to go looking for it", () => {
  // The check renders below the turn's answer, so it arrived off the bottom of the screen.
  assert.match(CHECK, /frame\.current\?\.scrollIntoView/, "the check no longer brings itself into view");
  // 🔴 ONCE, ON ARRIVAL. Scrolling the page under someone between question three and four is the
  // surface grabbing them mid-answer, which is worse than the thing being fixed.
  assert.match(CHECK, /\}, \[\]\);/, "the scroll gained a dependency, so it will fire mid-run");
  // 🔴 AND IT HONOURS prefers-reduced-motion, because a smooth scroll is motion.
  assert.match(CHECK, /prefers-reduced-motion: reduce/, "the scroll stopped honouring reduced motion");
});

test("🔴🔴🔴 the ANSWER is never hidden to make room for the quiz", () => {
  // 🔴 THE FIRST FIX I TRIED, AND IT REPRODUCES A DEFECT ALREADY ON RECORD. 2026-08-24: "Teach me
  // the three branches of the US government, then quiz me on it" returned five good chips and an
  // empty answer, and the canvas printed "Nemesis had nothing to add." above a quiz on a lesson
  // never given. Suppressing the prose whenever a check exists does that on purpose.
  assert.match(CANVAS, /\{regions\.reply && session\.aside && \(/, "the reply is gated on the check again, so a taught lesson can vanish");
  // The stand-in, though, must never appear ABOVE a quiz.
  assert.match(CANVAS, /presence === "quiet" && !checkOwnsSurface/, "the empty-handed notice can print above a live quiz");
});

console.log("the-asked-part-is-findable.test.ts OK");
