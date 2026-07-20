import assert from "node:assert/strict";

import { completionDelta, readCompletionStream } from "./chat-stream";

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

  console.log("chat-stream.test.ts OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
