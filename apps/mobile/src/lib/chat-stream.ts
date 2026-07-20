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
  delta?: { content?: unknown };
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
 * Consume an OpenAI-compatible server-sent-event response without assuming
 * network chunks align to lines. Returns the exact accumulated assistant text.
 */
export async function readCompletionStream(
  body: ReadableStream<Uint8Array> | null,
  onDelta?: CompletionDeltaHandler,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trimEnd();
    if (!line.startsWith("data:")) return;
    const delta = completionDelta(line.slice(5).trimStart());
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
