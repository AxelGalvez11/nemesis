import assert from "node:assert/strict";

import { applyChatEffort, toolsAllowed } from "./chat-effort";
import { acceptsOffer, classifyChatRequest, detectsSaveRequest, offersToCreate, promptWithoutAttachments, routeInstruction, SAVE_INSTRUCTION } from "./chat-routing";
import { buildWireMessages } from "./chat-api";

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
  // Owner 2026-07-28, verbatim: this returned FALSE, so the turn went out on the
  // tool-less reasoner and the model wrote the whole test into the chat.
  // SAVE_ARTIFACT only knew "practice test" — nobody types that.
  "create a test on brand generic of top 100 drugs",
  "create a quiz on the krebs cycle",
  "build an exam for pharmacology",
  "make me a test on the top 100 drugs",
  "generate 2 quizzes on renal dosing",
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

// But a YEAR inside a save request is part of a date, not a request for current
// information — and every calendar request carries one. Measured live: "Add
// these five to my calendar: Aug 3 2026 ..." bought a paid search it had no use
// for, purely because RECENT_YEAR_PATTERN matches \b202[4-9]\b.
for (const prompt of [
  "Add these five to my calendar: Aug 3 2026 Pharmacology exam, Aug 31 2026 Final exam",
  "put my exam on my calendar for May 4 2026",
  "make flashcards from the 2026 guidelines I pasted",
]) {
  const decision = classifyChatRequest(prompt);
  assert.equal(decision.savesToWorkspace, true, prompt);
  assert.equal(decision.searchWeb, false, prompt);
}

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
{
  const prior =
    "Before I build the test: what do you want for how many questions, the difficulty (easy, medium, hard, or mixed), and the question types (multiple choice, true/false, or a mix)?";
  const decision = classifyChatRequest("20, hard, with a mix", prior);
  assert.equal(decision.savesToWorkspace, true);
  assert.equal(decision.model, "deepseek-chat");
}

// The regression that raising the attachment budget amplified: a lecture slide
// citing a recent year tripped the web-search matcher, buying a paid search on
// every upload. Routing reads what the student TYPED; skills still read it all.
//
// The matcher itself is gone (2026-08-06 — the web is a tool the model calls,
// so no regex reads this text looking for a reason to search). The SPLIT still
// matters and is still asserted: it decides which model answers and what the
// turn is treated as, and a lecture must not be able to answer that on the
// student's behalf.
{
  const wireText = "summarise this\n\n### Attachment: week3.pptx\nType: application/pptx\n\nAdapted from Smith et al., 2024. Updated guidance.";
  assert.equal(promptWithoutAttachments(wireText), "summarise this");
  assert.equal(classifyChatRequest(promptWithoutAttachments(wireText)).searchWeb, false);
}
// The same regression, in the case that actually happens most: files attached
// with NOTHING typed. prepareChatAttachments trims the wire text, so the blank
// line before the first header is gone and the header STARTS the string —
// matching only "\n\n### Attachment: " handed the whole lecture back as though
// the student had typed it, and the bare upload kept buying a paid search.
// This shape is copied from prepareChatAttachments, not invented: a fixture with
// an imaginary leading blank line is what let the first fix pass its test and
// still do nothing on screen.
{
  const wireText = `${"".trim()}\n\n### Attachment: week3.pptx\nType: application/pptx\n\nAdapted from Smith et al., 2024.`.trim();
  assert.ok(wireText.startsWith("### Attachment: "), "the real shape has no leading blank line");
  assert.equal(promptWithoutAttachments(wireText), "");
}

// A message with no attachment is untouched.
assert.equal(promptWithoutAttachments("what is the latest guidance"), "what is the latest guidance");

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

// The same shape for syllabus-intake, whose offer names the CALENDAR rather than
// a study artifact. Without "calendar" in the offer vocabulary a bare "yes" kept
// its tools only by accident — it fell through to the conversation route, which
// happens to use the tools model. On High effort that accident stops working and
// the turn lands on the tool-less lane, which is the fabrication path.
{
  const offer = "Here are the 22 dated items I found.\n\nWant me to add these to your calendar?";
  assert.equal(offersToCreate(offer), true);
  for (const reply of ["yes", "yes please", "go ahead", "sure"]) {
    assert.equal(detectsSaveRequest(reply, offer), true, reply);
    assert.equal(classifyChatRequest(reply, offer).savesToWorkspace, true, reply);
    // High is the case that was silently broken.
    assert.equal(toolsAllowed(applyChatEffort(classifyChatRequest(reply, offer), "high")), true, `${reply} @ high`);
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

// ── what a bare test/quiz/exam must NOT drag in ──────────────────────────────
// The reason these three nouns cannot simply join SAVE_ARTIFACT: SAVE_VERB
// includes "prep", and studying FOR a test is not creating one. The create verb
// has to govern the noun directly.
for (const prompt of [
  "help me prepare for my test",
  "I have an exam tomorrow, where should I start?",
  "quiz me on the top 100 drugs",
  "test my understanding of the Krebs cycle",
  // The programming sense of "test", which a create verb walks straight into.
  "write a test for this function",
  "generate unit tests for the parser",
  "create a test suite for this module",
  "what will be on the exam?",
  "how do I make good flashcards?",
]) {
  assert.equal(detectsSaveRequest(prompt), false, prompt);
}

// ── a save turn must be TOLD to use the tool ─────────────────────────────────
// Routing correctly only buys the tools; it does not make the model reach for
// them. Without this line a model handed a tool and a blank page writes the
// test out in prose, which is exactly what the student reported.
{
  const saveTurn = buildWireMessages([], "create a test on brand generic of top 100 drugs");
  assert.ok(saveTurn[0]?.content.includes(SAVE_INSTRUCTION), "a save turn carries the save instruction");

  const plainTurn = buildWireMessages([], "explain how beta blockers lower blood pressure");
  assert.ok(!plainTurn[0]?.content.includes(SAVE_INSTRUCTION), "an ordinary question does not");
}

// A save turn on the High dial keeps its tools (applyChatEffort) — and must
// therefore still carry the instruction that tells it to use them.
{
  const decision = applyChatEffort(classifyChatRequest("create a test on the krebs cycle"), "high");
  assert.equal(toolsAllowed(decision), true, "High must not strip a save's tools");
  const messages = buildWireMessages([], "create a test on the krebs cycle", decision);
  assert.ok(messages[0]?.content.includes(SAVE_INSTRUCTION));
}

console.log("chat-routing.test.ts OK");
