import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { DEFAULT_INTENT, type ChatIntent } from "@nemesis/shared";
import { decisionFromIntent, routeForTurn, routeInstruction, type ChatRouteDecision } from "./chat-routing.ts";

// 🔴 WHAT THIS FILE STOPPED TESTING. It used to assert that "hello" classified as conversation,
// that "What is the latest Next.js release?" bought a search, that "make me flashcards on beta
// blockers" was a save. Those were pinning thirteen regexes that were a SECOND COPY of the web
// classifier — and one of them had already drifted from its twin, so the same question behaved
// differently on the two surfaces and nothing could catch it. The reading now happens once, in
// @nemesis/shared, and the phrasings are exercised against the live model by
// apps/web/scripts/chat-intent-acceptance.mts.
//
// What is left is what this file still owns: how the Deep research toggle interacts with a save.

const intent = (over: Partial<ChatIntent>): ChatIntent => ({ ...DEFAULT_INTENT, ...over });

const FORCED_RESEARCH: ChatRouteDecision = {
  model: "deepseek-reasoner",
  reasoningEffort: "high",
  route: "research",
  searchWeb: true,
};

Deno.test("routeInstruction: one line per route, mentioning its own framing", () => {
  assertEquals(routeInstruction("conversation").includes("naturally"), true);
  assertEquals(routeInstruction("learning").includes("learner's level"), true);
  assertEquals(routeInstruction("current").includes("time-sensitive"), true);
  assertEquals(routeInstruction("research").includes("limitations"), true);
});

Deno.test("the Deep research toggle wins on an ordinary question", () => {
  assertEquals(routeForTurn(intent({ mode: "learning" }), FORCED_RESEARCH), FORCED_RESEARCH);
});

// Deep research runs on the reasoner, which carries no tools — so a save left under the toggle
// would produce an essay and write nothing, with no way for the student to tell why. The toggle is
// a preference they may have flipped days ago; the save is what they typed a second ago.
Deno.test("a save beats the Deep research toggle, because research carries no tools", () => {
  const decision = routeForTurn(intent({ mode: "learning", workspace: "write" }), FORCED_RESEARCH);
  assertEquals(decision.model, "deepseek-chat");
  assertEquals(decision.savesToWorkspace, true);
  assertEquals(decision.reasoningEffort, undefined);
});

// A workspace READ is not a save, so the toggle still wins there — deep research about their own
// notes is a coherent thing to ask for, and it does not silently fail the way a write would.
Deno.test("a workspace read does not beat the toggle", () => {
  assertEquals(routeForTurn(intent({ workspace: "read" }), FORCED_RESEARCH), FORCED_RESEARCH);
});

Deno.test("with the toggle off, routeForTurn is just the decision", () => {
  for (const workspace of ["none", "read", "write"] as const) {
    const read = intent({ mode: "learning", workspace });
    assertEquals(routeForTurn(read, null), decisionFromIntent(read), workspace);
  }
});
