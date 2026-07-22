// Chat wiring for the Sessions surface — ported verbatim from the mobile
// nemesis-llm recipe (apps/mobile/src/api/chat.ts + src/lib/chat-thread.ts):
// same device-key mint, same chat/completions call, same system prompt and
// history budget, same error copy. Web swaps SecureStore for localStorage and
// adds AbortSignal support (mobile has no cancel affordance).

import { supabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { SessionMessage } from "@/lib/workspace/sessions-store";
import { AGENT_TOOLS, executeAgentTool, type AgentToolCall } from "@/lib/workspace/agent-tools";
import { buildFreshSearchQuery, formatWebSearchContext, shouldSearchWeb, usableWebResults, type ChatWebResult } from "@/lib/workspace/chat-web-search";
import { classifyChatRequest, routeInstruction, type ChatRouteDecision } from "@/lib/workspace/chat-routing";
import { buildSkillMessage, selectChatSkills } from "@/lib/workspace/chat-skills";
import { readCompletionStreamFull, type CompletionDeltaHandler } from "@/lib/workspace/chat-stream";
import { showUpgradePrompt, type UpgradeResetKind } from "@/lib/workspace/upgrade-prompt";

const LLM_BASE = `${supabaseUrl}/functions/v1/nemesis-llm`;

export interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface WireMsg {
  role: "assistant" | "system" | "user" | "tool";
  content: string;
  /** Assistant messages that requested tools (echoed back on the next round). */
  tool_calls?: WireToolCall[];
  /** Tool-result messages: which call this answers. */
  tool_call_id?: string;
}

/** Nemesis speaks for itself here (same soul rules as the desktop agent):
 *  plain, concise, no emojis, never a different product's name.
 *  Universal rigor lives here because it rides every turn at no marginal cost;
 *  task-specific craft lives in chat-skills.ts and is injected only on match. */
export const CHAT_SYSTEM_PROMPT =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the user's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, code, primary evidence, or counterarguments when they improve understanding. " +
  "Separate established facts from inference and uncertainty. Correct misconceptions without being condescending. " +
  "When live web results are supplied, use them for current facts and cite the relevant URLs. " +
  "Never use emojis. " +
  "You can see and edit this student's Nemesis workspace through your tools: search and read their Library notes, create notes, " +
  "list flashcard decks and add cards, and list or add calendar events. Use the tools whenever a question involves their own notes, " +
  "decks, or schedule, or when they ask you to save something — read their real data instead of guessing, and never invent what a " +
  "note or calendar says. After any write, state plainly what you created or changed. School portals are still handled by the Mac app's missions. " +
  "Check your own work before you answer: verify every number, unit, name, and date you are about to state, and re-read the question to confirm you " +
  "answered what was actually asked. If a step does not hold up, fix it before replying rather than hedging afterwards. When you are unsure, say what " +
  "you are unsure about and what would settle it — never fill a gap with something that merely sounds right.";

/** Keep the upstream payload bounded: the most recent messages whose combined
 *  length fits the budget (always at least the latest message, even if huge —
 *  the valve's own caps are the final authority). */
export const HISTORY_CHAR_BUDGET = 24_000;
export const HISTORY_MAX_MESSAGES = 30;

export function trimHistory(
  history: SessionMessage[],
  charBudget = HISTORY_CHAR_BUDGET,
  maxMessages = HISTORY_MAX_MESSAGES,
): SessionMessage[] {
  const recent = history.slice(-maxMessages);
  const out: SessionMessage[] = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (!msg) continue;
    const cost = msg.content.length;
    if (out.length > 0 && used + cost > charBudget) break;
    out.unshift(msg);
    used += cost;
  }
  return out;
}

/** Preserve the conversation's originating goal when a long transcript has to
 * drop older turns. This is deterministic and bounded, so continuity does not
 * require another paid model call. */
