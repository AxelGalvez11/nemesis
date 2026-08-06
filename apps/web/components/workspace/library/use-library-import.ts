"use client";

// One import pipeline, two sidebars: the classic Library tree and the docs-nav
// both accept the same files and file them the same way.
//
// WHAT HAPPENS TO A DOCUMENT (PDF/Word/PowerPoint/image): its text is
// extracted by the server (/api/notebooks/extract/file), THE LIBRARIAN files
// it — one model pass that turns the document into clean, cross-linked topic
// pages under the student's own folders, and adds Related links to a few
// genuinely related existing notes (see library-librarian.ts, incl. the
// Personal-folder exemption) — and THE ORIGINAL FILE IS KEPT: uploaded to the
// private library-sources bucket and filed under the same folder, so it shows
// in that folder's Sources group and opens from the note's source pills
// (owner 2026-08-03: "yes it needs to be stored so that users can click on
// it"). Each created page records its lineage in library_provenance with the
// stored file's id.
//
// If the model is unreachable or its plan doesn't validate, the import falls
// back to the old behaviour — one raw-text note under "Imported" — but the
// original is STILL kept (filed under "Imported") and stamped, so organizing
// quality never decides whether the student keeps their file.
//
// Markdown/text files are the student's OWN notes: saved verbatim, never
// reorganized, and not duplicated into storage — the note IS the content.
// Every storage/provenance write is best-effort: an import never fails
// because a stamp or upload did. Per-file try/catch so one unreadable file
// does not abandon the rest of the batch.

import { useState } from "react";

import { supabase } from "@/lib/supabase";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import { describeCoverage, type ExtractionCoverage } from "@nemesis/shared";
import { extractFile, isExtractable, isImage } from "@/lib/workspace/chat-attachments";
import { composeImportedNote, findRelatedTitles, importedTitleFrom } from "@/lib/workspace/library-import";
import { setLibrarySourceFolder, uploadLibrarySource, type LibrarySource } from "@/lib/workspace/library-sources";
import {
  applyLibrarianPlan,
  buildLibrarianMessages,
  librarianOutline,
  parseLibrarianPlan,
  LIBRARIAN_MODEL,
} from "@/lib/workspace/library-librarian";

export const LIBRARY_IMPORT_ACCEPT =
  ".md,.markdown,.txt,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.heic,.heif,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/webp,image/heic,image/heif";

/** Below this much extracted text a document is a snippet, not a lecture —
 *  the librarian pass isn't worth a model call and the plain note is fine. */
const LIBRARIAN_MIN_CHARS = 200;

interface UseLibraryImportArgs {
  uid: string | null;
  notes: readonly CloudLibraryNote[];
  folders: readonly string[];
  createNote: (input: { title: string; folder: string; content: string }) => Promise<CloudLibraryNote>;
  saveNote: (input: { id: string; title: string; content: string }) => Promise<unknown>;
  /** Called with the last successfully imported note's path, to open it. */
  onImported: (lastPath: string) => void;
  /** Called once per batch that stored at least one original file, so the
   *  surface can refresh its Sources listing. */
  onSourcesChanged?: () => void;
}

