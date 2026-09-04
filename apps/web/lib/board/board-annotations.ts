// Annotations made on a document opened from the board, kept IN the board document.
//
// 🔴🔴🔴 NOTHING WRITES THESE ANY MORE, AND THE FILE STAYS ANYWAY. The owner asked for them on the
// morning of 2026-09-04 (*"annotate any document to have an inline chat with the annotation"*) and
// cut them the same evening (*"remove the annotation from pdf docs"*). Between those two messages a
// learner could pin notes inside a document, and those notes are sitting in saved boards right now.
// So the READ and the WRITE-BACK below are load-bearing: `board-model.ts` parses this field on every
// open and serialises it on every save, which is the only reason those notes are not deleted by the
// next autosave. What went with the layer are the parts that only a UI could use — the count, the
// label, the `DocumentComment` conversion — because furniture nothing sits on is how a codebase
// stops being readable.
//
// 🔴🔴 THE BOARD IS ITS OWN STORE, AND THAT IS NOT A SECOND COMMENT SYSTEM. The chat's reader keeps
// its notes in `document_comments`, keyed by the DURABLE `library_sources.id` — which is exactly
// right there, and impossible here: a file dropped on the board is read for its text and need never
// be filed at all, so most board sources have no durable id to key on. Anchoring a board annotation
// to the board-local source id in that table would spray rows that no other surface can resolve.
//
// So a board annotation rides in the one JSON document the board already saves, beside the card it
// belongs with. Reopening /canvas/<id> brings the pins back because the board itself came back.
// What is NOT duplicated is the shape: a row here is a `DocumentComment` in all but where it lives,
// so `comment-layer.tsx` draws it, `rootsOf` counts it and `comment-answer.ts` answers it with no
// idea which store it came from.
//
// PURE. No React, no I/O.

import type { CommentAnchor, CommentAuthor } from "@/lib/workspace/document-comments";

/**
 * One note pinned to a spot in a board source, or one turn of the conversation under it.
 *
 * 🔴 A REPLY IS AN ANNOTATION, the same rule `document-comments.ts` states at length: `parentId`
 * null means this IS the note, and anything else is a turn in its thread. Counting replies as pins
 * would put two marks on a spot that was asked about once.
 */
export interface BoardAnnotation {
  id: string;
  /** The `BoardSource.id` this is pinned to. */
  sourceId: string;
  parentId: string | null;
  author: CommentAuthor;
  /** Page / slide / section, 1-based. Null when the document has no units to speak of. */
  unit: number | null;
  anchor: CommentAnchor;
  body: string;
  /** Null = open. Resolving is a state, never a deletion. */
  resolvedAt: string | null;
  createdAt: string;
}

const fraction = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;

/** An anchor as stored is learner data in a JSON blob: read it defensively, never trust the shape. */
function readAnchor(raw: unknown): CommentAnchor {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const anchor: CommentAnchor = {};
  const x = fraction(source.x);
  const y = fraction(source.y);
  if (x !== null && y !== null) {
    anchor.x = x;
    anchor.y = y;
  }
  if (source.box && typeof source.box === "object") {
    const box = source.box as Record<string, unknown>;
    const parts = [fraction(box.x), fraction(box.y), fraction(box.width), fraction(box.height)];
    if (parts.every((part) => part !== null)) {
      anchor.box = { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
    }
  }
  if (typeof source.block === "number" && Number.isInteger(source.block) && source.block >= 0) {
    anchor.block = source.block;
  }
  if (typeof source.quote === "string" && source.quote.trim()) anchor.quote = source.quote;
  return anchor;
}

/**
 * Read the `annotations` of a stored board without trusting any of it.
 *
 * 🔴 A DOCUMENT SAVED BEFORE THIS EXISTED HAS NO FIELD AT ALL, and must load exactly as it always
 * did. Missing reads as none, never as an error.
 */
export function parseBoardAnnotations(raw: unknown): BoardAnnotation[] {
  if (!Array.isArray(raw)) return [];
  const annotations: BoardAnnotation[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const value = entry as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : null;
    const sourceId = typeof value.sourceId === "string" ? value.sourceId : null;
    const body = typeof value.body === "string" ? value.body : "";
    if (!id || !sourceId || !body.trim()) continue;
    annotations.push({
      anchor: readAnchor(value.anchor),
      // 🔴 UNKNOWN READS AS THE LEARNER. A row that fell through as "nemesis" would put the
      // learner's own words in Nemesis's voice.
      author: value.author === "nemesis" ? "nemesis" : "learner",
      body,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
      id,
      parentId: typeof value.parentId === "string" ? value.parentId : null,
      resolvedAt: typeof value.resolvedAt === "string" ? value.resolvedAt : null,
      sourceId,
      unit: typeof value.unit === "number" && Number.isFinite(value.unit) ? value.unit : null,
    });
  }
  return annotations;
}

/**
 * What goes to the database: annotations whose source is still on the board, and whose thread still
 * has a note at the top of it.
 *
 * 🔴 DANGLING REFERENCES ARE CUT, the same rule `serializeBoardState` already applies to a card's
 * `sourceIds`. A source deleted from the board leaves its notes pointing at nothing, and a reply
 * whose note was deleted is a turn in a conversation that no longer exists.
 */
export function serializeBoardAnnotations(
  annotations: readonly BoardAnnotation[],
  sourceIds: ReadonlySet<string>,
): BoardAnnotation[] {
  const kept = annotations.filter((annotation) => sourceIds.has(annotation.sourceId));
  const roots = new Set(kept.filter((annotation) => annotation.parentId === null).map((annotation) => annotation.id));
  return kept.filter((annotation) => annotation.parentId === null || roots.has(annotation.parentId));
}
