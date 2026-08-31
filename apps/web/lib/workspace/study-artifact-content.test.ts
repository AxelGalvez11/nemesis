import assert from "node:assert/strict";
import test from "node:test";

import {
  bestAttempt,
  buildMindmapGenMessages,
  buildTestGenMessages,
  deckMaterial,
  isTypedQuestion,
  missedQuestionCards,
  normalisedAnswer,
  outlineToMermaidMindmap,
  parseGeneratedMindmap,
  parseGeneratedTest,
  parseMindmapContent,
  parseTestContent,
  scoreAttempt,
  scoreTone,
  typedAnswerMatches,
  type TestQuestion,
} from "./study-artifact-content";

const QUESTION = { answer: 1, options: ["Alpha", "Beta", "Gamma", "Delta"], q: "Which receptor?", why: "Beta-1 drives rate." };
/** As a generation reply writes it: a STRING under `answer`, no options. */
const TYPED_WIRE = { accept: ["consideración"], answer: "Consideration", q: "Name the doctrine that makes a promise enforceable.", why: "No consideration, no contract." };

function asChoice(item: unknown): TestQuestion {
  assert.ok(item && !isTypedQuestion(item as TestQuestion), "expected a choice question");
  return item as TestQuestion;
}

test("generated tests parse through fences, junk, and bad rows", () => {
  const good = parseGeneratedTest('```json\n{"questions":[' + JSON.stringify(QUESTION) + "]}\n```");
  assert.equal(good.length, 1);
  // Not the literal index any more: parseGeneratedTest now re-seats the correct
  // option so a paper's answers are not all in the same place (2026-07-24, see
  // test-answer-balance.ts). What has to hold is that the index still points at
  // the option that was actually true — which is the stronger assertion.
  const first = asChoice(good[0]);
  assert.equal(first.options[first.answer], "Beta");
  assert.deepEqual([...first.options].sort(), ["Alpha", "Beta", "Delta", "Gamma"]);
  const mixed = parseGeneratedTest(JSON.stringify({
    questions: [QUESTION, { answer: 9, options: ["a", "b"], q: "out of bounds" }, { options: ["a", "b"], q: "" }],
  }));
  assert.equal(mixed.length, 1);
  assert.deepEqual(parseGeneratedTest("no json"), []);
});

// ── typed questions (owner 2026-08-31: "the test could include type to answer") ──────────────

test("🔴 a typed question survives the trip: generation reply in, stored jsonb back out", () => {
  // The wire shape (string `answer`) and the stored shape (`typedAnswer`) are
  // both readable — regenerating a paper and reopening a saved one must agree.
  const generated = parseGeneratedTest(JSON.stringify({ questions: [QUESTION, TYPED_WIRE] }));
  assert.equal(generated.length, 2);
  const typed = generated[1];
  assert.ok(typed && isTypedQuestion(typed));
  assert.equal(typed.typedAnswer, "Consideration");
  assert.deepEqual(typed.accept, ["consideración"]);
  const reread = parseTestContent({ attempts: [], questions: generated });
  assert.ok(reread && isTypedQuestion(reread.questions[1]!));
});

test("🔴 typed grading forgives writing mechanics, never the words", () => {
  const typed = { accept: [], q: "Ask 'How are you?' formally in Spanish.", typedAnswer: "¿Cómo está usted?", why: "" };
  // Calibration: casing, accents, punctuation and spacing are mechanics.
  assert.ok(typedAnswerMatches("como esta usted", typed));
  assert.ok(typedAnswerMatches("  Cómo  está USTED?? ", typed));
  // A different word is a different answer — this is the line that must hold.
  assert.ok(!typedAnswerMatches("como estas", typed));
  assert.ok(!typedAnswerMatches("", typed));
  // `accept` widens spelling, through the same normalisation.
  assert.ok(typedAnswerMatches("CONSIDERACION", { accept: ["consideración"], q: "", typedAnswer: "Consideration", why: "" }));
  // 🔴 Field-agnostic: an engineering symbol string works by the same rule.
  assert.equal(normalisedAnswer("σ = F/A"), "σ f a");
});

test("🔴 balancing re-seats only choice questions; typed ones hold their place", () => {
  // Calibration: run balanceAnswerPositions over the mixed list and the typed
  // row either crashes it or gets dropped — this pins the split-and-reassemble.
  const mixed = parseGeneratedTest(JSON.stringify({ questions: [QUESTION, TYPED_WIRE, { ...QUESTION, q: "Third?" }] }));
  assert.equal(mixed.length, 3);
  assert.ok(!isTypedQuestion(mixed[0]!));
  assert.ok(isTypedQuestion(mixed[1]!));
  assert.ok(!isTypedQuestion(mixed[2]!));
  for (const item of [mixed[0]!, mixed[2]!]) {
    const choice = asChoice(item);
    assert.equal(choice.options[choice.answer], "Beta");
  }
});

