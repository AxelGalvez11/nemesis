// The spatial Canvas — one board, many chat cards, saved as ONE JSON document.
//
// Owner, 2026-09-03: "replicate the wondering /canvas one for one so that we have a good baseline
// to work from." Every shape and limit here is copied from their shipped client; the numbers and
// the reasons live in docs/wondering-canvas-reference.md, §1 and §2.
//
// 🔴 THIS IS NOT `lib/learn/canvas-model.ts`. That file is the CHAT (the /learn conversation, which
// used to be called the canvas); this is the BOARD, a React Flow surface of chat cards. The two
// share the model door and the markdown renderer and nothing else. Internally this lane is named
// `board` so the ~120 `canvas-*` files of the chat cannot be confused with it; what a learner
// reads says "Canvas".

import type { BoardMakeKind } from "./board-deliverables";
import type { CanvasOutput, CanvasSource } from "@/lib/learn/canvas-model";
import type { TestRun } from "@/lib/learn/test-run";

import { parseBoardAnnotations, serializeBoardAnnotations, type BoardAnnotation } from "./board-annotations";

export const BOARD_DOCUMENT_VERSION = 1;

export const MAX_BOARD_CARDS = 250;
export const MAX_BOARD_TITLE_CHARACTERS = 120;
export const MAX_BOARD_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_BOARD_MESSAGE_CHARACTERS = 8_000;
export const MAX_BOARD_CONTEXT_EXCERPT_CHARACTERS = 4_000;
/** The last N turns of a card that ride into the next model call, and into a branch. */
export const CARD_CONTEXT_TURNS = 16;

export const BOARD_MESSAGE_TOO_LONG_REPLY =
  "Your message is over the 8,000-character limit. Shorten or split it, then try again.";
export const BOARD_REPLY_ERROR_FALLBACK = "Something went wrong answering this. Try again.";
export const NEW_THREAD_TITLE = "New thread";
export const UNTITLED_BOARD = "Untitled canvas";

export interface BoardPosition {
  x: number;
  y: number;
}

export interface BoardViewport extends BoardPosition {
  zoom: number;
}

export interface BoardCitation {
  url: string;
  title: string;
}

export interface BoardSuggestions {
  followUps: string[];
  branches: string[];
  newThreads: string[];
}

export function emptySuggestions(): BoardSuggestions {
  return { followUps: [], branches: [], newThreads: [] };
}

export interface BoardMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** The sentence this turn was asked about (a branch, a "Reply here", a dive-deeper). */
  contextExcerpt?: string;
  /** Which occurrence of that excerpt in the parent's text, when it appears more than once. */
  contextOccurrence?: number;
  citations?: BoardCitation[];
  suggestedQuestions?: BoardSuggestions;
  isError?: boolean;
  /** Written but never finished: the reply was in flight when the board was last saved. */
  pending?: boolean;
  /** Runtime only. Never serialised. */
  isStreaming?: boolean;
  wasTruncated?: boolean;
  /** The turn whose `newThreads` suggestions the board composer shows. */
  updatesComposerSuggestions?: boolean;
}

export type BoardHighlightKind = "saved" | "branch";

export interface BoardHighlight {
  id: string;
  category: "highlighted-text";
  kind: BoardHighlightKind;
  text: string;
  occurrence?: number;
  savedByUser: boolean;
  noteIds: string[];
}

export interface BoardSavedImage {
  id: string;
  category: "saved-image";
  url: string;
  alt: string;
}

export interface BoardNote {
  id: string;
  category: "note";
  contextExcerpt: string | null;
  contextOccurrence?: number;
  text: string;
  position: BoardPosition;
}

export type BoardCardKind = "conversation" | "lesson";
export type BoardCardStatus = "idle" | "streaming";

export interface BoardCard {
  id: string;
  kind: BoardCardKind;
  parentId: string | null;
  sourceIds: string[];
  contextExcerpt: string | null;
  contextOccurrence?: number;
  /** The parent's last turns, copied at branch time so a branch reads what came before it. */
  inheritedContext: Array<Pick<BoardMessage, "role" | "content">>;
  title: string;
  summary?: string;
  collapsed?: true;
  highlights: BoardHighlight[];
  savedImages: BoardSavedImage[];
  notes: BoardNote[];
  status: BoardCardStatus;
  position: BoardPosition;
  width: number;
  height?: number;
  messages: BoardMessage[];
}

export type BoardSourceType = "pdf" | "image" | "document";
export type BoardSourceStatus = "processing" | "ready" | "error";

