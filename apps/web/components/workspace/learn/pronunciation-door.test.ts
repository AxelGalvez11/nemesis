/**
 * The scorer is reachable from a screen.
 *
 * 🔴🔴 §47 SHIPPED AZURE PRONUNCIATION ASSESSMENT AND NOTHING COULD OPEN IT. Word, syllable and
 * phoneme scores, the alternative sound the recogniser thought it heard, a comparison against the
 * learner's previous attempt — all built, all tested, and `usePronunciationAttempt` had ZERO
 * callers in the product. This file exists so that cannot quietly become true again: the capability
 * and the door are asserted together, because this codebase's most expensive recurring defect is a
 * finished feature nobody can reach.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const EXAMPLE = readFileSync(new URL("./spoken-example.tsx", import.meta.url), "utf8");
const HOOK = readFileSync(new URL("./use-pronunciation-attempt.ts", import.meta.url), "utf8");

test("🔴 something a learner can see calls the scorer", () => {
  assert.match(EXAMPLE, /usePronunciationAttempt\(\)/, "the pronunciation scorer has no caller again");
  assert.match(EXAMPLE, /<Codicon name=\{attempt\.recording \? "debug-stop" : "mic"\}/, "there is no control to press");
});

test("🔴 it is scored against THIS sentence and THIS variety, never a guess", () => {
  // The scorer takes exactly two things and this component is the only place holding both. Passing
  // anything else — the whole reply, the instruction locale — would score the learner against
  // words they were never asked to say.
  assert.match(EXAMPLE, /attempt\.start\(\{ locale, text \}\)/, "the attempt is not aimed at the example it sits on");
});

test("🔴 no button where it cannot work — Safari records a format the assessor refuses", () => {
  // The hook already decides this honestly; the surface must honour it rather than render a
  // control that always fails.
  assert.match(EXAMPLE, /attempt\.supported && \(/, "a record button is offered where recording cannot work");
  assert.match(HOOK, /MediaRecorder\.isTypeSupported/, "the support test has gone — `supported` is now a guess");
});

test("a refusal is said in words, because four different failures must not look like one dead button", () => {
  for (const failure of ["not-signed-in", "microphone-unavailable", "recording-unsupported"]) {
    assert.ok(EXAMPLE.includes(`"${failure}"`), `${failure} has no message`);
  }
});

console.log("pronunciation-door.test.ts OK");
