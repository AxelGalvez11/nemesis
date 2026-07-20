// Chat-thread pure logic (cloud-first pivot §6): transcript shaping for the
// phone's Chat surface. Dependency-free by design (Deno-testable) — the network
// half lives in api/chat.ts.
//
// The phone talks to the SAME metered valve as the desktop (nemesis-llm), so
// there is no client-side token accounting here — just context-window hygiene:
// send a bounded slice of the transcript, never the whole history.
import { classifyChatRequest, routeInstruction, type ChatRouteDecision } from "./chat-routing.ts";

export type ChatRole = "assistant" | "user";

export interface ChatSource {
  title: string;
  url: string;
  description: string;
}

export interface ChatMsg {
  role: ChatRole;
  content: string;
  /** ISO timestamp — display + persistence only, never sent upstream. */
  at: string;
  /** Client-generated UUID — the identity of this message's `chat_messages`
   *  cloud row (see lib/chat-threads.ts). Optional only for rows cached before
   *  this field existed; the sync path backfills one the next time it runs. */
  id?: string;
  /** Web-search citations attached when the router decided this turn needed
   *  live results (persisted into the cloud row's `meta.sources`). */
  sources?: ChatSource[];
}

export interface WireMsg {
  role: "assistant" | "system" | "user";
  content: string;
}

/** Nemesis speaks for itself here (same soul rules as the desktop agent):
 *  plain, concise, no emojis, never a different product's name. Adopted
 *  verbatim from the web CHAT_SYSTEM_PROMPT (apps/web/lib/workspace/chat-api.ts)
 *  so a thread shared between phone and web sounds the same either side — the
 *  "Mac app's missions" line is a known stale reference on web too (tracked,
 *  out of scope for this round). */
export const CHAT_SYSTEM_PROMPT =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the user's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, code, primary evidence, or counterarguments when they improve understanding. " +
  "Separate established facts from inference and uncertainty. Correct misconceptions without being condescending. " +
  "When live web results are supplied, use them for current facts and cite the relevant URLs. " +
  "Never use emojis. If a question needs the student's own files or their school portals, " +
  "say that the Mac app's missions handle those and answer what you can from knowledge.";

/** Keep the upstream payload bounded: the most recent messages whose combined
 *  length fits the budget (always at least the latest message, even if huge —
 *  the valve's own caps are the final authority). */
export const HISTORY_CHAR_BUDGET = 24_000;
export const HISTORY_MAX_MESSAGES = 30;

export function trimHistory(
  history: ChatMsg[],
  charBudget = HISTORY_CHAR_BUDGET,
  maxMessages = HISTORY_MAX_MESSAGES,
): ChatMsg[] {
  const recent = history.slice(-maxMessages);
  const out: ChatMsg[] = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const cost = recent[i].content.length;
    if (out.length > 0 && used + cost > charBudget) break;
    out.unshift(recent[i]);
    used += cost;
  }
  return out;
}

/** The chat/completions message array for one turn. `decision` (defaulting to
 *  a fresh classification of `userText`) folds the router's per-route framing
 *  into the system message — mirrors web's buildWireMessages, minus the
 *  continuity-anchor/live-clock extras (not requested for the phone in this
 *  round; the history budget already keeps context bounded). */
export function buildWireMessages(
  history: ChatMsg[],
  userText: string,
  decision: ChatRouteDecision = classifyChatRequest(userText),
): WireMsg[] {
  return [
    { content: `${CHAT_SYSTEM_PROMPT}\n\n${routeInstruction(decision.route)}`, role: "system" },
    ...trimHistory(history).map((msg) => ({ content: msg.content, role: msg.role })),
    { content: userText, role: "user" },
  ];
}

export type ChatErrorKind = "budget" | "auth" | "unreachable" | "generic";

function errorCode(body: unknown): string {
  return typeof body === "object" && body !== null
    ? ((body as { error?: { code?: string } }).error?.code ?? "")
    : "";
}

/** Classify the valve's error shape — mirrors web's chatErrorKind so the UI can
 *  (eventually) style a budget card differently from a plain error row. */
export function chatErrorKind(status: number, body: unknown): ChatErrorKind {
  if (errorCode(body) === "daily_token_budget_exhausted" || status === 429) return "budget";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500 || status === 502) return "unreachable";
  return "generic";
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

/** Format live web-search results into a context block the model is told to
 *  cite from — ported from apps/web/lib/workspace/chat-web-search.ts's
 *  formatWebSearchContext (that module's trigger heuristics are NOT ported;
 *  the phone's ONLY search trigger is chat-routing.ts's `searchWeb` decision). */
export function formatWebSearchContext(results: ChatSource[]): string {
  const usable = results.filter((result) => result.url && (result.title || result.description)).slice(0, 5);
  if (usable.length === 0) return "";
  return [
    "Live web search results (use these for current facts and cite the relevant URL in the answer):",
    ...usable.map((result, index) => `${index + 1}. ${result.title || result.url}\nURL: ${result.url}\n${result.description}`),
  ].join("\n\n");
}

/** Parse a non-streaming chat/completions response body into assistant text. */
export function completionText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" && message.content.trim() ? message.content : null;
}
