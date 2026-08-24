// A conversation can ask multiple-choice questions, and every field of them was written by a model.
//
// 🔴🔴 THE FEATURE SHIPPED AND COULD NEVER FIRE, WHICH IS WHY THE WIRING IS TESTED AND NOT JUST THE
// VALIDATOR. `CanvasCheck` — the tappable chips — landed in #773 behind `wantsTest`, which was read
// as `then === "study" && …`. On the same day the rigid teaching lane was removed, so a "quiz me"
// became an ordinary reply and that condition went permanently false. Two correct pieces, shipped
// hours apart, adding up to a control nobody could reach. Both halves are held here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MAX_OPTIONS, MIN_OPTIONS, readChatCheck } from "./chat-check";
import { cardsFromMisses, MAX_QUESTIONS } from "./test-run";

const good = (over?: Record<string, unknown>) => ({
  prompt: "Which part of the uterus rises in pregnancy?",
  options: [
    { text: "The fundus", correct: true },
    { text: "The cervix" },
    { text: "The isthmus" },
  ],
  ...over,
});

test("a well-formed question becomes a run", () => {
  const run = readChatCheck([good()]);
  assert.equal(run?.questions.length, 1);
  assert.equal(run?.questions[0]?.prompt, "Which part of the uterus rises in pregnancy?");
  assert.equal(run?.questions[0]?.options.filter((option) => option.correct).length, 1);
});

test("🔴 the order the model wrote is the order shown", () => {
  // There is no pool to balance answer position against here, and shuffling would need a clock or a
  // random — both banned in this lane. The prompt asks the model to vary the seat; nothing reorders.
  const run = readChatCheck([good()]);
  assert.deepEqual(run?.questions[0]?.options.map((option) => option.text), [
    "The fundus",
    "The cervix",
    "The isthmus",
  ]);
});

test("🔴🔴 a question with no right answer, or two, is DROPPED", () => {
  // Zero correct makes every pick a miss; two makes the learner wrong for choosing a right answer.
  // Both are silent when scored, which is the whole reason this is checked rather than trusted.
  const none = good({ options: [{ text: "a" }, { text: "b" }] });
  const two = good({ options: [{ text: "a", correct: true }, { text: "b", correct: true }] });
  assert.equal(readChatCheck([none]), null);
  assert.equal(readChatCheck([two]), null);
  // …and one bad question does not take the good ones with it.
  assert.equal(readChatCheck([none, good(), two])?.questions.length, 1);
});

test("🔴 malformed shapes are refused rather than repaired", () => {
  assert.equal(readChatCheck(null), null);
  assert.equal(readChatCheck("quiz me"), null);
  assert.equal(readChatCheck([{ prompt: "", options: [{ text: "a", correct: true }, { text: "b" }] }]), null);
  assert.equal(readChatCheck([good({ options: [{ text: "only one", correct: true }] })]), null, "one option is a statement with a button under it");
  const tooMany = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => ({ text: `option ${i}`, correct: i === 0 }));
  assert.equal(readChatCheck([good({ options: tooMany })]), null);
  assert.equal(readChatCheck([good({ options: [{ text: "", correct: true }, { text: "b" }] })]), null);
  assert.ok(MIN_OPTIONS === 2 && MAX_OPTIONS === 5);
});

test("🔴 the run is bounded, because a model wrote the length too", () => {
  const many = Array.from({ length: MAX_QUESTIONS + 6 }, () => good());
  assert.equal(readChatCheck(many)?.questions.length, MAX_QUESTIONS);
});

test("🔴🔴 a chat question can never be mistaken for a tracked objective", () => {
  // Nothing here is written to `learner_evidence`, and the namespace is what makes that legible at
  // a glance anywhere a key turns up.
  const run = readChatCheck([good(), good({ prompt: "And which part opens into the vagina?" })]);
  for (const question of run?.questions ?? []) {
    assert.match(question.objectiveIdentityKey, /^chat:/);
  }
  // Two questions never collide, which is what `cardsFromMisses` dedups on.
  assert.equal(new Set(run?.questions.map((q) => q.objectiveIdentityKey)).size, 2);
});

test("🔴 missing one still earns a card — the one thing a check outlives the chat as", () => {
  const run = readChatCheck([good()]);
  assert.ok(run);
  const missed = run.questions.map((question) => question.objectiveIdentityKey);
  const cards = cardsFromMisses(run, missed);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.front, "Which part of the uterus rises in pregnancy?");
  assert.equal(cards[0]?.back, "The fundus", "the card's back is not the answer they should have given");
});

test("🔴🔴 …and the chips are actually REACHABLE from a conversation", () => {
  // The half that shipped broken. `wantsTest` must not be gated on a study turn any more, and the
  // canvas must fall back to the turn's questions when the objectives pool refuses.
  const router = readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8");
  assert.ok(
    !/wantsTest: then === "study"/.test(router),
    "the chips are gated on a study turn again — with the rigid lane gone, that is permanently unreachable",
  );
  assert.match(router, /check: readChatCheck\(parsed\.check\)/, "the turn no longer carries its own questions");

  const canvas = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /session\.testQuestions \?\? fromPool/, "a conversation's questions never reach the chips");
  assert.match(canvas, /if \(!isTestRefusal\(fromPool\)\) return fromPool/, "the grounded pool stopped taking precedence");
});
