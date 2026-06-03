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

export async function chat(params: ChatParams, apiKey: string): Promise<ChatResponse> {
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

/**
 * Force `toolName` and return its parsed arguments as T. DeepSeek's structured
 * output is INTERMITTENTLY malformed on complex nested schemas (~some fraction
 * of calls), so we retry the whole generation on a no-tool-call / invalid-JSON
 * result — an independent re-roll almost always succeeds.
 */
export async function callTool<T>(
  params: ChatParams,
  toolName: string,
  apiKey: string,
): Promise<{ input: T; model: string; usage?: Usage }> {
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
