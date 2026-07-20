export type CompletionDeltaHandler = (delta: string, accumulated: string) => void;

/** One assembled tool call from a completed stream (OpenAI delta format:
 *  fragments arrive keyed by index, id/name once, arguments concatenated). */
export interface StreamedToolCall {
  id: string;
  name: string;
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
  delta?: { content?: unknown; tool_calls?: RawToolCallDelta[] };
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
 * network chunks align to lines. Returns the accumulated assistant text plus
 * any tool calls the model streamed (empty array for plain answers).
 */
export async function readCompletionStreamFull(
  body: ReadableStream<Uint8Array> | null,
  onDelta?: CompletionDeltaHandler,
): Promise<CompletionStreamResult> {
  if (!body) return { text: "", toolCalls: [] };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  const toolCalls = new Map<number, StreamedToolCall>();

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trimEnd();
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trimStart();
    if (!data || data === "[DONE]") return;
    let parsed: { choices?: StreamChoice[] } | null = null;
    try {
      parsed = JSON.parse(data) as { choices?: StreamChoice[] };
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
      toolCalls: [...toolCalls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call).filter((call) => call.name),
    };
  } finally {
    reader.releaseLock();
  }
}

/** Text-only view of the stream — kept for callers that never use tools. */
export async function readCompletionStream(
  body: ReadableStream<Uint8Array> | null,
  onDelta?: CompletionDeltaHandler,
): Promise<string> {
  const result = await readCompletionStreamFull(body, onDelta);
  return result.text;
}
