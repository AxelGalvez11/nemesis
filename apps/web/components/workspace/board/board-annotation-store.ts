"use client";

// The board's own comment store: the reader writes here instead of into `document_comments`.
//
// 🔴🔴 THE READER CANNOT TELL. `CommentStore` is the seam `document-comments.ts` grew for exactly
// this (read its comment on the interface): the reader still owns WHAT a note is, when it is drawn
// and how it is answered, and only WHERE it is kept became the host's answer. Nothing about the
// annotate layer, the thread, or the model door is duplicated here.
//
// 🔴 EVERY WRITE IS SYNCHRONOUS AND STILL RETURNS A PROMISE. The board keeps its annotations in
// React state and saves the whole document 400ms later, so there is no request to await — but the
// interface is the table's, and a store that returned bare values would need a second reader.
//
// 🔴 WRITING NEVER READS `annotations` OUT OF A CLOSURE. `read` and `write` are handed in as
// functions over the LIVE value, because a store captured at render time would drop every note
// made after it (and this codebase has already paid for a stale-closure write once: see
// `dictation-doubled-every-sentence`).

import {
  asDocumentComment,
  type BoardAnnotation,
} from "@/lib/board/board-annotations";
import type { CommentStore, DocumentComment } from "@/lib/workspace/document-comments";

/** A fresh id, and a fallback for the handful of environments with no `crypto.randomUUID`. */
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function boardAnnotationStore(
  sourceId: string,
  read: () => readonly BoardAnnotation[],
  write: (update: (current: readonly BoardAnnotation[]) => BoardAnnotation[]) => void,
): CommentStore {
  const mine = (): BoardAnnotation[] => read().filter((annotation) => annotation.sourceId === sourceId);
  return {
    add: async (comment): Promise<DocumentComment | null> => {
      const body = comment.body.trim();
      if (!body) return null;
      const made: BoardAnnotation = {
        anchor: comment.anchor,
        author: comment.author ?? "learner",
        body,
        createdAt: new Date().toISOString(),
        id: newId(),
        parentId: comment.parentId ?? null,
        resolvedAt: null,
        sourceId,
        unit: comment.unit,
      };
      write((current) => [...current, made]);
      return asDocumentComment(made);
    },
    list: async () => mine().map(asDocumentComment),
    remove: async (id) => {
      // 🔴 A NOTE TAKES ITS ANSWERS WITH IT — the same cascade the table declares in its migration.
      // Left behind, a reply is a turn in a conversation with no question at the top of it.
      write((current) => current.filter((annotation) => annotation.id !== id && annotation.parentId !== id));
      return true;
    },
    setResolved: async (id, resolved) => {
      const at = resolved ? new Date().toISOString() : null;
      write((current) =>
        current.map((annotation) => (annotation.id === id ? { ...annotation, resolvedAt: at } : annotation)),
      );
      return true;
    },
  };
}
