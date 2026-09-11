// Attaching material to a canvas — the phone's version of the web's `attachFilesInner`
// (apps/web/components/workspace/learn/use-canvas-session.ts:1041-1170). Everything that
// function does is here: read (or claim an already-started read), re-derive the coverage note
// and the excerpt grounding from what actually got FILED rather than trusting the upload
// response, merge the source into the canvas, and record a `source` moment for the History Rail
// / the canvas's own turn thread (`threadFromCanvas`, `turnHasContent` — a source-only moment
// draws as its own file-card row, see `CanvasTurn.tsx`, already wired to read `turn.attached`).
//
// The pure field assembly lives in lib/canvas-source-build.ts (Deno-testable); this file is the
// I/O around it — the one thing that cannot be Deno-tested, because it reaches `@/lib/supabase`
// and `@/lib/sources/source-context` through `@/learn/sources`, both real dependencies Deno's
// resolver has no mapping for (see that file's own header, and canvas-source-build.ts's).

import type { DocumentModel } from "@nemesis/shared";

import { loadCanvas, saveCanvas } from "./canvases";
import {
  buildFileCanvasSource,
  buildNoteCanvasSource,
  excerptSourceFor,
  nextSourceId,
} from "@/lib/canvas-source-build";
import { nextMomentId } from "@/lib/canvases";
import type { Extracted, PendingAttachmentItem } from "@/lib/pending-attachment";
import {
  buildExcerpts,
  buildExcerptsFromModel,
  coverageNote,
  excerptsFromSourceContext,
  loadCanonicalSource,
  mergeSourceIntoCanvas,
  storedCoverageNote,
  type CanonicalLoad,
} from "@/learn/sources";
import { appendMoment, type CanvasSource, type LearningCanvas } from "@/learn/web";

export interface AttachOutcome {
  canvas: LearningCanvas;
  /** Titles of items that could not be attached, so the caller can say so without losing
   *  whatever else DID attach — one bad file must not cost the rest of the send. */
  failed: string[];
}

const NOT_FOUND: CanonicalLoad = { ok: false, reason: "not-found" };

/** One filed file, turned into a `CanvasSource` — the web's three-tier excerpt choice
 *  (`excerptSourceFor`) plus the re-read of what actually survived persistence. Null when the
 *  item never got a read started (signed out at pick time on the front door); the caller counts
 *  that as a failure rather than guessing at a retry. */
async function buildAttachedFileSource(
  id: string,
  item: Extract<PendingAttachmentItem, { kind: "file" }>,
): Promise<CanvasSource | null> {
  if (!item.read) return null;
  const extracted: Extracted = await item.read;

  // Read back what survived persistence, not what the upload response claimed — the same reason
  // the web re-reads here (`use-canvas-session.ts`'s own comment on this exact step).
  const canonical = extracted.librarySourceId ? await loadCanonicalSource(extracted.librarySourceId) : NOT_FOUND;
  const note = extracted.librarySourceId
    ? ((await storedCoverageNote(extracted.librarySourceId)) ?? null)
    : (coverageNote(extracted.coverage) ?? null);

  const model: DocumentModel | undefined = extracted.model;
  const tier = excerptSourceFor(canonical.ok, Boolean(model));
  const excerpts =
    tier === "canonical" && canonical.ok
      ? excerptsFromSourceContext(id, canonical.context)
      : tier === "model" && model
        ? buildExcerptsFromModel(id, model)
        : buildExcerpts(id, extracted.text);

  return buildFileCanvasSource(id, item.name, extracted, excerpts, canonical.ok ? canonical.context.quality : undefined, note);
}

/**
 * Attach every item to the canvas, in order, as one save.
 *
 * 🔴 RE-READ ONCE, MERGE ALL, SAVE ONCE — not per item. A per-item save is N round trips and can
 * clobber a concurrent write; `api/canvases.ts`'s own callers (`recordExchange` in
 * `canvas-turn.ts`) re-read fresh for the identical reason.
 *
 * 🔴 ONE FAILURE DOES NOT LOSE THE REST. Each item is attempted independently; a file that could
 * not be read (or a note whose content vanished) is named in `failed` and the loop continues, so
 * three good attachments still land when a fourth's read rejected.
 */
export async function attachToCanvas(
  uid: string,
  canvas: LearningCanvas,
  items: readonly PendingAttachmentItem[],
): Promise<AttachOutcome> {
  if (items.length === 0) return { canvas, failed: [] };

  let working = (await loadCanvas(uid, canvas.id)) ?? canvas;
  const failed: string[] = [];
  let attached = false;

  for (const item of items) {
    const label = item.kind === "note" ? item.note.title.trim() || "Untitled note" : item.name;
    try {
      // Minted against `working`, which the loop keeps re-assigning as each source merges — the
      // web's own warning against deriving this from the canvas at the START of a multi-file
      // attach (see nextSourceId's own comment).
      const id = nextSourceId(working);
      const source =
        item.kind === "note"
          ? buildNoteCanvasSource(id, item.note, buildExcerpts(id, item.note.content))
          : await buildAttachedFileSource(id, item);
      if (!source) {
        failed.push(label);
        continue;
      }
      working = mergeSourceIntoCanvas(working, source);
      // The moment, not a copy of the source — its title is read back from `canvas.sources` when
      // the thread draws, exactly as the web's own comment on this call describes.
      //
      // 🔴 NOT GUARDED BY `sameMoment`. The web's `recordMoment` drops a moment identical to the
      // one before it — a real StrictMode-double-render guard for an `assistant` moment, but
      // `sameMoment` (canvas-moment.ts) never compares `sourceIds`, only `userText`/
      // `assistantText`/`questionId`/`responseId`. Two DIFFERENT files attached in the same call
      // produce two `source` moments that are, by that comparison, indistinguishable — so
      // reusing the same guard here would silently drop every source in a multi-file attach
      // after the first. This loop already runs each item at most once, so there is nothing for
      // a dedupe check to protect against.
      working = {
        ...working,
        moments: appendMoment(working.moments, { kind: "source", sourceIds: [source.id] }, new Date().toISOString(), nextMomentId(working)),
      };
      attached = true;
    } catch {
      failed.push(label);
    }
  }

  if (attached) await saveCanvas(uid, working);
  return { canvas: working, failed };
}
