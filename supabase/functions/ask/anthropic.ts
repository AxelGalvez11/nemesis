// Minimal Anthropic Messages API client over fetch (Deno edge — no npm SDK).
// Supports prompt caching (cache_control) and forced tool_use for structured
// output. We store the API-resolved `model` on the trace so model_name is the
// real snapshot even when we send an alias.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export type SystemPrompt =
  | string
  | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MessagesParams {
  model: string;
  max_tokens: number;
  system?: SystemPrompt;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Tool[];
  tool_choice?: { type: "tool"; name: string } | { type: "auto" } | { type: "any" };
  temperature?: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
}

export interface MessagesResponse {
  id: string;
  model: string;
  stop_reason: string;
  content: ContentBlock[];
  usage: Usage;
}

export async function callMessages(
  params: MessagesParams,
  apiKey: string,
): Promise<MessagesResponse> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  return await res.json() as MessagesResponse;
}

/** Force the model to call `toolName` and return its validated input as T. */
export async function callTool<T>(
  params: MessagesParams,
  toolName: string,
  apiKey: string,
): Promise<{ input: T; model: string; usage: Usage }> {
  const res = await callMessages(
    { ...params, tool_choice: { type: "tool", name: toolName } },
    apiKey,
  );
  const block = res.content.find((b) => b.type === "tool_use" && b.name === toolName);
  if (!block || block.input == null) {
    throw new Error(`model did not call tool '${toolName}' (stop_reason=${res.stop_reason})`);
  }
  return { input: block.input as T, model: res.model, usage: res.usage };
}