export function useLibraryImport({ uid, notes, folders, createNote, saveNote, onImported, onSourcesChanged }: UseLibraryImportArgs) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  /** What imported successfully but INCOMPLETELY — one line per file, and empty
   *  whenever everything was read in full. Not an error: the note is real and
   *  worth keeping; the student simply has to know what is not in it. */
  const [importNotices, setImportNotices] = useState<string[]>([]);

  /** Best-effort provenance stamp linking a note to its stored original. */
  const recordProvenance = async (noteId: string, fileName: string, sourceId: string | null, location?: object | null) => {
    if (!uid) return;
    try {
      await supabase.from("library_provenance").insert({
        document_id: noteId,
        location: location ?? {},
        source_id: sourceId,
        source_kind: "upload",
        source_path: fileName,
        user_id: uid,
      });
    } catch {
      // A missing stamp costs a pill, never an import.
    }
  };

  /** The librarian pass for one document. Returns the first created page's
   *  path, or null when anything at all went wrong (caller falls back). The
   *  stored original (if the upload succeeded) is threaded into every page's
   *  provenance stamp so pills open the file. */
  const organizeDocument = async (
    file: File,
    text: string,
    filed: LibrarySource | null,
    coverage?: ExtractionCoverage,
  ): Promise<{ path: string; stored: LibrarySource | null } | null> => {
    if (!uid || text.trim().length < LIBRARIAN_MIN_CHARS) return null;
    try {
      const reply = await postChatCompletion(
        uid,
        buildLibrarianMessages({
          coverage,
          fileName: file.name,
          outline: librarianOutline(notes.map((note) => note.path), folders),
          text,
        }),
        { decision: { model: LIBRARIAN_MODEL, route: "learning", searchWeb: false } },
      );
      const plan = parseLibrarianPlan(reply.text ?? "", notes.map((note) => note.path));
      if (!plan) return null;
      // The bytes are already in the bucket — the librarian only decides WHERE
      // the row is filed, which is a metadata update, not a second upload.
      const stored = filed ? { ...filed, folderPath: plan.folder } : null;
      if (filed) await setLibrarySourceFolder(uid, filed.id, plan.folder);
      const firstPath = await applyLibrarianPlan(plan, {
        createNote,
        findNote: (path) => {
          const found = notes.find((note) => note.path.toLocaleLowerCase() === path.toLocaleLowerCase());
          return found ? { content: found.content, id: found.id, title: found.title } : null;
        },
        recordSource: (noteId, location) => recordProvenance(noteId, file.name, stored?.id ?? null, location),
        saveNote,
      });
      return firstPath ? { path: firstPath, stored } : null;
    } catch {
      return null;
    }
  };

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImportError(null);
    setImportNotices([]);
    setImporting(true);
    const failures: string[] = [];
    // 🔴 NOT FAILURES, AND NOT SILENCE EITHER. A file whose pages could not all
    // be read still imports, and the note built from it is still worth having —
    // but the student has to be told which part of their lecture is not in it.
    // Kept separate from `failures` because the two want different words and a
    // different colour: one says "this did not work", the other says "this
    // worked, and here is what is missing".
    const notices: string[] = [];
    let lastPath: string | null = null;
    let storedAny = false;
    for (const file of files) {
      try {
        if (isExtractable(file)) {
          // 🔴 UPLOAD FIRST, THEN EXTRACT. The original used to be stored AFTER
          // extraction, which meant a large file was sent twice: once to the
          // extractor and again to the bucket. Filing it first yields the row id
          // the extractor takes as its reference, so the bytes leave the device
          // exactly once and every later operation names the same object.
          const filed = uid ? await uploadLibrarySource(uid, file, "Imported") : null;
          const { coverage, text, title } = await extractFile(file, uid, {
            folderPath: "Imported",
            sourceId: filed?.id,
          });
          // describeCoverage returns null on a complete read, so a clean import
          // adds nothing — a badge that appears on every file teaches people to
          // stop reading badges.
          const gap = coverage ? describeCoverage(coverage) : null;
          if (gap) notices.push(`${file.name}: ${gap}`);
          const organized = isImage(file) ? null : await organizeDocument(file, text, filed, coverage);
          if (organized) {
            lastPath = organized.path;
            storedAny = storedAny || organized.stored !== null;
          } else {
            const note = await createNote({
              // A camera filename ("IMG_4821.HEIC") makes a useless note title, so for a picture the
              // server's title — read out of the picture itself — wins. Documents keep the filename,
              // which is what a student named them and expects to see.
              title: isImage(file) ? (title ?? importedTitleFrom(file.name)) : importedTitleFrom(file.name),
              folder: "Imported",
              content: composeImportedNote(text, findRelatedTitles(text, notes)),
            });
            lastPath = note.path;
            if (uid) {
              // Already filed above — do NOT upload a second copy.
              storedAny = storedAny || filed !== null;
              await recordProvenance(note.id, file.name, filed?.id ?? null);
            }
          }
        } else {
          const title = file.name.replace(/\.(?:md|markdown|txt)$/i, "").trim() || "Untitled note";
          const note = await createNote({ title, folder: "", content: await file.text() });
          lastPath = note.path;
        }
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : "couldn't import"}`);
      }
    }
    setImporting(false);
    if (storedAny) onSourcesChanged?.();
    if (lastPath) onImported(lastPath);
    if (failures.length) setImportError(failures.join(" · "));
    setImportNotices(notices);
  };

  return { importError, importFiles, importNotices, importing };
}
