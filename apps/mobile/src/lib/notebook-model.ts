// Notebooks pure logic (phone port of the web Notebooks feature — apps/web/lib/notebooks/*):
// row parsers (never trust the wire — every row from Supabase is defensively re-validated
// here, mirroring apps/web/lib/notebooks/parse.ts) plus the grounded-chat prompt assembly
// (mirroring apps/web/lib/notebooks/chat.ts). Dependency-free aside from ./chat-thread.ts and
// ./chat-routing.ts (both already Deno-testable pure files) so this file stays Deno-testable
// too — the network half (Supabase calls, the nemesis-llm device-key transport) lives in
// api/notebooks.ts.

import { trimHistory, type WireMsg } from "./chat-thread.ts";
import { classifyChatRequest, routeInstruction, type ChatRouteDecision } from "./chat-routing.ts";

// ── Types (mirrors apps/web/lib/notebooks/parse.ts) ─────────────────────────

export type NotebookSourceKind = "library" | "text" | "url" | "pdf" | "docx" | "pptx" | "youtube";

/** The source kinds a Phase-1 notebook accepts. Only "library" is addable from the phone
 *  (see api/notebooks.ts) — url/pdf/docx/pptx/youtube extraction needs the web app's Node
 *  routes, which the phone can't call; "text" has no attach path here either. Every kind
 *  still needs to PARSE, though, so a source added on web/desktop renders correctly here. */
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

export type NotebookChatRole = "user" | "assistant" | "system";

/** One chat thread inside a notebook (the "Recents" row). */
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

export type NotebookOutputKind = "flashcards" | "test" | "slides";
export type NotebookOutputStatus = "pending" | "ready" | "failed";

/** One generated deliverable (notebook_outputs row). The phone lists and reads these —
 *  generation itself stays a web-app action (out of phone v1 scope). */
export interface NotebookOutput {
  id: string;
  notebookId: string;
  kind: NotebookOutputKind;
  title: string;
  content: string;
  status: NotebookOutputStatus;
  createdAt: string;
}

/** One in-memory transcript entry for the phone's notebook chat screen — deliberately
 *  narrower than the main Chat surface's ChatMsg (no client id, no web-search sources:
 *  notebook chat never searches the web). */
export interface NotebookChatEntry {
  role: "user" | "assistant";
  content: string;
  at: string;
}

// ── Parsers (never trust the wire, typed client or not) ─────────────────────

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function str(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function isSourceKind(x: unknown): x is NotebookSourceKind {
  return typeof x === "string" && (NOTEBOOK_SOURCE_KINDS as readonly string[]).includes(x);
}

function isChatRole(x: unknown): x is NotebookChatRole {
  return x === "user" || x === "assistant" || x === "system";
}

function isOutputKind(x: unknown): x is NotebookOutputKind {
  return x === "flashcards" || x === "test" || x === "slides";
}

function isOutputStatus(x: unknown): x is NotebookOutputStatus {
  return x === "pending" || x === "ready" || x === "failed";
}

/** Validate one `notebooks` row. Requires a string id + name; everything else degrades
 *  gracefully (a blank description/instructions reads as "not set", never an error). */
export function toNotebook(raw: unknown): Notebook | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  return {
    description: str(raw.description),
    id,
    instructions: str(raw.instructions),
    name,
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
    bytes: typeof raw.bytes === "number" ? raw.bytes : null,
    content: str(raw.content),
    createdAt: str(raw.created_at) ?? "",
    id,
    kind: raw.kind,
    libraryPath: str(raw.library_path),
    name: str(raw.name) ?? "Untitled source",
    notebookId,
    sourceUrl: str(raw.source_url),
  };
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

/** Validate one `notebook_chat_messages` row. Requires id + chat_id + a known role + content. */
export function toNotebookChatMessage(raw: unknown): NotebookChatMessage | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const chatId = str(raw.chat_id);
  const content = str(raw.content);
  if (!id || !chatId || !isChatRole(raw.role) || content === null) return null;
  return {
    chatId,
    content,
    createdAt: str(raw.created_at) ?? "",
    id,
    role: raw.role,
  };
}

