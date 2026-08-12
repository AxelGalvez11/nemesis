// Notebooks I/O layer (phone port of the web Notebooks feature): Supabase CRUD for
// notebooks / notebook_sources / notebook_chats / notebook_chat_messages / notebook_outputs,
// plus the nemesis-llm streaming transport for grounded notebook chat. RLS scopes every row
// to auth.uid(), so reads carry no explicit user filter (mirrors apps/web/lib/notebooks/*.ts).
//
// The chat transport is the SAME device-key mint + expo/fetch SSE recipe api/chat.ts uses
// (nemesis-llm valve, "nmk_" device keys) — deliberately re-implemented here rather than
// imported, since chat.ts doesn't export its private deviceKey/postChatCompletion and is
// off-limits to edit. It reads/writes the EXACT SAME SecureStore entry
// (`nemesis_device_key_v1_${uid}`) so a key minted by either surface is shared, never a
// parallel mint. Pure prompt-assembly + row-parsing lives in lib/notebook-model.ts.
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";

import { classifyChatRequest } from "@/lib/chat-routing";
import { chatErrorMessage, type WireMsg } from "@/lib/chat-thread";
import { readCompletionStream, type CompletionDeltaHandler } from "@/lib/chat-stream";
import {
  buildNotebookWireMessages,
  mapRows,
  toNotebook,
  toNotebookChat,
  toNotebookChatMessage,
  toNotebookOutput,
  toNotebookSource,
  type Notebook,
  type NotebookChat,
  type NotebookChatMessage,
  type NotebookChatEntry,
  type NotebookChatRole,
  type NotebookOutput,
  type NotebookSource,
  type NotebookSourceKind,
  type NotebookWireSource,
} from "@/lib/notebook-model";

import { supabase } from "./supabase";

export type {
  Notebook,
  NotebookChat,
  NotebookChatMessage,
  NotebookChatEntry,
  NotebookChatRole,
  NotebookOutput,
  NotebookOutputKind,
  NotebookOutputStatus,
  NotebookSource,
  NotebookSourceKind,
  NotebookWireSource,
} from "@/lib/notebook-model";

