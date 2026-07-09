// OpenAI-compatible chat/completions client (DeepSeek by default — the settled provider).
//
// Provider-agnostic on purpose: LLM_BASE_URL + LLM_API_KEY select the provider, so re-pointing
// is a config change, not a code change. Structured output uses forced function calling
// (parsed from tool_calls[0].function.arguments) for chat-class models; REASONER-class models
// (deepseek-reasoner and kin) don't support forced tool calls, so callTool transparently switches
// to a JSON-in-text protocol for them (see callToolViaJson) — same schema, same parsed result,
// with an automatic fallback to the chat-class model if the reasoner's JSON can't be parsed.

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export function llmBaseUrl(): string {
  return Deno.env.get("LLM_BASE_URL") ?? DEFAULT_BASE_URL;
}

/**
 * DeepSeek retires the `deepseek-chat` and `deepseek-reasoner` model aliases on 2026-07-24 15:59 UTC
 * (api-docs.deepseek.com/updates). This maps our internal model names to the durable V4 names plus the
 * `thinking` request parameter that selects the mode — so mechanical calls keep working after the
 * aliases die. V4 models default to THINKING mode, which rejects forced tool_choice ("Thinking mode
 * does not support this tool_choice"); the mechanical flash model must therefore send thinking OFF
 * explicitly. The v4-pro synthesis path is left at its provider default (thinking on) and is never
 * sent with forced tools. Non-DeepSeek providers (LLM_BASE_URL pointed elsewhere) pass through
 * untouched, so `thinking` — a DeepSeek-specific field — is never sent to another vendor.
 *   deepseek-chat     -> deepseek-v4-flash, thinking OFF   (behavior-preserving; the retired alias was thinking-off)
 *   deepseek-reasoner -> deepseek-v4-flash, thinking ON    (behavior-preserving; the retired alias was thinking-on)
 *   *v4-flash*        -> thinking OFF                        (bare name defaults to thinking; force off for forced tools)
 *   everything else   -> unchanged                          (v4-pro keeps its thinking-on default; no param sent)
 */
export function resolveDeepSeekModel(
  model: string,
  baseUrl: string,
): { model: string; thinking?: { type: "enabled" | "disabled" } } {
  if (!baseUrl.includes("deepseek")) return { model };
  const m = model.toLowerCase();
  if (m === "deepseek-chat") return { model: "deepseek-v4-flash", thinking: { type: "disabled" } };
  if (m === "deepseek-reasoner") return { model: "deepseek-v4-flash", thinking: { type: "enabled" } };
  if (m.includes("v4-flash")) return { model, thinking: { type: "disabled" } };
  return { model };
}

/**
 * Reasoner-class model? These emit chain-of-thought and (per provider docs) do NOT support
 * forced function calling — structured output must be requested as plain JSON text. The match
 * pattern is env-tunable (REASONER_MODEL_PATTERN) so a future model name routes correctly
 * without a code change. Default matches "reasoner" anywhere in the model name.
 */
export function isReasonerModel(model: string): boolean {
  const pattern = Deno.env.get("REASONER_MODEL_PATTERN");
  if (pattern) {
    try {
      return new RegExp(pattern, "i").test(model);
    } catch {
      // invalid pattern -> fall through to the default match
    }
  }
  return model.toLowerCase().includes("reasoner");
}

/** First configured key wins: LLM_API_KEY (generic) > DEEPSEEK > OPENAI. */
export function llmApiKey(): string {
  return Deno.env.get("LLM_API_KEY") ??
    Deno.env.get("DEEPSEEK_API_KEY") ??
    Deno.env.get("OPENAI_API_KEY") ??
    "";
}

/** Reasoner calls may live on a DIFFERENT provider than the chat slots (e.g. chat slots pointed
 *  at one vendor while the reasoner is DeepSeek's). Own base/key with sane DeepSeek defaults. */
export function reasonerBaseUrl(): string {
  return Deno.env.get("REASONER_BASE_URL") ?? DEFAULT_BASE_URL;
}
export function reasonerApiKey(): string {
  return Deno.env.get("REASONER_API_KEY") ?? Deno.env.get("DEEPSEEK_API_KEY") ?? llmApiKey();
}

/**
 * True when a reasoner call would send the CHAT provider's generic key to a DIFFERENT reasoner
 * endpoint — the silent-degradation misconfig (every reasoner call 401s twice, then falls back to
 * the chat model: safe but a permanent invisible quality downgrade). PURE for testability; the
 * once-per-isolate warning below makes it loud in logs.
 */
export function reasonerKeyMisconfigured(): boolean {
  const dedicated = Deno.env.get("REASONER_API_KEY") ?? Deno.env.get("DEEPSEEK_API_KEY");
  return !dedicated && reasonerBaseUrl() !== llmBaseUrl();
}
let warnedReasonerKey = false;

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
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
}

