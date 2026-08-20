import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { isEchoOfTheCue } from "./response-admission";

// Giving the cue back is not a demonstration.
//
// 🔴 THE CASE, AS MEASURED IN PRODUCTION. Asked "what is the brand for losartan?", answered
// `losartan`. Recorded `demonstration_obtained: true`, verdict `partial`, confidence 0.30 — a
// durable claim that someone partly knows something they showed nothing about. They asserted no
// belief about the direction asked; they restated the prompt.
//
// 🔴 AND THE JUDGE IS NOT AT FAULT, WHICH IS WHY THE FIX IS NOT IN THE JUDGE. An echo has maximum
// lexical overlap with the question — the answer token is inside the prompt — so every string,
// substring and embedding comparison scores it highly. The judge was asked "how good is this
// answer" and gave a defensible reading. Whether an ATTEMPT was made at all is a different
// question, it is structural, and nobody was asking it.

const CUE = "losartan";
const EXPECTED = "Cozaar";

function echo(response: string, expectedAnswer = EXPECTED, cue = CUE): boolean {
  return isEchoOfTheCue({ cue, expectedAnswer, response });
}

// ── the measured case ───────────────────────────────────────────────────────

test("🔴 the exact production case: the cue handed back is no demonstration", () => {
  assert.equal(echo("losartan"), true);
});

test("an echo survives the ways people actually type", () => {
  assert.equal(echo("Losartan"), true, "case is not a claim");
  assert.equal(echo("losartan."), true, "nor is punctuation");
  assert.equal(echo("  losartan  "), true);
  assert.equal(echo("it's losartan"), true, "a copula around the cue adds no belief");
  assert.equal(echo("losartan is losartan"), true, "restating it twice claims nothing twice");
});

// ── 🔴 the guard that protects a learner who actually answered ──────────────

test("🔴 saying the ANSWER is a demonstration, however much of the cue comes with it", () => {
  assert.equal(echo("Cozaar"), false, "the plain correct answer");
  assert.equal(echo("losartan is sold as Cozaar"), false, "the cue AND the answer is an answer");
  assert.equal(echo("Cozaar, the brand for losartan"), false);
});

test("🔴 a degenerate objective whose cue IS its answer never records a non-attempt", () => {
  // A term defined as itself, a source that listed one column twice. Saying the cue IS saying the
  // answer here, and whenever the two readings collide the one that credits the learner must win.
  assert.equal(echo("losartan", "losartan"), false);
});

test("a real attempt is never mistaken for an echo", () => {
  assert.equal(echo("Diovan"), false, "wrong, but a genuine claim — the judge should see it");
  assert.equal(echo("I think it's Hyzaar"), false);
  assert.equal(echo("something with an ARB"), false);
  assert.equal(echo("no idea"), false, "an admission is the OTHER non-attempt, not this one");
});

test("an empty or cue-less response is not an echo", () => {
  assert.equal(echo(""), false, "nothing was said at all");
  assert.equal(echo("   "), false);
  assert.equal(echo("losartan", EXPECTED, ""), false, "no cue means nothing to echo");
});

test("the cue must be the WHOLE response, not merely present in it", () => {
  // The same "only" that governs the admission rule. A response that mentions the cue and then goes
  // on to claim something is an attempt, and the judge is the thing that reads attempts.
  assert.equal(echo("losartan blocks the AT1 receptor"), false);
  assert.equal(echo("losartan — I remember the brand starts with a C"), false);
});

// ── 🔴 the rule it generalises must not have moved ──────────────────────────

test("🔴 the echo rule is the half that could not move to the judge", () => {
  // 🔴 THE ADMISSION HALF OF THIS PAIR IS GONE. `isAdmissionOfNotKnowing` matched twenty-one
  // English phrases before the judge saw the answer; the judge reads an admission itself now, in
  // any language (canvas-prompts.ts). What could not move is this one: asked "what is the brand
  // for losartan?" and answered `losartan`, every string, substring and embedding comparison
  // scores that highly, because the token is literally inside the question.
  assert.equal(isEchoOfTheCue({ cue: "losartan", expectedAnswer: "Cozaar", response: "losartan" }), true)
});

// ── 🔴 where it runs, which is the half a unit test cannot see ──────────────

test("🔴 the echo is caught BEFORE the judge", async () => {
  // The predicate being correct is worthless if the runtime consults it after the verdict is
  // already back — the row would be written from the judge's `partial` and the check would be
  // decoration. This is the whole reason the rule survives at all: the judge measurably CANNOT
  // make it, so asking it after the fact would be asking the wrong question twice.
  const runtime = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  const submitAt = runtime.indexOf("const submit = useCallback");
  assert.ok(submitAt !== -1, "the submission path must be findable for this guard to mean anything");

  const echoAt = runtime.indexOf("isEchoOfTheCue", submitAt);
  const judgeAt = runtime.indexOf("evaluateLearningResponse", submitAt);
  assert.ok(echoAt !== -1, "the submission path must consult the echo rule at all");
  assert.ok(judgeAt !== -1, "and the judge call must still be there for the ordering to be meaningful");
  assert.ok(echoAt < judgeAt, "the echo check must come BEFORE the judge");
});

test("🔴 an echo is not filed as an admission of not knowing", async () => {
  // The evidence is identical and the analytics must not be: someone who echoed the cue never told
  // us they did not know, and `canvas_unknown_admitted` would put a statement in the record that
  // the learner never made.
  const runtime = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.match(runtime, /canvas_cue_echoed/, "the echo needs an event of its own");
  const echoAt = runtime.indexOf("isEchoOfTheCue", runtime.indexOf("const submit = useCallback"));
  assert.match(
    runtime.slice(echoAt, echoAt + 400),
    /canvas_cue_echoed/,
    "and the echo branch must be the thing that fires it",
  );
});

// ── field-agnostic, which is a standing rule and not a nicety ───────────────

test("the rule reads identically outside anything medical", () => {
  assert.equal(isEchoOfTheCue({ cue: "Donoghue v Stevenson", expectedAnswer: "duty of care", response: "Donoghue v Stevenson" }), true);
  assert.equal(isEchoOfTheCue({ cue: "M8 × 1.25", expectedAnswer: "coarse pitch", response: "M8 × 1.25" }), true);
  assert.equal(isEchoOfTheCue({ cue: "Donoghue v Stevenson", expectedAnswer: "duty of care", response: "duty of care" }), false);
});

test("🔴 no subject-matter vocabulary reached the rule's DATA", async () => {
  // The same guard `response-admission.test.ts` keeps over its own list, pointed at the list this
  // change adds. 🔴 SCOPED TO THE CONSTANT, NOT THE FUNCTION BODY, AND THE DIFFERENCE IS REAL: the
  // prose around a rule legitimately names an example to explain itself, and a guard that cannot
  // tell an illustration from a keyword list fails on good writing while catching nothing. What
  // must stay field-free is what the matcher READS.
  const source = await readFile(new URL("./response-admission.ts", import.meta.url), "utf8");
  const data = source.slice(source.indexOf("const ECHO_FILLER"), source.indexOf("/** One spelling"));
  assert.ok(data.includes("is"), "the slice must actually contain the list, or this guard proves nothing");
  for (const word of ["brand", "generic", "drug", "dose", "patient", "case", "statute", "torque"]) {
    assert.equal(data.includes(word), false, `"${word}" is subject matter, not a shape of response`);
  }
});
