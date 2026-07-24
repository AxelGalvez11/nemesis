import assert from "node:assert/strict";

import { toolsAllowed } from "./chat-effort";
import { classifyChatRequest, detectsPerformanceRequest, detectsSaveRequest, needsWorkspaceTools, routeInstruction } from "./chat-routing";

// Ordinary conversation stays on the least expensive lane.
assert.deepEqual(classifyChatRequest("hello"), {
  route: "conversation",
  model: "deepseek-chat",
  searchWeb: false,
});

// Learning is discipline-neutral and gets Flash thinking, not a premium model request.
for (const prompt of [
  "Explain eigenvectors geometrically",
  "Compare negligence and strict liability",
  "Debug this TypeScript recursion",
  "Analyze the symbolism in Beloved",
  "Derive the IS-LM equilibrium",
  "Teach me the renin-angiotensin system",
]) {
  const decision = classifyChatRequest(prompt);
  assert.equal(decision.route, "learning", prompt);
  assert.equal(decision.model, "deepseek-reasoner", prompt);
  assert.equal(decision.searchWeb, false, prompt);
  assert.equal(decision.reasoningEffort, undefined, prompt);
}

assert.deepEqual(classifyChatRequest("What is the latest Next.js release?"), {
  route: "current",
  model: "deepseek-reasoner",
  searchWeb: true,
});
assert.deepEqual(classifyChatRequest("Write a literature review with peer-reviewed sources about urban heat islands"), {
  route: "research",
  model: "deepseek-reasoner",
  searchWeb: true,
  reasoningEffort: "high",
});

assert.match(routeInstruction("learning"), /learner's level/);
assert.match(routeInstruction("research"), /limitations/);

// ── Save requests keep the tools-capable model ───────────────────────────────
// The real phrasings a student uses to save study material. Each MUST leave on
// deepseek-chat (the only model whose tools ride) and MUST NOT be route
// "conversation" (sendChatTurn's web re-promotion would push that to the
// reasoner and drop the tools — the "make me flashcards saves nothing" bug).
for (const prompt of [
  "make me flashcards on beta blockers",
  "make flashcards about the Krebs cycle",
  "create a deck for pharmacology",
  "build me a mind map of the RAAS pathway",
  "turn this into a mind map",
  "generate a practice test on ACE inhibitors",
  "add these to my deck",
  "save this as a note",
  "save this to my library",
  "put my exam on my calendar",
  "add my exam to my calendar",
]) {
  assert.equal(detectsSaveRequest(prompt), true, prompt);
  const decision = classifyChatRequest(prompt);
  assert.equal(decision.model, "deepseek-chat", prompt);
  assert.notEqual(decision.route, "conversation", prompt);
  assert.equal(decision.reasoningEffort, undefined, prompt);
}

// A save request that also names a current topic keeps web AND the tools model.
const currentSave = classifyChatRequest("make flashcards about the latest COVID variants");
assert.equal(currentSave.model, "deepseek-chat");
assert.equal(currentSave.searchWeb, true);

// Ordinary learning/research/coding requests must NOT read as saves — they keep
// their normal routes. "write" is deliberately not a save verb, and ambiguous
// nouns only count when anchored to the student's own workspace.
for (const prompt of [
  "explain how beta blockers work",
  "Write a literature review with peer-reviewed sources about urban heat islands",
  "write a test for this function",
  "what's on my schedule today",
  "Teach me the renin-angiotensin system",
  "Compare negligence and strict liability",
]) {
  assert.equal(detectsSaveRequest(prompt), false, prompt);
}
// The reasoner routes those still resolve to are untouched by the save gate.
assert.equal(classifyChatRequest("explain how beta blockers work").model, "deepseek-reasoner");

// --- performance questions ---------------------------------------------------
// Same tool-gate hazard as a save, one layer up: these all trip LEARNING_PATTERN
// ("how", "study", "practice", "quiz") or the 120-char rule, which would land
// them on the reasoner — and toolsAllowed() strips every tool there, so
// read_study_performance would be missing on exactly the questions it answers.
for (const prompt of [
  "how am I doing?",
  "how am I doing on my flashcards",
  "how's my retention on the cardio deck",
  "how did I do on the last practice test",
  "what's my progress this month",
  "show me my weak areas",
  "my test scores are what exactly",
  "what should I review today",
  "what do I need to study before Friday",
  "am I ready for the exam",
  "which cards do I keep missing",
  "what topics am I failing",
  "based on my study data, where am I weakest",
  "check my review history and tell me what to drill",
]) {
  assert.equal(detectsPerformanceRequest(prompt), true, prompt);
  assert.equal(needsWorkspaceTools(prompt), true, prompt);
  const decision = classifyChatRequest(prompt);
  assert.equal(decision.model, "deepseek-chat", prompt);
  assert.notEqual(decision.route, "conversation", prompt);
  assert.equal(decision.reasoningEffort, undefined, prompt);
  // toolsAllowed() is the gate that actually matters — pin it here too so a
  // future edit to either file can't silently strip the tools again.
  assert.equal(toolsAllowed(decision), true, prompt);
}

// A performance question never promotes to web search: the answer lives in the
// student's own logs, and "my latest test" must not trigger a news lookup.
for (const prompt of ["how did I do on my latest test", "what should I review today"]) {
  assert.equal(classifyChatRequest(prompt).searchWeb, false, prompt);
}

// Teaching questions that merely mention these words must NOT read as
// performance — they belong on the reasoner, where the thinking is worth it.
for (const prompt of [
  "how do I calculate retention in spaced repetition",
  "explain how spaced repetition scheduling works",
  "what is a good retention rate for medical students",
  "how should students study for pharmacology exams",
  "teach me how to make flashcards that actually work",
  "why do I forget things I studied last week",
  "explain the forgetting curve",
]) {
  assert.equal(detectsPerformanceRequest(prompt), false, prompt);
}
assert.equal(classifyChatRequest("explain how spaced repetition scheduling works").model, "deepseek-reasoner");

// A save is still a save, and both gates feed the same tools invariant.
assert.equal(needsWorkspaceTools("make flashcards about the Krebs cycle"), true);
assert.equal(needsWorkspaceTools("explain how beta blockers work"), false);

console.log("chat-routing.test.ts OK");
