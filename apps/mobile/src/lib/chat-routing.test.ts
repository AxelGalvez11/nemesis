// Deno unit tests (repo convention) for the chat routing helpers — mirrors
// apps/web/lib/workspace/chat-routing.test.ts (translated to Deno's assert style
// to match this package's test convention).
// Run: deno test --no-check apps/mobile/src/lib/chat-routing.test.ts
import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyChatRequest, routeInstruction } from "./chat-routing.ts";

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
