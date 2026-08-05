"use client";

// The "+" finder — a centered, zoom-in dialog (Radix Dialog handles the micro-animation) for adding a
// source three ways: pull in a Library note, drop a web link (scraped to text), or upload a PDF / Word
// / PowerPoint (parsed to text). Everything becomes text on the notebook_sources row; the file bytes
// are never kept. Pasted-text was removed per owner feedback. Writes go through the store (RLS-scoped).

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { SearchField } from "@/components/desktop-ui/search-field";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { MAX_SOURCE_BYTES } from "@/lib/notebooks/ingest-ref";
import { cn } from "@/lib/utils";

import type { UseNotebooksApi } from "./notebooks-store";
import { extractAndAddFile, extractAndAddUrl, isAcceptedFile } from "./notebook-source-actions";

type Tab = "library" | "url" | "upload";

interface NotebookSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookId: string;
  uid: string | null;
  existingLibraryPaths: Set<string>;
  addLibrary: UseNotebooksApi["addLibrary"];
  addExtracted: UseNotebooksApi["addExtracted"];
}

export function NotebookSourcesDialog({
  open,
  onOpenChange,
  notebookId,
  uid,
  existingLibraryPaths,
  addLibrary,
  addExtracted,
}: NotebookSourcesDialogProps) {
  const [tab, setTab] = useState<Tab>("library");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that source.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl gap-4 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add a source</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5">
          <TabButton icon="book" label="Library" active={tab === "library"} onClick={() => setTab("library")} />
          <TabButton icon="link" label="Link" active={tab === "url"} onClick={() => setTab("url")} />
          <TabButton icon="cloud-upload" label="Upload" active={tab === "upload"} onClick={() => setTab("upload")} />
        </div>

        {error && <p className="text-[0.8rem] text-(--dt-destructive)">{error}</p>}

        {tab === "library" && (
          <LibraryTab
            existingPaths={existingLibraryPaths}
            busy={busy}
            onPick={(note) => run(() => addLibrary(notebookId, { path: note.path, title: note.title, content: note.content }))}
          />
        )}
        {tab === "url" && <UrlTab busy={busy} onAdd={(url) => run(() => extractAndAddUrl({ uid, notebookId, url, addExtracted }))} />}
        {tab === "upload" && <UploadTab busy={busy} onFile={(file) => run(() => extractAndAddFile({ uid, notebookId, file, addExtracted }))} />}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8rem] font-medium transition-colors",
        active
          ? "border-(--ui-stroke-secondary) bg-(--ui-control-active-background) text-foreground"
          : "border-(--ui-stroke-tertiary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
      )}
    >
      <Codicon name={icon} size="0.8rem" />
      {label}
    </button>
  );
}

function LibraryTab({
  existingPaths,
  onPick,
  busy,
}: {
  existingPaths: Set<string>;
  onPick: (note: { path: string; title: string; content: string }) => void;
  busy: boolean;
}) {
  const { notes, status } = useCloudLibrary();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes;
    return list.slice(0, 200);
  }, [notes, query]);

  return (
    <div className="flex flex-col gap-2">
      <SearchField aria-label="Search notes" onChange={setQuery} placeholder="Search your notes…" value={query} />
      <div className="max-h-72 overflow-y-auto">
        {status === "loading" ? (
          <p className="px-1 py-3 text-[0.85rem] text-(--ui-text-tertiary)">Loading your notes…</p>
        ) : filtered.length === 0 ? (
          <p className="px-1 py-3 text-[0.85rem] text-(--ui-text-tertiary)">No notes found.</p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((note) => {
              const added = existingPaths.has(note.path);
              return (
                <li key={note.path}>
                  <button
                    type="button"
                    disabled={added || busy}
                    onClick={() => onPick({ path: note.path, title: note.title, content: note.content })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[0.9rem] text-(--ui-text-secondary) enabled:hover:bg-(--ui-control-hover-background) enabled:hover:text-foreground disabled:opacity-45"
                  >
                    <Codicon name={added ? "check" : "book"} size="0.85rem" className="shrink-0 text-(--ui-text-tertiary)" />
                    <span className="min-w-0 flex-1 truncate">{note.title}</span>
                    {added && <span className="text-[0.7rem] text-(--ui-text-quaternary)">Added</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function UrlTab({ busy, onAdd }: { busy: boolean; onAdd: (url: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <input
        className="rounded-xl border border-(--ui-stroke-tertiary) bg-transparent px-3 py-2 text-[0.95rem] text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url.trim() && !busy) onAdd(url.trim());
        }}
        placeholder="https://example.com/article"
        value={url}
      />
      <p className="text-[0.72rem] text-(--ui-text-quaternary)">We grab the page&rsquo;s readable text. Pages behind a login can&rsquo;t be read.</p>
      <div className="flex justify-end">
        <Button disabled={!url.trim() || busy} onClick={() => onAdd(url.trim())} size="sm" type="button" variant="secondary">
          {busy ? "Reading…" : "Add link"}
        </Button>
      </div>
    </div>
  );
}

function UploadTab({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = Array.from(e.dataTransfer.files).find(isAcceptedFile);
          if (file) onFile(file);
        }}
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors",
          dragging
            ? "border-(--ui-stroke-secondary) bg-(--ui-control-hover-background) text-foreground"
            : "border-(--ui-stroke-secondary) text-(--ui-text-secondary) enabled:hover:bg-(--ui-control-hover-background) disabled:opacity-60",
        )}
      >
        <Codicon name="cloud-upload" size="1.4rem" />
        <span className="text-[0.9rem] font-medium">{busy ? "Reading…" : "Drop a file here, or choose one"}</span>
        {/* 🔴 Said "up to 25 MB" while the real ceiling was ~4.5 MB — the promise a
            student read right before the upload failed for no stated reason. Named
            from the constant now, so the sentence cannot drift from the limit. */}
        <span className="text-[0.72rem] text-(--ui-text-quaternary)">
          PDF, Word, or PowerPoint · up to {Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB
        </span>
      </button>
    </div>
  );
}
