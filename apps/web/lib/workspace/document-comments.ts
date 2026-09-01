// Comments pinned to a spot in a document — the ANNOTATE layer.
//
// Owner, 2026-08-28: *"This is not supposed to be that [an editor]. This is supposed to be more of
// an annotate with a comment type of edit."* The reader shows documents; changing what a document
// says is the job of the application that made it (`edit-a-line.test.ts` holds that door shut).
// What a learner CAN do is point at a spot, write a note, and either keep it or hand it to
// Nemesis. This module is the note's storage.
//
// 🔴 TWO KINDS OF DOCUMENT, ONE TABLE. A `source` is theirs (a filed Library file — never edited);
// an `output` is ours (something Nemesis made, which Nemesis may revise on request). The comment
// row is identical either way; what differs is what "send to Nemesis" DOES with it, and that is
// the caller's business, not storage's.
//
// 🔴 EVERY WRITE IS BEST-EFFORT, the same stance `library-sources.ts` takes: a note that fails to
// save must degrade to "try again", never take the reader down with it. Reads return [] on any
// failure, because "no comments" is drawable and an exception in a render effect is not.

import { supabase } from "@/lib/supabase";

export type CommentDocKind = "source" | "output";

/** Which document a comment lives on. */
export interface CommentDocRef {
  kind: CommentDocKind;
  id: string;
}

/**
 * Where on the unit a comment sits. Fractions of the unit's element, 0–1 — the contract
 * `use-region-drag.ts` established, and the only one that survives zoom and resize.
 *
 * Exactly one of these shapes is present:
 *   point — {x, y}
 *   area  — {box}
 *   block — {block}, for flowing documents where pixels reflow and the paragraph is the
 *           stable thing to hold on to.
 */
export interface CommentAnchor {
  x?: number;
  y?: number;
  box?: { x: number; y: number; width: number; height: number };
  block?: number;
  /**
   * The words the comment was made on, when it started as a highlight.
   *
   * 🔴 THE TEXT ITSELF, NOT A CHARACTER OFFSET. A document is re-read whenever the parser improves,
   * and offsets from the previous read point at different words afterwards — silently, with the pin
   * still rendering. A quote can at worst fail to match, which is visible; an offset moves, which is
   * not. It rides beside `x`/`y` rather than replacing them: the position is what pins the mark,
   * the quote is what the comment is ABOUT, and the two answer different questions.
   */
  quote?: string;
}

export interface DocumentComment {
  id: string;
  docKind: CommentDocKind;
  docId: string;
  /** Page / slide / sheet, 1-based; null when the document has no units to speak of. */
  unit: number | null;
  anchor: CommentAnchor;
  body: string;
  /** Null = open. Resolving is a state, not a deletion. */
  resolvedAt: string | null;
  createdAt: string;
}

// ── The preview lane ─────────────────────────────────────────────────────────
// The dev-preview harness makes NO network calls (`preview-context.tsx` says so in as many
// words), and a signed-out reader still has to be able to draft a comment and watch it pin.
// So without a uid — or with preview set — comments live in this map for the life of the page.
const previewStore = new Map<string, DocumentComment[]>();
const keyOf = (ref: CommentDocRef) => `${ref.kind}:${ref.id}`;

/** Test/harness hook: forget every in-memory comment. */
export function resetPreviewComments(): void {
  previewStore.clear();
}

interface CommentRow {
  id: string;
  doc_origin: string;
  doc_id: string;
  unit: number | null;
  anchor: unknown;
  body: string;
  resolved_at: string | null;
  created_at: string;
}

/** The anchor as stored is learner data via jsonb — read it defensively, never trust the shape. */
function readAnchor(raw: unknown): CommentAnchor {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const anchor: CommentAnchor = {};
  const fraction = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
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
  return anchor;
}

