// Deno unit tests (repo convention) for the SSE completion-stream parser —
// mirrors apps/web/lib/workspace/chat-stream.test.ts (translated to Deno's
// assert style + Deno.test to match this package's test convention).
// Run: deno test --no-check apps/mobile/src/lib/chat-stream.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { completionDelta, readCompletionStream, readCompletionStreamFull, reasoningDelta } from "./chat-stream.ts";

Deno.test("completionDelta: extracts delta content, ignores [DONE] and malformed JSON", () => {
  assertEquals(completionDelta('{"choices":[{"delta":{"content":"Hello"}}]}'), "Hello");
  assertEquals(completionDelta("[DONE]"), "");
  assertEquals(completionDelta("not-json"), "");
  assertEquals(completionDelta(""), "");
});

Deno.test("readCompletionStream: reassembles SSE chunks that split mid-line, ignores [DONE]", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"cho',
    'ices":[{"delta":{"content":" precise"}}]}\r\n',
    'data: {"choices":[{"delta":{"content":" answer."}}]}\n\ndata: [DONE]\n\n',
  ];
  const seen: string[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const text = await readCompletionStream(stream, (_delta, accumulated) => seen.push(accumulated));
  assertEquals(text, "A precise answer.");
  assertEquals(seen, ["A", "A precise", "A precise answer."]);
});

Deno.test("readCompletionStream: a null body resolves to an empty string", async () => {
  assertEquals(await readCompletionStream(null), "");
});

Deno.test("reasoningDelta: reads the model's working-out, tolerates turns without it", () => {
  assertEquals(reasoningDelta('{"choices":[{"delta":{"reasoning_content":"Okay, so"}}]}'), "Okay, so");
  // An Instant turn runs with thinking disabled — content only, no reasoning.
  assertEquals(reasoningDelta('{"choices":[{"delta":{"content":"Hello"}}]}'), "");
  // The valve appends a usage chunk whose `choices` array is empty.
  assertEquals(reasoningDelta('{"choices":[],"usage":{"total_tokens":42}}'), "");
  assertEquals(reasoningDelta("[DONE]"), "");
  assertEquals(reasoningDelta("not-json"), "");
});

Deno.test("readCompletionStream: reasoning accumulates separately and never leaks into the answer", async () => {
  const encoder = new TextEncoder();
  // The real shape of a deep turn: reasoning streams first, the answer follows.
  const chunks = [
    'data: {"choices":[{"delta":{"reasoning_content":"Okay, this is "}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning_content":"a pharmacology question."}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"ACE inhibitors"}}]}\n\n',
    'data: {"choices":[],"usage":{"total_tokens":99}}\n\ndata: [DONE]\n\n',
  ];
  const thoughts: string[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const text = await readCompletionStream(stream, undefined, (_delta, accumulated) => thoughts.push(accumulated));
  // The returned answer is the ANSWER — reasoning must never contaminate it.
  assertEquals(text, "ACE inhibitors");
  assertEquals(thoughts, ["Okay, this is ", "Okay, this is a pharmacology question."]);
});

Deno.test("readCompletionStream: a turn with no reasoning simply never calls the handler", async () => {
  const encoder = new TextEncoder();
  const thoughts: string[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });
  assertEquals(await readCompletionStream(stream, undefined, (_d, a) => thoughts.push(a)), "Hi");
  assertEquals(thoughts, []);
});

// ── tool calls ───────────────────────────────────────────────────────────────
// Tool calls arrive in FRAGMENTS: id and name once, arguments a few characters at
// a time, keyed by index, and a model may open several at once and interleave
// them. Every test below is a shape the live provider actually sends.

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

Deno.test("readCompletionStreamFull: assembles one tool call from its fragments", async () => {
  const result = await readCompletionStreamFull(
    streamOf([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"add_flashcards","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"deck_name\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Pharm\\"}"}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ]),
  );
  assertEquals(result.text, "");
  assertEquals(result.toolCalls.length, 1);
  assertEquals(result.toolCalls[0]?.id, "call_1");
  assertEquals(result.toolCalls[0]?.name, "add_flashcards");
  assertEquals(result.toolCalls[0]?.arguments, '{"deck_name":"Pharm"}');
});

Deno.test("readCompletionStreamFull: two interleaved calls stay separate and in order", async () => {
  // Keyed by index, NOT by arrival order — fragments for call 1 land between
  // fragments for call 0, and concatenating them blindly would produce one
  // corrupt argument string.
  const result = await readCompletionStreamFull(
    streamOf([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"search_library","arguments":"{\\"query\\""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"list_study_decks","arguments":"{"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"ACE\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"}"}}]}}]}\n\n',
    ]),
  );
  assertEquals(result.toolCalls.map((call) => call.name), ["search_library", "list_study_decks"]);
  assertEquals(result.toolCalls[0]?.arguments, '{"query":"ACE"}');
  assertEquals(result.toolCalls[1]?.arguments, "{}");
});

Deno.test("readCompletionStreamFull: text and a tool call can arrive on the same turn", async () => {
  const seen: string[] = [];
  const result = await readCompletionStreamFull(
    streamOf([
      'data: {"choices":[{"delta":{"content":"Let me check."}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"search_library","arguments":"{}"}}]}}]}\n\n',
    ]),
    (_delta, accumulated) => seen.push(accumulated),
  );
  assertEquals(result.text, "Let me check.");
  assertEquals(seen, ["Let me check."]);
  assertEquals(result.toolCalls.length, 1);
});

Deno.test("readCompletionStreamFull: a fragment with no name is dropped, not dispatched", async () => {
  // A truncated turn can leave an index with arguments and no function name.
  // Passing that on would call the tool "" and surface "Unknown tool ''".
  const result = await readCompletionStreamFull(
    streamOf(['data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}\n\n']),
  );
  assertEquals(result.toolCalls, []);
});

Deno.test("readCompletionStreamFull: an index-less fragment is treated as call 0", async () => {
  // Some providers omit `index` when there is only one call.
  const result = await readCompletionStreamFull(
    streamOf(['data: {"choices":[{"delta":{"tool_calls":[{"id":"d","function":{"name":"add_mindmap","arguments":"{}"}}]}}]}\n\n']),
  );
  assertEquals(result.toolCalls.length, 1);
  assertEquals(result.toolCalls[0]?.name, "add_mindmap");
});

Deno.test("readCompletionStreamFull: a plain answer reports no tool calls", async () => {
  const result = await readCompletionStreamFull(
    streamOf(['data: {"choices":[{"delta":{"content":"Just words."}}]}\n\ndata: [DONE]\n\n']),
  );
  assertEquals(result.text, "Just words.");
  assertEquals(result.toolCalls, []);
});

Deno.test("readCompletionStreamFull: a null body is empty on both fields", async () => {
  assertEquals(await readCompletionStreamFull(null), { text: "", toolCalls: [] });
});

Deno.test("readCompletionStream still returns text only, tools or not", async () => {
  // The live-notes and recording paths call this one and must be unaffected.
  const text = await readCompletionStream(
    streamOf([
      'data: {"choices":[{"delta":{"content":"Notes."}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"e","function":{"name":"search_library","arguments":"{}"}}]}}]}\n\n',
    ]),
  );
  assertEquals(text, "Notes.");
});