test("a mixed attempt scores typed answers by match and records the typed text on a miss", () => {
  const questions = parseGeneratedTest(JSON.stringify({ questions: [QUESTION, TYPED_WIRE] }));
  const first = asChoice(questions[0]);
  const right = scoreAttempt(questions, [first.answer, "consideracion"], "2026-08-31T00:00:00Z");
  assert.equal(right.score, 2);
  const wrong = scoreAttempt(questions, [first.answer, "estoppel"], "2026-08-31T00:00:00Z");
  assert.equal(wrong.score, 1);
  // The miss keeps WHAT was typed — the review screen shows it back.
  assert.deepEqual(wrong.missed, [{ picked: "estoppel", questionIndex: 1 }]);
  // And that attempt survives the jsonb round trip with the text intact.
  const stored = parseTestContent({ attempts: [wrong], questions });
  assert.equal(stored?.attempts[0]?.missed[0]?.picked, "estoppel");
});

test("a missed typed question becomes a recall flashcard with the written-out answer", () => {
  const questions = parseGeneratedTest(JSON.stringify({ questions: [TYPED_WIRE] }));
  const cards = missedQuestionCards(questions, [{ picked: "estoppel", questionIndex: 0 }]);
  assert.equal(cards[0]?.back, "Consideration\n\nNo consideration, no contract.");
});

test("the generation prompt offers the typed shape without demanding it", () => {
  const messages = buildTestGenMessages(deckMaterial("Contracts", [{ back: "b", front: "f" }]), 5);
  assert.ok(messages[1]?.content.includes('"accept"'));
  assert.ok(messages[1]?.content.includes("at most a third"));
});

test("jsonb content round-trips and rejects shells", () => {
  const content = parseTestContent({ attempts: [{ at: "2026-07-21T00:00:00Z", missed: [{ picked: 0, questionIndex: 0 }], score: 3, total: 5 }], questions: [QUESTION] });
  assert.equal(content?.questions.length, 1);
  assert.equal(content?.attempts.length, 1);
  assert.equal(parseTestContent(null), null);
  assert.equal(parseTestContent({ questions: [] }), null);
  assert.equal(parseMindmapContent({ outline: " # Root\n- a " })?.outline, "# Root\n- a");
  assert.equal(parseMindmapContent({}), null);
});

test("mindmap replies accept the JSON wrapper or a bare outline", () => {
  assert.equal(parseGeneratedMindmap('{"outline":"# Root\\n- leaf"}'), "# Root\n- leaf");
  assert.equal(parseGeneratedMindmap("# Root\n- leaf"), "# Root\n- leaf");
  assert.equal(parseGeneratedMindmap("just prose, not an outline"), null);
});

test("outline converts to a mermaid mindmap with depth preserved and unsafe punctuation stripped", () => {
  const mermaid = outlineToMermaidMindmap("# Beta blockers\n- Cardiac\n  - Rate (beta-1)\n- Renal");
  const lines = mermaid.split("\n");
  assert.equal(lines[0], "mindmap");
  assert.equal(lines[1], "  root((Beta blockers))");
  assert.equal(lines[2], "    Cardiac");
  assert.equal(lines[3], "      Rate beta-1");
  assert.equal(lines[4], "    Renal");
});

test("prompts carry the material and the requested shape", () => {
  const material = deckMaterial("Cardio", [{ back: "Slows rate", front: "Metoprolol" }]);
  const testMessages = buildTestGenMessages(material, 10);
  assert.equal(testMessages.length, 2);
  assert.ok(testMessages[1]?.content.includes("exactly 10"));
  assert.ok(testMessages[1]?.content.includes("Metoprolol — Slows rate"));
  const mapMessages = buildMindmapGenMessages(material);
  assert.ok(mapMessages[1]?.content.includes('{"outline"'));
});

test("scoring splits hits from misses and best attempt prefers the top ratio", () => {
  const questions = [QUESTION, { ...QUESTION, q: "Second?" }];
  const attempt = scoreAttempt(questions, [1, 0], "2026-07-21T00:00:00Z");
  assert.equal(attempt.score, 1);
  assert.deepEqual(attempt.missed, [{ picked: 0, questionIndex: 1 }]);
  const best = bestAttempt([attempt, { ...attempt, at: "later", missed: [], score: 2 }]);
  assert.equal(best?.score, 2);
  assert.equal(bestAttempt([]), null);
});

test("score tone bands the best attempt at 80/60 and stays neutral untaken", () => {
  const attempt = { at: "2026-08-04T00:00:00Z", missed: [], score: 8, total: 10 };
  assert.equal(scoreTone([attempt]), "strong");
  assert.equal(scoreTone([{ ...attempt, score: 6 }]), "mid");
  assert.equal(scoreTone([{ ...attempt, score: 5 }]), "weak");
  // The colour follows the BEST attempt, same as the label next to it.
  assert.equal(scoreTone([{ ...attempt, score: 2 }, attempt]), "strong");
  assert.equal(scoreTone([]), "none");
  assert.equal(scoreTone([{ ...attempt, score: 0, total: 0 }]), "none");
});

test("missed questions become recall-style flashcards", () => {
  const cards = missedQuestionCards([QUESTION], [{ picked: 0, questionIndex: 0 }, { picked: 0, questionIndex: 9 }]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.front, "Which receptor?");
  assert.equal(cards[0]?.back, "Beta\n\nBeta-1 drives rate.");
});
