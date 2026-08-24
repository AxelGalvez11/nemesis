import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cardsFromMisses, type TestRun } from "@/lib/learn/test-run";

// ── the test card on the canvas: where it may appear, and what it may take over ──────────────
//
// 🔴🔴 THE INVARIANT THIS FILE DEFENDS IS `canvas-runtime-branch.test.ts`'s, NOT A NEW ONE. That
// file forbids `<CanvasRecall`, `<CanvasTest`, `<CanvasDiagnosis` and `<CanvasComplete` from ever
// appearing in `learning-canvas.tsx` again: they were six-stage renderers that REPLACED the page
// and each claimed the composer, and two on one screen meant two rivals for one input. The rule it
// states is *"never two answer surfaces on one composer"*.
//
// `CanvasCheck` is deliberately outside that ban — it composes on top of the material and takes
// answers by TAP ONLY — but "outside the ban" is a claim that has to be held, not asserted once in
// a comment. These tests hold it.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CHECK = strip(readFileSync(new URL("./canvas-check.tsx", import.meta.url), "utf8"));
const CANVAS = strip(readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8"));
const SESSION = strip(readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8"));

test("🔴🔴 the check card never claims the composer", () => {
  // The clarification card DOES route the composer to itself (`composerIntent` returns "clarify").
  // This one must not: a learner mid-test still has an ordinary composer for ordinary questions,
  // and two surfaces competing for one input is precisely what the runtime-branch ban exists for.
  assert.ok(!/composerIntent|answerSink|awaitingAnswer/.test(CHECK), "the check card started reaching for the composer's routing");
  assert.ok(!/<input|<textarea/i.test(CHECK), "the check card grew a text box, which is a second composer wearing a card");
});

test("🔴🔴 it never paints while the policy is already waiting on an answer", () => {
  // Calibration: drop `!policy.awaitingAnswer` and this reddens. A hosted task with a live question
  // plus a test card on the same screen is two things asking to be answered.
  const mount = CANVAS.slice(CANVAS.indexOf("session.testRequested &&"), CANVAS.indexOf("<CanvasCheck"));
  assert.ok(mount.length > 0, "the mount site moved — this guard is pointed at nothing");
  assert.match(mount, /!policy\.awaitingAnswer/, "the test card can now appear beside a live task question");
});

test("🔴 the banned stage names stay banned, and this card is not one of them", () => {
  assert.ok(!CANVAS.includes("<CanvasTest"), "the banned stage name is back in the canvas");
  assert.match(CANVAS, /<CanvasCheck/, "the check card is not mounted at all");
});

test("🔴🔴 a test is never a mode: every turn re-answers the question", () => {
  // §38 permits a test as a PHRASE precisely because it cannot become a state the learner sits
  // inside. Assigning the decision's value (rather than only ever setting it true) is what makes
  // that structural: the next turn clears it whether or not anyone remembered to.
  assert.match(SESSION, /setTestRequested\(decision\.wantsTest\)/, "a test request can now survive into the next turn");
  assert.ok(!/setTestRequested\(true\)/.test(SESSION), "something sets the test flag without a decision behind it");
});

test("🔴🔴 no question is marked while the test is still running", () => {
  // 🔴🔴 OWNER, 2026-08-24: *"I need that to just be one where the user does not immediately get
  // feedback until the end… that way it's not just like friction every time you click the answer."*
  //
  // The guard is on the QUESTION screen reading `correct` at all, not merely on the verdict
  // sentence, because the first version leaked the answer three other ways before it said a word:
  // the right row grew a ring, the wrong rows faded to 45% opacity, and every row went `disabled`.
  // A learner could see which one was right without reading anything. So: the question screen must
  // not branch on correctness, and the marking must live in `CheckResult`.
  const question = CHECK.slice(CHECK.indexOf("export function CanvasCheck"), CHECK.indexOf("export function groundedMiss"));
  const result = CHECK.slice(CHECK.indexOf("function CheckResult"));
  assert.ok(question.length > 0 && result.length > 0, "the two screens could not be told apart — this guard is pointed at nothing");

  assert.ok(!/option\.correct/.test(question), "the live question screen reads which option is correct — the answer leaks through styling");
  assert.ok(!/groundedMiss\(/.test(question), "a verdict sentence is back on the live question screen");
  assert.ok(!/verdictFor\(/.test(question), "the live question screen is scoring a tap as it happens");

  // …and the feedback genuinely moved rather than being deleted: the review still names the
  // ground, still states the answer, and still shows what they picked.
  assert.match(result, /groundedMiss\(/, "the grounded sentence was dropped instead of moved to the review");
  assert.match(result, /verdictFor\(/, "the review does not mark the questions at all");
  assert.match(result, /The answer:/, "the review never states the right answer");
});

test("🔴 one tap answers and advances — the second press was the friction", () => {
  // The old card demanded "Next question" after every tap, so a five-question run cost ten presses.
  assert.ok(!/Next question/.test(CHECK), "the extra press per question is back");
  assert.ok(!/See how you did/.test(CHECK), "the extra press before the results is back");
  const answer = CHECK.slice(CHECK.indexOf("const answer = ("), CHECK.indexOf("return (", CHECK.indexOf("const answer = (")));
  assert.match(answer, /setPicks\(/, "tapping an option no longer records the answer");
  assert.match(answer, /if \(last\) setDone\(true\)/, "the last answer no longer ends the run");
  assert.match(answer, /else setIndex/, "answering no longer advances to the next question");
});

test("🔴 a mis-tap is recoverable, because deferred marking is what made it invisible", () => {
  // While each tap was marked instantly, hitting the wrong row was obvious immediately. Deferring
  // the marking removes that signal, so the way back has to be explicit — otherwise this change
  // quietly turns a slip into a wrong answer the learner cannot see until the results.
  assert.match(CHECK, /index > 0 && \(/, "Back is offered on the first question, where there is nothing behind");
  assert.match(CHECK, />\s*Back\s*</, "there is no way back after a mis-tap");
});

test("🔴 cards from misses reuse the canvas's own deck and cost no model call", () => {
  const body = CANVAS.slice(CANVAS.indexOf("const makeCardsFromMisses"), CANVAS.indexOf("const makeCardsFromMisses") + 1600);
  assert.match(body, /ensureCanvasDeck\(uid, canvas\.title, canvas\.studyDeckId\)/, "a test now makes its own deck each time");
  assert.match(body, /writeRecallCards\(/, "the misses no longer become real study cards");
  assert.ok(!/postChatCompletion/.test(body), "making cards from misses started paying for a model call");
});

test("cardsFromMisses turns the exact question they failed into the card", () => {
  const run: TestRun = {
    questions: [
      { objectiveIdentityKey: "a", options: [{ correct: true, text: "right" }, { correct: false, text: "wrong" }], prompt: "Q1?" },
      { objectiveIdentityKey: "b", options: [{ correct: true, text: "yes" }, { correct: false, text: "no" }], prompt: "Q2?" },
    ],
  };
  assert.deepEqual(cardsFromMisses(run, ["b"]), [{ back: "yes", front: "Q2?", objectiveIdentityKey: "b" }]);
  assert.deepEqual(cardsFromMisses(run, []), []);
  // One objective, one card, however many times it was asked.
  assert.equal(cardsFromMisses(run, ["a", "a"]).length, 1);
});

test("🔴 a question with no correct option produces no card rather than a blank one", () => {
  const broken: TestRun = {
    questions: [{ objectiveIdentityKey: "a", options: [{ correct: false, text: "one" }], prompt: "Q?" }],
  };
  assert.deepEqual(cardsFromMisses(broken, ["a"]), [], "a card with an empty back reached the deck");
});
