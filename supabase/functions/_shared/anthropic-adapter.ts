// Anthropic is not OpenAI-compatible, and the valve was pretending it was.
//
// 🔴 THE DEFECT. `callProvider` posts `${base}/chat/completions` with
// `Authorization: Bearer <key>` — the OpenAI shape — and Anthropic was in the
// fallback list beside GLM, Qwen and Kimi, which genuinely are OpenAI-compatible.
// Anthropic's API is `POST /v1/messages` with `x-api-key` and an
// `anthropic-version` header, a top-level `system` string rather than a system
// message, tool calls as `tool_use` content blocks rather than `tool_calls`, and
// tool results as `tool_result` blocks inside a USER turn.
//
// So the last link in the outage chain would have failed on every single call.
// It never fired, which is the only reason nobody noticed: it is reached only
// when DeepSeek AND GLM AND Qwen AND Kimi are all unusable at once.
//
// This adapter translates in both directions so the rest of the valve — and
// every client — keeps speaking one dialect. Non-streaming upstream by design:
// Anthropic's event stream is a different protocol again, and an outage
// fallback that is correct and arrives in one piece beats one that is elegant
// and wrong. When the client asked for a stream, `sseFromCompletion` replays
// the finished answer as a well-formed OpenAI stream.

export const ANTHROPIC_VERSION = "2023-06-01";
/** Anthropic requires max_tokens. OpenAI treats it as optional. */
const DEFAULT_MAX_TOKENS = 8_192;

interface OpenAiToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiMessage {
  role?: string;
  content?: unknown;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

type Block = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function parseArguments(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // A malformed argument string must not abort the failover. An empty object
    // lets the model see its own call came back unusable and try again.
    return {};
  }
}

/**
 * OpenAI chat/completions body → Anthropic Messages body.
 *
 * The three structural moves, each of which the old code got wrong by omission:
 *   1. System messages leave `messages` and become one top-level `system` string.
 *   2. An assistant turn's `tool_calls` become `tool_use` content blocks.
 *   3. A `role:"tool"` result becomes a `tool_result` block in a USER turn —
 *      Anthropic has no tool role at all.
 */
export function toAnthropicRequest(body: Record<string, unknown>, model: string): Record<string, unknown> {
  const source = Array.isArray(body.messages) ? (body.messages as OpenAiMessage[]) : [];
  const system: string[] = [];
  const messages: { role: "user" | "assistant"; content: Block[] }[] = [];

  const push = (role: "user" | "assistant", block: Block) => {
    const last = messages[messages.length - 1];
    // Consecutive same-role turns are merged: Anthropic rejects two user turns
    // in a row, and two tool results in one round produce exactly that.
    if (last && last.role === role) last.content.push(block);
    else messages.push({ content: [block], role });
  };

  for (const message of source) {
    if (message.role === "system") {
      if (text(message.content)) system.push(text(message.content));
      continue;
    }
    if (message.role === "tool") {
      push("user", {
        content: text(message.content),
        tool_use_id: message.tool_call_id ?? "",
        type: "tool_result",
      });
      continue;
    }
    if (message.role === "assistant") {
      const blocks: Block[] = [];
      if (text(message.content)) blocks.push({ text: text(message.content), type: "text" });
      for (const call of message.tool_calls ?? []) {
        blocks.push({
          id: call.id ?? "",
          input: parseArguments(call.function?.arguments),
          name: call.function?.name ?? "",
          type: "tool_use",
        });
      }
      // An assistant turn with neither text nor calls is not a turn Anthropic
      // will accept; dropping it is better than sending an empty content array.
      if (blocks.length) for (const block of blocks) push("assistant", block);
      continue;
    }
    if (text(message.content)) push("user", { text: text(message.content), type: "text" });
  }

  const tools = Array.isArray(body.tools)
    ? (body.tools as { function?: { name?: string; description?: string; parameters?: unknown } }[])
      .map((tool) => ({
        description: tool.function?.description ?? "",
        input_schema: tool.function?.parameters ?? { properties: {}, type: "object" },
        name: tool.function?.name ?? "",
      }))
      .filter((tool) => tool.name)
    : [];

  const maxTokens = typeof body.max_tokens === "number"
    ? body.max_tokens
    : typeof body.max_completion_tokens === "number"
      ? body.max_completion_tokens
      : DEFAULT_MAX_TOKENS;

  return {
    max_tokens: maxTokens,
    messages,
    model,
    ...(system.length ? { system: system.join("\n\n") } : {}),
    ...(tools.length ? { tools } : {}),
  };
}

/** The headers Anthropic needs. Notably NOT `Authorization: Bearer`. */
export function anthropicHeaders(key: string): Record<string, string> {
  return { "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json", "x-api-key": key };
}

/** Anthropic stop reasons → OpenAI finish reasons. */
function finishReason(stop: unknown): string {
  if (stop === "tool_use") return "tool_calls";
  if (stop === "max_tokens") return "length";
  return "stop";
}

/**
 * Anthropic Messages response → an OpenAI chat/completions object.
 *
 * The client, the metering transform and every test downstream read the OpenAI
 * shape. Translating here means the fallback is invisible above this line —
 * which is the whole point of a fallback.
 */
export function fromAnthropicResponse(payload: unknown): Record<string, unknown> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const blocks = Array.isArray(body.content) ? (body.content as Block[]) : [];

  const answer = blocks.filter((block) => block.type === "text").map((block) => text(block.text)).join("");
  const toolCalls = blocks
    .filter((block) => block.type === "tool_use")
    .map((block) => ({
      function: { arguments: JSON.stringify(block.input ?? {}), name: text(block.name) },
      id: text(block.id),
      type: "function" as const,
    }));

  const usage = (body.usage ?? {}) as Record<string, unknown>;
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  const cached = typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;

  return {
    choices: [{
      finish_reason: finishReason(body.stop_reason),
      index: 0,
      message: {
        content: answer || null,
        role: "assistant",
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
    }],
    model: text(body.model),
    object: "chat.completion",
    // Named the way the meter already reads them, so cost attribution keeps
    // working through an outage instead of silently recording an estimate.
    usage: {
      completion_tokens: output,
      prompt_cache_hit_tokens: cached,
      prompt_tokens: input,
      total_tokens: input + output,
    },
  };
}

/**
 * Replay a finished completion as an OpenAI SSE stream.
 *
 * The client asked for `stream: true` and its reader expects `data:` frames; an
 * outage is not the moment to hand it a shape it has never parsed. One content
 * frame, one usage frame, `[DONE]`. Tool calls ride the first frame whole,
 * because there is nothing to stream them from.
 */
export function sseFromCompletion(completion: Record<string, unknown>): string {
  const choice = (completion.choices as Record<string, unknown>[] | undefined)?.[0] ?? {};
  const message = (choice.message ?? {}) as Record<string, unknown>;
  const frames = [
    JSON.stringify({
      choices: [{
        delta: {
          ...(message.content ? { content: message.content } : {}),
          ...(message.tool_calls
            ? {
              tool_calls: (message.tool_calls as Record<string, unknown>[]).map((call, index) => ({
                function: call.function,
                id: call.id,
                index,
              })),
            }
            : {}),
        },
        index: 0,
      }],
      model: completion.model,
    }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: choice.finish_reason, index: 0 }], usage: completion.usage }),
  ];
  return `${frames.map((frame) => `data: ${frame}\n\n`).join("")}data: [DONE]\n\n`;
}
