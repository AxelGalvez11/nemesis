// Material picked on the front door, waiting for the canvas that is about to mint. The phone's
// version of the web's stash (components/workspace/learn/pending-attachment.ts) — same reason,
// same shape, same single-use rule.
//
// 🔴 WHY A MODULE VARIABLE AND NOT THE ROUTE PARAMS. `startCanvas()` mints a canvas id locally,
// before the canvas screen ever mounts (LearnHome.tsx's own comment: "nothing is created by
// pressing this, only by beginning"). A picked file cannot ride `router.push`'s params — a
// `Promise` cannot be serialised into a route string, and uploading before the learner has a
// canvas to upload INTO would attach the file to nothing. This is a same-tab, same-JavaScript-
// context handoff across one client-side navigation, which is exactly what a module variable is
// for (see the web file's own header for the longer version of this argument).
//
// 🔴 SINGLE-USE. `takePending()` clears as it reads, in the same expression, so a learner who
// attaches material, backs out to the front door and opens a DIFFERENT canvas cannot find the
// first canvas's files re-attached to the second one.
//
// 🔴 THE READ TRAVELS WITH THE FILE, AS A PROMISE — not a raw picked asset. The front door starts
// the upload and the extract the MOMENT the file lands (`read them on drop, like chatgpt`,
// mirrored from the web's own pending-attachment.ts), so by the time Send is pressed the work is
// usually already finished. `read: null` means nothing was started — the phone was signed out at
// pick time — and the canvas screen falls back to reading the file itself from `uri`.
//
// PURE module state — no React, no Supabase, no FileSystem. api/canvas-sources.ts does the I/O
// this hands off to.

import type { CloudLibraryNote } from "@/api/cloudLibrary";
import type { DocumentModel, ExtractionCoverage } from "@nemesis/shared";

/**
 * What a completed (or completing) read hands back — the phone's `ExtractedFile`, field-named to
 * match the web's (lib/workspace/chat-attachments.ts's `ExtractedFile`) on purpose: `text`,
 * `title`, `kind`, `coverage`, `model`, `librarySourceId` are the exact six fields
 * `attachFilesInner` reads off its own extraction result, so a port that renames one of them here
 * would have to be caught by hand instead of by the type checker.
 */
export interface Extracted {
  text: string;
  /** The parser's own title line — a table header some of the time, never a picker's chip label.
   *  `documentTitle` (learn/web.ts) is what makes this safe to show. */
  title: string | null;
  /** Whatever the extractor reported — "pdf" | "docx" | "pptx" | "image", or absent. */
  kind?: string;
  coverage?: ExtractionCoverage;
  model?: DocumentModel;
  /** The `library_sources.id` this reached, when filing worked. Absent (not null) when there is
   *  nothing to file — matches `CanvasSource.librarySourceId`'s own optional-not-nullable shape. */
  librarySourceId?: string;
}

/** One piece of material staged on the front door, before the canvas that will hold it exists. */
export type PendingAttachmentItem =
  | {
      kind: "file";
      /** Local file URI — the fallback identity if `read` is null and the canvas screen has to
       *  start the read itself. */
      uri: string;
      /** The file's own name — what `documentTitle`'s fallback and an image's title use. */
      name: string;
      size: number | null;
      mimeType: string | null;
      /** The extraction already running (or already finished) for this file, started the moment
       *  it landed on the front door. Null only when nothing could be started. */
      read: Promise<Extracted> | null;
    }
  | {
      kind: "note";
      /** An existing Library note, picked whole — nothing to read, it is already text. */
      note: CloudLibraryNote;
    };

/**
 * `documents.ts`'s `ReadDocument` and `photos.ts`'s `ReadPhoto` widen to this same shape
 * structurally (a chip `title`, a raw file `name`, `uri`, `size`, `mimeType` do not appear here
 * on purpose — TypeScript allows the extra fields on a variable, and this function only reads
 * the six that matter). One mapper, called from wherever a pick happens, so the two readers
 * cannot describe "what was extracted" two different ways.
 */
export function extractedFrom(read: {
  text: string;
  extractedTitle: string | null;
  kind?: string;
  coverage?: ExtractionCoverage;
  model?: DocumentModel;
  librarySourceId: string | null;
}): Extracted {
  return {
    text: read.text,
    title: read.extractedTitle,
    ...(read.kind ? { kind: read.kind } : {}),
    ...(read.coverage ? { coverage: read.coverage } : {}),
    ...(read.model ? { model: read.model } : {}),
    ...(read.librarySourceId ? { librarySourceId: read.librarySourceId } : {}),
  };
}

let pending: PendingAttachmentItem[] | null = null;

/** Hold material for the canvas that is about to mount. Replaces anything already waiting —
 *  there is only ever one "about to exist" canvas at a time. */
export function putPending(items: readonly PendingAttachmentItem[]): void {
  pending = items.length > 0 ? [...items] : null;
}

/** Take the waiting material, if any, and clear it. Returns null when nothing is waiting. */
export function takePending(): PendingAttachmentItem[] | null {
  const held = pending;
  pending = null;
  return held;
}

/** Testing seam: forget anything held, without claiming it. */
export function clearPending(): void {
  pending = null;
}
