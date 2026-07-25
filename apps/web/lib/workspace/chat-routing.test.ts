import assert from "node:assert/strict";

import { classifyChatRequest, detectsSaveRequest, routeInstruction } from "./chat-routing";

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
  // The flag applyChatEffort reads to stop the High dial stripping the tools.
  assert.equal(decision.savesToWorkspace, true, prompt);
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

console.log("chat-routing.test.ts OK");
