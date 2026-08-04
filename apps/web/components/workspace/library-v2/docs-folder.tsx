"use client";

// One folder, shown in the center pane like a docs site's section index.
// Owner 2026-08-03: "source files live inside the same Library, but in their
// own 'Sources' area under each course or topic … Notes = organized
// knowledge, Sources = original uploaded material" — kept VISIBLY SEPARATE so
// the Library never becomes a mix of notes and raw files, and nobody has to
// switch to a separate Files page.
//
// Reached by clicking a breadcrumb on a note, a folder card on the home page,
// or a crumb on another folder page. URL: ?folder=<path>.

import { Codicon } from "@/components/desktop-ui/codicon";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { countLibraryNotes, type LibraryTreeFolder } from "@/lib/workspace/library-tree";
import {
  formatSourceSize,
  librarySourceKindIcon,
  librarySourceKindLabel,
  type LibrarySource,
} from "@/lib/workspace/library-sources";

import { DocsCrumbs } from "./docs-crumbs";

interface DocsFolderProps {
  folder: LibraryTreeFolder;
  /** Source files filed directly under this folder (already filtered). */
  sources: readonly LibrarySource[];
  onOpenPath: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenHome: () => void;
  onOpenSource: (id: string) => void;
}

function dayLabel(iso: string): string | null {
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp) || stamp <= 0) return null;
  return new Date(stamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function DocsFolder({ folder, sources, onOpenPath, onOpenFolder, onOpenHome, onOpenSource }: DocsFolderProps) {
  const noteCount = countLibraryNotes(folder);
  const empty = folder.notes.length === 0 && folder.folders.length === 0 && sources.length === 0;
  const counts = [
    noteCount === 1 ? "1 note" : `${noteCount} notes`,
    ...(sources.length > 0 ? [sources.length === 1 ? "1 source file" : `${sources.length} source files`] : []),
  ].join(" · ");

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl min-w-0 flex-col px-8 pb-16 pt-6 max-sm:px-4">
      <header>
        <DocsCrumbs onOpenFolder={onOpenFolder} onOpenHome={onOpenHome} path={folder.path.split("/").slice(0, -1).join("/")} />
        <h1 className="mt-2 flex items-center gap-2.5 text-[1.75rem] font-bold tracking-tight text-foreground">
          <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="folder" size="1.375rem" />
          <span className="min-w-0 truncate">{folder.name}</span>
        </h1>
        <p className="mt-1 text-xs text-(--ui-text-tertiary)">{counts}</p>
      </header>

      {empty ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <EmptyState description="Notes you create or import into this folder will show up here." title="This folder is empty" />
        </div>
      ) : (
        <>
          {folder.folders.length > 0 && (
            <section className="mt-8" data-testid="folder-subfolders">
              <div className="grid gap-2 sm:grid-cols-2">
                {folder.folders.map((child) => (
                  <button
                    className="group flex items-center justify-between gap-2 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-4 py-3 text-left transition-colors hover:border-(--ui-stroke-secondary)"
                    key={child.path}
                    onClick={() => onOpenFolder(child.path)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold text-foreground">
                      <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="folder" size="0.8125rem" />
                      <span className="truncate">{child.name}</span>
                    </span>
                    <span className="shrink-0 text-[0.65rem] text-(--ui-text-quaternary)">
                      {countLibraryNotes(child) === 1 ? "1 note" : `${countLibraryNotes(child)} notes`}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {folder.notes.length > 0 && (
            <section className="mt-8" data-testid="folder-notes">
              <h2 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Notes</h2>
              <div className="grid gap-px">
                {folder.notes.map((note) => {
                  const edited = dayLabel(note.updatedAt);
                  return (
                    <button
                      className="row-hover flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left"
                      key={note.path}
                      onClick={() => onOpenPath(note.path)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-[0.8125rem] font-medium text-(--ui-text-secondary)">
                        <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="note" size="0.8125rem" />
                        <span className="truncate">{note.title}</span>
                      </span>
                      {edited && <span className="shrink-0 text-[0.65rem] text-(--ui-text-quaternary)">{edited}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {sources.length > 0 && (
            <section className="mt-8" data-testid="folder-sources">
              <h2 className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Sources</h2>
              <p className="mb-2 text-xs text-(--ui-text-tertiary)">Original files this folder&rsquo;s notes were built from.</p>
              <div className="grid gap-px">
                {sources.map((source) => {
                  const meta = [librarySourceKindLabel(source.kind), formatSourceSize(source.sizeBytes), dayLabel(source.createdAt)]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <button
                      className="row-hover flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left"
                      key={source.id}
                      onClick={() => onOpenSource(source.id)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-[0.8125rem] font-medium text-(--ui-text-secondary)">
                        <Codicon className="shrink-0 text-(--ui-text-quaternary)" name={librarySourceKindIcon(source.kind)} size="0.8125rem" />
                        <span className="truncate">{source.fileName}</span>
                      </span>
                      <span className="shrink-0 text-[0.65rem] text-(--ui-text-quaternary)">{meta}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
