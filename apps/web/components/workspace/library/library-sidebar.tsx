"use client";

// Cloud Library tree with persisted note/folder creation, search, selection,
// and shared state for the editor and Graph surfaces.

import { IconFileImport, IconFilePlus, IconFolderPlus, IconSearch, IconX } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Skeleton } from "@/components/desktop-ui/skeleton";
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

export function LibrarySidebar({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [createKind, setCreateKind] = useState<LibraryCreateKind | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { status, notes, folders, error, selectedPath, select, reload, createNote, createFolder, deleteNote, deleteFolder, moveNote, moveFolder, renameNote, renameFolder } = useCloudLibrary();

  const tree = useMemo(() => buildLibraryTree(notes, folders), [folders, notes]);
  const totalCount = useMemo(() => countLibraryNotes(tree), [tree]);
  const loading = status === "idle" || status === "loading";

  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    if (!trimmedQuery) return null;
    const q = trimmedQuery.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, trimmedQuery]);

  const createBlankNote = async () => {
    const note = await createNote({ title: "Untitled note", folder: "", content: "" });
    router.replace(`${navigationRoot}/library?note=${encodeURIComponent(note.path)}`);
    onNavigate?.();
  };

  const openPath = (path: string) => {
    select(path);
    router.replace(`${navigationRoot}/library?note=${encodeURIComponent(path)}`);
    onNavigate?.();
  };

  const importNotes = async (files: File[]) => {
    if (files.length === 0) return;
    setImportError(null);
    try {
      let lastPath: string | null = null;
      for (const file of files) {
        const title = file.name.replace(/\.(?:md|markdown|txt)$/i, "").trim() || "Untitled note";
        const note = await createNote({ title, folder: "", content: await file.text() });
        lastPath = note.path;
      }
      if (lastPath) openPath(lastPath);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Couldn't import those notes.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height)">
      <div className="workspace-page-header flex items-center justify-between gap-3 px-3 pb-2 pt-2.5">
        <div className="min-w-0">
          <h1 className="workspace-page-title">Library</h1>
          {status === "error" && (
            <p className="mt-0.5 text-[0.65rem] font-medium text-(--dt-destructive)">Couldn&rsquo;t load notes</p>
          )}
        </div>
        <div className="flex gap-0.5">
          <input
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="sr-only"
            multiple
            onChange={(event) => void importNotes(Array.from(event.target.files ?? []))}
            ref={importInputRef}
            type="file"
          />
          {totalCount > 0 && (
            <Button
              aria-label={searchOpen ? "Hide note search" : "Search notes"}
              onClick={() => {
                setSearchOpen((value) => !value);
                if (searchOpen) setQuery("");
              }}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              {searchOpen ? <IconX /> : <IconSearch />}
            </Button>
          )}
          {HEADER_ACTIONS.map(({ label, icon: Icon }) => (
            <Button aria-label={label} key={label} onClick={() => label === "New note" ? void createBlankNote() : setCreateKind("folder")} size="icon-xs" type="button" variant="ghost">
              <Icon />
            </Button>
          ))}
          <Button aria-label="Import notes" onClick={() => importInputRef.current?.click()} size="icon-xs" title="Import notes" type="button" variant="ghost">
            <IconFileImport />
          </Button>
        </div>
      </div>

      {importError && <p className="mx-3 mb-1 text-[0.65rem] text-destructive" role="alert">{importError}</p>}

      {totalCount > 0 && searchOpen && (
        <div className="mx-3 mb-1">
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
                  note={{ kind: "note", id: note.id, path: note.path, title: note.title }}
                  onSelect={openPath}
                />
              ))}
            </SidebarRowStack>
          )
        ) : (
          <div className={cn("min-h-0 flex-1 px-2 pb-1.75", GROUP_BODY)}>
            <LibraryTreeView
              folder={tree}
              onCreateFolder={(path) => void createFolder(path)}
              onDeleteFolder={(path) => void deleteFolder(path)}
              onDeleteNote={(id) => void deleteNote(id)}
              onMoveFolder={(source, target) => void moveFolder(source, target)}
              onMoveNote={(id, target) => void moveNote(id, target)}
              onRenameFolder={(path, title) => void renameFolder(path, title)}
              onRenameNote={(id, title) => void renameNote(id, title)}
              onSelect={openPath}
              selectedPath={selectedPath}
            />
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