/** Validate one `notebook_outputs` row. Requires id + notebook_id + a known kind + status. */
export function toNotebookOutput(raw: unknown): NotebookOutput | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const notebookId = str(raw.notebook_id);
  if (!id || !notebookId || !isOutputKind(raw.kind) || !isOutputStatus(raw.status)) return null;
  return {
    content: str(raw.content) ?? "",
    createdAt: str(raw.created_at) ?? "",
    id,
    kind: raw.kind,
    notebookId,
    status: raw.status,
    title: str(raw.title) ?? "",
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

// ── Grounded-chat prompt assembly (mirrors apps/web/lib/notebooks/chat.ts) ──

/** A notebook chat's own system prompt. GROUNDED MODE (owner 2026-07-20, ported verbatim
 *  from apps/web/lib/notebooks/chat.ts): answers come from the attached sources only — no
 *  web search, no silent general-knowledge fallback. When the sources don't cover it, the
 *  model says so and points at adding a source. */
export const NOTEBOOK_SYSTEM_PROMPT =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the user's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, evidence, or counterarguments when useful. Never use emojis. " +
  "This is a notebook chat: answer ONLY from the sources the student attached (their text is included below) and the student's instructions. " +
  "Point to the relevant source by name when it helps, and distinguish the source's claims from your inference. " +
  "If the sources don't cover the question, say so plainly and suggest attaching a relevant source — " +
  "do not answer from outside knowledge, do not search the web, and never invent facts or citations. " +
  "Basic conversational replies (greetings, clarifying what's in this notebook) are fine without sources.";

/** Total characters of source text injected into the system prompt. Bounds the request (the
 *  valve caps too); once sources exceed this, later ones are dropped with a note. */
export const SOURCE_CHAR_BUDGET = 30_000;

export interface NotebookWireSource {
  name: string;
  content: string | null;
}

export interface BuildNotebookWireOpts {
  instructions: string | null;
  sources: NotebookWireSource[];
  history: NotebookChatEntry[];
  userText: string;
  decision?: ChatRouteDecision;
}

/** Assemble the injected source-context block: each source's name + its text, truncated to
 *  stay within `budget` total characters (earlier sources win). Sources with no text are
 *  skipped. Returns "" when there's nothing to add. PURE. */
export function buildSourceContext(sources: NotebookWireSource[], budget = SOURCE_CHAR_BUDGET): string {
  const withText = sources.filter((s) => (s.content ?? "").trim().length > 0);
  if (!withText.length) return "";
  const parts: string[] = [];
  let used = 0;
  let included = 0;
  for (const s of withText) {
    if (used >= budget) break;
    const remaining = budget - used;
    const body = (s.content ?? "").trim();
    const clip = body.length > remaining ? `${body.slice(0, remaining)}\n…[truncated]` : body;
    parts.push(`### Source: ${s.name}\n${clip}`);
    used += clip.length;
    included += 1;
  }
  const omitted = withText.length - included;
  const footer = omitted > 0 ? `\n\n(${omitted} more source${omitted === 1 ? "" : "s"} not shown — over the size limit.)` : "";
  return `Sources the student added to this notebook:\n\n${parts.join("\n\n")}${footer}`;
}

/** The chat/completions message array for one notebook turn: the notebook system prompt,
 *  the route framing, the student's instructions (if any), the source text (budgeted), then
 *  trimmed history + the new user message. Grounded mode never adds live web results — the
 *  route classifier here only picks the model (deepseek-chat vs -reasoner + effort), it does
 *  NOT trigger a search. PURE. */
export function buildNotebookWireMessages(opts: BuildNotebookWireOpts): WireMsg[] {
  const decision = opts.decision ?? classifyChatRequest(opts.userText);
  const parts = [NOTEBOOK_SYSTEM_PROMPT, routeInstruction(decision.route)];
  const instructions = opts.instructions?.trim();
  if (instructions) {
    parts.push(`This notebook's instructions from the student (follow them):\n${instructions}`);
  }
  const sourceContext = buildSourceContext(opts.sources);
  if (sourceContext) parts.push(sourceContext);
  return [
    { content: parts.join("\n\n"), role: "system" },
    ...trimHistory(opts.history).map((m) => ({ content: m.content, role: m.role })),
    { content: opts.userText, role: "user" },
  ];
}

// ── Small pure helpers ───────────────────────────────────────────────────────

/** Derive a chat title from the student's first message (mirrors
 *  apps/web/components/workspace/notebooks/notebook-home.tsx's titleFromPrompt): collapsed
 *  whitespace, capped to 48 chars with an ellipsis. */
export function titleFromPrompt(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 48 ? t : `${t.slice(0, 48).trimEnd()}…`;
}
