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
  // 🔴 THE `ref` IS MEASUREMENT, NOT CONTROL. The arriving canvas redraws this greeting where it
  // stood and fades it out (lib/learn/arrival.ts), so the front door has to be able to report its
  // rectangle. Nothing outside reads or writes the element beyond that.
  assert.match(HOME, /<LearnHeading departing=\{departing\} ref=\{headingBox\} \/>/, "the front door lost its greeting");
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
  assert.match(HEADING, /widths \? `\$\{Math\.ceil\(widths\[index\] \?\? 0\)[^`]*\}px` : "max-content"/, "the unmeasured fallback is gone");
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
  assert.match(HEADING, /visibility 0s linear \$\{FADE_OUT_MS\}ms/, "the outgoing word vanishes on the first frame of its own fade");
});

test("🔴 arriving is slower than leaving, and on its own curve (2026-09-01)", () => {
  // Owner: "make it even slower and smoother for the fade ins". The arrival is the half anybody
  // watches, so the two are no longer the same length, and the incoming word does NOT ride an
  // ease-out — that curve spends its opacity in the first fifth of the duration, so lengthening it
  // only stretches the part nobody sees.
  const out = /const FADE_OUT_MS = (\d+);/.exec(HEADING);
  const arrive = /const FADE_IN_MS = (\d+);/.exec(HEADING);
  assert.ok(out && arrive, "the two halves of the swap lost their own durations");
  assert.ok(Number(arrive[1]) > Number(out[1]) * 2, "the fade in is no longer meaningfully slower than the fade out");
  assert.match(HEADING, /opacity \$\{FADE_IN_MS\}ms \$\{EASE_IN\}/, "the arriving word is not on the slow curve");
  // The slot must settle while the word is still faint, so it never resizes under something legible.
  assert.match(HEADING, /width \$\{FADE_OUT_MS\}ms \$\{EASE_OUT\}/, "the width now moves for as long as the word takes to arrive");
});

test("🔴 the pace is the owner's, and it is a floor (2026-09-01)", () => {
  // Told twice that it was still too fast: "make it even slower and smoother for the fade ins",
  // then "make the movements slower its still too fast". These numbers are the answer to that, not
  // a default anybody should tidy back down.
  const ms = (name: string) => Number(new RegExp(`const ${name} = (\\d+);`).exec(HEADING)?.[1] ?? 0);
  assert.ok(ms("FADE_IN_MS") >= 1800, "the arrival was sped back up");
  assert.ok(ms("FADE_OUT_MS") >= 700, "the exit was sped back up");
  assert.ok(ms("HOLD_MS") >= 3200, "a subject no longer holds long enough to be read without hurry");
});

test("🔴 every subject is capitalised, and none of them shouts (2026-09-01)", () => {
  // Owner: "dont titles have capitalization unless its an article, idk it just feels wierd seeing
  // lowercase". Each word is the name of a thing you can pick rather than a word in a sentence, so
  // all nine agree. Every WORD is capitalised, not just the first: "Contract Law", not "Contract
  // law" — there is no article or preposition among them to leave lowercase.
  for (const subject of LEARN_SUBJECTS) {
    for (const word of subject.split(" ")) {
      assert.match(word, /^[A-Z]/, `"${subject}" is not capitalised`);
      assert.ok(word !== word.toUpperCase() || word.length === 1, `"${subject}" is shouting`);
    }
  }
});

test("🔴🔴 the last letter of a subject is never shaved (2026-09-01)", () => {
  // Owner: "the last letter gets cuttoff now". The slot's width comes from getBoundingClientRect,
  // which is the text's ADVANCE width, and a glyph's ink can sit outside its own advance — the more
  // so under this heading's negative tracking. Measured: "Thermodynamics" advances 181.91px, the
  // slot was 182px, and the final letter lost its right edge to the clip.
  const slotClass = /className="relative inline-grid[^"]*"/.exec(HEADING);
  assert.ok(slotClass, "the slot's class list moved");
  assert.ok(!/overflow-hidden/.test(slotClass[0]), "the slot is clipping its own text again");
  assert.match(HEADING, /const SLOT_SLACK_PX = [1-9]/, "the slot fits the advance width exactly, with nothing spare for the ink");
  assert.match(HEADING, /Math\.ceil\(widths\[index\] \?\? 0\) \+ SLOT_SLACK_PX/, "the slack never reaches the width");
});
