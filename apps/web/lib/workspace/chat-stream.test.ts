import assert from "node:assert/strict";

import { completionDelta, readCompletionStream, readCompletionStreamFull, reasoningDelta } from "./chat-stream";

assert.equal(completionDelta('{"choices":[{"delta":{"content":"Hello"}}]}'), "Hello");
assert.equal(completionDelta("[DONE]"), "");
assert.equal(completionDelta("not-json"), "");

// reasoning_content is read off the same delta shape as content, independently.
assert.equal(reasoningDelta('{"choices":[{"delta":{"reasoning_content":"weighing"}}]}'), "weighing");
assert.equal(reasoningDelta('{"choices":[{"delta":{"content":"answer"}}]}'), "");
assert.equal(reasoningDelta("[DONE]"), "");
assert.equal(reasoningDelta("not-json"), "");

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

  // A deep turn streams reasoning_content BEFORE the answer's first word: the
  // reasoning callback accumulates across chunks, then the content callback
  // takes over. Split mid-line to prove the reader reassembles across chunks.
  const reasonLines = [
    'data: {"choices":[{"delta":{"reasoning_content":"This is a "}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning_content":"pharmacology question."}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"ACE"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" inhibitors."}}]}\n\ndata: [DONE]\n\n',
  ].join("");
  const cut = Math.floor(reasonLines.length / 2);
  const reasonStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(reasonLines.slice(0, cut)));
      controller.enqueue(encoder.encode(reasonLines.slice(cut)));
      controller.close();
    },
  });
  const thoughts: string[] = [];
  const words: string[] = [];
  const reasoned = await readCompletionStreamFull(
    reasonStream,
    (_delta, accumulated) => words.push(accumulated),
    (_delta, accumulated) => thoughts.push(accumulated),
  );
  assert.equal(reasoned.text, "ACE inhibitors.");
  assert.deepEqual(thoughts, ["This is a ", "This is a pharmacology question."]);
  assert.deepEqual(words, ["ACE", "ACE inhibitors."]);

  console.log("chat-stream.test.ts OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
