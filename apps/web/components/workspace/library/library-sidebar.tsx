"use client";

// Cloud Library tree with persisted note/folder creation, search, selection,
// and shared state for the editor and Graph surfaces.

import { IconArrowsSort, IconChevronLeft, IconDots, IconFileImport, IconFilePlus, IconFolderPlus, IconSearch } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { Skeleton } from "@/components/desktop-ui/skeleton";
import { SearchField } from "@/components/desktop-ui/search-field";
import { useAuth } from "@/components/AuthProvider";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { libraryRouteBase } from "@/lib/workspace/library-links";
import { buildLibraryTree, countLibraryNotes, type LibrarySortMode } from "@/lib/workspace/library-tree";
import { cn } from "@/lib/utils";
import { GROUP_BODY, SCROLL_Y } from "@/components/workspace/shell/sidebar-primitives";

import { seedComposerFiles } from "@/lib/workspace/composer-seed";

import { LibraryTreeView } from "./library-tree-view";
import { LibraryTreeBlankState } from "./library-tree-blank-state";
import { LibraryCreateDialog, type LibraryCreateKind } from "./library-create-dialog";
import { LIBRARY_IMPORT_ACCEPT, useLibraryImport } from "./use-library-import";

export function LibrarySidebar({ onNavigate, showBack = true }: { onNavigate?: () => void; showBack?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
  const libraryBase = libraryRouteBase(pathname);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<LibrarySortMode>("az");
  const [createKind, setCreateKind] = useState<LibraryCreateKind | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { status, notes, folders, error, selectedPath, select, reload, createNote, saveNote, createFolder, deleteNote, deleteFolder, moveNote, moveFolder, renameNote, renameFolder } = useCloudLibrary();

  const tree = useMemo(() => buildLibraryTree(notes, folders, sortMode), [folders, notes, sortMode]);
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
    router.replace(`${libraryBase}?note=${encodeURIComponent(note.path)}`);
    onNavigate?.();
  };

  // Library runs in focus mode (WorkspaceShell hides the nav rail here), so
  // this Back control is the surface's only exit. Push an explicit route rather
  // than router.back(): a direct load or refresh of /library has no in-app
  // history entry to return to.
  const leaveLibrary = () => {
    router.push(`${navigationRoot}/sessions`);
    onNavigate?.();
  };

  const openPath = (path: string) => {
    select(path);
    router.replace(`${libraryBase}?note=${encodeURIComponent(path)}`);
    onNavigate?.();
  };

  // "Attach to AI chat": selected notes become virtual .md attachment files
  // seeded into the Sessions composer, which reads their text into the turn
  // via the ordinary prepareChatAttachments path.
  const attachNotesToChat = (noteIds: string[]) => {
    const chosen = notes.filter((note) => noteIds.includes(note.id));
    if (chosen.length === 0) return;
    seedComposerFiles(chosen.map((note) => new File([note.content], `${(note.title || "Note").replace(/[\\/:]/g, "-")}.md`, { type: "text/markdown" })));
    router.push(`${navigationRoot}/sessions`);
    onNavigate?.();
  };

  // Import pipeline shared with the docs-nav — see use-library-import.ts.
  const { importError, importFiles, importNotices, importing } = useLibraryImport({ createNote, folders, notes, onImported: openPath, saveNote, uid });

  const importNotes = async (files: File[]) => {
    await importFiles(files);
    if (importInputRef.current) importInputRef.current.value = "";
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height)">
      <div className="workspace-page-header px-3 pb-2 pt-2.5">
        {/* -ml-1.5 cancels the button's own left padding so the chevron sits on
            the same optical line as the "Library" title below it; the ghost
            hover fill reaching into the gutter matches the tree rows. py-1
            makes it 24px tall, the same as the tools button opposite it. */}
        {showBack && (
          <Button
            className="-ml-1.5 mb-1.5 py-1 text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
            onClick={leaveLibrary}
            size="xs"
            type="button"
            variant="ghost"
          >
            <IconChevronLeft /> Back
          </Button>
        )}
        {/* items-start, not items-center: the error line below the title makes
            this block two rows tall, and centering would drag the tools button
            down off the title it belongs to. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="workspace-page-title">Library</h1>
            {status === "error" && (
              <p className="mt-0.5 text-[0.65rem] font-medium text-(--dt-destructive)">Couldn&rsquo;t load notes</p>
            )}
          </div>
          <div className="flex gap-0.5">
            <input
              accept={LIBRARY_IMPORT_ACCEPT}
              className="hidden"
              multiple
              onChange={(event) => void importNotes(Array.from(event.target.files ?? []))}
              ref={importInputRef}
              type="file"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Library tools" size="icon-xs" title="Library tools" type="button" variant="ghost"><IconDots /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem disabled={totalCount === 0} onSelect={() => {
                  setSearchOpen((value) => !value);
                  if (searchOpen) setQuery("");
                }}><IconSearch /> {searchOpen ? "Hide search" : "Search notes"}</DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><IconArrowsSort /> Sort</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-40" sideOffset={6}>
                    <DropdownMenuRadioGroup onValueChange={(value) => setSortMode(value as LibrarySortMode)} value={sortMode}>
                      {/* Same label the phone uses for this mode, because it is
                          the same stored order on both surfaces. */}
                      <DropdownMenuRadioItem value="manual">My order</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="az">Sort A–Z</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="za">Sort Z–A</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="modified">Date modified</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="added">Date added</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void createBlankNote()}><IconFilePlus /> New note</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCreateKind("folder")}><IconFolderPlus /> New folder</DropdownMenuItem>
                <DropdownMenuItem disabled={importing} onSelect={() => importInputRef.current?.click()}><IconFileImport /> {importing ? "Importing…" : "Import notes or documents"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {importError && <p className="mx-3 mb-1 text-[0.65rem] text-destructive" role="alert">{importError}</p>}
      {/* Imported, but not in full. Muted rather than red: the file is in the
          Library and the note is real — this says which part of it is not. */}
      {importNotices.map((notice) => (
        <p className="mx-3 mb-1 text-[0.65rem] text-muted-foreground" key={notice} role="status">{notice}</p>
      ))}

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
            // 🔴 SEARCH RESULTS GO THROUGH THE TREE, not through bare rows.
            // They used to render LibraryNoteRow directly with only onSelect,
            // so right-clicking a note found by searching did nothing while
            // right-clicking the same note in the tree opened the full menu —
            // the student had to clear the search to rename the thing they had
            // just gone looking for. A folder with no sub-folders renders as a
            // flat list, so handing the matches over as one keeps every action
            // and leaves exactly one menu implementation in the codebase.
            <div className={cn("min-h-0 flex-1 px-2 pb-1.75", SCROLL_Y)}>
              <LibraryTreeView
                folder={{
                  folders: [],
                  kind: "folder",
                  name: "",
                  notes: filtered.map((note) => ({
                    addedOrder: 0,
                    createdAt: note.createdAt,
                    id: note.id,
                    kind: "note" as const,
                    path: note.path,
                    position: note.position ?? null,
                    title: note.title,
                    updatedAt: note.updatedAt,
                  })),
                  path: "",
                }}
                // 🔴 NO MOVE HANDLERS ON SEARCH RESULTS, deliberately. Matches
                // are a flat list with no folders in it, so every drop inside
                // them resolves to the synthetic root — dragging a note one
                // row up to reorder it would silently move it OUT of its
                // folder to the Library root. Without these props a drag is a
                // no-op, which is what a filtered view should be.
                onAttachNotes={attachNotesToChat}
                onCreateNote={() => setCreateKind("note")}
                onCreateFolder={(path) => void createFolder(path)}
                onDeleteFolder={(path) => void deleteFolder(path)}
                onDeleteNote={(id) => void deleteNote(id)}
                onRenameFolder={(path, title) => void renameFolder(path, title)}
                onRenameNote={(id, title) => void renameNote(id, title)}
                onSelect={openPath}
                selectedPath={selectedPath}
              />
            </div>
          )
        ) : (
          <div className={cn("min-h-0 flex-1 px-2 pb-1.75", GROUP_BODY)}>
            <LibraryTreeView
              folder={tree}
              onAttachNotes={attachNotesToChat}
                onCreateNote={() => setCreateKind("note")}
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
