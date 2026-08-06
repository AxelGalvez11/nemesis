import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_TOOLS, executeAgentTool } from "./agent-tools";
import { appendToolRound, completionPayload, completionReasoning, WIRE_MODEL, type ChatReply, type WireMsg } from "./chat-api";
import { classifyChatRequest } from "./chat-routing";
import { readCompletionStreamFull } from "./chat-stream";

// The DeepSeek V4 thinking-mode contract, pinned against the shape production
// actually sends (owner 2026-08-06: test "the exact model, endpoint, SDK
// adapter, and streaming path used in production — not against generic
// tool-calling assumptions").
//
// 🔴 WHAT THIS FILE CANNOT DO, stated first so nobody mistakes it for the gate:
// it does not talk to DeepSeek. It proves that OUR side of the contract is
// correct and stays correct — the fields we send, the ids we pair, the deltas we
// keep — using a stream shaped exactly like V4's. Whether the provider ACCEPTS
// that shape is only answerable by asking it, which is scripts/deepseek-v4-gate.mts
// and needs a device key.
//
// The sequence below is four rounds because the historical bug lived BETWEEN
// rounds: a single successful tool call proves nothing about the field that has
// to survive into round two.

const reply = (text: string | null, reasoning: string, calls: { id: string; name: string; arguments: string }[]): ChatReply => ({
  errorKind: null,
  errorText: null,
  reasoning,
  sources: [],
  text,
  toolCalls: calls,
});

const assistantAt = (messages: WireMsg[], index: number) => messages.filter((message) => message.role === "assistant")[index]!;

/** Library search → web search → refined web search → final cited answer. */
function fourRounds(): WireMsg[] {
  let messages: WireMsg[] = [
    { content: "system", role: "system" },
    { content: "Does my lecture on anticoagulants still match current practice?", role: "user" },
  ];
  messages = appendToolRound(
    messages,
    reply(null, "THOUGHT-1", [{ arguments: '{"query":"anticoagulants"}', id: "call_aaa1", name: "search_library" }]),
    [{ arguments: '{"query":"anticoagulants"}', id: "call_aaa1", name: "search_library" }],
    [{ id: "call_aaa1", result: { notes: [{ path: "Pharm/Lecture 6.md", snippet: "target INR 2-3", title: "Lecture 6" }] } }],
  );
  messages = appendToolRound(
    messages,
    reply(null, "THOUGHT-2", [{ arguments: '{"query":"warfarin INR target guideline"}', id: "call_bbb2", name: "search_web" }]),
    [{ arguments: '{"query":"warfarin INR target guideline"}', id: "call_bbb2", name: "search_web" }],
    [{ id: "call_bbb2", result: { found: 1, results: "1. A guideline" } }],
  );
  messages = appendToolRound(
    messages,
    reply(null, "THOUGHT-3", [{ arguments: '{"query":"2026 anticoagulation guideline INR range update"}', id: "call_ccc3", name: "search_web" }]),
    [{ arguments: '{"query":"2026 anticoagulation guideline INR range update"}', id: "call_ccc3", name: "search_web" }],
    [{ id: "call_ccc3", result: { found: 2, results: "2. A newer guideline" } }],
  );
  return messages;
}

// (1) The complete assistant turn rides back: reasoning, content, tool calls.
test("every round echoes reasoning_content, content and tool_calls together", () => {
  const messages = fourRounds();
  const first = assistantAt(messages, 0);
  assert.equal(first.reasoning_content, "THOUGHT-1");
  assert.equal(first.content, "");
  assert.deepEqual(first.tool_calls?.map((call) => call.function.name), ["search_library"]);
  assert.equal(first.tool_calls?.[0]?.type, "function");
});

// (2) 🔴 THE HISTORICAL BUG. Round four must still carry round one's reasoning.
// Thinking mode requires the reasoning that preceded a tool call to be
// concatenated back on EVERY subsequent round — not just the next one.
test("reasoning from every earlier round survives to the final round", () => {
  const messages = fourRounds();
  const carried = messages.filter((message) => message.role === "assistant").map((message) => message.reasoning_content);
  assert.deepEqual(carried, ["THOUGHT-1", "THOUGHT-2", "THOUGHT-3"]);
  // And unchanged — echoed, never re-summarised or trimmed.
  assert.equal(assistantAt(messages, 0).reasoning_content, "THOUGHT-1");
});

