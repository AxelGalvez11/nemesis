import assert from "node:assert/strict";

import { applyChatEffort, toolsAllowed } from "./chat-effort";
import { acceptsOffer, classifyChatRequest, detectsSaveRequest, offersToCreate, promptWithoutAttachments, routeInstruction } from "./chat-routing";
import { shouldSearchWeb } from "./chat-web-search";

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
  "create a slide deck about ACE inhibitors",
  "make me lecture notes for tomorrow",
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
  // Questions ABOUT the artifact carry a save verb and a save noun, but asking
  // words never open a request — these belong on the reasoner, not the tool lane.
  "how do I make good flashcards?",
  "what is the best way to build a mind map",
  "why do flashcards work better than rereading",
]) {
  assert.equal(detectsSaveRequest(prompt), false, prompt);
}
// A polite ask is still an ask — "can/could/would you" must stay saves.
for (const prompt of ["can you make me flashcards on the Krebs cycle", "could you build a mind map of this"]) {
  assert.equal(detectsSaveRequest(prompt), true, prompt);
}
// The reasoner routes those still resolve to are untouched by the save gate.
assert.equal(classifyChatRequest("explain how beta blockers work").model, "deepseek-reasoner");

// The regression that raising the attachment budget amplified: a lecture slide
// citing a recent year tripped the web-search matcher, buying a paid search on
// every upload. Routing reads what the student TYPED; skills still read it all.
{
  const wireText = "summarise this\n\n### Attachment: week3.pptx\nType: application/pptx\n\nAdapted from Smith et al., 2024. Updated guidance.";
  assert.equal(promptWithoutAttachments(wireText), "summarise this");
  assert.equal(shouldSearchWeb(promptWithoutAttachments(wireText)), false);
  // The raw wire text is exactly what used to trip it.
  assert.equal(shouldSearchWeb(wireText), true);
}
// A message with no attachment is untouched, and a real live-info question still searches.
assert.equal(promptWithoutAttachments("what is the latest guidance"), "what is the latest guidance");
assert.equal(shouldSearchWeb(promptWithoutAttachments("what is the latest guidance")), true);

// Accepting the offer our OWN lecture-intake skill makes. Observed live
// 2026-07-27: the student replied "flashcards", LEARNING_PATTERN matched
// `flashcards?`, the turn went to the tool-less reasoner, and the model wrote
// "[Calling tool: add_flashcards ...]" as prose and reported 14 cards saved to
// a deck that does not exist. Asserted at the END of the chain — through
// applyChatEffort to toolsAllowed — because that is where the failure was; a
// classifier-only assertion would pass over the same dead feature.
{
  const offer = "I have read the lecture.\n\nWant me to turn this into notes, flashcards, a practice test, or all three?";
  assert.equal(offersToCreate(offer), true);
  for (const reply of ["flashcards", "notes", "all three", "yes", "yes please", "a practice test", "do it", "notes and flashcards"]) {
    assert.equal(detectsSaveRequest(reply, offer), true, reply);
    const decision = classifyChatRequest(reply, offer);
    assert.equal(decision.savesToWorkspace, true, reply);
    for (const effort of ["instant", "medium", "high"] as const) {
      assert.equal(toolsAllowed(applyChatEffort(decision, effort)), true, `${reply} @ ${effort}`);
    }
  }
}

// Both halves are required. Without the offer the same words are ordinary
// learning questions, and after an offer a question back is not an acceptance.
{
  const offer = "Want me to turn this into notes, flashcards, a practice test, or all three?";
  for (const reply of ["flashcards", "notes", "all three", "yes"]) {
    assert.equal(detectsSaveRequest(reply, ""), false, `${reply} with no offer`);
  }
  for (const reply of [
    "explain how flashcards help memory",
    "what is the difference between notes and flashcards?",
    "how do I make good flashcards?",
    // Long enough to be a new instruction rather than an acceptance.
    "actually let's go back to the contraindications section and walk through each one in detail",
  ]) {
    assert.equal(detectsSaveRequest(reply, offer), false, reply);
  }
  // An assistant turn that merely mentions flashcards is not an offer.
  assert.equal(offersToCreate("Flashcards are effective because of spaced retrieval."), false);
  // Nor is an offer that is not a question.
  assert.equal(offersToCreate("I can turn this into flashcards."), false);
  assert.equal(acceptsOffer("flashcards"), true);
  assert.equal(acceptsOffer(""), false);
}

console.log("chat-routing.test.ts OK");
