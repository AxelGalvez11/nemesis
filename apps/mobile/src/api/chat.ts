// Phone Chat (cloud-first pivot, P1a): talks to the SAME metered valve as the
// desktop app (nemesis-llm edge function) — server-side model routing, plan
// budgets, and failover all apply unchanged, so chat here bills exactly like
// chat on the Mac. No Mac involvement anywhere in this path: this is the app's
// first fully standalone surface.
//
// Identity rules (review findings, 2026-07-17 — same class as reviewEvents):
// EVERYTHING here is scoped to the signed-in user's id. The device key lives
// under a per-user SecureStore entry and is only ever minted from a session
// whose user matches; the rolling thread file is per-user too. An account
// switch on this phone can neither read, upload, nor bill against another
// account's conversation — each user's key and thread simply wait for them.
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
import { buildWireMessages, chatErrorMessage, completionText, type ChatMsg } from "@/lib/chat-thread";

const LLM_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-llm`;
const CHAT_MODEL = "deepseek-chat";

// SecureStore keys allow [A-Za-z0-9._-]; uuids fit as-is.
const deviceKeyStoreFor = (uid: string) => `nemesis_device_key_v1_${uid}`;
const threadPathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}chat-thread-v1-${uid}.json`;

/** Mint a device key for the CURRENT session, only if it belongs to `uid` —
 *  a stale screen from a previous account must never mint under the new one. */
async function mintDeviceKey(uid: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) return null;
  try {
    const res = await fetch(`${LLM_BASE}/device-key`, {
      body: JSON.stringify({ label: "Nemesis iPhone" }),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: string };
    if (typeof body.key !== "string" || !body.key.startsWith("nmk_")) return null;
    await SecureStore.setItemAsync(deviceKeyStoreFor(uid), body.key);
    return body.key;
  } catch {
    return null;
  }
}

async function deviceKey(uid: string): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(deviceKeyStoreFor(uid));
    if (stored?.startsWith("nmk_")) return stored;
  } catch {
    // fall through to a fresh mint
  }
  return mintDeviceKey(uid);
}

export interface ChatReply {
  text: string | null;
  errorText: string | null;
}

/** One non-streaming completion turn for the signed-in user `uid`. Never
 *  throws — errors come back as a student-readable line for the screen. */
export async function sendChat(uid: string, history: ChatMsg[], userText: string): Promise<ChatReply> {
  let key = await deviceKey(uid);
  if (!key) return { errorText: "Sign in to chat.", text: null };

  const payload = JSON.stringify({ messages: buildWireMessages(history, userText), model: CHAT_MODEL });
  const call = (bearer: string) =>
    fetch(`${LLM_BASE}/v1/chat/completions`, {
      body: payload,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      method: "POST",
    });

  try {
    let res = await call(key);
    // A revoked/unknown key (wiped server-side, restored phone) re-mints once —
    // still strictly under this uid's session.
    if (res.status === 401 || res.status === 403) {
      const fresh = await mintDeviceKey(uid);
      if (fresh) {
        key = fresh;
        res = await call(key);
      }
    }
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) return { errorText: chatErrorMessage(res.status, body), text: null };
    const text = completionText(body);
    return text
      ? { errorText: null, text }
      : { errorText: "The answer came back empty. Try again.", text: null };
  } catch {
    return { errorText: "You're offline — chat needs a connection (your Library still works).", text: null };
  }
}

// --- thread persistence (one rolling thread PER USER, local to this phone) ------

function castMsg(row: unknown): ChatMsg | null {
  if (typeof row !== "object" || row === null) return null;
  const { role, content, at } = row as Record<string, unknown>;
  if (role !== "user" && role !== "assistant") return null;
  if (typeof content !== "string" || typeof at !== "string") return null;
  return { at, content, role };
}

export async function loadChatThread(uid: string): Promise<ChatMsg[]> {
  try {
    const path = threadPathFor(uid);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return [];
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as {
      v?: number;
      messages?: unknown;
    };
    if (parsed?.v !== 1 || !Array.isArray(parsed.messages)) return [];
    return parsed.messages.map(castMsg).filter((m): m is ChatMsg => m !== null);
  } catch {
    return [];
  }
}

export async function saveChatThread(uid: string, messages: ChatMsg[]): Promise<void> {
  try {
    // Cap what persists — the send path trims again anyway.
    await FileSystem.writeAsStringAsync(threadPathFor(uid), JSON.stringify({ messages: messages.slice(-200), v: 1 }));
  } catch {
    // best-effort
  }
}

export async function clearChatThread(uid: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(threadPathFor(uid), { idempotent: true });
  } catch {
    // best-effort
  }
}
