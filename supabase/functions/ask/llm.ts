// OpenAI-compatible chat/completions client (DeepSeek by default).
//
// Provider-agnostic on purpose: LLM_BASE_URL + LLM_API_KEY select the provider,
// so swapping DeepSeek -> OpenAI (if DeepSeek's forced tool-use proves flaky) is
// a config change, not a code change. Structured output uses forced function
// calling; the model's reply is parsed from tool_calls[0].function.arguments.
//
// COMPLIANCE NOTE: with the DeepSeek default, user questions are sent to a
// Chinese API. That is a Phase-7 launch-gate decision (re-point LLM_BASE_URL to
// a US provider, or get sign-off) — fine for synthetic-question validation now.

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export function llmBaseUrl(): string {
  return Deno.env.get("LLM_BASE_URL") ?? DEFAULT_BASE_URL;
}

/** First configured key wins: LLM_API_KEY (generic) > DEEPSEEK > OPENAI. */
export function llmApiKey(): string {
  return Deno.env.get("LLM_API_KEY") ??
    Deno.env.get("DEEPSEEK_API_KEY") ??
    Deno.env.get("OPENAI_API_KEY") ??
    "";
}

export function hasLlmKey(): boolean {
  return llmApiKey().length > 0;
}

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
}

export interface ChatParams {
  model: string;
  max_tokens: number;
  /** System instruction (sent as a role:"system" message). */
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Tool[];
  tool_choice?: { type: "function"; function: { name: string } } | "auto" | "none";
  temperature?: number;
  /**
   * DeepSeek-V4 thinking-mode toggle. Left undefined by the router when routing is off,
   * so the body carries no `thinking` field and the OpenAI request shape is unchanged.
   */
  thinking?: "enabled" | "disabled";
  /** DeepSeek reasoning_effort ("high"/"max"); only meaningful with thinking enabled. */
  reasoningEffort?: string;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
}

export interface ChatResponse {
  model: string;
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
    finish_reason: string;
  }>;
  usage?: Usage;
}

/**
 * Build the chat/completions request body. Pure + exported so the request shape is unit-testable.
 * The `thinking`/`reasoning_effort` fields are emitted ONLY when the router set them (DeepSeek
 * thinking registers); with routing off they are absent, so the OpenAI request is byte-identical.
 */
export function buildChatBody(params: ChatParams): Record<string, unknown> {
  const messages = [
    ...(params.system ? [{ role: "system" as const, content: params.system }] : []),
    ...params.messages,
  ];
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.max_tokens,
    messages,
    temperature: params.temperature ?? 1,
  };
  if (params.tools) {
    body.tools = params.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (params.tool_choice) body.tool_choice = params.tool_choice;
  // DeepSeek thinking-mode controls (see model-route.ts). Absent unless explicitly routed,
  // so OpenAI / legacy requests are unaffected. Thinking mode ignores temperature server-side.
  if (params.thinking) body.thinking = { type: params.thinking };
  if (params.reasoningEffort) body.reasoning_effort = params.reasoningEffort;
  return body;
}

export async function chat(params: ChatParams, apiKey: string): Promise<ChatResponse> {
  const body = buildChatBody(params);

  // Retry transient rate-limit / 5xx (DeepSeek can 429 under bursty traffic).
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${llmBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return await res.json() as ChatResponse;

    const text = await res.text().catch(() => "");
    lastErr = `llm ${res.status}: ${text.slice(0, 300)}`;
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

export type ToolExtract<T> = { ok: true; input: T } | { ok: false; err: string };

/** Find `toolName`'s call in a response and parse its JSON arguments. Pure, so the callTool
 *  orchestration (which path ran, when we fall back) is unit-testable without the network. */
export function extractToolInput<T>(res: ChatResponse, toolName: string): ToolExtract<T> {
  const call = res.choices[0]?.message.tool_calls?.find((c) => c.function.name === toolName);
  if (!call) return { ok: false, err: `no tool call (finish_reason=${res.choices[0]?.finish_reason})` };
  try {
    return { ok: true, input: parseToolArguments(call.function.arguments) as T };
  } catch {
    return { ok: false, err: `invalid JSON (len=${String(call.function.arguments ?? "").length})` };
  }
}

/** Params for the RELIABLE forced path. DeepSeek V4 thinking mode rejects a forced tool_choice
 *  (HTTP 400), so a thinking request is coerced to non-thinking here — this is the guaranteed-
 *  structured-output fallback (a safety property: a medical answer must never come back as
 *  unparseable prose). Non-thinking / OpenAI params keep their thinking value untouched
 *  (undefined -> the field is never sent, so the OpenAI request shape is unchanged). */
export function forcedToolParams(params: ChatParams, toolName: string): ChatParams {
  return {
    ...params,
    thinking: params.thinking === "enabled" ? "disabled" : params.thinking,
    tool_choice: { type: "function", function: { name: toolName } },
  };
}

/** Params for the THINKING path: tool_choice "auto" (forcing is rejected in thinking mode), thinking
 *  left enabled so the model reasons before choosing to call the tool. */
export function autoThinkingParams(params: ChatParams): ChatParams {
  return { ...params, tool_choice: "auto" };
}

const THINKING_TRIES = 2;
const FORCED_TRIES = 5;

/**
 * Get structured output by calling `toolName` and parsing its arguments as T.
 *
 * Non-thinking (OpenAI + DeepSeek non-thinking): FORCES the tool — guaranteed structured output.
 * DeepSeek's complex-schema output is INTERMITTENTLY malformed, so we retry the whole generation
 * on a no-call / invalid-JSON result; an independent re-roll almost always succeeds.
 *
 * Thinking (DeepSeek V4): a forced tool_choice is rejected, so we first try a few attempts with
 * tool_choice:"auto" (the model reasons, then chooses to call the tool). If those don't yield clean
 * structured output, we DROP to the forced non-thinking path above — so a thinking request can never
 * cost us the structured-output guarantee; at worst it loses the chain-of-thought for that call.
 */
export async function callTool<T>(
  params: ChatParams,
  toolName: string,
  apiKey: string,
): Promise<{ input: T; model: string; usage?: Usage }> {
  let lastErr = "no attempts";

  if (params.thinking === "enabled") {
    const thinkParams = autoThinkingParams(params);
    for (let attempt = 0; attempt < THINKING_TRIES; attempt++) {
      const res = await chat(thinkParams, apiKey);
      const r = extractToolInput<T>(res, toolName);
      if (r.ok) return { input: r.input, model: res.model, usage: res.usage };
      lastErr = `thinking/auto: ${r.err}`;
    }
    // thinking did not produce structured output -> fall through to the guaranteed forced path
  }

  const forced = forcedToolParams(params, toolName);
  for (let attempt = 0; attempt < FORCED_TRIES; attempt++) {
    const res = await chat(forced, apiKey);
    const r = extractToolInput<T>(res, toolName);
    if (r.ok) return { input: r.input, model: res.model, usage: res.usage };
    lastErr = r.err;
    if (r.err.startsWith("invalid JSON")) {
      console.error(`tool '${toolName}' ${r.err} attempt ${attempt + 1}`);
    }
  }
  throw new Error(`tool '${toolName}' failed after retries: ${lastErr}`);
}

/**
 * Parse a function-call arguments string. DeepSeek occasionally wraps the JSON
 * in ```json fences or appends prose; strip those and extract the object. A
 * genuinely truncated payload still throws (surfaced as a 500, the honest
 * signal that max_tokens was too low).
 */
function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // ignore — fall through to recovery
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate); // throws -> caller reports invalid JSON
}
