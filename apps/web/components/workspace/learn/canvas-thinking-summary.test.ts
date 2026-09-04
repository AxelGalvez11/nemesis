// The finished thinking row: one line in the slot the caption held, opening to the lines it showed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { workedForLabel } from "@/lib/learn/worked-for";

const SOURCE = readFileSync(new URL("./canvas-thinking-summary.tsx", import.meta.url), "utf8");

test("🔴 the label is the reference's wording, rounded to whole seconds and never under one", () => {
  assert.equal(workedForLabel(0.2), "Worked for 1s");
  assert.equal(workedForLabel(11.6), "Worked for 12s");
  assert.equal(workedForLabel(59.4), "Worked for 59s");
  assert.equal(workedForLabel(60), "Worked for 1m");
  assert.equal(workedForLabel(74), "Worked for 1m 14s");
});

test("🔴🔴 it is a row above the answer that opens to the model's own lines, never a transcript", () => {
  assert.match(SOURCE, /if \(lines\.length === 0\) return null;/, "a turn with nothing shown draws a row anyway");
  assert.match(SOURCE, /aria-expanded=\{open\}/, "the row is not a disclosure");
  assert.match(SOURCE, /lines\.map\(\(line\) => \(/, "the lines are not what opens");
  assert.doesNotMatch(SOURCE, /reasoning_content|onReasoning/, "raw reasoning has a path into the summary");
  assert.doesNotMatch(SOURCE, /canvas-thinking-word/, "a finished row shimmers as if still working");
});

test("🔴 same slot and same type as the live caption: the canvas column, 16 on 24", () => {
  assert.match(SOURCE, /max-w-\(--canvas-column\) px-6 pb-2/);
  assert.match(SOURCE, /text-\[length:var\(--canvas-text-body\)\] leading-\[24px\]/);
  // 🔴🔴 THE COPY, NOT THE COMMENTS. This read the raw file and reddened on 2026-09-03 for an em
  // dash inside a NOTE about the spacing — prose that no learner can ever see. The ban (owner
  // 2026-08-25) is on em dashes in words Nemesis shows people; a guard that also polices the
  // explanation of the code is the same "reads prose, not code" trap this repo has now paid for
  // three times, just pointing the other way. Comments are stripped first.
  const copy = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(copy, /—/, "an em dash reached learner-facing copy");
  // 🔴 CALIBRATION: the file DOES still contain one, in a comment, so a guard that had not been
  // narrowed would fail here. This proves the narrowing is real rather than vacuous.
  assert.match(SOURCE, /—/, "the calibration is stale: nothing in this file has an em dash any more");
});
