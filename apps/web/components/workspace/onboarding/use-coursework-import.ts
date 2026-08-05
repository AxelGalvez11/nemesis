"use client";

// Bringing a portal reading INTO the Library — the part that actually writes.
//
// WHAT LANDS, for each document the student ticked:
//
//   1. the bytes are fetched THROUGH THE EXTENSION, because the school session
//      that authorises them lives in the portal's own tab and nowhere else;
//   2. the file goes to the same server extractor every other import uses
//      (/api/notebooks/extract/file) and comes back as text;
//   3. that text becomes a note in the course's own folder, so it is searchable
//      and the chat can read it;
//   4. the ORIGINAL is kept via uploadLibrarySource, filed in the same folder,
//      so the student can open the real PDF (owner 2026-08-03: "yes it needs to
//      be stored so that users can click on it").
//
// 🔴 NO LIBRARIAN PASS HERE, and that is a deliberate difference from
// use-library-import.ts. Dropping one file into the Library runs a model pass
// that reorganises it into topic pages, which is right for a stray download.
// It is wrong for this: a course import arrives with the student's OWN folder
// structure already on it — "Exam 2 / Lectures / Week 3" — which is the
// structure they navigate by and the one their instructor built. Re-filing it
// by topic would throw away the only organisation that is guaranteed to make
// sense to them, and it would cost one model call PER DOCUMENT across a hundred
// documents. The portal's shape is kept exactly.
//
// EVERY FAILURE IS PER-DOCUMENT. A file that 403s, times out, is too big, or
// has no readable text costs that one document and is NAMED at the end. An
// import that gives up on the first refusal would be useless on a real portal.

import { useCallback, useRef, useState } from "react";

import { extractFile } from "@/lib/workspace/chat-attachments";
import { requestFile } from "@/lib/workspace/extension-bridge";
import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import { uploadLibrarySource } from "@/lib/workspace/library-sources";
import type { PlannedDocument } from "@/lib/workspace/coursework-import";

/** Extensions the server extractor can turn into text. Anything else is still
 *  KEPT as a source file — it just has no note in front of it, because we have
 *  nothing honest to put in one. */
const READABLE = new Set(["pdf", "docx", "pptx", "png", "jpg", "jpeg", "webp", "heic", "heif"]);

export interface ImportProgress {
  /** Documents finished, successfully or not. */
  done: number;
  total: number;
  /** What is being worked on right now, for a line the student can read. */
  current: string;
  /** Documents whose text is now in the Library. */
  imported: number;
  /** Originals kept in storage. */
  stored: number;
  /** Named, never rounded away — see the header. */
  failures: string[];
}

const EMPTY: ImportProgress = { current: "", done: 0, failures: [], imported: 0, stored: 0, total: 0 };

/** base64 → a File the rest of the app can treat like any upload. */
function toFile(base64: string, name: string, mime: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime || "application/octet-stream" });
}

/** The extension names a file from the portal's own headers where it can. Where
 *  it could not, the page's title is a better name than an opaque id — an Ultra
 *  file URL ends in `_2017715_1`. */
function fileNameFor(document: PlannedDocument, fetched: { name: string }): string {
  if (fetched.name && fetched.name !== "Untitled") return fetched.name;
  const extension = document.fileType ? `.${document.fileType}` : "";
  return `${document.title}${extension}`;
}

/** The note's body: the document's text, with a line saying where it came from.
 *  The source line is markdown so it renders as a link the student can follow
 *  back to the portal — the same honesty marker the syllabus importer uses. */
function composeNote(document: PlannedDocument, text: string): string {
  const source = document.url ? `\n\n---\n\n[Open the original on your school portal](${document.url})\n` : "";
  return `${text.trim()}${source}`;
}

interface UseCourseworkImportArgs {
  uid: string | null;
  createNote: (input: { title: string; folder: string; content: string }) => Promise<CloudLibraryNote>;
  createFolder: (path: string) => Promise<string>;
}

