import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ANTHROPIC_VERSION,
  anthropicHeaders,
  fromAnthropicResponse,
  sseFromCompletion,
  toAnthropicRequest,
} from "./anthropic-adapter.ts";

const conversation = () => ({
  max_tokens: 4096,
  messages: [
    { content: "You are Nemesis.", role: "system" },
    { content: "Does my lecture still match practice?", role: "user" },
    {
      content: "",
      role: "assistant",
      tool_calls: [{ function: { arguments: '{"query":"anticoagulants"}', name: "search_library" }, id: "call_a1", type: "function" }],
    },
    { content: '{"notes":[{"title":"Lecture 6"}]}', role: "tool", tool_call_id: "call_a1" },
    {
      content: "",
      role: "assistant",
      tool_calls: [{ function: { arguments: '{"query":"guideline"}', name: "search_web" }, id: "call_b2", type: "function" }],
    },
    { content: '{"found":1}', role: "tool", tool_call_id: "call_b2" },
  ],
  model: "deepseek-v4-flash",
  tools: [{ function: { description: "Search notes", name: "search_library", parameters: { properties: {}, type: "object" } }, type: "function" }],
});

Deno.test("the headers are Anthropic's, not OpenAI's", () => {
  const headers = anthropicHeaders("sk-ant-test");
  assertEquals(headers["x-api-key"], "sk-ant-test");
  assertEquals(headers["anthropic-version"], ANTHROPIC_VERSION);
  // 🔴 The exact defect: the valve sent `Authorization: Bearer`, which Anthropic
  // does not accept on /v1/messages.
  assertEquals("Authorization" in headers, false);
});

Deno.test("the system prompt leaves messages and becomes a top-level field", () => {
  const request = toAnthropicRequest(conversation(), "claude-sonnet-4-6");
  assertEquals(request.system, "You are Nemesis.");
  const messages = request.messages as { role: string }[];
  assert(messages.every((message) => message.role !== "system"), "a system role survived into messages");
});

Deno.test("tool calls become tool_use blocks and results become tool_result in a user turn", () => {
  const messages = toAnthropicRequest(conversation(), "claude-sonnet-4-6").messages as { role: string; content: Record<string, unknown>[] }[];
  const use = messages.flatMap((message) => message.content).filter((block) => block.type === "tool_use");
  assertEquals(use.map((block) => block.id), ["call_a1", "call_b2"]);
  assertEquals(use[0].name, "search_library");
  // Arguments arrive as a JSON STRING from OpenAI and must be an OBJECT here.
  assertEquals(use[0].input, { query: "anticoagulants" });

  const results = messages.flatMap((message) => message.content).filter((block) => block.type === "tool_result");
  assertEquals(results.map((block) => block.tool_use_id), ["call_a1", "call_b2"]);
  // Anthropic has no tool role — a result belongs to the USER turn.
  const resultTurn = messages.find((message) => message.content.some((block) => block.type === "tool_result"));
  assertEquals(resultTurn?.role, "user");
});

Deno.test("no two consecutive turns share a role", () => {
  const messages = toAnthropicRequest(conversation(), "claude-sonnet-4-6").messages as { role: string }[];
  for (let index = 1; index < messages.length; index += 1) {
    assert(messages[index].role !== messages[index - 1].role, `two ${messages[index].role} turns in a row at ${index}`);
  }
});

Deno.test("tools are translated to input_schema, and max_tokens is always present", () => {
  const request = toAnthropicRequest(conversation(), "claude-sonnet-4-6");
  const tools = request.tools as Record<string, unknown>[];
  assertEquals(tools[0].name, "search_library");
  assert("input_schema" in tools[0], "Anthropic wants input_schema, not parameters");
  assertEquals(request.max_tokens, 4096);
  // Required by Anthropic and optional in OpenAI — a body without it 400s.
  assert(typeof (toAnthropicRequest({ messages: [] }, "claude-sonnet-4-6").max_tokens) === "number");
});

Deno.test("malformed tool arguments do not abort the failover", () => {
  const request = toAnthropicRequest({
    messages: [{ content: "", role: "assistant", tool_calls: [{ function: { arguments: "{not json", name: "x" }, id: "c1" }] }],
  }, "claude-sonnet-4-6");
  const block = (request.messages as { content: Record<string, unknown>[] }[])[0].content[0];
  assertEquals(block.input, {}, "an unparseable argument becomes empty, not an exception");
});

Deno.test("the response comes back in the OpenAI shape the rest of the valve reads", () => {
  const completion = fromAnthropicResponse({
    content: [
      { text: "Your lecture still matches [1].", type: "text" },
      { id: "toolu_9", input: { query: "warfarin" }, name: "search_web", type: "tool_use" },
    ],
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    usage: { cache_read_input_tokens: 40, input_tokens: 120, output_tokens: 30 },
  });
  const choice = (completion.choices as Record<string, unknown>[])[0];
  const message = choice.message as Record<string, unknown>;
  assertEquals(message.content, "Your lecture still matches [1].");
  assertEquals(choice.finish_reason, "tool_calls", "tool_use maps to the OpenAI finish reason");
  const calls = message.tool_calls as Record<string, unknown>[];
  assertEquals(calls[0].id, "toolu_9");
  // Arguments must be a STRING again — that is what executeAgentTool parses.
  assertEquals((calls[0].function as Record<string, unknown>).arguments, '{"query":"warfarin"}');
  // The meter reads these exact names; wrong names would silently bill an estimate.
  assertEquals(completion.usage, { completion_tokens: 30, prompt_cache_hit_tokens: 40, prompt_tokens: 120, total_tokens: 150 });
});

Deno.test("a plain answer maps to a stop finish reason and no tool calls", () => {
  const completion = fromAnthropicResponse({ content: [{ text: "Hello.", type: "text" }], stop_reason: "end_turn" });
  const choice = (completion.choices as Record<string, unknown>[])[0];
  assertEquals(choice.finish_reason, "stop");
  assertEquals("tool_calls" in (choice.message as Record<string, unknown>), false);
});

Deno.test("a garbage payload degrades rather than throwing", () => {
  for (const payload of [null, undefined, {}, { content: "not an array" }]) {
    const completion = fromAnthropicResponse(payload);
    assertEquals(((completion.choices as Record<string, unknown>[])[0].message as Record<string, unknown>).content, null);
  }
});

Deno.test("a streaming client gets a well-formed OpenAI stream, not a different protocol", () => {
  const completion = fromAnthropicResponse({
    content: [{ text: "Answer.", type: "text" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5 },
  });
  const sse = sseFromCompletion(completion);
  assert(sse.endsWith("data: [DONE]\n\n"));
  const frames = sse.split("\n\n").filter(Boolean).map((line) => line.replace(/^data: /, ""));
  assertEquals(frames[frames.length - 1], "[DONE]");
  assertEquals(JSON.parse(frames[0]).choices[0].delta.content, "Answer.");
  // The meter scrapes total_tokens out of the tail of the stream; without a
  // usage frame an outage turn would be billed at the length/4 estimate.
  assertEquals(JSON.parse(frames[1]).usage.total_tokens, 15);
});
