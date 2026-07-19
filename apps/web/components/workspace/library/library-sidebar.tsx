"use client";

// Cloud Library tree with persisted note/folder creation, search, selection,
// and shared state for the editor and Graph surfaces.

import { IconFilePlus, IconFolderPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { CountSkeleton, Skeleton } from "@/components/desktop-ui/skeleton";
import { SearchField } from "@/components/desktop-ui/search-field";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { buildLibraryTree, countLibraryNotes } from "@/lib/workspace/library-tree";
import { cn } from "@/lib/utils";
import { GROUP_BODY, SCROLL_Y, SidebarRowStack } from "@/components/workspace/shell/sidebar-primitives";

import { LibraryNoteRow, LibraryTreeView } from "./library-tree-view";
import { LibraryTreeBlankState } from "./library-tree-blank-state";
import { LibraryCreateDialog, type LibraryCreateKind } from "./library-create-dialog";

const HEADER_ACTIONS = [
  { label: "New note", icon: IconFilePlus },
  { label: "New folder", icon: IconFolderPlus },
] as const;

export function LibrarySidebar() {
  const [query, setQuery] = useState("");
  const [createKind, setCreateKind] = useState<LibraryCreateKind | null>(null);
  const { status, notes, folders, error, selectedPath, select, reload } = useCloudLibrary();

  const tree = useMemo(() => buildLibraryTree(notes, folders), [folders, notes]);
  const totalCount = useMemo(() => countLibraryNotes(tree), [tree]);
  const loading = status === "idle" || status === "loading";

  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    if (!trimmedQuery) return null;
    const q = trimmedQuery.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, trimmedQuery]);

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height)">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Library</h1>
          {loading ? (
            <CountSkeleton className="mt-1.5" />
          ) : status === "error" ? (
            <p className="mt-0.5 text-[0.65rem] font-medium text-(--dt-destructive)">Couldn&rsquo;t load notes</p>
          ) : (
            <p className="mt-0.5 text-[0.65rem] font-medium tabular-nums text-(--ui-text-tertiary)">
              {totalCount} note{totalCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="flex gap-0.5">
          {HEADER_ACTIONS.map(({ label, icon: Icon }) => (
            <Button aria-label={label} key={label} onClick={() => setCreateKind(label === "New note" ? "note" : "folder")} size="icon-xs" type="button" variant="ghost">
              <Icon />
            </Button>
          ))}
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mx-3">
          <SearchField
            aria-label="Search notes"
            containerClassName="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2 opacity-100"
            onChange={setQuery}
            placeholder="Search notes…"
            value={query}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <LibrarySkeletons />
        ) : status === "error" ? (
          <LibraryErrorState message={error} onRetry={reload} />
        ) : totalCount === 0 ? (
          <LibraryTreeBlankState onCreate={() => setCreateKind("note")} />
        ) : trimmedQuery && filtered ? (
          filtered.length === 0 ? (
            <LibraryNoMatchState query={trimmedQuery} />
          ) : (
            <SidebarRowStack className={cn("flex min-h-0 flex-1 flex-col gap-px px-2 pb-1.75", SCROLL_Y)}>
              {filtered.map((note) => (
                <LibraryNoteRow
                  isSelected={note.path === selectedPath}
                  key={note.path}
                  note={{ kind: "note", path: note.path, title: note.title }}
                  onSelect={select}
                />
              ))}
            </SidebarRowStack>
          )
        ) : (
          <div className={cn("min-h-0 flex-1 px-2 pb-1.75", GROUP_BODY)}>
            <LibraryTreeView folder={tree} onSelect={select} selectedPath={selectedPath} />
          </div>
        )}
      </div>
      <LibraryCreateDialog kind={createKind ?? "note"} onOpenChange={(open) => !open && setCreateKind(null)} open={createKind !== null} />
    </aside>
  );
}

function LibrarySkeletons() {
  const widths = ["w-32", "w-40", "w-28", "w-36", "w-24"];
  return (
    <div aria-hidden className="grid gap-px px-2">
      {widths.map((width, index) => (
        <div className="grid min-h-[1.625rem] items-center rounded-md pl-2" key={index}>
          <Skeleton className={cn("h-3 rounded-sm", width)} />
        </div>
      ))}
    </div>
  );
}

function LibraryErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <Codicon className="text-(--ui-text-quaternary)" name="warning" size="1.25rem" />
        <p className="text-xs text-(--ui-text-tertiary)">Couldn&rsquo;t reach your notes</p>
        {message && <p className="max-w-52 text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">{message}</p>}
        <Button className="mt-0.5 text-(--ui-text-secondary)" onClick={onRetry} size="sm" variant="ghost">
          <Codicon name="refresh" size="0.75rem" /> Retry
        </Button>
      </div>
    </div>
  );
}

function LibraryNoMatchState({ query }: { query: string }) {
  return (
    <div className="wrap-anywhere grid min-h-24 flex-1 place-items-center px-4 text-center text-xs text-(--ui-text-tertiary)">
      {`No notes match “${query}”.`}
    </div>
  );
}