test("a non-thinking round sends no reasoning_content field at all", () => {
  const messages = appendToolRound(
    [],
    reply(null, "", [{ arguments: "{}", id: "call_x", name: "search_library" }]),
    [{ arguments: "{}", id: "call_x", name: "search_library" }],
    [{ id: "call_x", result: {} }],
  );
  assert.ok(!("reasoning_content" in assistantAt(messages, 0)), "an empty field is a field the provider never asked for");
});

// (3) Ids pair a result to its call. Position does not.
test("tool-call ids are preserved and pair results by id, not by order", () => {
  const messages = fourRounds();
  const ids = messages.filter((message) => message.role === "assistant").flatMap((message) => message.tool_calls?.map((call) => call.id) ?? []);
  assert.deepEqual(ids, ["call_aaa1", "call_bbb2", "call_ccc3"]);
  assert.deepEqual(messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id), ids);
});

test("two tools in one round keep their own ids even when results resolve out of order", () => {
  const calls = [
    { arguments: '{"query":"a"}', id: "call_first", name: "search_library" },
    { arguments: '{"query":"b"}', id: "call_second", name: "search_web" },
  ];
  // The executor resolves these concurrently; the slower one can land first.
  const messages = appendToolRound([], reply(null, "T", calls), calls, [
    { id: "call_second", result: { found: 1 } },
    { id: "call_first", result: { notes: [] } },
  ]);
  const paired = messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id);
  assert.deepEqual(paired, ["call_second", "call_first"], "each result carries its OWN call id");
  assert.equal(new Set(paired).size, 2, "no id is reused");
});

// (4) Thinking mode rejects a forced tool choice — the provider says so in as
// many words ("Thinking mode does not support this tool_choice").
test("no route ever sends tool_choice", () => {
  for (const ask of ["explain osmosis", "hello", "what is due this week", "make me flashcards on ACE inhibitors"]) {
    const payload = completionPayload([], classifyChatRequest(ask, ""), { tools: AGENT_TOOLS });
    assert.ok(!("tool_choice" in payload), `${ask} sent tool_choice`);
    assert.ok(!("function_call" in payload), `${ask} sent the legacy function_call`);
  }
});

test("the final tool-free round omits tools entirely rather than sending an empty list", () => {
  const payload = completionPayload([], classifyChatRequest("hello", ""), { tools: [] });
  assert.ok(!("tools" in payload), "an empty array is a different request from no tools");
});

// 🔴 THE CLIENT NO LONGER ASKS FOR ANYTHING (owner 2026-08-06: "The client must
// not be trusted to authorize an expensive model by sending effort: high").
// Every route sends the same constant model and no effort field at all; the
// gateway classifies the student's words and decides. The old version of this
// test asserted that High set `reasoning_effort` — true of a value no composer
// could produce, since the effort pill went in July and Medium stripped it.
test("no route sends an effort field or a varying model", () => {
  for (const ask of ["explain osmosis", "hello", "write a literature review with citations", "reorganize my whole semester"]) {
    const payload = completionPayload([], classifyChatRequest(ask, ""), { tools: AGENT_TOOLS });
    assert.ok(!("reasoning_effort" in payload), `${ask} asked for an effort level`);
    assert.ok(!("reasoning" in payload), `${ask} asked for an effort level`);
    assert.ok(!("thinking" in payload), `${ask} chose a thinking mode`);
    assert.equal(payload.model, WIRE_MODEL, `${ask} chose its own model`);
  }
});

