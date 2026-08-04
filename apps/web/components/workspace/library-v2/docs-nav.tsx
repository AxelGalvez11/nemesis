"use client";

// Left rail of the docs-style Library: Home on top, a persistent search box,
// then the whole vault as a collapsible FOLDER tree, the way Obsidian's own
// docs site lists its sections. Folders are just folders — a course, a
// project, a topic; nothing here assumes which (owner 2026-08-03). The tree
// itself is the classic LibraryTreeView, so drag-to-move, rename,
// multi-select and "Attach to AI chat" all keep working exactly as before;
// only the frame around it is new.
//
// Each folder also shows its SOURCES — the original uploaded files its notes
// were built from — as an indented group under the folder's notes, visibly
// separate (owner: "Notes = organized knowledge, Sources = original uploaded
// material"). Clicking one opens the original in the center. Breadcrumbs in
// the center reveal folders HERE (expand + scroll) instead of navigating —
// folders are never pages.

import { IconChevronLeft, IconDots, IconFileImport, IconFilePlus, IconFolderPlus, IconArrowsSort } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

import { formatSourceSize, librarySourceKindIcon, sourcesInFolder, type LibrarySource } from "@/lib/workspace/library-sources";

import { LibraryTreeView, libraryTreeIndentStyle, type LibraryTreeReveal } from "../library/library-tree-view";
import { LibraryTreeBlankState } from "../library/library-tree-blank-state";
import { LibraryCreateDialog, type LibraryCreateKind } from "../library/library-create-dialog";
import { LIBRARY_IMPORT_ACCEPT, useLibraryImport } from "../library/use-library-import";

interface DocsNavProps {
  /** Path of the open note, or null when no note is open. */
  openNotePath: string | null;
  /** Source files, grouped per folder inside the tree. */
  sources: readonly LibrarySource[];
  /** Id of the source file open in the center, for its row highlight. */
  openSourceId: string | null;
  onOpenSource: (id: string) => void;
  /** Fired when imports/folder ops changed stored files — parent re-loads. */
  onSourcesChanged?: () => void;
  /** Breadcrumb reveal request from the center pane. */
  revealFolder?: LibraryTreeReveal | null;
  onOpenNote: (path: string) => void;
  /** Close the drawer after navigating (narrow viewports only). */
  onNavigate?: () => void;
  showBack?: boolean;
}

export function DocsNav({ openNotePath, sources, openSourceId, onOpenSource, onSourcesChanged, revealFolder, onOpenNote, onNavigate, showBack = false }: DocsNavProps) {
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

  // A reveal can't land inside a search-pruned tree — clear the filter first.
  useEffect(() => {
    if (revealFolder) setQuery("");
  }, [revealFolder]);

  const open = (path: string) => {
    onOpenNote(path);
    onNavigate?.();
  };

  const { importError, importFiles, importing } = useLibraryImport({ createNote, folders, notes, onImported: open, onSourcesChanged, saveNote, uid });

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
    // A rounded floating panel, not a flush rail (owner 2026-08-04: "make the
    // library sidebar into a rounded box shape"). The wrapper in
    // library-docs-page decides WHERE it sits (docked in flow, or peeking
    // over the page); this aside only knows its own box.
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) shadow-[0_3px_12px_rgba(0,0,0,0.05)]">
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

      {/* No Home button (owner 2026-08-04): Home is a NOTE — it sits in the
          tree like any other note, and bare /library already lands on it. */}
      <div className="px-3 pb-1.5">
        <div>
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
              onDeleteFolder={(path) => void deleteFolder(path).then(() => onSourcesChanged?.())}
              onDeleteNote={(id) => void deleteNote(id)}
              onMoveFolder={(source, target) => void moveFolder(source, target).then(() => onSourcesChanged?.())}
              onMoveNote={(id, target) => void moveNote(id, target)}
              onRenameFolder={(path, title) => void renameFolder(path, title).then(() => onSourcesChanged?.())}
              onRenameNote={(id, title) => void renameNote(id, title)}
              onSelect={open}
              renderFolderExtras={(treeFolder, depth) => {
                const folderSources = sourcesInFolder(sources, treeFolder.path);
                if (folderSources.length === 0) return null;
                return (
                  <SourcesGroup
                    depth={depth}
                    onNavigate={onNavigate}
                    onOpenSource={onOpenSource}
                    openSourceId={openSourceId}
                    sources={folderSources}
                  />
                );
              }}
              revealFolder={revealFolder}
              selectedPath={openNotePath}
            />
          </div>
        )}
      </div>
      <LibraryCreateDialog kind={createKind ?? "note"} onOpenChange={(value) => !value && setCreateKind(null)} open={createKind !== null} />
    </aside>
  );
}

/** A folder's Sources, as their own COLLAPSIBLE node inside the tree (owner:
 *  "sources need to be … under a folder so that sources are collapsable").
 *  Renders like a folder row — chevron, name, count — starting closed so the
 *  tree stays notes-first; it opens itself when the file being viewed lives
 *  inside, so a deep link is never pointing at a hidden row. */
function SourcesGroup({ sources, depth, openSourceId, onOpenSource, onNavigate }: {
  sources: readonly LibrarySource[];
  depth: number;
  openSourceId: string | null;
  onOpenSource: (id: string) => void;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const holdsOpenSource = openSourceId !== null && sources.some((source) => source.id === openSourceId);

  useEffect(() => {
    if (holdsOpenSource) setOpen(true);
  }, [holdsOpenSource]);

  return (
    <div data-testid="tree-sources">
      <div style={libraryTreeIndentStyle(depth)}>
        <button
          aria-expanded={open}
          className="row-hover flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-1 text-left text-xs font-medium text-foreground"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <Codicon className="shrink-0 text-(--ui-text-quaternary)" name={open ? "chevron-down" : "chevron-right"} size="0.75rem" />
          <span className="truncate">Sources</span>
          <span className="ml-auto shrink-0 pr-1 text-[0.65rem] font-normal text-(--ui-text-quaternary)">{sources.length}</span>
        </button>
      </div>
      {open && sources.map((source) => (
        <div key={source.id} style={libraryTreeIndentStyle(depth + 1)}>
          <button
            className={cn(
              "row-hover flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs",
              source.id === openSourceId ? "bg-(--ui-row-active-background) text-foreground" : "text-(--ui-text-secondary) hover:text-foreground",
            )}
            onClick={() => { onOpenSource(source.id); onNavigate?.(); }}
            title={`${source.fileName}${formatSourceSize(source.sizeBytes) ? ` · ${formatSourceSize(source.sizeBytes)}` : ""}`}
            type="button"
          >
            <Codicon className="shrink-0 text-(--ui-text-quaternary)" name={librarySourceKindIcon(source.kind)} size="0.6875rem" />
            <span className="truncate">{source.fileName}</span>
          </button>
        </div>
      ))}
    </div>
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