function rowToComment(row: CommentRow): DocumentComment {
  return {
    id: row.id,
    docKind: row.doc_origin === "output" ? "output" : "source",
    docId: row.doc_id,
    unit: row.unit,
    anchor: readAnchor(row.anchor),
    body: row.body ?? "",
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

const COLUMNS = "id,doc_origin,doc_id,unit,anchor,body,resolved_at,created_at";

/** Every comment on one document, oldest first — the order a margin reads in. */
export async function listDocumentComments(
  uid: string | null,
  ref: CommentDocRef,
  options?: { preview?: boolean },
): Promise<DocumentComment[]> {
  if (options?.preview || !uid) return [...(previewStore.get(keyOf(ref)) ?? [])];
  try {
    const { data, error } = await supabase
      .from("document_comments")
      .select(COLUMNS)
      .eq("user_id", uid)
      .eq("doc_origin", ref.kind)
      .eq("doc_id", ref.id)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as CommentRow[]).map(rowToComment);
  } catch {
    return [];
  }
}

export async function addDocumentComment(
  uid: string | null,
  ref: CommentDocRef,
  comment: { unit: number | null; anchor: CommentAnchor; body: string },
  options?: { preview?: boolean },
): Promise<DocumentComment | null> {
  const body = comment.body.trim();
  if (!body) return null;
  if (options?.preview || !uid) {
    const made: DocumentComment = {
      id: crypto.randomUUID(),
      docKind: ref.kind,
      docId: ref.id,
      unit: comment.unit,
      anchor: comment.anchor,
      body,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    };
    previewStore.set(keyOf(ref), [...(previewStore.get(keyOf(ref)) ?? []), made]);
    return made;
  }
  try {
    const { data, error } = await supabase
      .from("document_comments")
      .insert({
        user_id: uid,
        doc_origin: ref.kind,
        doc_id: ref.id,
        unit: comment.unit,
        anchor: comment.anchor as Record<string, unknown>,
        body,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) return null;
    return rowToComment(data as unknown as CommentRow);
  } catch {
    return null;
  }
}

/** Resolve or reopen. Returns whether the write landed. */
export async function setCommentResolved(
  uid: string | null,
  ref: CommentDocRef,
  id: string,
  resolved: boolean,
  options?: { preview?: boolean },
): Promise<boolean> {
  const at = resolved ? new Date().toISOString() : null;
  if (options?.preview || !uid) {
    const list = previewStore.get(keyOf(ref)) ?? [];
    const found = list.find((comment) => comment.id === id);
    if (!found) return false;
    previewStore.set(keyOf(ref), list.map((comment) => (comment.id === id ? { ...comment, resolvedAt: at } : comment)));
    return true;
  }
  try {
    const { error } = await supabase
      .from("document_comments")
      .update({ resolved_at: at, updated_at: new Date().toISOString() })
      .eq("user_id", uid)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteDocumentComment(
  uid: string | null,
  ref: CommentDocRef,
  id: string,
  options?: { preview?: boolean },
): Promise<boolean> {
  if (options?.preview || !uid) {
    const list = previewStore.get(keyOf(ref)) ?? [];
    previewStore.set(keyOf(ref), list.filter((comment) => comment.id !== id));
    return true;
  }
  try {
    const { error } = await supabase.from("document_comments").delete().eq("user_id", uid).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** OPEN comments across several documents in one read — what a turn packet wants. */
export async function openCommentsForDocs(
  uid: string | null,
  refs: readonly CommentDocRef[],
  options?: { preview?: boolean },
): Promise<DocumentComment[]> {
  if (refs.length === 0) return [];
  if (options?.preview || !uid) {
    return refs.flatMap((ref) => (previewStore.get(keyOf(ref)) ?? []).filter((comment) => comment.resolvedAt === null));
  }
  try {
    const { data, error } = await supabase
      .from("document_comments")
      .select(COLUMNS)
      .eq("user_id", uid)
      .in("doc_id", refs.map((ref) => ref.id))
      .is("resolved_at", null)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    // 🔴 FILTERED AGAIN BY (kind, id), not just by the `in` above. Two kinds share one id space
    // only by accident, but "only by accident" is not a guarantee a filter should lean on.
    const wanted = new Set(refs.map(keyOf));
    return (data as unknown as CommentRow[])
      .map(rowToComment)
      .filter((comment) => wanted.has(keyOf({ kind: comment.docKind, id: comment.docId })));
  } catch {
    return [];
  }
}

/** How a comment names its spot in prose: "slide 3", "page 12, marked area", "section 4". */
export function describeCommentSpot(comment: DocumentComment, unitLabel: string): string {
  const parts: string[] = [];
  if (comment.unit !== null) parts.push(`${unitLabel} ${comment.unit}`);
  if (comment.anchor.box) parts.push("marked area");
  else if (comment.anchor.quote) parts.push("highlighted");
  else if (comment.anchor.block !== undefined) parts.push(`paragraph ${comment.anchor.block + 1}`);
  return parts.join(", ");
}

/**
 * The packet block: every open comment, grouped under its document's own name.
 *
 * 🔴 PURE, so `turn-router.test.ts`-style checks can pin its shape with no store in the loop.
 * The quotes are the learner's own words verbatim — they are the whole point of the block.
 */
export function commentsContextBlock(
  docs: readonly { title: string; unitLabel: string; comments: readonly DocumentComment[] }[],
): string {
  const lines: string[] = [];
  for (const doc of docs) {
    for (const comment of doc.comments) {
      if (comment.resolvedAt !== null) continue;
      const spot = describeCommentSpot(comment, doc.unitLabel);
      lines.push(`On "${doc.title}"${spot ? ` (${spot})` : ""}: "${comment.body}"`);
    }
  }
  return lines.join("\n");
}

/**
 * The message a comment becomes when the learner presses "Send to Nemesis".
 *
 * 🔴 IT STATES A FACT AND HANDS OVER THE NOTE — it does not classify. On a source the note is
 * usually a question; on a Nemesis-made document it is usually an instruction; and "is this
 * right?" on either is neither. What the learner wants done is the router's reading to make,
 * exactly as it is for a typed sentence (`turn-router.ts` on staged passages).
 *
 * 🔴 THE WORDING FOLLOWS WHETHER THE PICTURE REALLY TRAVELLED — the rule `mark-an-area` set:
 * claiming an attachment that is not there reads as a plausible answer either way, which is
 * precisely how the owner's "the test did not relate to the attachment" class of bug happens.
 */
export function commentAskPrompt(input: {
  fileName: string;
  unitLabel: string;
  unit: number | null;
  anchor: CommentAnchor;
  body: string;
  cropAttached: boolean;
}): string {
  const where = input.unit !== null ? ` on ${input.unitLabel} ${input.unit}` : "";
  // 🔴 A QUOTE BEATS A POSITION EVERY TIME. "I pointed at a spot on page 14" tells the model where
  // the learner's finger was and nothing about what is under it; the model cannot see the page. The
  // words are the only part of this that makes the answer about the right thing.
  const quoted = input.anchor.quote?.replace(/\s+/g, " ").trim();
  const gesture = quoted
    ? `I highlighted "${quoted.replace(/"/g, "'")}"`
    : input.anchor.box
      ? "I marked an area"
      : input.anchor.block !== undefined
        ? `I pointed at paragraph ${input.anchor.block + 1}`
        : "I pointed at a spot";
  const picture = input.cropAttached ? " The marked area is attached as a picture." : "";
  return `In "${input.fileName}", ${gesture}${where} and wrote: "${input.body.trim()}".${picture} Respond to my note about that exact spot.`;
}
