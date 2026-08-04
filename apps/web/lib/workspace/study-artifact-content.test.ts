import assert from "node:assert/strict";
import test from "node:test";

import {
  bestAttempt,
  buildMindmapGenMessages,
  buildTestGenMessages,
  deckMaterial,
  missedQuestionCards,
  outlineToMermaidMindmap,
  parseGeneratedMindmap,
  parseGeneratedTest,
  parseMindmapContent,
  parseTestContent,
  scoreAttempt,
  scoreTone,
} from "./study-artifact-content";

const QUESTION = { answer: 1, options: ["Alpha", "Beta", "Gamma", "Delta"], q: "Which receptor?", why: "Beta-1 drives rate." };

test("generated tests parse through fences, junk, and bad rows", () => {
  const good = parseGeneratedTest('```json\n{"questions":[' + JSON.stringify(QUESTION) + "]}\n```");
  assert.equal(good.length, 1);
  // Not the literal index any more: parseGeneratedTest now re-seats the correct
  // option so a paper's answers are not all in the same place (2026-07-24, see
  // test-answer-balance.ts). What has to hold is that the index still points at
  // the option that was actually true — which is the stronger assertion.
  assert.equal(good[0]?.options[good[0]?.answer ?? -1], "Beta");
  assert.deepEqual([...(good[0]?.options ?? [])].sort(), ["Alpha", "Beta", "Delta", "Gamma"]);
  const mixed = parseGeneratedTest(JSON.stringify({
    questions: [QUESTION, { answer: 9, options: ["a", "b"], q: "out of bounds" }, { options: ["a", "b"], q: "" }],
  }));
  assert.equal(mixed.length, 1);
  assert.deepEqual(parseGeneratedTest("no json"), []);
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
