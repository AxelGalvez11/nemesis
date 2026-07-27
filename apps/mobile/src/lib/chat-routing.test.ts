// Deno unit tests (repo convention) for the chat routing helpers — mirrors
// apps/web/lib/workspace/chat-routing.test.ts (translated to Deno's assert style
// to match this package's test convention).
// Run: deno test --no-check apps/mobile/src/lib/chat-routing.test.ts
import { assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyChatRequest, detectsSaveRequest, routeForTurn, routeInstruction, type ChatRouteDecision } from "./chat-routing.ts";

Deno.test("classifyChatRequest: ordinary conversation stays on the least expensive lane", () => {
  assertEquals(classifyChatRequest("hello"), { route: "conversation", model: "deepseek-chat", searchWeb: false });
});

Deno.test("classifyChatRequest: learning is discipline-neutral and gets Flash thinking, not a premium model request", () => {
  const prompts = [
    "Explain eigenvectors geometrically",
    "Compare negligence and strict liability",
    "Debug this TypeScript recursion",
    "Analyze the symbolism in Beloved",
    "Derive the IS-LM equilibrium",
    "Teach me the renin-angiotensin system",
  ];
  for (const prompt of prompts) {
    const decision = classifyChatRequest(prompt);
    assertEquals(decision.route, "learning", prompt);
    assertEquals(decision.model, "deepseek-reasoner", prompt);
    assertEquals(decision.searchWeb, false, prompt);
    assertEquals(decision.reasoningEffort, undefined, prompt);
  }
});

Deno.test("classifyChatRequest: current-events and explicit-web prompts route to current + searchWeb", () => {
  assertEquals(classifyChatRequest("What is the latest Next.js release?"), {
    route: "current",
    model: "deepseek-reasoner",
    searchWeb: true,
  });
});

Deno.test("classifyChatRequest: research prompts get the premium reasoning effort", () => {
  assertEquals(classifyChatRequest("Write a literature review with peer-reviewed sources about urban heat islands"), {
    route: "research",
    model: "deepseek-reasoner",
    searchWeb: true,
    reasoningEffort: "high",
  });
});

Deno.test("routeInstruction: one line per route, mentioning its own framing", () => {
  assertMatch(routeInstruction("learning"), /learner's level/);
  assertMatch(routeInstruction("research"), /limitations/);
  assertMatch(routeInstruction("current"), /time-sensitive/);
  assertMatch(routeInstruction("conversation"), /directly/);
});

// ── Save requests keep the tools-capable model ───────────────────────────────
// The prompt list is copied VERBATIM from the web suite, which is the only thing
// that keeps this file the faithful copy its header claims to be. Each phrasing
// MUST leave on deepseek-chat — the only model whose tool calls ride — and must
// carry no high effort, or the write turns back into prose that saves nothing.

const SAVE_PROMPTS = [
  "make me flashcards on beta blockers",
  "make flashcards about the Krebs cycle",
  "create a deck for pharmacology",
  "build me a mind map of the RAAS pathway",
  "turn this into a mind map",
  "generate a practice test on ACE inhibitors",
  "I need flashcards on cellular respiration",
  "Flashcards on cellular respiration",
  "Slides about cellular respiration",
  "Study notes on cellular respiration",
  "Practice test on cellular respiration",
  "add these to my deck",
  "save this as a note",
  "save this to my library",
  "put my exam on my calendar",
  "add my exam to my calendar",
];

Deno.test("a save request routes to the model whose tools work", () => {
  for (const prompt of SAVE_PROMPTS) {
    assertEquals(detectsSaveRequest(prompt), true, prompt);
    const decision = classifyChatRequest(prompt);
    assertEquals(decision.model, "deepseek-chat", prompt);
    assertNotEquals(decision.route, "conversation", prompt);
    assertEquals(decision.reasoningEffort, undefined, prompt);
    assertEquals(decision.savesToWorkspace, true, prompt);
  }
});

Deno.test("a save about a current topic keeps live search AND the tools model", () => {
  const decision = classifyChatRequest("make flashcards about the latest COVID variants");
  assertEquals(decision.model, "deepseek-chat");
  assertEquals(decision.searchWeb, true);
  assertEquals(decision.savesToWorkspace, true);
});

Deno.test("ordinary learning and research requests are not saves", () => {
  // "write" is deliberately not a save verb, and the ambiguous nouns only count
  // when anchored to the student's own deck/library/notes/calendar. Otherwise
  // every "explain X" would lose the reasoner it needs.
  for (const prompt of [
    "explain how beta blockers work",
    "Write a literature review with peer-reviewed sources about urban heat islands",
    "write a test for this function",
    "what's on my schedule today",
    "Teach me the renin-angiotensin system",
    "Compare negligence and strict liability",
  ]) {
    assertEquals(detectsSaveRequest(prompt), false, prompt);
  }
  assertEquals(classifyChatRequest("explain how beta blockers work").model, "deepseek-reasoner");
  assertEquals(classifyChatRequest("explain how beta blockers work").savesToWorkspace, undefined);
});

// ── Deep research toggle vs a save ───────────────────────────────────────────

const FORCED_RESEARCH: ChatRouteDecision = {
  model: "deepseek-reasoner",
  reasoningEffort: "high",
  route: "research",
  searchWeb: true,
};

Deno.test("the Deep research toggle wins on an ordinary question", () => {
  assertEquals(routeForTurn("explain how beta blockers work", FORCED_RESEARCH), FORCED_RESEARCH);
});

Deno.test("a save beats the Deep research toggle, because research carries no tools", () => {
  // The toggle is a persistent switch the student may have flipped days ago;
  // "make me flashcards" is what they typed a second ago. Left the other way
  // round, the turn returns an essay and saves nothing, with no way to tell why.
  const decision = routeForTurn("make me flashcards on beta blockers", FORCED_RESEARCH);
  assertEquals(decision.model, "deepseek-chat");
  assertEquals(decision.savesToWorkspace, true);
  assertEquals(decision.reasoningEffort, undefined);
});

Deno.test("with the toggle off, routeForTurn is just the classifier", () => {
  for (const prompt of ["hello", "explain osmosis", ...SAVE_PROMPTS]) {
    assertEquals(routeForTurn(prompt, null), classifyChatRequest(prompt), prompt);
  }
});