// (5) Arguments are generated text and are validated before anything runs.
test("malformed or hostile tool arguments never reach an executor", async () => {
  for (const args of ["", "not json", "null", "[1,2,3]", '"a string"', '{"query":{"$ne":null}}']) {
    const result = await executeAgentTool({ arguments: args, id: "call_bad", name: "search_web" }, {
      searchWeb: async () => { throw new Error("the executor must not have been reached"); },
    });
    assert.ok(result && typeof result === "object" && "error" in result, `${args} was not refused`);
  }
});

test("a tool never throws — a failure comes back as data the model can react to", async () => {
  const result = await executeAgentTool({ arguments: '{"query":"anything"}', id: "call_boom", name: "search_web" }, {
    searchWeb: async () => { throw new Error("provider exploded"); },
  });
  assert.ok(result && typeof result === "object" && "error" in result);
});

test("an empty search is reported as empty, never as an answer", async () => {
  const result = await executeAgentTool({ arguments: '{"query":"nothing matches"}', id: "call_none", name: "search_web" }, {
    searchWeb: async () => [],
  }) as Record<string, unknown>;
  assert.equal(result.found, 0);
  assert.match(String(result.warning), /could not be checked|search again/i);
});

// (7) The streaming path, shaped like a real V4 thinking-mode tool round:
// reasoning deltas first, then tool-call fragments split mid-argument.
const V4_TOOL_STREAM = [
  '{"choices":[{"delta":{"reasoning_content":"The student asks about "}}]}',
  '{"choices":[{"delta":{"reasoning_content":"their own lecture."}}]}',
  '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9f2","function":{"name":"search_library","arguments":"{\\"query\\":"}}]}}]}',
  '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"anticoagulants\\"}"}}]}}]}',
  '{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
].map((line) => `data: ${line}\n\n`).join("") + "data: [DONE]\n\n";

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      // One byte at a time: SSE arrives in arbitrary chunks and a parser that
      // only works on whole lines passes a friendlier fixture and fails live.
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
}

test("a streamed thinking tool round keeps reasoning and reassembles split arguments", async () => {
  const result = await readCompletionStreamFull(streamOf(V4_TOOL_STREAM));
  assert.equal(result.reasoning, "The student asks about their own lecture.");
  assert.equal(result.text, "", "reasoning is never mistaken for the answer");
  assert.deepEqual(result.toolCalls, [{ arguments: '{"query":"anticoagulants"}', id: "call_9f2", name: "search_library" }]);
  // The reassembled arguments must be parseable — that is what the executor gets.
  assert.deepEqual(JSON.parse(result.toolCalls[0]!.arguments), { query: "anticoagulants" });
});

test("the final answer round streams text while keeping its reasoning separate", async () => {
  const stream = [
    '{"choices":[{"delta":{"reasoning_content":"Comparing the two."}}]}',
    '{"choices":[{"delta":{"content":"Your lecture says INR 2-3"}}]}',
    '{"choices":[{"delta":{"content":" [1]."}}]}',
    '{"choices":[{"delta":{},"finish_reason":"stop"}]}',
  ].map((line) => `data: ${line}\n\n`).join("") + "data: [DONE]\n\n";
  const seen: string[] = [];
  const result = await readCompletionStreamFull(streamOf(stream), (delta) => seen.push(delta));
  assert.equal(result.text, "Your lecture says INR 2-3 [1].");
  assert.equal(result.reasoning, "Comparing the two.");
  // 🔴 The delta handler is what paints the screen. Reasoning reaching it would
  // put the model's private thinking into the student's answer bubble.
  assert.deepEqual(seen, ["Your lecture says INR 2-3", " [1]."]);
  assert.equal(seen.join("").includes("Comparing"), false);
});

test("the non-streamed path reads reasoning from the message, and tolerates its absence", () => {
  assert.equal(completionReasoning({ choices: [{ message: { content: "hi", reasoning_content: "THOUGHT" } }] }), "THOUGHT");
  assert.equal(completionReasoning({ choices: [{ message: { content: "hi" } }] }), "", "a non-thinking model sends no such field");
  assert.equal(completionReasoning(null), "");
  assert.equal(completionReasoning({ choices: [] }), "");
});

console.log("deepseek-v4-thinking.test.ts OK");