export function buildContinuityAnchor(history: SessionMessage[], kept: SessionMessage[]): string {
  if (history.length === 0 || kept.length === history.length) return "";
  const firstUser = history.find((message) => message.role === "user" && message.content.trim());
  if (!firstUser || kept.includes(firstUser)) return "";
  return `The conversation originally began with this user goal; preserve it unless the user has changed direction:\n${firstUser.content.slice(0, 1_200)}`;
}

/** The chat/completions message array for one turn. */
export function buildWireMessages(
  history: SessionMessage[],
  userText: string,
  decision = classifyChatRequest(userText),
): WireMsg[] {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const liveClock = `The current date is ${now.toISOString().slice(0, 10)} and the user's time zone is ${timeZone}. You do have this clock context; never claim you cannot know today's date.`;
  const kept = trimHistory(history);
  const continuityAnchor = buildContinuityAnchor(history, kept);
  // Skills go last among the system messages so their procedure is the most
  // recent instruction the model reads before the conversation itself.
  const skills = buildSkillMessage(selectChatSkills(userText));
  return [
    { content: `${CHAT_SYSTEM_PROMPT}\n\n${routeInstruction(decision.route)}\n\n${liveClock}`, role: "system" },
    ...(continuityAnchor ? [{ content: continuityAnchor, role: "system" as const }] : []),
    ...(skills ? [{ content: skills, role: "system" as const }] : []),
    ...kept.map((msg) => ({ content: msg.content, role: msg.role })),
    { content: userText, role: "user" },
  ];
}

export type ChatErrorKind = "budget" | "auth" | "unreachable" | "generic";

function errorCode(body: unknown): string {
  return typeof body === "object" && body !== null
    ? ((body as { error?: { code?: string } }).error?.code ?? "")
    : "";
}

/** Classify the valve's error shape — drives which error card the UI renders
 *  (the budget-exhausted card is visually distinct from a plain error row). */
export function chatErrorKind(status: number, body: unknown): ChatErrorKind {
  if (errorCode(body) === "daily_token_budget_exhausted" || status === 429) return "budget";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500 || status === 502) return "unreachable";
  return "generic";
}

/** Which credit window ran dry (a bare 429 without a code reads as daily). */
function budgetResetOf(body: unknown): UpgradeResetKind {
  return errorCode(body) === "monthly_token_budget_exhausted" ? "monthly" : "daily";
}

/** Map the valve's error shapes to one student-readable line. */
export function chatErrorMessage(status: number, body: unknown): string {
  const message =
    typeof body === "object" && body !== null
      ? ((body as { error?: { message?: string } }).error?.message ?? "")
      : "";
  const kind = chatErrorKind(status, body);

  if (kind === "budget") {
    return message || "You've reached today's usage limit. It resets tomorrow, or upgrade for more.";
  }
  if (kind === "auth") {
    return "This device needs to re-connect to your account. Try again — it repairs itself.";
  }
  if (kind === "unreachable") {
    return "The answer engine is unreachable right now. Try again in a moment.";
  }
  return message || "Something went wrong sending that. Try again.";
}

/** Parse a non-streaming chat/completions response body into assistant text. */
export function completionText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" && message.content.trim() ? message.content : null;
}

/** Tool calls from a non-streaming chat/completions response, if any. */
export function completionToolCalls(body: unknown): AgentToolCall[] {
  if (typeof body !== "object" || body === null) return [];
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return [];
  const raw = (choices[0] as { message?: { tool_calls?: unknown } }).message?.tool_calls;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const call = entry as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    if (typeof call.id !== "string" || typeof call.function?.name !== "string") return [];
    return [{ arguments: typeof call.function.arguments === "string" ? call.function.arguments : "{}", id: call.id, name: call.function.name }];
  });
}

// ── Device key (web: localStorage instead of SecureStore) ──────────────────

const deviceKeyStorageKey = (uid: string) => `nemesis_device_key_v1_${uid}`;

function readStoredKey(uid: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(deviceKeyStorageKey(uid));
    return stored?.startsWith("nmk_") ? stored : null;
  } catch {
    return null;
  }
}

