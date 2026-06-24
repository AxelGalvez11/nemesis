// Tests for the chat/completions request-body builder. The safety-critical case is the
// FIRST one: with no thinking field set, the body must carry neither `thinking` nor
// `reasoning_effort`, so the legacy/OpenAI request is unchanged when routing is off.
// Run: deno test supabase/functions/ask/llm.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  autoThinkingParams,
  buildChatBody,
  type ChatResponse,
  extractToolInput,
  forcedToolParams,
} from "./llm.ts";

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

// ---- callTool path helpers (thinking auto + forced fallback) ----

function resp(toolCalls?: Array<{ name: string; args: string }>, finish = "tool_calls"): ChatResponse {
  return {
    model: "m",
    choices: [{
      message: {
        content: null,
        tool_calls: toolCalls?.map((t, i) => ({ id: `c${i}`, type: "function", function: { name: t.name, arguments: t.args } })),
      },
      finish_reason: finish,
    }],
  };
}

Deno.test("forcedToolParams: thinking 'enabled' is coerced to 'disabled' and forces the tool (fallback guarantee)", () => {
  const p = forcedToolParams({ ...base, thinking: "enabled", reasoningEffort: "high" }, "compose_answer");
  assertEquals(p.thinking, "disabled");
  assertEquals(p.tool_choice, { type: "function", function: { name: "compose_answer" } });
});

Deno.test("forcedToolParams: OpenAI path keeps thinking undefined (field never sent)", () => {
  const p = forcedToolParams({ ...base }, "t");
  assertEquals(p.thinking, undefined);
  assertEquals(p.tool_choice, { type: "function", function: { name: "t" } });
});

Deno.test("autoThinkingParams: sets tool_choice 'auto' and leaves thinking enabled", () => {
  const p = autoThinkingParams({ ...base, thinking: "enabled" });
  assertEquals(p.tool_choice, "auto");
  assertEquals(p.thinking, "enabled");
});

Deno.test("extractToolInput: valid tool call -> ok with parsed input", () => {
  const r = extractToolInput<{ a: number }>(resp([{ name: "t", args: '{"a":1}' }]), "t");
  assert(r.ok);
  if (r.ok) assertEquals(r.input.a, 1);
});

Deno.test("extractToolInput: no tool call (prose answer) -> not ok", () => {
  assert(!extractToolInput(resp(undefined, "stop"), "t").ok);
});

Deno.test("extractToolInput: invalid JSON -> not ok", () => {
  assert(!extractToolInput(resp([{ name: "t", args: "{not json" }]), "t").ok);
});

Deno.test("extractToolInput: recovers JSON wrapped in ```json fences", () => {
  const r = extractToolInput<{ a: number }>(resp([{ name: "t", args: '```json\n{"a":2}\n```' }]), "t");
  assert(r.ok);
  if (r.ok) assertEquals(r.input.a, 2);
});
