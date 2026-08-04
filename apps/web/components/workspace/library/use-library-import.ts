"use client";

// One import pipeline, two sidebars: the classic Library tree and the docs-nav
// both accept the same files and file them the same way.
//
// WHAT HAPPENS TO A DOCUMENT (PDF/Word/PowerPoint): its text is extracted by
// the server (/api/notebooks/extract/file), then THE LIBRARIAN files it —
// one model pass that turns the document into clean, cross-linked topic pages
// under the student's own folders, and adds Related links to a few genuinely
// related existing notes (see library-librarian.ts, incl. the Personal-folder
// exemption). If the model is unreachable or its plan doesn't validate, the
// import falls back to exactly the old behaviour — one raw-text note under
// "Imported" with a `## Related` section — so organizing is only ever an
// upgrade, never a new way to lose a file.
//
// Markdown/text files are the student's OWN notes: saved verbatim, never
// reorganized. Images keep the plain path too (their extraction is a caption,
// not a document). Per-file try/catch so one unreadable file does not abandon
// the rest of the batch.
//
// The original bytes are NOT kept anywhere yet — extraction is text in, text
// out. When the file-storage layer lands (needs the owner-approved
// migrations), this hook is the choke point that starts uploading originals;
// provenance stamping below is already attempted and simply no-ops until its
// INSERT policy exists.

import { useState } from "react";

import { supabase } from "@/lib/supabase";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import { extractFile, isExtractable, isImage } from "@/lib/workspace/chat-attachments";
import { composeImportedNote, findRelatedTitles, importedTitleFrom } from "@/lib/workspace/library-import";
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
}

export function useLibraryImport({ uid, notes, folders, createNote, saveNote, onImported }: UseLibraryImportArgs) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  /** The librarian pass for one document. Returns the first created page's
   *  path, or null when anything at all went wrong (caller falls back). */
  const organizeDocument = async (fileName: string, text: string): Promise<string | null> => {
    if (!uid || text.trim().length < LIBRARIAN_MIN_CHARS) return null;
    try {
      const reply = await postChatCompletion(
        uid,
        buildLibrarianMessages({
          fileName,
          outline: librarianOutline(notes.map((note) => note.path), folders),
          text,
        }),
        { decision: { model: LIBRARIAN_MODEL, route: "learning", searchWeb: false } },
      );
      const plan = parseLibrarianPlan(reply.text ?? "", notes.map((note) => note.path));
      if (!plan) return null;
      const firstPath = await applyLibrarianPlan(plan, {
        createNote,
        findNote: (path) => {
          const found = notes.find((note) => note.path.toLocaleLowerCase() === path.toLocaleLowerCase());
          return found ? { content: found.content, id: found.id, title: found.title } : null;
        },
        recordSource: async (noteId, location) => {
          // Best-effort provenance: the table is SELECT-only until its
          // migration lands, so this fails quietly today and starts lighting
          // up source pills the moment the INSERT policy exists.
          await supabase.from("library_provenance").insert({
            document_id: noteId,
            location: location ?? {},
            source_kind: "upload",
            source_path: fileName,
            user_id: uid,
          });
        },
        saveNote,
      });
      return firstPath || null;
    } catch {
      return null;
    }
  };

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImportError(null);
    setImporting(true);
    const failures: string[] = [];
    let lastPath: string | null = null;
    for (const file of files) {
      try {
        if (isExtractable(file)) {
          const { text, title } = await extractFile(file, uid);
          const organizedPath = isImage(file) ? null : await organizeDocument(file.name, text);
          if (organizedPath) {
            lastPath = organizedPath;
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
    if (lastPath) onImported(lastPath);
    if (failures.length) setImportError(failures.join(" · "));
  };

  return { importError, importFiles, importing };
}
