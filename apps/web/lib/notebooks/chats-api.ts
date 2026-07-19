// Cloud CRUD for notebook chats (the Claude-Projects "Recents") and their messages. RLS scopes every
// row to auth.uid(), so reads carry no explicit user filter. Mirrors lib/notebooks/api.ts against the
// fresh notebook_chats + notebook_chat_messages tables (migration 20260718T02_notebook_chats.sql).
// The Supabase client is untyped for these tables, so every row is re-validated through ./parse.

import { isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";

import {
  mapRows,
  toNotebookChat,
  toNotebookChatMessage,
  type NotebookChat,
  type NotebookChatMessage,
  type NotebookChatRole,
} from "./parse";

export type { NotebookChat, NotebookChatMessage, NotebookChatRole } from "./parse";

/** PostgREST "relation does not exist" — the chat tables aren't applied to this project yet. Lets
 *  reads degrade to empty in the window before the migration lands (page still renders). */
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

const CHAT_COLS = "id,notebook_id,title,updated_at";
const MESSAGE_COLS = "id,chat_id,role,content,created_at";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// ── Chats ────────────────────────────────────────────────────────────────────

export async function listChats(notebookId: string): Promise<NotebookChat[]> {
  if (isPreviewMode) return [];
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

export async function createChat(notebookId: string, title: string): Promise<NotebookChat | null> {
  if (isPreviewMode) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebook_chats")
    .insert({ user_id: userId, notebook_id: notebookId, title: title.trim().slice(0, 200) || "New chat" })
    .select(CHAT_COLS)
    .maybeSingle();
  if (error || !data) return null;
  return toNotebookChat(data);
}

export async function renameChat(id: string, title: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase
    .from("notebook_chats")
    .update({ title: title.trim().slice(0, 200) || "New chat" })
    .eq("id", id);
  if (error) throw new Error(`rename chat failed: ${error.message}`);
}

export async function deleteChat(id: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("notebook_chats").delete().eq("id", id);
  if (error) throw new Error(`delete chat failed: ${error.message}`);
}

/** Move a chat to the top of Recents after a new turn. The updated_at trigger sets now() on any
 *  update; fire-and-forget (a failed bump only affects sort order, never correctness). */
export async function touchChat(id: string): Promise<void> {
  if (isPreviewMode) return;
  await supabase.from("notebook_chats").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

// ── Messages ───────────────────────────────────────────────────────────────────

export async function listMessages(chatId: string): Promise<NotebookChatMessage[]> {
  if (isPreviewMode) return [];
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

/** Append one message. RLS + the not-null user_id default keep it scoped to the caller. */
export async function appendMessage(input: {
  chatId: string;
  notebookId: string;
  role: NotebookChatRole;
  content: string;
}): Promise<NotebookChatMessage | null> {
  if (isPreviewMode) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebook_chat_messages")
    .insert({
      user_id: userId,
      chat_id: input.chatId,
      notebook_id: input.notebookId,
      role: input.role,
      content: input.content,
    })
    .select(MESSAGE_COLS)
    .maybeSingle();
  if (error) throw new Error(`append message failed: ${error.message}`);
  return data ? toNotebookChatMessage(data) : null;
}
