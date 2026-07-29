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
import { buildLibraryTree, countLibraryNotes, type LibrarySortMode } from "@/lib/workspace/library-tree";
import { extractFile, isExtractable, isImage } from "@/lib/workspace/chat-attachments";
import { composeImportedNote, findRelatedTitles, importedTitleFrom } from "@/lib/workspace/library-import";
import { cn } from "@/lib/utils";
import { GROUP_BODY, SCROLL_Y, SidebarRowStack } from "@/components/workspace/shell/sidebar-primitives";

import { seedComposerFiles } from "@/lib/workspace/composer-seed";

import { LibraryNoteRow, LibraryTreeView } from "./library-tree-view";
import { LibraryTreeBlankState } from "./library-tree-blank-state";
import { LibraryCreateDialog, type LibraryCreateKind } from "./library-create-dialog";

export function LibrarySidebar({ onNavigate, showBack = true }: { onNavigate?: () => void; showBack?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<LibrarySortMode>("az");
  const [createKind, setCreateKind] = useState<LibraryCreateKind | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { status, notes, folders, error, selectedPath, select, reload, createNote, createFolder, deleteNote, deleteFolder, moveNote, moveFolder, renameNote, renameFolder } = useCloudLibrary();

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
    router.replace(`${navigationRoot}/library?note=${encodeURIComponent(note.path)}`);
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
    router.replace(`${navigationRoot}/library?note=${encodeURIComponent(path)}`);
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

  // Import handles two kinds of file. Markdown/text is read in the browser and saved
  // verbatim, exactly as before. PDF/Word/PowerPoint is sent to the server extractor
  // (/api/notebooks/extract/file) for its text, filed under an "Imported" folder, and
  // auto-linked into the knowledge graph via a `## Related` section pointing at any
  // existing notes it mentions. Per-file try/catch so one unreadable file (too large,
  // signed out) does not abandon the rest of the batch.
  const importNotes = async (files: File[]) => {
    if (files.length === 0) return;
    setImportError(null);
    setImporting(true);
    const failures: string[] = [];
    let lastPath: string | null = null;
    for (const file of files) {
      try {
        if (isExtractable(file)) {
          const { text, title } = await extractFile(file, uid);
          const note = await createNote({
            // A camera filename ("IMG_4821.HEIC") makes a useless note title, so for a picture the
            // server's title — read out of the picture itself — wins. Documents keep the filename,
            // which is what a student named them and expects to see.
            title: isImage(file) ? (title ?? importedTitleFrom(file.name)) : importedTitleFrom(file.name),
            folder: "Imported",
            content: composeImportedNote(text, findRelatedTitles(text, notes)),
          });
          lastPath = note.path;
        } else {
          const title = file.name.replace(/\.(?:md|markdown|txt)$/i, "").trim() || "Untitled note";
          const note = await createNote({ title, folder: "", content: await file.text() });
          lastPath = note.path;
        }
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : "couldn't import"}`);
      }
    }
    setImporting(false);
    if (lastPath) openPath(lastPath);
    if (failures.length) setImportError(failures.join(" · "));
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
              accept=".md,.markdown,.txt,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.heic,.heif,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/webp,image/heic,image/heif"
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
                  note={{ kind: "note", id: note.id, path: note.path, title: note.title, updatedAt: note.updatedAt, createdAt: note.createdAt, addedOrder: 0, position: note.position ?? null }}
                  onSelect={openPath}
                />
              ))}
            </SidebarRowStack>
          )
        ) : (
          <div className={cn("min-h-0 flex-1 px-2 pb-1.75", GROUP_BODY)}>
            <LibraryTreeView
              folder={tree}
              onAttachNotes={attachNotesToChat}
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
