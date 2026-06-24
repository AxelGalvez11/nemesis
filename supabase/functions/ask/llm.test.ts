// Tests for the chat/completions request-body builder. The safety-critical case is the
// FIRST one: with no thinking field set, the body must carry neither `thinking` nor
// `reasoning_effort`, so the legacy/OpenAI request is unchanged when routing is off.
// Run: deno test supabase/functions/ask/llm.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildChatBody } from "./llm.ts";

const base = {
  model: "m",
  max_tokens: 100,
  messages: [{ role: "user" as const, content: "hi" }],
};

Deno.test("buildChatBody: no thinking/effort fields by default (legacy shape preserved)", () => {
  const body = buildChatBody({ ...base });
  assert(!("thinking" in body), "must not emit thinking when unset");
  assert(!("reasoning_effort" in body), "must not emit reasoning_effort when unset");
  assertEquals(body.model, "m");
  assertEquals(body.max_tokens, 100);
  assertEquals(body.temperature, 1, "defaults temperature to 1");
});

Deno.test("buildChatBody: system message is prepended", () => {
  const body = buildChatBody({ ...base, system: "be safe" });
  const msgs = body.messages as Array<{ role: string; content: string }>;
  assertEquals(msgs[0], { role: "system", content: "be safe" });
  assertEquals(msgs[1], { role: "user", content: "hi" });
});

Deno.test("buildChatBody: thinking disabled emits {type:disabled}, no effort", () => {
  const body = buildChatBody({ ...base, thinking: "disabled" });
  assertEquals(body.thinking, { type: "disabled" });
  assert(!("reasoning_effort" in body));
});

Deno.test("buildChatBody: thinking enabled + effort emits both", () => {
  const body = buildChatBody({ ...base, thinking: "enabled", reasoningEffort: "high" });
  assertEquals(body.thinking, { type: "enabled" });
  assertEquals(body.reasoning_effort, "high");
});

Deno.test("buildChatBody: tools and tool_choice pass through", () => {
  const body = buildChatBody({
    ...base,
    tools: [{ name: "t", description: "d", parameters: { type: "object" } }],
    tool_choice: { type: "function", function: { name: "t" } },
  });
  const tools = body.tools as Array<{ type: string; function: { name: string } }>;
  assertEquals(tools[0].type, "function");
  assertEquals(tools[0].function.name, "t");
  assertEquals(body.tool_choice, { type: "function", function: { name: "t" } });
});

Deno.test("buildChatBody: explicit temperature is respected (0 for determinism)", () => {
  const body = buildChatBody({ ...base, temperature: 0 });
  assertEquals(body.temperature, 0);
});
