// Every fixed string a learner reads, held to one voice.
//
// 🔴 THE SWEEP IS THE POINT. Each of these lines reads fine on its own; the assistant's voice
// only becomes visible when you see all of them at once, which is what this does and what a
// reviewer looking at a diff cannot.

import assert from "node:assert/strict";
import test from "node:test";

import { CONTINUE_LABEL } from "./canvas-continue";
import { VERDICT_HEADLINE } from "./canvas-judge";
import {
  ASK_PLACEHOLDER,
  RECALL_PLACEHOLDER,
  RESPONSE_PLACEHOLDER,
  START_WITH_MATERIAL_PLACEHOLDER,
} from "./canvas-tasks";
import { ASSISTANT_TICS, MAX_HEADLINE_WORDS, voiceProblems } from "./learner-voice";
import { THINKING_COPY } from "./thinking-phases";

/** Every fixed learner-facing string, with where it came from. */
function learnerCopy(): { where: string; text: string; maxWords?: number }[] {
  const out: { where: string; text: string; maxWords?: number }[] = [];
  for (const [key, text] of Object.entries(VERDICT_HEADLINE)) {
    out.push({ maxWords: MAX_HEADLINE_WORDS, text, where: `VERDICT_HEADLINE.${key}` });
  }
  for (const [key, text] of Object.entries(RESPONSE_PLACEHOLDER)) {
    out.push({ maxWords: 7, text, where: `RESPONSE_PLACEHOLDER.${key}` });
  }
  for (const [key, text] of Object.entries(THINKING_COPY)) {
    out.push({ maxWords: 5, text, where: `THINKING_COPY.${key}` });
  }
  out.push({ maxWords: 3, text: RECALL_PLACEHOLDER, where: "RECALL_PLACEHOLDER" });
  out.push({ maxWords: 8, text: ASK_PLACEHOLDER, where: "ASK_PLACEHOLDER" });
  out.push({ maxWords: 8, text: START_WITH_MATERIAL_PLACEHOLDER, where: "START_WITH_MATERIAL_PLACEHOLDER" });
  out.push({ maxWords: 3, text: CONTINUE_LABEL, where: "CONTINUE_LABEL" });
  return out;
}

test("no learner-facing string speaks in the assistant's voice", () => {
  const failures: string[] = [];
  for (const entry of learnerCopy()) {
    for (const problem of voiceProblems(entry.text, { maxWords: entry.maxWords })) {
      failures.push(`${entry.where}: "${problem.text}" — ${problem.why}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `\n🔴 Learner-facing copy drifted into assistant voice:\n  ${failures.join("\n  ")}\n`,
  );
});

test("a verdict names what happened rather than how to feel about it", () => {
  for (const [verdict, headline] of Object.entries(VERDICT_HEADLINE)) {
    assert.ok(headline.trim().length > 0, `${verdict} must say something`);
    assert.ok(
      !/\b(?:we|us|our)\b/i.test(headline),
      `${verdict}: "${headline}" — the learner answered, not a pair`,
    );
  }
});

test("a placeholder describes the answer, never commands the learner", () => {
  for (const [task, placeholder] of Object.entries(RESPONSE_PLACEHOLDER)) {
    assert.ok(
      !/^(?:please|you must|you should|now )/i.test(placeholder.trim()),
      `${task}: "${placeholder}" gives an order`,
    );
  }
});

// ── The rule itself, so a hole in it is visible ────────────────────────────────

test("the tic patterns catch what they claim to", () => {
  const caught = (text: string) => voiceProblems(text).length > 0;
  assert.ok(caught("Not quite — let's fix it."), "first-person-plural");
  assert.ok(caught("Great job! You got it."), "praise inflation");
  assert.ok(caught("I'm happy to walk you through this."), "assistant self-reference");
  assert.ok(caught("It seems like you meant the other one."), "hedging");
  assert.ok(caught("Don't worry, this one is hard."), "unrequested reassurance");
  assert.ok(caught("Of course — here is the answer."), "conversational filler");
  assert.ok(caught("You got it!"), "exclamation");
});

test("the rule does not fire on plain teaching language", () => {
  for (const line of [
    "That's it.",
    "You have part of this.",
    "Reading slides",
    "Walk through it, step by step…",
    "The middle step is missing.",
    "This confuses cause with correlation.",
  ]) {
    assert.deepEqual(voiceProblems(line), [], `false positive on "${line}"`);
  }
});

test("every tic carries a reason, so a failure teaches the fix", () => {
  for (const tic of ASSISTANT_TICS) {
    assert.ok(tic.why.length > 20, `${tic.pattern} needs a reason worth reading`);
  }
});
