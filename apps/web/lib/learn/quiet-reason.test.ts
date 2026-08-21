// The empty canvas has to say WHY, and the sentence it says it with must not leak a prompt.
//
// 🔴🔴 REPORTED 2026-08-21. A 276-excerpt lecture PDF landed on "Nemesis hasn't found anything to
// ask you about yet", with a Try again button — while the sources panel, two clicks away, already
// said *"Incomplete source: 28 pictures were not read."* The product knew the reason and showed a
// dead end instead. Lecture slides are mostly pictures, so a reader that cannot see pictures has
// genuinely read the deck and genuinely found little in it: this is the ordinary case for a deck
// rather than an edge one, and putting the reason on screen is the difference between "this app is
// broken" and "this file is mostly diagrams".
//
// 🔴 THE NOTE IS WRITTEN FOR DeepSeek, WHICH IS WHY IT CANNOT BE PRINTED AS IT ARRIVES. It is
// wrapped in square brackets so it reads as an annotation inside a prompt, and it ends with an
// instruction to the model. All of that would land on a learner's screen verbatim.
//
// 🔴 THE FIXTURE IS THE STRING THE OWNER ACTUALLY SAW, not one this test built. A fixture built by
// calling the builder would keep passing if the builder's format changed underneath it, because
// both halves would move together — which is exactly the drift the last test here guards against by
// reading the builder's own source.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const QUIET = readFileSync(new URL("../../components/workspace/learn/canvas-quiet.tsx", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
const BUILDER = readFileSync(
  new URL("../../../../packages/shared/src/extraction-coverage.ts", import.meta.url),
  "utf8",
);

/** Verbatim, from the owner's report. */
const REAL =
  "[Incomplete source: 28 pictures were not read. If the student's question depends on what is " +
  "missing, say so plainly rather than answering as though you read the whole document.]";

/** The trimmer, kept identical to the component's — see the last test for why that is checked. */
function lower(note: string): string {
  const inner = note.replace(/^\s*\[/, "").replace(/\]\s*$/, "");
  const fact = inner.split(/(?<=\.)\s/)[0] ?? inner;
  const stripped = fact.replace(/^\s*Incomplete source:\s*/i, "").replace(/\.$/, "");
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

test("🔴 the empty canvas is handed the reason, not left to shrug", () => {
  assert.match(QUIET, /unread\?: readonly \{ title: string; note: string \}\[\]/);
  assert.match(QUIET, /could not read all of/);
  assert.match(CANVAS, /source\.coverageNote/, "the canvas stopped passing what it knows");
});

// 🔴 CUT AT THE FIRST FULL STOP, with the brackets and the label. What is left is the fact and only
// the fact — which is the sentence a learner needed all along.
test("🔴 the model's half of the note never reaches the screen", () => {
  const shown = lower(REAL);
  assert.equal(shown, "28 pictures were not read");
  assert.ok(!shown.includes("student"), "the instruction to the model leaked onto the screen");
  assert.ok(!/incomplete source/i.test(shown), "the internal label leaked onto the screen");
  assert.ok(!/[[\]]/.test(shown), "the wire format's brackets leaked onto the screen");
});

test("a note with several facts keeps the first sentence whole", () => {
  const many = "[Incomplete source: 3 of 40 pages could NOT be read and are not below; 28 pictures were not read. If the student's question depends on what is missing, say so plainly.]";
  assert.equal(lower(many), "3 of 40 pages could NOT be read and are not below; 28 pictures were not read");
});

// 🔴🔴 THE THREE THINGS THIS TRIMS ARE THE BUILDER'S, NOT INVENTIONS — and if the builder changes
// its wrapper, its label or its trailing instruction, the trimmer silently stops trimming and the
// prompt reappears on a learner's screen with every other test still green.
test("🔴 the builder still produces what the trimmer expects to remove", () => {
  assert.match(BUILDER, /return `\[Incomplete source: \$\{facts\.join\("; "\)\}\./, "the wrapper or the label moved");
  assert.match(BUILDER, /If the student's question depends on what is missing/, "the model instruction moved");
});

test("🔴 the component trims the same three things this test does", () => {
  for (const step of [/\\\[/, /Incomplete source:/, /\(\?<=\\\.\)/]) {
    assert.match(QUIET, step, `the component's trimmer no longer removes ${String(step)}`);
  }
});
