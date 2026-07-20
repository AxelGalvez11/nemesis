// Deno unit tests (repo convention) for the SSE completion-stream parser —
// mirrors apps/web/lib/workspace/chat-stream.test.ts (translated to Deno's
// assert style + Deno.test to match this package's test convention).
// Run: deno test --no-check apps/mobile/src/lib/chat-stream.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { completionDelta, readCompletionStream } from "./chat-stream.ts";

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
