// The front door's greeting: what it says, what it offers, and what it does when nothing may move.
//
// Owner, 2026-09-01: *"replace the 'what are you working on' with 'Learn x' and have the x fade in
// different subjects like calculus, biology, etc. so users are encouraged to learn"*.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { LEARN_SUBJECTS } from "./learn-heading";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const HEADING = read("./learn-heading.tsx");
const HOME = read("./canvas-home.tsx");

test("🔴 the front door says Learn, and the old question is gone", () => {
  assert.match(HOME, /<LearnHeading departing=\{departing\} \/>/, "the front door lost its greeting");
  assert.ok(!/What are you working on/.test(HOME), "the question the owner replaced is back");
  assert.match(HEADING, /Learn&nbsp;/, "the word Learn left the heading");
});

test("🔴🔴 the subjects span faculties — the field-agnostic rule, in the most-read line in the product", () => {
  // CLAUDE.md, owner 2026-07-27: Nemesis is a field-agnostic academic OS, and the design test for
  // anything is whether it works for a law student AND a mechanical engineering student. A list of
  // only sciences answers that test with "no" in the first thing anybody sees.
  const subjects = LEARN_SUBJECTS.map((subject) => subject.toLowerCase());
  assert.ok(subjects.includes("calculus"), "the owner's own example is missing");
  assert.ok(subjects.includes("biology"), "the owner's own example is missing");
  for (const [faculty, subject] of [
    ["law", "contract law"],
    ["engineering", "thermodynamics"],
    ["the humanities", "art history"],
    ["health", "anatomy"],
    ["the social sciences", "macroeconomics"],
    ["languages", "spanish"],
    ["computing", "data structures"],
    ["the trades", "welding"],
  ] as const) {
    assert.ok(subjects.includes(subject), `nothing on the front door speaks to ${faculty}`);
  }
  assert.ok(LEARN_SUBJECTS.length >= 8, "too few subjects to read as a rotation");
  // 🔴 AND THE ONE WORD THE PRODUCT MAY NEVER LEAD WITH. field-agnostic.test.ts caught this list's
  // first draft, which opened the health slot with "pharmacology" — the word that made this product
  // look like a pharmacy app for its whole first life. Asserted here too, at the source, so the
  // reason travels with the list rather than living only in a scanner two directories away.
  assert.ok(!subjects.some((subject) => /pharmac/.test(subject)), "the pharmacy assumption is back on the front door");
  assert.equal(new Set(subjects).size, subjects.length, "a subject is listed twice");
});

test("🔴 reduced motion stops the ROTATION, not just the fade", () => {
  // The rotation IS the motion here. The house rule (STILL in lib/mascot/states.ts) is that the
  // honest answer to reduced motion is a characteristic frame, so the first subject holds.
  assert.match(HEADING, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/, "the preference is never read");
  assert.match(HEADING, /if \(still \|\| departing\) return;/, "the rotation runs while motion is refused");
  assert.match(HEADING, /transition: still\s*\?\s*undefined/, "the crossfade runs while motion is refused");
});

test("🔴🔴 the width is measured ONCE, and zero is never used as a width", () => {
  // #987 blanked the page by measuring mid-swap and verifying only at rest. Here every word is on
  // screen from the first paint, one pass at mount reads them all, and a headless or font-less pass
  // that reports 0 leaves the slot at max-content rather than collapsing it.
  assert.match(HEADING, /measured\.some\(\(width\) => width <= 0\)\) return;/, "a zero width can now reach the slot");
  assert.match(HEADING, /widths \? `\$\{Math\.ceil\(widths\[index\] \?\? 0\)\}px` : "max-content"/, "the unmeasured fallback is gone");
  assert.match(HEADING, /useEffect\(\(\) => \{\s*const measured = words\.current\.map/, "the measuring pass is no longer a one-shot mount effect");
});

test("🔴 the swapping word is hidden from screen readers, behind one stable sentence", () => {
  assert.match(HEADING, /<span className="sr-only">Learn anything\.<\/span>/, "a screen reader hears nothing, or hears the rotation");
  assert.match(HEADING, /<span aria-hidden="true" className="inline-flex items-baseline">/, "the rotating line is announced every few seconds");
});

test("🔴 §46.3: the greeting uses the canvas title token, never a raw size", () => {
  assert.match(HEADING, /text-\[length:var\(--canvas-text-title\)\]/, "the greeting invented its own font size");
});

test("🔴🔴 only the LIVE subject is text — the other nine are hidden, not merely transparent", () => {
  // Caught in the filmstrip: at opacity 0 the words are invisible but still text, so the heading
  // read "Learn calculus biology contract law thermodynamics…" to anything walking rendered text,
  // and selecting the line copied all ten. `visibility` removes them; the delay keeps the
  // crossfade a crossfade rather than a cut.
  assert.match(HEADING, /visibility: at === index \? "visible" : "hidden"/, "the inactive subjects are text again");
  assert.match(HEADING, /visibility 0s linear \$\{FADE_MS\}ms/, "the outgoing word vanishes on the first frame of its own fade");
});
