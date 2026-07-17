// Phone Chat (cloud-first pivot, P1a): talks to the SAME metered valve as the
// desktop app (nemesis-llm edge function) — server-side model routing, plan
// budgets, and failover all apply unchanged, so chat here bills exactly like
// chat on the Mac. No Mac involvement anywhere in this path: this is the app's
// first fully standalone surface.
//
// Auth = a device key minted once from the signed-in Supabase session
// (POST /device-key with the user JWT → nmk_… stored in SecureStore). A revoked
// key self-heals: one re-mint retry, then the error surfaces.
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
import { buildWireMessages, chatErrorMessage, completionText, type ChatMsg } from "@/lib/chat-thread";

const LLM_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-llm`;
const DEVICE_KEY_STORE = "nemesis_device_key_v1";
const THREAD_PATH = `${FileSystem.documentDirectory ?? ""}chat-thread-v1.json`;
const CHAT_MODEL = "deepseek-chat";

async function mintDeviceKey(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return null;
  try {
    const res = await fetch(`${LLM_BASE}/device-key`, {
      body: JSON.stringify({ label: "Nemesis iPhone" }),
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: string };
    if (typeof body.key !== "string" || !body.key.startsWith("nmk_")) return null;
    await SecureStore.setItemAsync(DEVICE_KEY_STORE, body.key);
    return body.key;
  } catch {
    return null;
  }
}

async function deviceKey(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(DEVICE_KEY_STORE);
    if (stored?.startsWith("nmk_")) return stored;
  } catch {
    // fall through to a fresh mint
  }
  return mintDeviceKey();
}

export interface ChatReply {
  text: string | null;
  errorText: string | null;
}

/** One non-streaming completion turn. Never throws — errors come back as a
 *  student-readable line for the thread. */
export async function sendChat(history: ChatMsg[], userText: string): Promise<ChatReply> {
  let key = await deviceKey();
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
    // A revoked/unknown key (wiped server-side, restored phone) re-mints once.
    if (res.status === 401 || res.status === 403) {
      const fresh = await mintDeviceKey();
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

// --- thread persistence (one rolling thread, local to this phone) ---------------

function castMsg(row: unknown): ChatMsg | null {
  if (typeof row !== "object" || row === null) return null;
  const { role, content, at } = row as Record<string, unknown>;
  if (role !== "user" && role !== "assistant") return null;
  if (typeof content !== "string" || typeof at !== "string") return null;
  return { at, content, role };
}

export async function loadChatThread(): Promise<ChatMsg[]> {
  try {
    const info = await FileSystem.getInfoAsync(THREAD_PATH);
    if (!info.exists) return [];
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(THREAD_PATH)) as {
      v?: number;
      messages?: unknown;
    };
    if (parsed?.v !== 1 || !Array.isArray(parsed.messages)) return [];
    return parsed.messages.map(castMsg).filter((m): m is ChatMsg => m !== null);
  } catch {
    return [];
  }
}

export async function saveChatThread(messages: ChatMsg[]): Promise<void> {
  try {
    // Cap what persists — the send path trims again anyway.
    await FileSystem.writeAsStringAsync(THREAD_PATH, JSON.stringify({ messages: messages.slice(-200), v: 1 }));
  } catch {
    // best-effort
  }
}

export async function clearChatThread(): Promise<void> {
  try {
    await FileSystem.deleteAsync(THREAD_PATH, { idempotent: true });
  } catch {
    // best-effort
  }
}
