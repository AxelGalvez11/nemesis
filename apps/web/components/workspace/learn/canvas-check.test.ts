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
