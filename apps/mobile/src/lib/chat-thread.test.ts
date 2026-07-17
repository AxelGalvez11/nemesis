// Deno unit tests (repo convention) for the chat-thread pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/chat-thread.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildWireMessages,
  CHAT_SYSTEM_PROMPT,
  chatErrorMessage,
  completionText,
  trimHistory,
  type ChatMsg,
} from "./chat-thread.ts";

const msg = (role: "assistant" | "user", content: string): ChatMsg => ({
  at: "2026-07-17T06:00:00Z",
  content,
  role,
});

Deno.test("trimHistory: keeps the most recent messages within the char budget", () => {
  const history = [msg("user", "a".repeat(100)), msg("assistant", "b".repeat(100)), msg("user", "c".repeat(100))];
  const trimmed = trimHistory(history, 220, 30);
  assertEquals(trimmed.map((m) => m.content[0]), ["b", "c"]);
});

Deno.test("trimHistory: always keeps at least the latest message, even over budget", () => {
  const history = [msg("user", "x".repeat(5000))];
  assertEquals(trimHistory(history, 100, 30).length, 1);
});

Deno.test("trimHistory: caps message count", () => {
  const history = Array.from({ length: 50 }, (_, i) => msg("user", `m${i}`));
  const trimmed = trimHistory(history, 100_000, 30);
  assertEquals(trimmed.length, 30);
  assertEquals(trimmed[29].content, "m49");
});

Deno.test("buildWireMessages: system first, history in order, new user text last", () => {
  const wire = buildWireMessages([msg("user", "hi"), msg("assistant", "hello")], "what next?");
  assertEquals(wire[0], { content: CHAT_SYSTEM_PROMPT, role: "system" });
  assertEquals(wire[1], { content: "hi", role: "user" });
  assertEquals(wire[2], { content: "hello", role: "assistant" });
  assertEquals(wire[3], { content: "what next?", role: "user" });
});

Deno.test("chatErrorMessage: budget, auth, server, and fallback shapes", () => {
  const budget = chatErrorMessage(429, { error: { code: "daily_token_budget_exhausted", message: "Daily token budget reached for the free plan. Upgrade or try again tomorrow." } });
  assertEquals(budget.includes("Daily token budget"), true);
  assertEquals(chatErrorMessage(401, null).includes("re-connect"), true);
  assertEquals(chatErrorMessage(502, null).includes("unreachable"), true);
  assertEquals(chatErrorMessage(400, { error: { message: "invalid chat.completions body" } }), "invalid chat.completions body");
  assertEquals(chatErrorMessage(400, null), "Something went wrong sending that. Try again.");
});

Deno.test("completionText: extracts assistant text, rejects empty/malformed", () => {
  assertEquals(completionText({ choices: [{ message: { content: "Answer." } }] }), "Answer.");
  assertEquals(completionText({ choices: [{ message: { content: "   " } }] }), null);
  assertEquals(completionText({ choices: [] }), null);
  assertEquals(completionText("nope"), null);
});