export function useCourseworkImport({ uid, createNote, createFolder }: UseCourseworkImportArgs) {
  const [progress, setProgress] = useState<ImportProgress>(EMPTY);
  const [running, setRunning] = useState(false);
  // Set when the student presses Stop. Read inside the loop so a long import
  // can be abandoned without abandoning what has already landed.
  const cancelled = useRef(false);

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  /**
   * Create every folder the import needs, parents first.
   *
   * An already-existing folder is a fine outcome, not a failure — a student
   * importing a second time, or adding one course to a semester they already
   * brought in, must not see errors for folders that are exactly right.
   */
  const makeFolders = useCallback(async (folders: readonly string[]): Promise<string[]> => {
    const failed: string[] = [];
    for (const folder of folders) {
      try {
        await createFolder(folder);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (!/exist/i.test(message)) failed.push(`the folder ${folder}`);
      }
    }
    return failed;
  }, [createFolder]);

  /** One document, end to end. Returns what happened so the caller can count. */
  const importOne = useCallback(async (
    document: PlannedDocument,
  ): Promise<{ imported: boolean; stored: boolean; failure?: string }> => {
    if (!document.url) return { failure: `${document.title}: no link to open`, imported: false, stored: false };

    const fetched = await requestFile(document.url);
    if (!fetched) {
      // The commonest real causes, in one sentence a student can act on: the
      // extension is gone, the portal refused, or their session expired.
      return { failure: `${document.title}: couldn't be downloaded`, imported: false, stored: false };
    }

    const name = fileNameFor(document, fetched);
    let file: File;
    try {
      file = toFile(fetched.base64, name, fetched.mime);
    } catch {
      return { failure: `${document.title}: arrived damaged`, imported: false, stored: false };
    }

    const extension = (document.fileType ?? name.split(".").pop() ?? "").toLowerCase();

    // 🔴 A WEB PAGE IS NOT A DOCUMENT, AND CANVAS HANDS BACK A LOT OF THEM.
    //
    // MEASURED on a real signed-in Canvas (cbu.instructure.com, 2026-08-04):
    // every row in a course's modules list links to
    // `/courses/:id/modules/items/:itemId`, never to the file itself. That URL
    // is a redirect, and where it lands depends entirely on what the row IS —
    // an attachment redirects to the actual PDF (which arrives with a real
    // filename and imports perfectly), while an assignment, a quiz, a wiki page
    // or an external tool redirects to a Canvas SCREEN and returns HTML.
    //
    // Without this, every one of those screens would be uploaded to the
    // student's Library as a "source file": a folder of unopenable HTML blobs
    // named after their coursework. Refusing them keeps the Library honest, and
    // the student is told the row was skipped rather than being left to
    // discover the junk later.
    //
    // Judged on the SERVER'S content type plus the filename, never on the URL:
    // the URL is the same shape for both, which is the whole problem.
    const looksLikeWebPage = fetched.mime.startsWith("text/html");
    if (looksLikeWebPage && !READABLE.has(extension)) {
      return { failure: `${document.title}: a page on your portal, not a file`, imported: false, stored: false };
    }

    // The original is kept FIRST and independently of whether the text can be
    // read. A scanned handout that defeats the extractor is still the
    // student's handout, and losing it because we could not summarise it would
    // be the worst outcome here.
    let stored = false;
    if (uid) {
      const source = await uploadLibrarySource(uid, file, document.folderPath);
      stored = source !== null;
    }

    if (!READABLE.has(extension)) {
      // Kept, not read. Said plainly rather than counted as an import, because
      // "it is in your Library" and "the chat can read it" are different claims.
      return { failure: `${document.title}: kept as a file, no text to read`, imported: false, stored };
    }

    try {
      const { text } = await extractFile(file, uid);
      await createNote({
        content: composeNote(document, text),
        folder: document.folderPath,
        title: document.title,
      });
      return { imported: true, stored };
    } catch (cause) {
      return {
        failure: `${document.title}: ${cause instanceof Error ? cause.message : "couldn't be read"}`,
        imported: false,
        stored,
      };
    }
  }, [createNote, uid]);

  /**
   * Run the whole import.
   *
   * 🔴 ONE DOCUMENT AT A TIME, on purpose. Each one is a request to the
   * student's school for a file, and firing eighty at once at a university
   * server is exactly what abuse looks like from their side. It also keeps the
   * progress line truthful — "reading Lecture 4 of 83" means what it says.
   */
  const runImport = useCallback(async (
    folders: readonly string[],
    documents: readonly PlannedDocument[],
  ): Promise<ImportProgress> => {
    cancelled.current = false;
    setRunning(true);
    const state: ImportProgress = { ...EMPTY, total: documents.length };
    setProgress(state);

    const folderFailures = await makeFolders(folders);
    state.failures.push(...folderFailures);

    for (const document of documents) {
      if (cancelled.current) break;
      state.current = document.title;
      setProgress({ ...state });

      const result = await importOne(document);
      if (result.imported) state.imported += 1;
      if (result.stored) state.stored += 1;
      if (result.failure) state.failures.push(result.failure);
      state.done += 1;
      setProgress({ ...state });
    }

    state.current = "";
    setProgress({ ...state });
    setRunning(false);
    return state;
  }, [importOne, makeFolders]);

  return { cancel, progress, running, runImport };
}
