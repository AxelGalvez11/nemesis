import assert from "node:assert/strict";
import test from "node:test";

import {
  bestAttempt,
  buildMindmapGenMessages,
  buildTestGenMessages,
  deckMaterial,
  missedQuestionCards,
  noteMaterial,
  outlineToMermaidMindmap,
  parseGeneratedMindmap,
  parseGeneratedTest,
  parseMindmapContent,
  parseTestContent,
  scoreAttempt,
} from "./study-artifact-content";

const QUESTION = { answer: 1, options: ["Alpha", "Beta", "Gamma", "Delta"], q: "Which receptor?", why: "Beta-1 drives rate." };

test("generated tests parse through fences, junk, and bad rows", () => {
  const good = parseGeneratedTest('```json\n{"questions":[' + JSON.stringify(QUESTION) + "]}\n```");
  assert.equal(good.length, 1);
  assert.equal(good[0]?.answer, 1);
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

test("missed questions become recall-style flashcards", () => {
  const cards = missedQuestionCards([QUESTION], [{ picked: 0, questionIndex: 0 }, { picked: 0, questionIndex: 9 }]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.front, "Which receptor?");
  assert.equal(cards[0]?.back, "Beta\n\nBeta-1 drives rate.");
});

// ── Learning objectives reach the generators ─────────────────────────────────
// A lecture's objectives slide is what the exam is written from, and it sits on the
// first slide. Carrying it separately is what puts it at the head of EVERY chunk
// rather than only the first one (lib/workspace/material-chunks.ts).

test("noteMaterial pulls the objectives out of a lecture and keeps the lecture whole", () => {
  const lecture = `Learning Objectives\n• Describe the renin-angiotensin system\n• Explain ACE inhibition\n\n${"Filler slide text about pharmacology. ".repeat(400)}`;
  const material = noteMaterial("Antihypertensives", lecture);
  assert.deepEqual(material.objectives, ["Describe the renin-angiotensin system", "Explain ACE inhibition"]);
  // Not clipped here any more: a clipped source is a source read in part, and the
  // generator now reads every chunk of it.
  assert.equal(material.text, lecture.trim());
});

test("a note with no objectives slide carries none rather than an empty array", () => {
  const material = noteMaterial("Scratch", "Penicillins bind PBPs.");
  assert.equal(material.objectives, undefined);
});

test("the test generator is told the objectives, ahead of the material", () => {
  const material = noteMaterial("Antihypertensives", "Objectives\n• Describe the renin-angiotensin system\n\nBody text here.");
  const prompt = buildTestGenMessages(material, 10)[1]!.content;
  assert.match(prompt, /Describe the renin-angiotensin system/);
  assert.ok(prompt.indexOf("renin-angiotensin") < prompt.indexOf("Material:"), "objectives must precede the material");
});

test("the mind-map generator gets the same objectives", () => {
  const material = noteMaterial("Antihypertensives", "Objectives\n• Describe the renin-angiotensin system\n\nBody.");
  assert.match(buildMindmapGenMessages(material)[1]!.content, /Describe the renin-angiotensin system/);
});

test("a deck with no objectives produces a prompt with no objectives preamble", () => {
  const material = deckMaterial("Antibiotics", [{ back: "bactericidal", front: "penicillin" }]);
  assert.doesNotMatch(buildTestGenMessages(material, 5)[1]!.content, /learning objectives/i);
});