export interface BoardSource {
  id: string;
  type: BoardSourceType;
  name: string;
  /** The extracted text: the card's preview, and the material for a source filed before grounding. */
  content: string;
  /**
   * The chat-shaped view of this document, so the board grounds and cites the way the chat does.
   *
   * 🔴 OWNER 2026-09-03: "i dont like that it makes up its own sources" and yes to "bring the chat's
   * document grounding to the canvas". The board used to paste `content` into the question up to
   * Wondering's limits; now `lib/board/board-grounding.ts` retrieves the passages the question
   * needs from `library_chunks`, labels every excerpt `[s1:e4]`, and the answer cites those ids.
   * Absent on a source dropped before this existed, which is built from `content` on the fly.
   */
  grounded?: CanvasSource;
  status: BoardSourceStatus;
  error?: string;
  /** Runtime only: object URLs for dropped images. Never serialised. */
  previewUrls: string[];
  position: BoardPosition;
  width: number;
  height?: number;
}

export interface BoardDocument {
  version: number;
  cards: BoardCard[];
  sources: BoardSource[];
  /** Absent on boards saved before deliverables joined; read as none. */
  outputs?: BoardOutputCard[];
  selectedSourceIds: string[];
  useWebSearch: boolean;
  viewport?: BoardViewport;
  /** Notes pinned inside a source, opened in the reading panel. See `board-annotations.ts`.
   *  🔴 OPTIONAL, BECAUSE EVERY BOARD SAVED BEFORE THIS EXISTED HAS NO SUCH FIELD and must load
   *  exactly as it always did. Absent reads as none. */
  annotations?: BoardAnnotation[];
}

export type BoardOutputStatus = "making" | "ready" | "error";

/**
 * A deliverable made on the board: flashcards, a note, a document, slides, a page, a report.
 *
 * Owner 2026-09-03, asked whether deliverables should join the canvas: "yes", to the shape "ask for
 * one in plain words in any card's follow-up box, or from the composer's + menu. The result appears
 * as its own card beside the thread it came from, joined by a line, and also lands in the Library
 * exactly as chat deliverables do." The `output` is the chat's own `CanvasOutput`, made by the
 * chat's own makers (lib/learn/canvas-deliverables.ts), so a deck is real study rows and a note is
 * a real Library page. What is the board's is only where the card sits.
 */
export interface BoardOutputCard {
  id: string;
  /** The thread it was made from, or null when asked from the board composer. */
  cardId: string | null;
  kind: BoardMakeKind;
  status: BoardOutputStatus;
  /** What was asked, so an errored card can say what it failed to make. */
  topic: string;
  error?: string;
  /** Runtime only: the maker's current step ("Reading 3 of 8 pages…"). */
  progress?: string;
  output?: CanvasOutput;
  /**
   * The questions, when this card is a check.
   *
   * 🔴 THE RUN IS SAVED WITH THE BOARD AND THE ANSWERS ARE NOT. A board is a place you come back
   * to, so a test that vanished on reload would be a card that lied about being there; but the
   * taps live in `CanvasCheck`'s own state and die with it, which is the chat's rule ("nothing here
   * is kept") and the only honest one, since a half-answered test resumed a day later is not a
   * measurement of anything.
   */
  run?: TestRun;
  createdAt: string;
  position: BoardPosition;
  width: number;
  height?: number;
}

export interface BoardState {
  cards: BoardCard[];
  sources: BoardSource[];
  outputs: BoardOutputCard[];
  selectedSourceIds: string[];
  useWebSearch: boolean;
  viewport?: BoardViewport;
  annotations?: BoardAnnotation[];
}

export function normalizeContextExcerpt(text: string | undefined | null): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_BOARD_CONTEXT_EXCERPT_CHARACTERS);
}

export function messageLength(text: string): number {
  return text.trim().length;
}

export function isMessageTooLong(text: string): boolean {
  return messageLength(text) > MAX_BOARD_MESSAGE_CHARACTERS;
}

export function messageLimitNotice(text: string): string | null {
  const length = messageLength(text);
  if (length <= MAX_BOARD_MESSAGE_CHARACTERS) return null;
  return `${length.toLocaleString()} / ${MAX_BOARD_MESSAGE_CHARACTERS.toLocaleString()} characters. Shorten or split your message to send it.`;
}

