"use client";

// Library folder-tree sidebar — desktop src/app/library/index.tsx LibraryView aside, now
// wired to the real cloud read: lib/workspace/library-cloud-store.ts fetches the signed-in
// user's rows from readable_library_documents and this renders them as a folder tree
// (lib/workspace/library-tree.ts). Still read-only — the three header actions stay inert
// placeholders (write sync is a separate, later slice).

import { IconFilePlus, IconFolderPlus, IconLayoutSidebarLeftCollapse } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { CountSkeleton, Skeleton } from "@/components/desktop-ui/skeleton";
import { SearchField } from "@/components/desktop-ui/search-field";
import { Tip } from "@/components/desktop-ui/tooltip";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { buildLibraryTree, countLibraryNotes } from "@/lib/workspace/library-tree";
import { cn } from "@/lib/utils";
import { GROUP_BODY, SCROLL_Y, SidebarRowStack } from "@/components/workspace/shell/sidebar-primitives";

import { LibraryNoteRow, LibraryTreeView } from "./library-tree-view";
import { LibraryTreeBlankState } from "./library-tree-blank-state";

const INERT_TIP = "Editing isn't available yet — notes are read-only until write sync ships";

const HEADER_ACTIONS = [
  { label: "New note", icon: IconFilePlus },
  { label: "New folder", icon: IconFolderPlus },
  { label: "Hide file list", icon: IconLayoutSidebarLeftCollapse },
];

export function LibrarySidebar() {
  const [query, setQuery] = useState("");
  const { status, notes, error, selectedPath, select, reload } = useCloudLibrary();

  const tree = useMemo(() => buildLibraryTree(notes), [notes]);
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
            <Tip key={label} label={INERT_TIP}>
              <Button aria-label={label} size="icon-xs" type="button" variant="ghost">
                <Icon />
              </Button>
            </Tip>
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
          <LibraryTreeBlankState />
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
