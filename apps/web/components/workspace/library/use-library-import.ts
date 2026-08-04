"use client";

// One import pipeline, two sidebars: the classic Library tree and the docs-nav
// both accept the same files and file them the same way. Markdown/text is read
// in the browser and saved verbatim; PDF/Word/PowerPoint/images go to the
// server extractor (/api/notebooks/extract/file) for their text, are filed
// under an "Imported" folder, and get a `## Related` section linking any
// existing notes they mention. Per-file try/catch so one unreadable file (too
// large, signed out) does not abandon the rest of the batch.
//
// The original bytes are NOT kept anywhere yet — extraction is text in, text
// out (see the extractor route). When the file-storage layer lands, this hook
// is the choke point that starts stamping library_provenance rows.

import { useState } from "react";

import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import { extractFile, isExtractable, isImage } from "@/lib/workspace/chat-attachments";
import { composeImportedNote, findRelatedTitles, importedTitleFrom } from "@/lib/workspace/library-import";

export const LIBRARY_IMPORT_ACCEPT =
  ".md,.markdown,.txt,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.heic,.heif,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/webp,image/heic,image/heif";

interface UseLibraryImportArgs {
  uid: string | null;
  notes: readonly CloudLibraryNote[];
  createNote: (input: { title: string; folder: string; content: string }) => Promise<CloudLibraryNote>;
  /** Called with the last successfully imported note's path, to open it. */
  onImported: (lastPath: string) => void;
}

export function useLibraryImport({ uid, notes, createNote, onImported }: UseLibraryImportArgs) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
          const note = await createNote({
            // A camera filename ("IMG_4821.HEIC") makes a useless note title, so for a picture the
            // server's title — read out of the picture itself — wins. Documents keep the filename,
            // which is what a student named them and expects to see.
            title: isImage(file) ? (title ?? importedTitleFrom(file.name)) : importedTitleFrom(file.name),
            folder: "Imported",
            content: composeImportedNote(text, findRelatedTitles(text, notes)),
          });
          lastPath = note.path;
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
