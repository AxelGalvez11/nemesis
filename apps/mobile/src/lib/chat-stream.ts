// SSE (server-sent-event) parser for chat/completions streaming — ported from
// apps/web/lib/workspace/chat-stream.ts (cloud-first pivot, phone chat §6).
// Keep in sync with the web original.
//
// On the phone this consumes the `ReadableStream<Uint8Array>` returned by
// `expo/fetch`'s Response.body (SDK 56 ships a spec-compliant Response/
// ReadableStream/TextDecoder via its "winter" runtime — the same shape a
// browser gives web — so this file needs no RN-specific adaptation).

export type CompletionDeltaHandler = (delta: string, accumulated: string) => void;

interface StreamChoice {
  delta?: { content?: unknown; reasoning_content?: unknown };
}
/** Extract visible text from one OpenAI-compatible SSE data payload. */
export function completionDelta(data: string): string {
  if (!data || data === "[DONE]") return "";
  try {
    const parsed = JSON.parse(data) as { choices?: StreamChoice[] };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

/**
 * Extract the model's own working-out from one SSE payload.
 *
 * A deep turn streams `reasoning_content` for several seconds BEFORE the first
 * word of the answer (measured against the live engine: first reasoning at
 * ~0.5s, first answer word at ~4.5s), which is the gap the thinking preview
 * exists to fill. The metering valve forwards provider bytes untouched, so this
 * arrives on the phone already — no backend change is involved in reading it.
 *
 * Returns "" for every turn that has none: an Instant turn runs with thinking
 * disabled, and a provider we fail over to may not report it at all. Callers
 * MUST treat empty as normal and fall back to the phase line.
 */
export function reasoningDelta(data: string): string {
  if (!data || data === "[DONE]") return "";
  try {
    const parsed = JSON.parse(data) as { choices?: StreamChoice[] };
    const reasoning = parsed.choices?.[0]?.delta?.reasoning_content;
    return typeof reasoning === "string" ? reasoning : "";
  } catch {
    return "";
  }
}

/**
 * Consume an OpenAI-compatible server-sent-event response without assuming
 * network chunks align to lines. Returns the exact accumulated assistant text.
 */
export async function readCompletionStream(
  body: ReadableStream<Uint8Array> | null,
  onDelta?: CompletionDeltaHandler,
  onReasoning?: CompletionDeltaHandler,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let reasoning = "";

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trimEnd();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trimStart();
    // Reasoning first: a chunk carries one or the other, and the reasoning
    // stream runs out before the answer's first chunk arrives.
    if (onReasoning) {
      const thought = reasoningDelta(payload);
      if (thought) {
        reasoning += thought;
        onReasoning(thought, reasoning);
      }
    }
    const delta = completionDelta(payload);
    if (!delta) return;
    accumulated += delta;
    onDelta?.(delta, accumulated);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    if (buffer) consumeLine(buffer);
    return accumulated;
  } finally {
    reader.releaseLock();
  }
}
