// Deno unit tests (repo convention) for the phone's answer-effort dial —
// mirrors apps/web/lib/workspace/chat-effort.test.ts.
// Run: deno test --no-check apps/mobile/src/lib/chat-effort.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyChatEffort, CHAT_EFFORT_LABEL, CHAT_EFFORTS, DEFAULT_CHAT_EFFORT, isChatEffort } from "./chat-effort.ts";
import { classifyChatRequest } from "./chat-routing.ts";

Deno.test("instant drops to the cheap model and clears any routed thinking", () => {
  // The research route is the one that sets reasoningEffort itself — the case
  // where an explicit choice has to BEAT the route's guess rather than merge.
  const routed = classifyChatRequest("write a report with citations");
  assertEquals(routed.reasoningEffort, "high");
  const decided = applyChatEffort(routed, "instant");
  assertEquals(decided.model, "deepseek-chat");
  assertEquals(decided.reasoningEffort, undefined);
});

Deno.test("high asks for deep thinking without touching the routed model", () => {
  const routed = classifyChatRequest("Explain eigenvectors geometrically");
  const decided = applyChatEffort(routed, "high");
  assertEquals(decided.model, routed.model);
  assertEquals(decided.reasoningEffort, "high");
});

Deno.test("medium strips the research route's automatic high effort", () => {
  const decided = applyChatEffort(classifyChatRequest("write a report with citations"), "medium");
  assertEquals(decided.reasoningEffort, undefined);
});

Deno.test("web search survives every effort level — live sources aren't a compute choice", () => {
  const routed = classifyChatRequest("what is the latest news");
  assertEquals(routed.searchWeb, true);
  for (const effort of CHAT_EFFORTS) {
    assertEquals(applyChatEffort(routed, effort).searchWeb, true);
  }
});

Deno.test("applyChatEffort never mutates the decision it was handed", () => {
  const routed = classifyChatRequest("write a report with citations");
  const before = { ...routed };
  applyChatEffort(routed, "instant");
  assertEquals(routed, before);
});

Deno.test("the three levels are exactly what the menu renders, in order", () => {
  assertEquals(CHAT_EFFORTS, ["instant", "medium", "high"]);
  assertEquals(CHAT_EFFORTS.map((e) => CHAT_EFFORT_LABEL[e]), ["Instant", "Medium", "High"]);
});

Deno.test("isChatEffort guards a persisted/unknown value", () => {
  assertEquals(isChatEffort(DEFAULT_CHAT_EFFORT), true);
  assertEquals(isChatEffort("medium"), true);
  assertEquals(isChatEffort("turbo"), false);
  assertEquals(isChatEffort(null), false);
});
