"use client";

// Left rail of the docs-style Library: Home on top, a persistent search box,
// then the whole vault as a collapsible FOLDER tree, the way Obsidian's own
// docs site lists its sections. Folders are just folders — a course, a
// project, a topic; nothing here assumes which (owner 2026-08-03). The tree
// itself is the classic LibraryTreeView, so drag-to-move, rename,
// multi-select and "Attach to AI chat" all keep working exactly as before;
// only the frame around it is new.

import { IconChevronLeft, IconDots, IconFileImport, IconFilePlus, IconFolderPlus, IconHome, IconArrowsSort } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/desktop-ui/button";
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
import { SearchField } from "@/components/desktop-ui/search-field";
import { Skeleton } from "@/components/desktop-ui/skeleton";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useAuth } from "@/components/AuthProvider";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { buildLibraryTree, countLibraryNotes, filterLibraryTree, type LibrarySortMode } from "@/lib/workspace/library-tree";
import { seedComposerFiles } from "@/lib/workspace/composer-seed";
import { cn } from "@/lib/utils";
import { GROUP_BODY } from "@/components/workspace/shell/sidebar-primitives";

import { LibraryTreeView } from "../library/library-tree-view";
import { LibraryTreeBlankState } from "../library/library-tree-blank-state";
import { LibraryCreateDialog, type LibraryCreateKind } from "../library/library-create-dialog";
import { LIBRARY_IMPORT_ACCEPT, useLibraryImport } from "../library/use-library-import";

interface DocsNavProps {
  /** Path of the open note, or null on the home page. */
  openNotePath: string | null;
  onOpenNote: (path: string) => void;
  onGoHome: () => void;
  /** Close the drawer after navigating (narrow viewports only). */
  onNavigate?: () => void;
  showBack?: boolean;
}

export function DocsNav({ openNotePath, onOpenNote, onGoHome, onNavigate, showBack = false }: DocsNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { status, notes, folders, error, reload, createNote, saveNote, createFolder, deleteNote, deleteFolder, moveNote, moveFolder, renameNote, renameFolder } = useCloudLibrary();

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<LibrarySortMode>("az");
  const [createKind, setCreateKind] = useState<LibraryCreateKind | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildLibraryTree(notes, folders, sortMode), [folders, notes, sortMode]);
  const visibleTree = useMemo(() => filterLibraryTree(tree, query), [query, tree]);
  const totalCount = useMemo(() => countLibraryNotes(tree), [tree]);
  const loading = status === "idle" || status === "loading";
  const noMatches = query.trim().length > 0 && countLibraryNotes(visibleTree) === 0 && visibleTree.folders.length === 0;

  const open = (path: string) => {
    onOpenNote(path);
    onNavigate?.();
  };

  const { importError, importFiles, importing } = useLibraryImport({ createNote, folders, notes, onImported: open, saveNote, uid });

  const attachNotesToChat = (noteIds: string[]) => {
    const chosen = notes.filter((note) => noteIds.includes(note.id));
    if (chosen.length === 0) return;
    seedComposerFiles(chosen.map((note) => new File([note.content], `${(note.title || "Note").replace(/[\\/:]/g, "-")}.md`, { type: "text/markdown" })));
    router.push(`${navigationRoot}/sessions`);
    onNavigate?.();
  };

  const createBlankNote = async () => {
    const note = await createNote({ title: "Untitled note", folder: "", content: "" });
    open(note.path);
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height)">
      <div className="workspace-page-header px-3 pb-1 pt-2.5">
        {showBack && (
          <Button
            className="-ml-1.5 mb-1.5 py-1 text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
            onClick={() => { router.push(`${navigationRoot}/sessions`); onNavigate?.(); }}
            size="xs"
            type="button"
            variant="ghost"
          >
            <IconChevronLeft /> Back
          </Button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="workspace-page-title">Library</h1>
            {status === "error" && <p className="mt-0.5 text-[0.65rem] font-medium text-(--dt-destructive)">Couldn&rsquo;t load notes</p>}
          </div>
          <div className="flex gap-0.5">
            <input
              accept={LIBRARY_IMPORT_ACCEPT}
              className="hidden"
              multiple
              onChange={(event) => {
                void importFiles(Array.from(event.target.files ?? [])).then(() => {
                  if (importInputRef.current) importInputRef.current.value = "";
                });
              }}
              ref={importInputRef}
              type="file"
            />
            <Button aria-label="New note" onClick={() => void createBlankNote()} size="icon-xs" title="New note" type="button" variant="ghost"><IconFilePlus /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Library tools" size="icon-xs" title="Library tools" type="button" variant="ghost"><IconDots /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><IconArrowsSort /> Sort</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-40" sideOffset={6}>
                    <DropdownMenuRadioGroup onValueChange={(value) => setSortMode(value as LibrarySortMode)} value={sortMode}>
                      <DropdownMenuRadioItem value="manual">My order</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="az">Sort A–Z</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="za">Sort Z–A</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="modified">Date modified</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="added">Date added</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCreateKind("folder")}><IconFolderPlus /> New folder</DropdownMenuItem>
                <DropdownMenuItem disabled={importing} onSelect={() => importInputRef.current?.click()}><IconFileImport /> {importing ? "Importing…" : "Import notes or documents"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {importError && <p className="mx-3 mb-1 text-[0.65rem] text-destructive" role="alert">{importError}</p>}

      <div className="px-3 pb-1.5">
        <button
          className={cn(
            "row-hover flex w-full items-center gap-2 rounded-md px-2 py-1.25 text-left text-xs font-medium",
            openNotePath === null ? "bg-(--ui-row-active-background) text-foreground" : "text-(--ui-text-secondary) hover:text-foreground",
          )}
          onClick={() => { onGoHome(); onNavigate?.(); }}
          type="button"
        >
          <IconHome size={14} stroke={1.7} /> Home
        </button>
        <div className="mt-1.5">
          <SearchField
            aria-label="Search notes"
            containerClassName="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2 opacity-100"
            onChange={setQuery}
            placeholder="Search notes…"
            value={query}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <NavSkeletons />
        ) : status === "error" ? (
          <NavErrorState message={error} onRetry={reload} />
        ) : totalCount === 0 ? (
          <LibraryTreeBlankState onCreate={() => setCreateKind("note")} />
        ) : noMatches ? (
          <div className="wrap-anywhere grid min-h-24 flex-1 place-items-center px-4 text-center text-xs text-(--ui-text-tertiary)">{`No notes match “${query.trim()}”.`}</div>
        ) : (
          <div className={cn("min-h-0 flex-1 px-2 pb-1.75", GROUP_BODY)}>
            <LibraryTreeView
              folder={visibleTree}
              onAttachNotes={attachNotesToChat}
              onCreateFolder={(path) => void createFolder(path)}
              onDeleteFolder={(path) => void deleteFolder(path)}
              onDeleteNote={(id) => void deleteNote(id)}
              onMoveFolder={(source, target) => void moveFolder(source, target)}
              onMoveNote={(id, target) => void moveNote(id, target)}
              onRenameFolder={(path, title) => void renameFolder(path, title)}
              onRenameNote={(id, title) => void renameNote(id, title)}
              onSelect={open}
              selectedPath={openNotePath}
            />
          </div>
        )}
      </div>
      <LibraryCreateDialog kind={createKind ?? "note"} onOpenChange={(value) => !value && setCreateKind(null)} open={createKind !== null} />
    </aside>
  );
}

function NavSkeletons() {
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

function NavErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
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