interface ChatResponse {
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

export async function chat(params: ChatParams, apiKey: string, baseUrl: string = llmBaseUrl()): Promise<ChatResponse> {
  const messages = [
    ...(params.system ? [{ role: "system" as const, content: params.system }] : []),
    ...params.messages,
  ];
  const resolved = resolveDeepSeekModel(params.model, baseUrl);
  const body: Record<string, unknown> = {
    model: resolved.model,
    max_tokens: params.max_tokens,
    messages,
    temperature: params.temperature ?? 1,
  };
  if (resolved.thinking) body.thinking = resolved.thinking;
  if (params.tools) {
    body.tools = params.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (params.tool_choice) body.tool_choice = params.tool_choice;

  // Retry transient rate-limit / 5xx (DeepSeek can 429 under bursty traffic).
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
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

/**
 * Force `toolName` and return its parsed arguments as T. DeepSeek's structured
 * output is INTERMITTENTLY malformed on complex nested schemas (~some fraction
 * of calls), so we retry the whole generation on a no-tool-call / invalid-JSON
 * result — an independent re-roll almost always succeeds.
 *
 * Reasoner-class models can't be forced into tool calls, so they route through
 * callToolViaJson (same contract: parsed arguments as T), which itself falls
 * back to the chat-class model on persistent parse failure — a reasoner slot
 * can therefore never be LESS reliable than today's chat slot, only smarter.
 */
export async function callTool<T>(
  params: ChatParams,
  toolName: string,
  apiKey: string,
): Promise<{ input: T; model: string; usage?: Usage }> {
  if (isReasonerModel(params.model)) return await callToolViaJson<T>(params, toolName, apiKey);
  let lastErr = "no attempts";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await chat(
      { ...params, tool_choice: { type: "function", function: { name: toolName } } },
      apiKey,
    );
    const call = res.choices[0]?.message.tool_calls?.find((c) => c.function.name === toolName);
    if (!call) {
      lastErr = `no tool call (finish_reason=${res.choices[0]?.finish_reason})`;
      continue;
    }
    try {
      const input = parseToolArguments(call.function.arguments) as T;
      return { input, model: res.model, usage: res.usage };
    } catch {
      const raw = String(call.function.arguments ?? "");
      lastErr = `invalid JSON (len=${raw.length})`;
      console.error(`tool '${toolName}' ${lastErr} attempt ${attempt + 1}: ${raw.slice(0, 300)}`);
    }
  }
  throw new Error(`tool '${toolName}' failed after retries: ${lastErr}`);
}

/** Final-answer floor for reasoner calls. */
const REASONER_MIN_TOKENS = 1024;
/** Thinking headroom added ON TOP of the caller's answer budget for reasoner models. DeepSeek's
 *  max_tokens caps the WHOLE output — chain-of-thought AND the final answer (their pricing docs:
 *  "MAX OUTPUT … includes the CoT tokens"). A caller budget sized for the answer alone (e.g.
 *  synthesis's 8192) gets consumed by reasoning first, so the JSON answer truncates mid-string →
 *  unparseable → reroll → fallback → the deep-research timeout. Reserving a large separate reasoning
 *  allowance lets the model think AND still emit the full JSON on the first roll. Well under v4-pro's
 *  384K output ceiling; unused tokens are never billed. */
const REASONER_THINKING_HEADROOM = 24000;

/**
 * Structured output from a REASONER-class model: same contract as callTool (parsed arguments
 * for `toolName` as T), different wire protocol. The tool's JSON Schema is embedded in the
 * system prompt and the model is told to answer with ONLY a JSON object; the reply text goes
 * through the same parseToolArguments recovery (fences/prose stripping) as tool calls.
 *
 * Two independent rolls, then a HARD FALLBACK: re-run the whole call as a normal forced tool
 * call on the chat-class generate model. The fallback result's `model` field reports the model
 * that actually answered, so stored model_version strings stay honest automatically.
 */
async function callToolViaJson<T>(
  params: ChatParams,
  toolName: string,
  apiKey: string,
): Promise<{ input: T; model: string; usage?: Usage }> {
  if (!warnedReasonerKey && reasonerKeyMisconfigured()) {
    warnedReasonerKey = true;
    console.warn(
      `reasoner model '${params.model}' has no REASONER_API_KEY/DEEPSEEK_API_KEY while the chat slots use a different ` +
        `provider — the generic key will be sent to ${reasonerBaseUrl()} and will likely be rejected; every reasoner call ` +
        `will burn 2 attempts and fall back to the chat model. Set REASONER_API_KEY (or DEEPSEEK_API_KEY) to fix.`,
    );
  }
  const schema = params.tools?.find((t) => t.name === toolName);
  const jsonInstruction = [
    params.system ?? "",
    "",
    `Respond with ONLY a single JSON object — no markdown fences, no prose before or after. ` +
    `The object must be valid arguments for the tool "${toolName}"` +
    (schema ? ` per this JSON Schema:\n${JSON.stringify(schema.parameters)}` : "."),
  ].join("\n").trim();

  let lastErr = "no attempts";
  for (let attempt = 0; attempt < 2; attempt++) {
    let content = "";
    try {
      // The reasoner leg has its own provider config (reasonerBaseUrl/reasonerApiKey — DeepSeek by
      // default), independent of where the chat slots point. An API error here (wrong key, model
      // not found, provider down) counts as a failed attempt, NOT a crash — the fallback still runs.
      const res = await chat(
        {
          ...params,
          system: jsonInstruction,
          // Answer budget (floored) PLUS a separate reasoning allowance — see REASONER_THINKING_HEADROOM.
          max_tokens: Math.max(params.max_tokens, REASONER_MIN_TOKENS) + REASONER_THINKING_HEADROOM,
          // No tools/tool_choice on the wire: forced tool_choice is rejected in thinking mode
          // ("Thinking mode does not support this tool_choice" — api-docs.deepseek.com/guides/tool_calls).
          tools: undefined,
          tool_choice: undefined,
        },
        reasonerApiKey() || apiKey,
        reasonerBaseUrl(),
      );
      content = res.choices[0]?.message.content ?? "";
      const input = parseToolArguments(content) as T;
      return { input, model: res.model, usage: res.usage };
    } catch (err) {
      lastErr = content
        ? `reasoner JSON unparseable (len=${content.length})`
        : `reasoner call failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`;
      console.error(`tool '${toolName}' ${lastErr} attempt ${attempt + 1}${content ? `: ${content.slice(0, 300)}` : ""}`);
    }
  }

  // Hard fallback: the chat-class model with a real forced tool call. Guard against a
  // misconfigured fallback that is itself a reasoner (would recurse forever).
  const fallbackModel = Deno.env.get("LLM_GENERATE_MODEL") ?? "deepseek-chat";
  if (isReasonerModel(fallbackModel)) {
    throw new Error(`tool '${toolName}' failed on reasoner and fallback '${fallbackModel}' is also a reasoner: ${lastErr}`);
  }
  console.error(`tool '${toolName}': reasoner '${params.model}' fell back to '${fallbackModel}' (${lastErr})`);
  return await callTool<T>({ ...params, model: fallbackModel }, toolName, apiKey);
}

/**
 * Parse a function-call arguments string. DeepSeek occasionally wraps the JSON
 * in ```json fences or appends prose; strip those and extract the object. A
 * genuinely truncated payload still throws (surfaced as a 500, the honest
 * signal that max_tokens was too low).
 */
export function parseToolArguments(raw: string): unknown {
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

/**
 * Streaming variant of a forced tool call: same request with stream:true, forwarding each
 * tool-arguments delta to `onArgs` as it arrives (SSE "data:" lines, OpenAI/DeepSeek shape).
 * NO retry loop on purpose — a stream that fails or yields no arguments throws, and the caller
 * falls back to the non-streaming callTool path, so streaming can never be less reliable than
 * today, only faster to first byte.
 */
export async function chatToolArgsStream(
  params: ChatParams,
  toolName: string,
  apiKey: string,
  onArgs: (chunk: string) => void,
): Promise<{ argumentsText: string; model: string }> {
  // Reasoner models can't stream forced tool arguments — throw BEFORE any network call so the
  // caller's existing fallback path (non-streaming callTool, which handles reasoners) kicks in.
  if (isReasonerModel(params.model)) {
    throw new Error(`llm stream: '${params.model}' is a reasoner model (no forced tool calls) — use callTool`);
  }
  const messages = [
    ...(params.system ? [{ role: "system" as const, content: params.system }] : []),
    ...params.messages,
  ];
  const resolved = resolveDeepSeekModel(params.model, llmBaseUrl());
  const body: Record<string, unknown> = {
    model: resolved.model,
    max_tokens: params.max_tokens,
    messages,
    temperature: params.temperature ?? 1,
    stream: true,
    tool_choice: { type: "function", function: { name: toolName } },
  };
  if (resolved.thinking) body.thinking = resolved.thinking;
  if (params.tools) {
    body.tools = params.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  const res = await fetch(`${llmBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`llm stream ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let args = "";
  let model = params.model;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let evt: {
          model?: string;
          choices?: Array<{ delta?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
        };
        try {
          evt = JSON.parse(data);
        } catch {
          continue; // partial/garbled event line — the terminal parse of `args` is the correctness gate
        }
        if (evt.model) model = evt.model;
        const chunk = evt.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments;
        if (typeof chunk === "string" && chunk) {
          args += chunk;
          onArgs(chunk);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!args) throw new Error(`llm stream: no '${toolName}' arguments received`);
  return { argumentsText: args, model };
}
