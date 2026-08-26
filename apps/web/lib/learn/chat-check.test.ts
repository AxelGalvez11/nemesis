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
import { turnRouterMessages, type TurnContext } from "./turn-router";

/** An empty canvas, so the packet under test is the contract itself and not one turn's state. */
const EMPTY_CONTEXT: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Tuesday, 18 August 2026",
  webContext: "",
};

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

test("🔴🔴 the packet says a check never replaces the answer", () => {
  // 🔴 MEASURED ON PRODUCTION 2026-08-24. *"Teach me the three branches of the US government, then
  // quiz me on it"* returned five perfectly good chips and an EMPTY answer, so the canvas rendered
  // its "Nemesis had nothing to add." notice above a quiz on a lesson that was never given. The
  // learner asked for two things and received only the second.
  //
  // 🔴 THE CAUSE WAS THE INSTRUCTION NEXT TO IT: "do not also write them out in your prose"
  // presupposes prose exists, and the model read it as permission to write none. Same shape as a
  // figure marker with no payload, in the other direction — one half of a two-part answer treated
  // as the whole of it.
  // 🔴 BUILT FROM `turnRouterMessages`, NOT READ OUT OF THE SOURCE. The rule spans two adjacent
  // string literals, so a source match would break on where the `+` happens to fall — and would be
  // testing the file rather than what the model is actually handed. This is the assembled packet.
  const packet = turnRouterMessages({ context: EMPTY_CONTEXT, utterance: "quiz me on this" })
    .map((message) => message.content)
    .join("\n")
    .replace(/\s+/g, " ");
  assert.match(packet, /A check NEVER replaces your answer/, "a check may once more arrive with no answer at all");
  assert.match(
    packet,
    /sending questions with an empty answer leaves them being tested on a lesson you never gave/,
    "the consequence of an empty answer is no longer spelled out",
  );
  // The clause that caused it must survive too: it is right, it was just half a rule.
  assert.match(packet, /do not also write them out in your prose/, "the no-duplication clause was removed rather than completed");
});

test("🔴🔴 the contract forbids questions in prose, and says what to do instead", () => {
  // Owner, on production 2026-08-26: *"i asked for a quiz and it put it in chat not as component."*
  // The reply opened "Here's your diagnostic quiz" and printed nine numbered open questions.
  // Nothing failed — `wantsTest` was false, `check` was null, and the chip surface had nothing to
  // render. Every instruction told the model what to do WHEN it filled `check` in; none said that
  // writing questions in prose is not a thing it may do, and prose accepts anything while `check`
  // has a shape (2-5 options, exactly one correct). A model that decides open questions suit the
  // material has no channel for them, so it takes the one that never refuses.
  //
  // Calibration: drop either half of the rule and this reddens.
  // Built from the assembled packet, not from the source, for the reason the test above gives: the
  // rule spans adjacent string literals and a source match tests where the `+` falls.
  const packet = turnRouterMessages({ context: EMPTY_CONTEXT, utterance: "give me a quiz on this" })
    .map((message) => message.content)
    .join("\n")
    .replace(/\s+/g, " ");
  assert.match(packet, /QUESTIONS ARE NEVER PROSE/, "nothing stops a quiz being written as a numbered list");
  assert.match(packet, /ask ONE, in a sentence/, "the open-question case has no answer, so prose stays the escape hatch");
  // 🔴 AND THE ENTRY CONDITION COVERS MATERIAL THE LEARNER BROUGHT. "already been taught" was read
  // as "taught by Nemesis from nothing"; the reported canvas had an uploaded table taught from it.
  assert.match(
    packet,
    /Material the learner uploaded and has just been taught from counts as material they have been taught/,
    "a quiz on uploaded material is outside the rule again",
  );
});
