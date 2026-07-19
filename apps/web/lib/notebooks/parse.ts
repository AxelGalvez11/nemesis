// Pure parsers + types for Notebooks. Imports NOTHING (stays import-safe under bare `tsx` tests):
// the network CRUD that instantiates the Supabase client lives in ./api. The Supabase client is
// untyped for these new tables, so every row from the wire is defensively re-validated here —
// never trust a network response's shape, typed client or not.

export type NotebookSourceKind = "library" | "text" | "url" | "pdf" | "docx" | "pptx" | "youtube";

/** The source kinds a Phase-1 notebook accepts. `youtube` is wired in the schema for the immediate
 *  fast-follow; the UI enables the other six first. */
export const NOTEBOOK_SOURCE_KINDS: readonly NotebookSourceKind[] = [
  "library",
  "text",
  "url",
  "pdf",
  "docx",
  "pptx",
  "youtube",
];

export interface Notebook {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  updatedAt: string;
}

export interface NotebookSource {
  id: string;
  notebookId: string;
  kind: NotebookSourceKind;
  name: string;
  /** Extracted/pasted text (library = note snapshot; url/pdf/docx/pptx/youtube = extracted text). */
  content: string | null;
  /** url + youtube sources: the original link. Null otherwise. */
  sourceUrl: string | null;
  /** library sources only: the readable_library_documents.path referenced. */
  libraryPath: string | null;
  bytes: number | null;
  createdAt: string;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function str(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function isSourceKind(x: unknown): x is NotebookSourceKind {
  return typeof x === "string" && (NOTEBOOK_SOURCE_KINDS as readonly string[]).includes(x);
}

/** Validate one `notebooks` row. Requires a string id + name; everything else degrades gracefully. */
export function toNotebook(raw: unknown): Notebook | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    description: str(raw.description),
    instructions: str(raw.instructions),
    updatedAt: str(raw.updated_at) ?? "",
  };
}

/** Validate one `notebook_sources` row. Requires a string id + notebook_id + a known kind. */
export function toNotebookSource(raw: unknown): NotebookSource | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const notebookId = str(raw.notebook_id);
  if (!id || !notebookId || !isSourceKind(raw.kind)) return null;
  return {
    id,
    notebookId,
    kind: raw.kind,
    name: str(raw.name) ?? "Untitled source",
    content: str(raw.content),
    sourceUrl: str(raw.source_url),
    libraryPath: str(raw.library_path),
    bytes: typeof raw.bytes === "number" ? raw.bytes : null,
    createdAt: str(raw.created_at) ?? "",
  };
}

export type NotebookChatRole = "user" | "assistant" | "system";

/** One chat thread inside a notebook (the Claude-Projects "Recents" row). */
export interface NotebookChat {
  id: string;
  notebookId: string;
  title: string;
  updatedAt: string;
}

/** One persisted message in a notebook chat. */
export interface NotebookChatMessage {
  id: string;
  chatId: string;
  role: NotebookChatRole;
  content: string;
  createdAt: string;
}

function isChatRole(x: unknown): x is NotebookChatRole {
  return x === "user" || x === "assistant" || x === "system";
}

/** Validate one `notebook_chats` row. Requires a string id + notebook_id. */
export function toNotebookChat(raw: unknown): NotebookChat | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const notebookId = str(raw.notebook_id);
  if (!id || !notebookId) return null;
  return {
    id,
    notebookId,
    title: str(raw.title) ?? "New chat",
    updatedAt: str(raw.updated_at) ?? "",
  };
}

/** Validate one `notebook_chat_messages` row. Requires id + chat_id + a known role + string content. */
export function toNotebookChatMessage(raw: unknown): NotebookChatMessage | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const chatId = str(raw.chat_id);
  const content = str(raw.content);
  if (!id || !chatId || !isChatRole(raw.role) || content === null) return null;
  return {
    id,
    chatId,
    role: raw.role,
    content,
    createdAt: str(raw.created_at) ?? "",
  };
}

/** Map a Supabase `data` array through a row parser, dropping rows that fail validation. */
export function mapRows<T>(data: unknown, parse: (r: unknown) => T | null): T[] {
  if (!Array.isArray(data)) return [];
  const out: T[] = [];
  for (const row of data) {
    const parsed = parse(row);
    if (parsed) out.push(parsed);
  }
  return out;
}
