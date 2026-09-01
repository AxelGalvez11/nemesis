// The early-spoken opener says EXACTLY what the finished pipeline would say first, or nothing.
//
// The parity block is the heart: for every case where the watcher fires, the finished text is
// pushed through the real `replySpeechPlan` and the watcher's opener must equal `plan[0].text`
// byte for byte — that equality is what lets `use-response-audio.ts` continue the primed timeline
// instead of restarting it. Everything else here is the stand-downs: the cases where speaking
// early could say something the finished turn would not.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { replySpeechPlan } from "./reply-speech";
import { spokenOpenerWatch } from "./spoken-opener";
import { DEFAULT_READING_VOICE } from "@/lib/speech/reading-voice";

const DECISION = '```json\n{"then": "reply"}\n```\n';

/** Feed a finished text in small chunks, the way a stream hands it over. */
function streamed(text: string, step = 7): string | null {
  const watch = spokenOpenerWatch();
  for (let at = step; at < text.length + step; at += step) {
    const fired = watch.feed(text.slice(0, at));
    if (fired !== null) return fired;
  }
  return null;
}

test("the opener equals the finished plan's first utterance, byte for byte", () => {
  const cases = [
    `${DECISION}Enzymes speed the reaction up without being used. They do it by holding both molecules in place.`,
    `${DECISION}Oxygen is the final electron acceptor. Without it the whole chain backs up, and the cell falls back on fermentation.`,
    // Prose before the fence is legal and joins the answer, `readTurnDecision` says so.
    `Good question. Let me put it plainly.\n${DECISION}The cell burns glucose for energy.`,
  ];
  for (const finished of cases) {
    const fired = streamed(finished);
    assert.ok(fired, `expected an early opener for: ${finished.slice(0, 60)}`);
    const plan = replySpeechPlan(finished.replace(/```json[\s\S]*?```/, " "), DEFAULT_READING_VOICE);
    assert.ok(plan.length > 0, "the finished plan is not empty");
    assert.equal(fired, plan[0]?.text);
  }
});

test("it fires exactly once, at the first seam, never again", () => {
  const watch = spokenOpenerWatch();
  const text = `${DECISION}First sentence here. Second sentence follows. Third one too.`;
  let fired = 0;
  for (let at = 1; at <= text.length; at += 3) {
    if (watch.feed(text.slice(0, at)) !== null) fired += 1;
  }
  assert.equal(fired, 1);
  assert.equal(watch.feed(text), null);
});

test("a searching or acting turn never speaks early", () => {
  const rounds = [
    '```json\n{"then": "reply", "needsWeb": true, "webQuery": "latest guideline"}\n```\nLet me check. One moment.',
    '```json\n{"then": "reply", "needsPapers": true}\n```\nSearching the literature. Hold on.',
    '```json\n{"then": "study", "topic": "the Krebs cycle"}\n```\nStarting now. Here we go.',
    '```json\n{"then": "rewrite"}\n```\nRewritten below. Have a look.',
    '```json\n{"then": "reply", "tools": [{"name": "list_calendar_events", "arguments": {}}]}\n```\nChecking your calendar. One second.',
    '```json\n{"then": "reply", "wantsTest": true}\n```\nHere is your quiz. Ready when you are.',
    '```json\n{"then": "reply", "wantsCards": true}\n```\nCards coming up. Flip through these.',
    '```json\n{"then": "reply", "visuals": [{"kind": "quantitative"}]}\n```\nHere is the curve. It rises steeply.',
    '```json\n{"then": "study", "question": {"ask": "Which one?", "options": ["a", "b"]}}\n```\nWhich did you mean? Tell me.',
    '```json\n{"then": "reply", "wantsReport": "the history of insulin pricing"}\n```\nStarting the report. It will land in your library.',
    '```json\n{"then": "reply", "curriculumFor": "organic chemistry"}\n```\nBuilding the course. Give me a minute.',
  ];
  for (const finished of rounds) {
    assert.equal(streamed(finished), null, `should have stood down: ${finished.slice(11, 60)}`);
  }
});

test("notation, markdown and markers in the first sentence stand the lane down", () => {
  const risky = [
    `${DECISION}The rate is $v = k[S]$ at low concentration. More follows.`,
    `${DECISION}[compound: aspirin] binds the enzyme. More follows.`,
    `${DECISION}**Bold claim** to start. More follows.`,
    `${DECISION}See the diagram:\n\`\`\`mermaid\nflowchart TD\n\`\`\`\nMore follows. And more.`,
    `${DECISION}Take [figure 1] here. More follows.`,
  ];
  for (const finished of risky) {
    assert.equal(streamed(finished), null, `should have stood down: ${finished.slice(11, 50)}`);
  }
});

test("a first sentence past the opener bound is not split early, matching the finished plan", () => {
  const long = `${DECISION}${"word ".repeat(60).trim()}. And then a second sentence.`;
  assert.equal(streamed(long), null);
});

test("an unparseable decision block ends the watch rather than guessing", () => {
  assert.equal(streamed('```json\n{"then": "reply",,}\n```\nPlain sentence here. Another.'), null);
});

test("a one-sentence reply with no trailing text never fires early", () => {
  // No whitespace ever follows the full stop, so no seam exists to cut at.
  assert.equal(streamed(`${DECISION}The mitochondrion is the site of aerobic respiration.`), null);
});

test("the fence regex is the same shape turn-router reads, character for character", () => {
  const here = readFileSync(join(__dirname, "spoken-opener.ts"), "utf8");
  const router = readFileSync(join(__dirname, "turn-router.ts"), "utf8");
  const pattern = "/```json\\s*\\n?([\\s\\S]*?)```/";
  assert.ok(here.includes(`const FENCE = ${pattern};`), "spoken-opener carries the shared fence shape");
  assert.ok(router.includes(`const DECISION_BLOCK = ${pattern};`), "turn-router still reads that same shape");
});
