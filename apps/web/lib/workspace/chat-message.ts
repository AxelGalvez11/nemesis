// The shapes a chat turn is made of, after the Sessions product was deleted.
//
// 🔴 THESE OUTLIVED THEIR PRODUCT, WHICH IS WHY THEY MOVED RATHER THAN DIED. They were declared in
// `sessions-store.ts` and named after it — `SessionMessage`, `SessionAttachment`, `SessionOutput` —
// but the attachment pipeline the Canvas uses is built on them, and so is `postChatCompletion`,
// which every model call in this product goes through. Deleting the Sessions surface would
// therefore have taken the Canvas with it, or left "Session" as the name of a concept the product
// no longer has.
//
// Renamed on the way out, deliberately. The owner's rule (2026-08-20) is that Sessions stops being
// a product concept, not merely a page: a type called `SessionMessage` re-teaches the old
// architecture to everyone who reads it, and the old architecture leaks back in through its names
// first.
//
// PURE TYPES. No store, no persistence, no React — the store this came from was 900 lines of
// localStorage and cloud sync, and none of that survived.

/** A file or image travelling with a message. Images carry a signed URL for immediate display and
 *  the private storage path that can be re-signed later. */
export interface ChatAttachment {
  name: string;
  kind: "image" | "file";
  mime?: string;
  url?: string;
  storagePath?: string;
  /** The `library_sources` row this document is filed under — what a note's
   *  `[n](?source=<id>)` citation pill points at. */
  sourceId?: string;
}

/** A web page a turn consulted. */
export interface ChatSource {
  title: string;
  url: string;
  description: string;
}

/**
 * Something a turn produced and filed.
 *
 * 🔴 `route` AND `url` ARE PERSISTED, AND THAT IS A LIVE MIGRATION ITEM. Rows already in the
 * database hold `/study?section=cards|tests|mindmaps` strings minted by `agent-tools.ts`. Retiring
 * `/study` therefore needs a data migration rather than a code repoint — see
 * `docs/canvas-one-semantic-authority.md`.
 */
export interface ChatOutput {
  id: string;
  kind: "flashcards" | "slides" | "test" | "mindmap" | "note" | "event" | "report" | "recording" | "other";
  title: string;
  url?: string;
  /** In-app destination, shared with the iOS artifact card. */
  route?: string;
  transcript?: string;
  notes?: string;
  durationSeconds?: number;
  createdAt?: string;
  polish?: "pending" | "done";
}

/** One turn of a conversation, as it is stored and as it reaches the model. */
export interface ChatMessage {
  /** Client-generated UUID — the `chat_messages` row's primary key. */
  id?: string;
  role: "user" | "assistant";
  content: string;
  /** ISO timestamp — display and persistence only. */
  at: string;
  sources?: ChatSource[];
  outputs?: ChatOutput[];
  attachments?: ChatAttachment[];
}
