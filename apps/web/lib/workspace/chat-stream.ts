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
  /**
   * The reasoner's own thoughts for this round (DeepSeek `reasoning_content`).
   *
   * 🔴 RETURNED, NOT MERELY STREAMED, AND THAT IS THE POINT. Thinking mode
   * requires that when the model calls a tool, the reasoning it produced before
   * that call is concatenated back into the context on every following round.
   * This value was already being accumulated here and then dropped, so the next
   * round had nothing to echo — which is why tools were withheld from every
   * reasoner route (chat-effort.ts:toolsAllowed), and in turn why a question
   * needing BOTH the student's own material and the live web could not be
   * answered at all. Never part of the visible answer.
   */
  reasoning: string;
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
 * Consume an OpenAI-compatible server-sent-event response without assuming
 * network chunks align to lines. Returns the accumulated assistant text plus
 * any tool calls the model streamed (empty array for plain answers).
 */
export async function readCompletionStreamFull(
  body: ReadableStream<Uint8Array> | null,
  onDelta?: CompletionDeltaHandler,
  onReasoning?: CompletionDeltaHandler,
): Promise<CompletionStreamResult> {
  if (!body) return { reasoning: "", text: "", toolCalls: [] };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  // The reasoner's thoughts (DeepSeek `reasoning_content`). Never part of the
  // answer text — surfaced separately so the thinking strip can show live
  // progress instead of a static shimmer while the model works.
  let accumulatedReasoning = "";
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
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
      accumulatedReasoning += delta.reasoning_content;
      onReasoning?.(delta.reasoning_content, accumulatedReasoning);
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
      reasoning: accumulatedReasoning,
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