function storeKey(uid: string, key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(deviceKeyStorageKey(uid), key);
  } catch {
    // Quota/private mode — the mint still succeeds for this call, just not cached.
  }
}

/** Mint a device key for the CURRENT session, only if it belongs to `uid` —
 *  a stale tab from a previous account must never mint under the new one. */
async function mintDeviceKey(uid: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) return null;
  try {
    const res = await fetch(`${LLM_BASE}/device-key`, {
      body: JSON.stringify({ label: "Nemesis Web" }),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: string };
    if (typeof body.key !== "string" || !body.key.startsWith("nmk_")) return null;
    storeKey(uid, body.key);
    return body.key;
  } catch {
    return null;
  }
}

export async function deviceKey(uid: string): Promise<string | null> {
  const stored = readStoredKey(uid);
  if (stored) return stored;
  return mintDeviceKey(uid);
}

export interface ChatReply {
  text: string | null;
  errorText: string | null;
  errorKind: ChatErrorKind | null;
  sources: ChatWebResult[];
  /** Present when the model asked to run tools instead of (or before) answering. */
  toolCalls?: AgentToolCall[];
}

export interface ChatCompletionOptions {
  signal?: AbortSignal;
  decision?: ChatRouteDecision;
  onDelta?: CompletionDeltaHandler;
  /** OpenAI-format tool schemas; the valve forwards them verbatim. */
  tools?: readonly unknown[];
}

/** One completion turn from an arbitrary wire-message array — the shared transport for
 *  both the main Sessions chat and per-notebook chats (same device-key mint, same valve, same error
 *  copy). Streams when `onDelta` is supplied. Resolves (never rejects) for network/API failures —
 *  those come back as a student-readable line. Only an aborted `signal` rejects, so the caller can
 *  tell "the user stopped it" apart from "it failed". */
