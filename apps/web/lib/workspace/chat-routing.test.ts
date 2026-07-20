import assert from "node:assert/strict";

import { classifyChatRequest, routeInstruction } from "./chat-routing";

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

console.log("chat-routing.test.ts OK");