/** The first 60 characters of the question, on one line, ellipsised. "New thread" when empty. */
export function deriveCardTitle(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return NEW_THREAD_TITLE;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Board title: the first card title that is not the placeholder, else the first source name. */
export function deriveBoardTitle(cards: readonly BoardCard[], sources: readonly BoardSource[]): string {
  const card = cards.find((item) => item.title.trim() && item.title !== NEW_THREAD_TITLE);
  const title = card?.title ?? sources.find((source) => source.name.trim())?.name ?? UNTITLED_BOARD;
  const chars = Array.from(title);
  return chars.length <= MAX_BOARD_TITLE_CHARACTERS ? title : chars.slice(0, MAX_BOARD_TITLE_CHARACTERS).join("");
}

export function documentFitsSizeLimit(document: BoardDocument): boolean {
  return new TextEncoder().encode(JSON.stringify(document)).byteLength <= MAX_BOARD_DOCUMENT_BYTES;
}

function isFirstReplyPending(card: BoardCard): boolean {
  return (
    card.messages.length === 2 &&
    card.messages[0]?.role === "user" &&
    card.messages[1]?.role === "assistant" &&
    card.messages[1]?.pending === true
  );
}

export interface MeasuredSize {
  width: number;
  height: number;
}

/** A card's saved size is what the board MEASURED, not what the model guessed: width always, height
 *  only once the card has an answer to be tall for (a card still waiting on its first reply keeps
 *  growing, so its height is not a fact yet). */
export function applyMeasuredCardSize(card: BoardCard, measured: MeasuredSize | undefined): BoardCard {
  if (!measured) return card;
  const contracted = card.collapsed === true;
  return {
    ...card,
    width: measured.width,
    ...(!contracted && card.messages.length > 0 && !isFirstReplyPending(card) ? { height: measured.height } : {}),
  };
}

/** What goes to the database. Runtime-only fields are dropped, dangling references are cut. */
export function serializeBoardState(state: BoardState, measured?: ReadonlyMap<string, MeasuredSize>): BoardDocument {
  const sources = state.sources
    .filter((source) => source.status !== "processing")
    .map((source) => {
      const size = measured?.get(source.id);
      return { ...source, ...(size ? { width: size.width, height: size.height } : {}), previewUrls: [] };
    });
  const sourceIds = new Set(sources.map((source) => source.id));
  const cardIds = new Set(state.cards.map((card) => card.id));
  return {
    version: BOARD_DOCUMENT_VERSION,
    cards: state.cards.map((card) => ({
      ...applyMeasuredCardSize(card, measured?.get(card.id)),
      status: "idle",
      parentId: card.parentId !== null && cardIds.has(card.parentId) ? card.parentId : null,
      sourceIds: card.sourceIds.filter((id) => sourceIds.has(id)),
      messages: card.messages
        .filter((message) => message.role === "user" || message.content.trim() || message.pending)
        .map((message) => {
          const { isStreaming: _streaming, ...rest } = message;
          return rest;
        }),
    })),
    sources,
    outputs: state.outputs.filter((output) => output.status !== "making").map((output) => {
      const size = measured?.get(output.id);
      return { ...output, ...(size ? { width: size.width, height: size.height } : {}) };
    }),
    selectedSourceIds: state.selectedSourceIds.filter((id) => sourceIds.has(id)),
    useWebSearch: state.useWebSearch,
    ...(state.viewport ? { viewport: state.viewport } : {}),
    // 🔴 WRITTEN ONLY WHEN THERE ARE SOME. An empty array on every board would add a field to every
    // document that has never been annotated, for nothing.
    ...(state.annotations && state.annotations.length > 0
      ? { annotations: serializeBoardAnnotations(state.annotations, sourceIds) }
      : {}),
  };
}

function parseViewport(raw: unknown): BoardViewport | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const x = Number(value.x);
  const y = Number(value.y);
  const zoom = Number(value.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) return undefined;
  return { x, y, zoom };
}