export async function postChatCompletion(
  uid: string,
  wireMessages: WireMsg[],
  options: ChatCompletionOptions = {},
): Promise<ChatReply> {
  let key = await deviceKey(uid);
  if (!key) return { errorKind: "auth", errorText: "Sign in to chat.", sources: [], text: null };

  const decision = options.decision ?? { route: "conversation", model: "deepseek-chat", searchWeb: false };
  const payload = JSON.stringify({
    messages: wireMessages,
    model: decision.model,
    ...(decision.reasoningEffort ? { reasoning_effort: decision.reasoningEffort } : {}),
    ...(options.onDelta ? { stream: true } : {}),
    ...(options.tools?.length ? { tools: options.tools } : {}),
  });
  const call = (bearer: string) =>
    fetch(`${LLM_BASE}/v1/chat/completions`, {
      body: payload,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      method: "POST",
      signal: options.signal,
    });

  try {
    let res = await call(key);
    // A revoked/unknown key (wiped server-side, restored browser) re-mints once —
    // still strictly under this uid's session.
    if (res.status === 401 || res.status === 403) {
      const fresh = await mintDeviceKey(uid);
      if (fresh) {
        key = fresh;
        res = await call(key);
      }
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      const errorKind = chatErrorKind(res.status, body);
      const errorText = chatErrorMessage(res.status, body);
      // Out of credits is an upsell moment, not just an error row: pop the
      // shell-mounted upgrade dialog on every budget-exhausted turn.
      if (errorKind === "budget") showUpgradePrompt(errorText, budgetResetOf(body));
      return { errorKind, errorText, sources: [], text: null };
    }
    let text: string | null = null;
    let toolCalls: AgentToolCall[] = [];
    if (options.onDelta) {
      const streamed = await readCompletionStreamFull(res.body, options.onDelta);
      text = streamed.text.trim() ? streamed.text : null;
      toolCalls = streamed.toolCalls;
    } else {
      const body = (await res.json().catch(() => null)) as unknown;
      text = completionText(body);
      toolCalls = completionToolCalls(body);
    }
    if (text || toolCalls.length) {
      return { errorKind: null, errorText: null, sources: [], text, ...(toolCalls.length ? { toolCalls } : {}) };
    }
    return { errorKind: "generic", errorText: "The answer came back empty. Try again.", sources: [], text: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return {
      errorKind: "unreachable",
      errorText: "You're offline — chat needs a connection. Try again in a moment.",
      sources: [],
      text: null,
    };
  }
}

/** Most tool rounds a single turn may run before we force a plain answer. */
const AGENT_MAX_TOOL_ROUNDS = 4;

/** One routed completion turn for the signed-in user `uid` on the main Sessions chat.
 *  Runs the workspace agent loop (owner 2026-07-20): the model can call the
 *  Library/Study/Calendar tools; results are fed back until it answers in text.
 *  Tools are withheld on reasoner-model routes (DeepSeek thinking mode requires
 *  echoing reasoning_content on tool turns, which the stream doesn't retain). */
export async function sendChatTurn(
  uid: string,
  history: SessionMessage[],
  userText: string,
  signal?: AbortSignal,
  onDelta?: CompletionDeltaHandler,
): Promise<ChatReply> {
  const classified = classifyChatRequest(userText);
  const needsWeb = classified.searchWeb || shouldSearchWeb(userText);
  const decision: ChatRouteDecision = needsWeb && classified.route === "conversation"
    ? { route: "current", model: "deepseek-reasoner", searchWeb: true }
    : classified;
  let groundedText = userText;
  let sources: ChatWebResult[] = [];
  if (needsWeb) {
    const result = await searchWebContext(uid, buildFreshSearchQuery(userText), signal);
    sources = result.sources;
    groundedText = result.context
      ? `${userText}\n\n${result.context}`
      : `${userText}\n\nLive search was requested but returned no verifiable sources. Do not guess a current result; say clearly that it could not be verified.`;
  }

  const toolsEnabled = !decision.model.includes("reasoner");
  let messages: WireMsg[] = buildWireMessages(history, groundedText, decision);
  let reply: ChatReply = { errorKind: null, errorText: null, sources: [], text: null };
  for (let round = 0; round <= AGENT_MAX_TOOL_ROUNDS; round += 1) {
    // The last permitted round goes out without tools so it must answer in text.
    const offerTools = toolsEnabled && round < AGENT_MAX_TOOL_ROUNDS;
    reply = await postChatCompletion(uid, messages, {
      decision,
      onDelta,
      signal,
      ...(offerTools ? { tools: AGENT_TOOLS } : {}),
    });
    const calls = reply.toolCalls ?? [];
    if (!calls.length || reply.errorKind) break;
    const results = await Promise.all(calls.map(async (call) => ({ call, result: await executeAgentTool(call) })));
    messages = [
      ...messages,
      {
        content: reply.text ?? "",
        role: "assistant",
        tool_calls: calls.map((call) => ({ function: { arguments: call.arguments, name: call.name }, id: call.id, type: "function" as const })),
      },
      ...results.map(({ call, result }) => ({
        content: JSON.stringify(result).slice(0, 20_000),
        role: "tool" as const,
        tool_call_id: call.id,
      })),
    ];
  }
  return { ...reply, sources };
}

export async function searchWebContext(uid: string, query: string, signal?: AbortSignal): Promise<{ context: string; sources: ChatWebResult[] }> {
  const key = await deviceKey(uid);
  if (!key) return { context: "", sources: [] };
  try {
    const response = await fetch("/api/workspace/search", {
      body: JSON.stringify({ query, limit: 5 }),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      method: "POST",
      signal,
    });
    if (!response.ok) return { context: "", sources: [] };
    const body = (await response.json()) as { data?: { web?: ChatWebResult[] } };
    // Same list the prompt numbers, so an inline [n] in the answer resolves to
    // the source the model actually cited.
    const sources = usableWebResults(body.data?.web ?? []);
    return { context: formatWebSearchContext(sources), sources };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { context: "", sources: [] };
  }
}
