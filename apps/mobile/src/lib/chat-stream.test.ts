// Deno unit tests (repo convention) for the SSE completion-stream parser —
// mirrors apps/web/lib/workspace/chat-stream.test.ts (translated to Deno's
// assert style + Deno.test to match this package's test convention).
// Run: deno test --no-check apps/mobile/src/lib/chat-stream.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { completionDelta, readCompletionStream, reasoningDelta } from "./chat-stream.ts";

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
