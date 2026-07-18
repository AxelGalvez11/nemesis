// Chat wiring for the Sessions surface — ported verbatim from the mobile
// nemesis-llm recipe (apps/mobile/src/api/chat.ts + src/lib/chat-thread.ts):
// same device-key mint, same chat/completions call, same system prompt and
// history budget, same error copy. Web swaps SecureStore for localStorage and
// adds AbortSignal support (mobile has no cancel affordance).

import { supabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { SessionMessage } from "@/lib/workspace/sessions-store";

const LLM_BASE = `${supabaseUrl}/functions/v1/nemesis-llm`;
const CHAT_MODEL = "deepseek-chat";

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

/** The chat/completions message array for one turn. */
export function buildWireMessages(history: SessionMessage[], userText: string): WireMsg[] {
  return [
    { content: CHAT_SYSTEM_PROMPT, role: "system" },
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

/** Classify the valve's error shape — drives which error card the UI renders
 *  (the budget-exhausted card is visually distinct from a plain error row). */
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

/** Parse a non-streaming chat/completions response body into assistant text. */
export function completionText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" && message.content.trim() ? message.content : null;
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

async function deviceKey(uid: string): Promise<string | null> {
  const stored = readStoredKey(uid);
  if (stored) return stored;
  return mintDeviceKey(uid);
}

export interface ChatReply {
  text: string | null;
  errorText: string | null;
  errorKind: ChatErrorKind | null;
}

/** One non-streaming completion turn for the signed-in user `uid`. Resolves
 *  (never rejects) for network/API failures — those come back as a
 *  student-readable line. Only an aborted `signal` rejects, so the caller can
 *  tell "the user stopped it" apart from "it failed". */
export async function sendChatTurn(
  uid: string,
  history: SessionMessage[],
  userText: string,
  signal?: AbortSignal,
): Promise<ChatReply> {
  let key = await deviceKey(uid);
  if (!key) return { errorKind: "auth", errorText: "Sign in to chat.", text: null };

  const payload = JSON.stringify({ messages: buildWireMessages(history, userText), model: CHAT_MODEL });
  const call = (bearer: string) =>
    fetch(`${LLM_BASE}/v1/chat/completions`, {
      body: payload,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      method: "POST",
      signal,
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
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) return { errorKind: chatErrorKind(res.status, body), errorText: chatErrorMessage(res.status, body), text: null };
    const text = completionText(body);
    return text
      ? { errorKind: null, errorText: null, text }
      : { errorKind: "generic", errorText: "The answer came back empty. Try again.", text: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return {
      errorKind: "unreachable",
      errorText: "You're offline — chat needs a connection. Try again in a moment.",
      text: null,
    };
  }
}
