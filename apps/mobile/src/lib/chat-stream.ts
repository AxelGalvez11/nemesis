// SSE (server-sent-event) parser for chat/completions streaming — ported from
// apps/web/lib/workspace/chat-stream.ts (cloud-first pivot, phone chat §6).
// Keep in sync with the web original.
//
// On the phone this consumes the `ReadableStream<Uint8Array>` returned by
// `expo/fetch`'s Response.body (SDK 56 ships a spec-compliant Response/
// ReadableStream/TextDecoder via its "winter" runtime — the same shape a
// browser gives web — so this file needs no RN-specific adaptation).

export type CompletionDeltaHandler = (delta: string, accumulated: string) => void;

/** One assembled tool call from a completed stream.
 *
 *  OpenAI streams these in FRAGMENTS: the `id` and function `name` arrive once, on
 *  whichever chunk happens to carry them, while `arguments` comes through a few
 *  characters at a time and has to be concatenated. Fragments are keyed by `index`
 *  because a model may open several calls at once and interleave their chunks.
 *  Assembling by index — rather than assuming one call, or assuming order — is the
 *  whole job of the parser below. */
export interface StreamedToolCall {
  id: string;
  name: string;
  /** Raw JSON string as the model wrote it; parsed by the executor, not here. */
  arguments: string;
}

export interface CompletionStreamResult {
  text: string;
  toolCalls: StreamedToolCall[];
}

interface RawToolCallDelta {
  index?: number;
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

interface StreamChoice {
  delta?: { content?: unknown; reasoning_content?: unknown; tool_calls?: RawToolCallDelta[] };
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
 * network chunks align to lines. Returns the exact accumulated assistant text
 * plus any tool calls the model streamed (an empty array for a plain answer).
 */
export async function readCompletionStreamFull(
  body: ReadableStream<Uint8Array> | null,
  onDelta?: CompletionDeltaHandler,
  onReasoning?: CompletionDeltaHandler,
): Promise<CompletionStreamResult> {
  if (!body) return { text: "", toolCalls: [] };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let reasoning = "";
  const toolCalls = new Map<number, StreamedToolCall>();

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
    if (!payload || payload === "[DONE]") return;
    let parsed: { choices?: StreamChoice[] } | null = null;
    try {
      parsed = JSON.parse(payload) as { choices?: StreamChoice[] };
    } catch {
      return;
    }
    const delta = parsed?.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content) {
      accumulated += delta.content;
      onDelta?.(delta.content, accumulated);
    }
    for (const fragment of delta.tool_calls ?? []) {
      const index = typeof fragment.index === "number" ? fragment.index : 0;
      const existing = toolCalls.get(index) ?? { arguments: "", id: "", name: "" };
      if (typeof fragment.id === "string" && fragment.id) existing.id = fragment.id;
      if (typeof fragment.function?.name === "string" && fragment.function.name) existing.name = fragment.function.name;
      if (typeof fragment.function?.arguments === "string") existing.arguments += fragment.function.arguments;
      toolCalls.set(index, existing);
    }
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
    return {
      text: accumulated,
      // Sorted by index so a multi-call turn executes in the order the model
      // opened them; a fragment that never got a name is dropped rather than
      // dispatched as the unknown tool "".
      toolCalls: [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call)
        .filter((call) => call.name),
    };
  } finally {
    reader.releaseLock();
  }
}

/** Text-only view of the stream — for the callers that never offer tools (live
 *  notes, recording enhancement). Same parser underneath, so there is one place
 *  where SSE framing is handled. */
export async function readCompletionStream(
  body: ReadableStream<Uint8Array> | null,
  onDelta?: CompletionDeltaHandler,
  onReasoning?: CompletionDeltaHandler,
): Promise<string> {
  const result = await readCompletionStreamFull(body, onDelta, onReasoning);
  return result.text;
}
