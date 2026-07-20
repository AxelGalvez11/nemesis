import assert from "node:assert/strict";

import { completionDelta, readCompletionStream, readCompletionStreamFull } from "./chat-stream";

assert.equal(completionDelta('{"choices":[{"delta":{"content":"Hello"}}]}'), "Hello");
assert.equal(completionDelta("[DONE]"), "");
assert.equal(completionDelta("not-json"), "");

void (async () => {
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
  assert.equal(await readCompletionStream(stream, (_delta, accumulated) => seen.push(accumulated)), "A precise answer.");
  assert.deepEqual(seen, ["A", "A precise", "A precise answer."]);

  // Tool-call deltas assemble by index across fragments (agent loop input).
  const toolLines = [
    '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search_library","arguments":""}}]}}]}',
    '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"query\\":"}}]}}]}',
    '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"ACE inhibitors\\"}"}}]}}]}',
    '{"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"list_study_decks","arguments":"{}"}}]}}]}',
  ];
  const rawSse = toolLines.map((line) => `data: ${line}\n\n`).join("") + "data: [DONE]\n\n";
  const middle = Math.floor(rawSse.length / 2);
  const toolStream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Split mid-line on purpose: the reader must reassemble across chunks.
      controller.enqueue(encoder.encode(rawSse.slice(0, middle)));
      controller.enqueue(encoder.encode(rawSse.slice(middle)));
      controller.close();
    },
  });
  const full = await readCompletionStreamFull(toolStream);
  assert.equal(full.text, "");
  assert.equal(full.toolCalls.length, 2);
  assert.deepEqual(full.toolCalls[0], { arguments: '{"query":"ACE inhibitors"}', id: "call_1", name: "search_library" });
  assert.deepEqual(full.toolCalls[1], { arguments: "{}", id: "call_2", name: "list_study_decks" });

  console.log("chat-stream.test.ts OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
