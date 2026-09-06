"use client";

// Step three: add your first material.
//
// This is the first half of the product's core loop. A student drops in a
// reading, a slide deck, a lab manual, a case, a set of notes; Nemesis reads
// it and files it in their Library. The next step asks a question about it.
//
// IT IS THE LIBRARY'S OWN IMPORTER, NOT A COPY. useLibraryImport is the exact
// pipeline behind "Import notes or documents" in the Library sidebar: same
// accepted formats, same server extraction, same filing. Onboarding only adds a
// per-file list so a student watching three uploads can see which one is being
// read, which landed, and which did not.
//
// FILES ARE SAVED AS THEY ARRIVE. Unlike courses and dates, which wait for the
// end of the flow, a document is written to the account the moment it is
// read. That is the honest behaviour: the whole point of the step is that the
// material is there when the first question is asked, and there is nothing to
// "undo" about a file in a Library.

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { Check, FileText, Loader2, Upload, X } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

import { LIBRARY_IMPORT_ACCEPT, useLibraryImport } from "../library/use-library-import";

/** One file the student added, and where it got to. */
export interface MaterialRow {
  id: string;
  fileName: string;
  state: "reading" | "done" | "failed";
}

interface StepMaterialProps {
  uid: string | null;
  rows: MaterialRow[];
  onChange: (rows: MaterialRow[]) => void;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `material-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function StepMaterial({ onChange, rows, uid }: StepMaterialProps) {
  const library = useCloudLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  /** The row currently being read. The importer reports success by calling
   *  onImported with the note's path; that call is what flips the row to done. */
  const current = useRef<{ id: string; landed: boolean } | null>(null);
  /** The latest rows, so a sequence of awaited imports never overwrites a
   *  neighbour's state with a stale copy. */
  const latest = useRef(rows);
  latest.current = rows;

  const update = useCallback(
    (id: string, state: MaterialRow["state"]) => {
      const next = latest.current.map((row) => (row.id === id ? { ...row, state } : row));
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );

  const { importError, importFiles, importNotices, importing } = useLibraryImport({
    createNote: library.createNote,
    folders: library.folders,
    loadNoteContent: library.loadNoteContent,
    notes: library.notes,
    onImported: () => {
      if (current.current) current.current.landed = true;
    },
    saveNote: library.saveNote,
    uid,
  });

  async function handleFiles(list: FileList | File[] | null) {
    if (!list || !uid) return;
    const files = Array.from(list);
    if (files.length === 0) return;
    // Every file gets its row up front, so the student sees the whole batch and
    // not just the one being read.
    const added: MaterialRow[] = files.map((file) => ({ fileName: file.name, id: newId(), state: "reading" }));
    const next = [...latest.current, ...added];
    latest.current = next;
    onChange(next);
    // One file per import call. The importer reports per batch, and a batch of
    // one is what turns that into a per-file result.
    for (const [index, file] of files.entries()) {
      const row = added[index];
      if (!row) continue;
      current.current = { id: row.id, landed: false };
      await importFiles([file]);
      update(row.id, current.current.landed ? "done" : "failed");
      current.current = null;
    }
    library.reload();
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(id: string) {
    // Removes the row from this screen only. The file is already in the Library
    // and can be deleted there; onboarding does not delete anything.
    onChange(rows.filter((row) => row.id !== id));
  }

  const landed = rows.filter((row) => row.state === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Add your first material</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A reading, a slide deck, lecture notes, a problem set, a case. Nemesis reads it and files it in your
          Library, and the next step asks a question about it. You can skip this and add material any time.
        </p>
      </div>

      {importError && (
        <p className="rounded-lg border border-(--ui-danger)/40 bg-(--ui-danger)/10 px-3 py-2 text-xs text-(--ui-danger)">
          {importError}
        </p>
      )}

      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-6 text-center transition-colors",
          dragging ? "border-(--ui-accent) bg-(--ui-accent)/5" : "border-border",
        )}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        {importing ? (
          <>
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
            <p className="text-xs text-muted-foreground">Reading your material</p>
          </>
        ) : (
          <>
            <FileText className="text-muted-foreground" size={20} />
            <p className="max-w-sm text-xs text-muted-foreground">
              Drop files here, or choose them. PDF, Word, PowerPoint, spreadsheets, images, notes, and more.
            </p>
            <input
              accept={LIBRARY_IMPORT_ACCEPT}
              className="hidden"
              multiple
              onChange={(event) => void handleFiles(event.target.files)}
              ref={inputRef}
              type="file"
            />
            <Button disabled={!uid} onClick={() => inputRef.current?.click()} size="sm" type="button">
              <Upload size={14} /> Choose files
            </Button>
            {!uid && <p className="text-[0.6875rem] text-muted-foreground">Sign in to add material.</p>}
          </>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              key={row.id}
            >
              {row.state === "reading" && <Loader2 className="shrink-0 animate-spin text-muted-foreground" size={14} />}
              {row.state === "done" && <Check className="shrink-0 text-(--theme-primary)" size={14} />}
              {row.state === "failed" && <X className="shrink-0 text-(--ui-danger)" size={14} />}
              <span className="min-w-0 flex-1 truncate text-foreground">{row.fileName}</span>
              <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                {row.state === "reading" ? "Reading" : row.state === "done" ? "In your Library" : "Could not read"}
              </span>
              {row.state !== "reading" && (
                <button
                  aria-label={`Remove ${row.fileName} from this list`}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => remove(row.id)}
                  type="button"
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {importNotices.map((notice) => (
        <p className="text-[0.6875rem] text-muted-foreground" key={notice}>
          {notice}
        </p>
      ))}

      {landed > 0 && (
        <p className="text-[0.6875rem] text-muted-foreground">
          {landed === 1 ? "1 file is" : `${landed} files are`} in your Library. Add more, or continue.
        </p>
      )}
    </div>
  );
}