/** Read a stored document without trusting it: every array is defaulted, every reference checked. */
export function parseBoardState(raw: unknown): BoardState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { cards: [], sources: [], outputs: [], selectedSourceIds: [], useWebSearch: false };
  }
  const value = raw as Record<string, unknown>;
  const cards: BoardCard[] = Array.isArray(value.cards)
    ? (value.cards as Array<Record<string, unknown>>).map((card) => ({
        ...(card as unknown as BoardCard),
        status: "idle",
        messages: Array.isArray(card.messages) ? (card.messages as BoardMessage[]) : [],
        highlights: Array.isArray(card.highlights) ? (card.highlights as BoardHighlight[]) : [],
        savedImages: Array.isArray(card.savedImages) ? (card.savedImages as BoardSavedImage[]) : [],
        notes: Array.isArray(card.notes) ? (card.notes as BoardNote[]) : [],
        sourceIds: Array.isArray(card.sourceIds) ? (card.sourceIds as string[]) : [],
        inheritedContext: Array.isArray(card.inheritedContext)
          ? (card.inheritedContext as BoardCard["inheritedContext"])
          : [],
        parentId: typeof card.parentId === "string" ? card.parentId : null,
        contextExcerpt: typeof card.contextExcerpt === "string" ? card.contextExcerpt : null,
      }))
    : [];
  const sources: BoardSource[] = Array.isArray(value.sources)
    ? (value.sources as BoardSource[]).map((source) => ({ ...source, previewUrls: [] }))
    : [];
  const sourceIds = new Set(sources.map((source) => source.id));
  // A deliverable still being made when the board was saved is gone on reload: the maker is a
  // client call, and nothing would ever finish it. Same rule as a pending reply.
  const outputs: BoardOutputCard[] = Array.isArray(value.outputs)
    ? (value.outputs as BoardOutputCard[]).filter((output) => output && typeof output.id === "string" && output.status !== "making")
    : [];
  const selectedSourceIds = Array.isArray(value.selectedSourceIds)
    ? (value.selectedSourceIds as unknown[]).filter((id): id is string => typeof id === "string" && sourceIds.has(id))
    : [];
  const viewport = parseViewport(value.viewport);
  // 🔴 THE SAME CUT THE CARDS GET: an annotation whose source is gone points at nothing.
  const annotations = serializeBoardAnnotations(parseBoardAnnotations(value.annotations), sourceIds);
  return {
    cards,
    sources,
    outputs,
    selectedSourceIds,
    useWebSearch: value.useWebSearch === true,
    ...(viewport ? { viewport } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
  };
}

/** The turns a model call (or a branch) inherits from a card: what was said, minus errors, last 16. */
export function cardContext(card: Pick<BoardCard, "inheritedContext" | "messages">): Array<Pick<BoardMessage, "role" | "content">> {
  return [...card.inheritedContext, ...card.messages]
    .filter((message) => message.content.trim() && !("isError" in message && message.isError))
    .map((message) => ({ role: message.role, content: message.content }))
    .slice(-CARD_CONTEXT_TURNS);
}

/** A failed turn the learner asked to retry: the user line and its errored reply, removed together. */
export function removeFailedTurn(
  messages: readonly BoardMessage[],
  retry: { userMessageId: string; assistantMessageId: string },
): { messages: BoardMessage[]; updatesComposerSuggestions: boolean; contextExcerpt?: string; contextOccurrence?: number } | null {
  const index = messages.findIndex((message) => message.id === retry.assistantMessageId);
  if (index < 1) return null;
  const user = messages[index - 1];
  const assistant = messages[index];
  if (!user || !assistant || user.id !== retry.userMessageId || user.role !== "user" || assistant.role !== "assistant" || !assistant.isError) {
    return null;
  }
  return {
    messages: messages.filter((_, at) => at !== index - 1 && at !== index),
    updatesComposerSuggestions: Boolean(assistant.updatesComposerSuggestions),
    contextExcerpt: user.contextExcerpt,
    contextOccurrence: user.contextOccurrence,
  };
}

/** The composer's new-thread chips come from the LAST root turn that was sent from the composer. */
export function latestComposerSuggestions(cards: readonly BoardCard[]): { messageId: string | null; suggestions: string[] } {
  for (const card of [...cards].reverse()) {
    for (const message of [...card.messages].reverse()) {
      if (message.role !== "assistant" || !message.updatesComposerSuggestions) continue;
      return {
        messageId: message.id,
        suggestions:
          !message.isError && Array.isArray(message.suggestedQuestions?.newThreads)
            ? message.suggestedQuestions.newThreads
            : [],
      };
    }
  }
  return { messageId: null, suggestions: [] };
}

/** Replies that were in flight when the board was last saved. They are shown as streaming again
 *  while the persisted reply is fetched back (see board-provider). */
export function pendingReplies(cards: readonly BoardCard[]): {
  cards: BoardCard[];
  pending: Array<{ cardId: string; messageId: string }>;
} {
  const pending = cards.flatMap((card) =>
    card.messages
      .filter((message) => message.role === "assistant" && message.pending)
      .map((message) => ({ cardId: card.id, messageId: message.id })),
  );
  if (pending.length === 0) return { cards: [...cards], pending };
  const cardIds = new Set(pending.map((item) => item.cardId));
  return {
    pending,
    cards: cards.map((card) =>
      cardIds.has(card.id)
        ? {
            ...card,
            status: "streaming",
            messages: card.messages.map((message) => (message.pending ? { ...message, isStreaming: true } : message)),
          }
        : card,
    ),
  };
}