const LLM_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-llm`;

// Cost attribution tag for the metering valve. Duplicated from api/chat.ts on purpose —
// this file deliberately keeps its own copy of the transport (see the header comment).
const CLIENT_HEADER = { "X-Nemesis-Client": "ios" } as const;

/** The model name on the wire. A CONSTANT — see api/chat.ts. */
const WIRE_MODEL = "deepseek-chat";

/** PostgREST "relation does not exist" — lets reads degrade to empty instead of throwing
 *  (mirrors apps/web/lib/notebooks/api.ts's isMissingRelation guard). */
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// ── Notebooks ────────────────────────────────────────────────────────────────

const NOTEBOOK_COLS = "id,name,description,instructions,updated_at";
const SOURCE_COLS = "id,notebook_id,kind,name,content,source_url,library_path,bytes,created_at";
const CHAT_COLS = "id,notebook_id,title,updated_at";
const MESSAGE_COLS = "id,chat_id,role,content,created_at";
const OUTPUT_COLS = "id,notebook_id,kind,title,content,status,created_at";

export async function listNotebooks(): Promise<Notebook[]> {
  const { data, error } = await supabase.from("notebooks").select(NOTEBOOK_COLS).order("updated_at", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`notebooks failed: ${error.message}`);
  }
  return mapRows(data, toNotebook);
}

/** Single-row fetch for the detail screen (app/notebook.tsx) — cheaper than pulling the
 *  whole list just to open one notebook, and correct regardless of how the screen was
 *  reached (list tap, deep link, cold start on a route param). RLS scopes the read, so a
 *  foreign or deleted id resolves to null rather than an error — same posture as
 *  api/cloudLibrary.ts's fetchNote. */
export async function getNotebookById(id: string): Promise<Notebook | null> {
  const { data, error } = await supabase.from("notebooks").select(NOTEBOOK_COLS).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw new Error(`notebook failed: ${error.message}`);
  }
  return data ? toNotebook(data) : null;
}

export async function createNotebook(name: string): Promise<Notebook | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebooks")
    .insert({ name: name.trim().slice(0, 200) || "Untitled notebook", user_id: userId })
    .select(NOTEBOOK_COLS)
    .maybeSingle();
  if (error || !data) return null;
  return toNotebook(data);
}

export async function renameNotebookById(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("notebooks").update({ name: name.trim().slice(0, 200) || "Untitled notebook" }).eq("id", id);
  if (error) throw new Error(`rename notebook failed: ${error.message}`);
}

export async function deleteNotebookById(id: string): Promise<void> {
  const { error } = await supabase.from("notebooks").delete().eq("id", id);
  if (error) throw new Error(`delete notebook failed: ${error.message}`);
}

// ── Sources ──────────────────────────────────────────────────────────────────

export async function listNotebookSources(notebookId: string): Promise<NotebookSource[]> {
  const { data, error } = await supabase
    .from("notebook_sources")
    .select(SOURCE_COLS)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`notebook sources failed: ${error.message}`);
  }
  return mapRows(data, toNotebookSource);
}

/** Reference a Library note (a pointer + a text snapshot for grounding) — the ONLY source
 *  type the phone can add: url/pdf/docx/pptx extraction needs the web app's Node routes. */
export async function addLibrarySourceToNotebook(
  notebookId: string,
  input: { path: string; title: string; content: string },
): Promise<NotebookSource | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebook_sources")
    .insert({
      bytes: input.content.length,
      content: input.content,
      kind: "library" satisfies NotebookSourceKind,
      library_path: input.path,
      name: input.title.trim().slice(0, 200) || "Untitled note",
      notebook_id: notebookId,
      user_id: userId,
    })
    .select(SOURCE_COLS)
    .maybeSingle();
  if (error) throw new Error(`add source failed: ${error.message}`);
  return data ? toNotebookSource(data) : null;
}

export async function deleteNotebookSource(id: string): Promise<void> {
  const { error } = await supabase.from("notebook_sources").delete().eq("id", id);
  if (error) throw new Error(`delete source failed: ${error.message}`);
}

// ── Chats ────────────────────────────────────────────────────────────────────

export async function listNotebookChats(notebookId: string): Promise<NotebookChat[]> {
  const { data, error } = await supabase
    .from("notebook_chats")
    .select(CHAT_COLS)
    .eq("notebook_id", notebookId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`notebook chats failed: ${error.message}`);
  }
  return mapRows(data, toNotebookChat);
}

export async function createNotebookChat(notebookId: string, title: string): Promise<NotebookChat | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebook_chats")
    .insert({ notebook_id: notebookId, title: title.trim().slice(0, 200) || "New chat", user_id: userId })
    .select(CHAT_COLS)
    .maybeSingle();
  if (error || !data) return null;
  return toNotebookChat(data);
}

/** Move a chat to the top of Recents after a new turn. Fire-and-forget from the caller's
 *  side (a failed bump only affects sort order, never correctness) — mirrors
 *  apps/web/lib/notebooks/chats-api.ts's touchChat exactly. */
export async function touchNotebookChat(id: string): Promise<void> {
  await supabase.from("notebook_chats").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

// ── Messages ───────────────────────────────────────────────────────────────────

export async function listNotebookChatMessages(chatId: string): Promise<NotebookChatMessage[]> {
  const { data, error } = await supabase
    .from("notebook_chat_messages")
    .select(MESSAGE_COLS)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`notebook messages failed: ${error.message}`);
  }
  return mapRows(data, toNotebookChatMessage);
}

export async function appendNotebookChatMessage(input: {
  chatId: string;
  notebookId: string;
  role: NotebookChatRole;
  content: string;
}): Promise<NotebookChatMessage | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebook_chat_messages")
    .insert({ chat_id: input.chatId, content: input.content, notebook_id: input.notebookId, role: input.role, user_id: userId })
    .select(MESSAGE_COLS)
    .maybeSingle();
  if (error) throw new Error(`append message failed: ${error.message}`);
  return data ? toNotebookChatMessage(data) : null;
}

/** Cloud rows only ever carry user/assistant into the phone transcript (a "system" role row
 *  is schema-legal but never rendered) — mirrors apps/web/lib/notebooks/chat.ts's toEntries. */
export function toChatEntries(rows: NotebookChatMessage[]): NotebookChatEntry[] {
  const out: NotebookChatEntry[] = [];
  for (const r of rows) {
    if (r.role === "user" || r.role === "assistant") out.push({ at: r.createdAt, content: r.content, role: r.role });
  }
  return out;
}

// ── Outputs (read-only on the phone — generation is a web-app action) ──────────

export async function listNotebookOutputs(notebookId: string): Promise<NotebookOutput[]> {
  const { data, error } = await supabase
    .from("notebook_outputs")
    .select(OUTPUT_COLS)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`notebook outputs failed: ${error.message}`);
  }
  return mapRows(data, toNotebookOutput);
}

// ── nemesis-llm device key (SAME SecureStore entry as api/chat.ts) ─────────────

const deviceKeyStoreFor = (uid: string) => `nemesis_device_key_v1_${uid}`;

/** Mint a device key for the CURRENT session, only if it belongs to `uid` — a stale screen
 *  from a previous account must never mint under the new one. Shares the exact SecureStore
 *  key api/chat.ts mints into, so whichever surface asks first is the only one that ever
 *  needs to mint. */
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

// ── Grounded chat/completions (streaming) ───────────────────────────────────────

export interface NotebookChatReply {
  text: string | null;
  errorText: string | null;
}

/** One completion turn over expo/fetch's streaming Response.body — same shape as
 *  api/chat.ts's private postChatCompletion. Never throws; network/API failures come back
 *  as a student-readable line so the caller can render it straight into the transcript
 *  (mirrors web notebook chat, which shows the error AS the assistant's reply rather than a
 *  separate error affordance). */
async function postNotebookCompletion(
  uid: string,
  wireMessages: WireMsg[],
  onDelta?: CompletionDeltaHandler,
): Promise<NotebookChatReply> {
  let key = await deviceKey(uid);
  if (!key) return { errorText: "Sign in to chat.", text: null };

  const payload = JSON.stringify({
    messages: wireMessages,
    model: WIRE_MODEL,
    stream: true,
  });
  const call = (bearer: string) =>
    expoFetch(`${LLM_BASE}/v1/chat/completions`, {
      body: payload,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", ...CLIENT_HEADER },
      method: "POST",
    });

  try {
    let res = await call(key);
    if (res.status === 401 || res.status === 403) {
      const fresh = await mintDeviceKey(uid);
      if (fresh) {
        key = fresh;
        res = await call(key);
      }
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      return { errorText: chatErrorMessage(res.status, body), text: null };
    }
    const text = await readCompletionStream(res.body, onDelta);
    return text ? { errorText: null, text } : { errorText: "The answer came back empty. Try again.", text: null };
  } catch {
    return { errorText: "You're offline — chat needs a connection. Try again in a moment.", text: null };
  }
}

export interface SendNotebookMessageOpts {
  uid: string;
  instructions: string | null;
  sources: NotebookWireSource[];
  history: NotebookChatEntry[];
  userText: string;
  onDelta?: CompletionDeltaHandler;
}

/** One grounded notebook turn: classify (model choice only — grounded mode never triggers a
 *  web search), assemble the sources-only wire messages (lib/notebook-model.ts), then stream
 *  the reply. Pure network call — persistence (appending the turn to notebook_chat_messages,
 *  bumping the chat's updated_at) is the caller's job, same split as api/chat.ts's
 *  sendChat()/saveThreadMessages(). */
export async function sendNotebookMessage(opts: SendNotebookMessageOpts): Promise<NotebookChatReply> {
  const decision = classifyChatRequest(opts.userText);
  const wire = buildNotebookWireMessages({
    decision,
    history: opts.history,
    instructions: opts.instructions,
    sources: opts.sources,
    userText: opts.userText,
  });
  return postNotebookCompletion(opts.uid, wire, opts.onDelta);
}

/** Move a chat thread's conversation into a notebook as a notebook chat (owner
 *  2026-07-22: a "Move to notebook" action in the chat "…" menu).
 *
 *  Chat threads and notebook chats are separate tables — chat_threads /
 *  chat_messages versus notebook_chats / notebook_chat_messages — so this is a
 *  real copy, not a re-parenting. Only role + content travel, because that is
 *  all a notebook_chat_messages row holds: per-message web sources and
 *  deliverable chips have nowhere to land and do NOT come along.
 *
 *  The caller deletes the source thread only AFTER this resolves, so a failure
 *  part-way through can never lose the conversation. */
export async function importChatThreadIntoNotebook(input: {
  notebookId: string;
  title: string;
  messages: readonly { role: NotebookChatRole; content: string }[];
}): Promise<NotebookChat | null> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to move this chat.");
  const chat = await createNotebookChat(input.notebookId, input.title);
  if (!chat) throw new Error("Couldn't create the chat in that notebook.");
  const rows = input.messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      chat_id: chat.id,
      content: message.content,
      notebook_id: input.notebookId,
      role: message.role,
      user_id: userId,
    }));
  if (rows.length > 0) {
    // One insert, so the transcript can't land half-written across many calls.
    const { error } = await supabase.from("notebook_chat_messages").insert(rows);
    if (error) throw new Error(`Couldn't copy the messages: ${error.message}`);
  }
  return chat;
}
