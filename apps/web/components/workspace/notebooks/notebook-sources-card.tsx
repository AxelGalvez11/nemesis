"use client";

// The right-rail "Sources" segment (Claude's Context box): one divider-separated block inside the
// unified rail panel that lists the notebook's sources, is itself a drag-and-drop target for files,
// and whose "+" opens the finder dialog. Renders borderless (the parent panel owns the rounding +
// dividers). Drops and dialog uploads share the same extract path (notebook-source-actions). Writes
// are RLS-scoped.

import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { NotebookSource, NotebookSourceKind } from "@/lib/notebooks/api";
import { cn } from "@/lib/utils";

import type { UseNotebooksApi } from "./notebooks-store";
import { NotebookSourcesDialog } from "./notebook-sources-dialog";
import { extractAndAddFile, isAcceptedFile } from "./notebook-source-actions";

const KIND_ICON: Record<NotebookSourceKind, string> = {
  library: "book",
  text: "note",
  url: "link",
  pdf: "file-pdf",
  docx: "file",
  pptx: "file-media",
  youtube: "play-circle",
};

function bytesLabel(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface NotebookSourcesCardProps {
  notebookId: string;
  uid: string | null;
  sources: NotebookSource[];
  sourcesStatus: UseNotebooksApi["sourcesStatus"];
  addLibrary: UseNotebooksApi["addLibrary"];
  addExtracted: UseNotebooksApi["addExtracted"];
  removeSource: UseNotebooksApi["removeSource"];
}

export function NotebookSourcesCard({
  notebookId,
  uid,
  sources,
  sourcesStatus,
  addLibrary,
  addExtracted,
  removeSource,
}: NotebookSourcesCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const existingLibraryPaths = useMemo(
    () => new Set(sources.filter((s) => s.libraryPath).map((s) => s.libraryPath as string)),
    [sources],
  );

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
    if (!files.length) {
      setDropError("Drop a PDF, Word, or PowerPoint file.");
      return;
    }
    setDropBusy(true);
    setDropError(null);
    try {
      for (const file of files) {
        await extractAndAddFile({ uid, notebookId, file, addExtracted });
      }
    } catch (err) {
      setDropError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setDropBusy(false);
    }
  };

  return (
    <section
      className={cn(
        "flex flex-col gap-2 p-3 transition-colors",
        dragging && "bg-(--ui-control-hover-background)",
      )}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[0.8rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
          Sources
          {sources.length > 0 && <span className="tabular-nums text-(--ui-text-quaternary)">{sources.length}</span>}
        </h2>
        <Button aria-label="Add a source" onClick={() => setDialogOpen(true)} size="icon-xs" type="button" variant="ghost">
          <Codicon name="add" size="0.85rem" />
        </Button>
      </div>

      {dropError && <p className="text-[0.72rem] text-(--dt-destructive)">{dropError}</p>}
      {dropBusy && <p className="text-[0.72rem] text-(--ui-text-tertiary)">Reading dropped file…</p>}

      {sourcesStatus === "loading" ? (
        <p className="py-2 text-[0.8rem] text-(--ui-text-tertiary)">Loading sources…</p>
      ) : sources.length === 0 ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-5 text-center text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background)"
        >
          <Codicon name="cloud-upload" size="1.1rem" />
          <span className="text-[0.78rem]">Drag files here, or click to add notes, links, or files.</span>
        </button>
      ) : (
        <ul className="flex flex-col gap-1">
          {sources.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-(--ui-control-hover-background)"
            >
              <Codicon name={KIND_ICON[s.kind]} size="0.85rem" className="shrink-0 text-(--ui-text-tertiary)" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.82rem] font-medium text-foreground">{s.name}</div>
                <div className="truncate text-[0.68rem] text-(--ui-text-quaternary)">
                  {s.kind === "url" && s.sourceUrl ? s.sourceUrl : s.kind === "library" ? "Library note" : bytesLabel(s.bytes) ?? s.kind.toUpperCase()}
                </div>
              </div>
              <Button
                aria-label={`Remove ${s.name}`}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => void removeSource(s.id)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Codicon name="trash" size="0.75rem" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <NotebookSourcesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        notebookId={notebookId}
        uid={uid}
        existingLibraryPaths={existingLibraryPaths}
        addLibrary={addLibrary}
        addExtracted={addExtracted}
      />
    </section>
  );
}
