// Chat-thread pure logic (cloud-first pivot, P1a): transcript shaping for the
// phone's Chat surface. Dependency-free by design (Deno-testable) — the network
// half lives in api/chat.ts.
//
// The phone talks to the SAME metered valve as the desktop (nemesis-llm), so
// there is no client-side token accounting here — just context-window hygiene:
// send a bounded slice of the transcript, never the whole history.

export type ChatRole = "assistant" | "user";

export interface ChatMsg {
  role: ChatRole;
  content: string;
  /** ISO timestamp — display + persistence only, never sent upstream. */
  at: string;
}

export interface WireMsg {
  role: "assistant" | "system" | "user";
  content: string;
}

/** Nemesis speaks for itself here (same soul rules as the desktop agent):
 *  plain, concise, no emojis, never a different product's name. */
export const CHAT_SYSTEM_PROMPT =
  "You are Nemesis, a study assistant for health-sciences students. " +
  "Answer plainly and concisely. Use markdown when structure helps (lists, tables). " +
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

/** The chat/completions message array for one turn. */
export function buildWireMessages(history: ChatMsg[], userText: string): WireMsg[] {
  return [
    { content: CHAT_SYSTEM_PROMPT, role: "system" },
    ...trimHistory(history).map((msg) => ({ content: msg.content, role: msg.role })),
    { content: userText, role: "user" },
  ];
}

/** Map the valve's error shapes to one student-readable line. */
export function chatErrorMessage(status: number, body: unknown): string {
  const code =
    typeof body === "object" && body !== null
      ? ((body as { error?: { code?: string; message?: string } }).error?.code ?? "")
      : "";
  const message =
    typeof body === "object" && body !== null
      ? ((body as { error?: { message?: string } }).error?.message ?? "")
      : "";

  if (code === "daily_token_budget_exhausted" || status === 429) {
    return message || "You've reached today's usage limit. It resets tomorrow, or upgrade for more.";
  }
  if (status === 401 || status === 403) {
    return "This device needs to re-connect to your account. Try again — it repairs itself.";
  }
  if (status >= 500 || status === 502) {
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
