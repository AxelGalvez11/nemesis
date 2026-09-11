// ── Chats in the workspace ──────────────────────────────────────────────────────────────────────────────────────────
//
// The Chat tab keeps a person's conversations with Nemesis in chat_threads and chat_messages, the app's own chat
// tables (each row readable and writable by its owner only). A chat made here is an ordinary chat record, and the
// chats people had before the canvas took over come back in the same list. The answers come from the board's turn
// (lib/board/board-turn.ts), the door every chat surface in the app uses; runtime.js makes that call.

/** What the tables accept: chat_threads_title_check and chat_messages_content_check. */
export const CHAT_TITLE_MAX = 200;
export const CHAT_MESSAGE_MAX = 60_000;
/** How much of a conversation rides along with each question. The newest messages win. */
export const CHAT_HISTORY_CHARS = 24_000;
export const CHAT_HISTORY_MESSAGES = 20;

export interface ChatSummary {
  id: string;
  title: string;
  /** Last activity, in milliseconds. */
  at: number;
  pinned: boolean;
  /** The workspace page this chat was started in, or null for a general chat (docs/space/PLAN.md, M13). */
  workspace: string | null;
}

export interface ChatCitation {
  title: string;
  url: string;
}

export interface ChatLine {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  sources: ChatCitation[];
}

type Row = Record<string, unknown>;

interface ReadQuery extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq(column: string, value: unknown): ReadQuery;
  order(column: string, options: { ascending: boolean }): ReadQuery;
  limit(count: number): ReadQuery;
}

/** The part of a Supabase client these calls use. */
export interface ChatDb {
  from(table: string): {
    select(columns: string): ReadQuery;
    insert(row: Row): PromiseLike<{ error: unknown }>;
    update(patch: Row): { eq(column: string, value: unknown): PromiseLike<{ error: unknown }> };
  };
}

const millis = (value: unknown): number => {
  const t = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(t) ? t : 0;
};

function fail(error: unknown, what: string): never {
  const detail = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  throw new Error(`${what}: ${detail}`);
}

/** A chat's name until Nemesis names it: the first line of the first question. */
export function chatTitle(text: string): string {
  const line = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  if (!line) return "New chat";
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
}

/** Sources saved with an answer. Older chats saved `{ title, url, description }`; both read the same. */
export function citationsOf(meta: unknown): ChatCitation[] {
  const list = meta && typeof meta === "object" ? (meta as { sources?: unknown }).sources : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((s: unknown) => {
    if (!s || typeof s !== "object") return [];
    const { title, url } = s as Row;
    return typeof url === "string" && url ? [{ title: typeof title === "string" && title ? title : url, url }] : [];
  });
}

/**
 * The workspace a chat was started in.
 *
 * 🔴 IT LIVES IN THE THREAD'S OWN `meta`, NOT IN A NEW COLUMN. A chat belongs to at most one workspace and nothing
 * queries by it, so a column and a migration would buy nothing that a field on the row does not already give.
 */
export function workspaceOf(meta: unknown): string | null {
  const value = meta && typeof meta === "object" ? (meta as { workspace?: unknown }).workspace : null;
  return typeof value === "string" && value ? value : null;
}

/** The person's chats, most recently active first. */
export async function listChats(db: ChatDb, userId: string, limit = 200): Promise<ChatSummary[]> {
  const { data, error } = await db
    .from("chat_threads")
    .select("id,title,pinned,updated_at,meta")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) fail(error, "chats could not be listed");
  return (data ?? []).flatMap((r) =>
    typeof r.id === "string"
      ? [
          {
            id: r.id,
            title: typeof r.title === "string" && r.title.trim() ? r.title : "New chat",
            at: millis(r.updated_at),
            pinned: r.pinned === true,
            workspace: workspaceOf(r.meta),
          },
        ]
      : [],
  );
}

/** One chat's questions and answers, oldest first. System rows belong to the model and are never shown. */
export async function loadChatLines(db: ChatDb, chatId: string): Promise<ChatLine[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("id,role,content,meta,created_at")
    .eq("thread_id", chatId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) fail(error, "the chat could not be opened");
  return (data ?? []).flatMap((r) =>
    r.role === "user" || r.role === "assistant"
      ? [{ id: String(r.id), role: r.role as ChatLine["role"], text: typeof r.content === "string" ? r.content : "", at: millis(r.created_at), sources: citationsOf(r.meta) }]
      : [],
  );
}

export async function createChat(db: ChatDb, userId: string, chatId: string, title: string, workspace: string | null = null): Promise<void> {
  const { error } = await db.from("chat_threads").insert({
    id: chatId,
    user_id: userId,
    title: title.slice(0, CHAT_TITLE_MAX),
    pinned: false,
    ...(workspace ? { meta: { workspace } } : {}),
  });
  if (error) fail(error, "the chat could not be saved");
}

export async function saveChatLine(
  db: ChatDb,
  userId: string,
  chatId: string,
  line: { id: string; role: ChatLine["role"]; text: string; sources?: readonly ChatCitation[] },
): Promise<void> {
  const sources = (line.sources ?? []).slice(0, 40).map((s) => ({ title: s.title, url: s.url }));
  const { error } = await db.from("chat_messages").insert({
    id: line.id,
    thread_id: chatId,
    user_id: userId,
    role: line.role,
    content: line.text.slice(0, CHAT_MESSAGE_MAX),
    meta: sources.length ? { sources } : null,
  });
  if (error) fail(error, "the message could not be saved");
}

/** Moves a chat to the top of the list, and renames it once Nemesis has named it. */
export async function touchChat(db: ChatDb, chatId: string, title?: string): Promise<void> {
  const patch: Row = { updated_at: new Date().toISOString() };
  if (title) patch.title = title.slice(0, CHAT_TITLE_MAX);
  const { error } = await db.from("chat_threads").update(patch).eq("id", chatId);
  if (error) fail(error, "the chat could not be updated");
}

/**
 * The conversation so far, as the model reads it with the next question: the newest messages that fit, oldest first,
 * starting from a question (a provider in the fallback chain refuses a conversation that opens with its own answer).
 */
export function chatHistory(
  lines: ReadonlyArray<{ role: string; text: string }>,
  chars = CHAT_HISTORY_CHARS,
  count = CHAT_HISTORY_MESSAGES,
): Array<{ role: ChatLine["role"]; content: string }> {
  const kept: Array<{ role: ChatLine["role"]; content: string }> = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0 && kept.length < count; i--) {
    const line = lines[i]!;
    if ((line.role !== "user" && line.role !== "assistant") || !line.text.trim()) continue;
    if (kept.length && used + line.text.length > chars) break;
    kept.unshift({ role: line.role, content: line.text.slice(-chars) });
    used += line.text.length;
  }
  while (kept.length && kept[0]!.role !== "user") kept.shift();
  return kept;
}
