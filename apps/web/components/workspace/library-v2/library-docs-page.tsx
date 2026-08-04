"use client";

// The docs-style Library (v2) — owner 2026-08-03: "a personal study wiki…
// left side all courses, folders, and notes; middle the note they are
// reading; right side a table of contents for that note."
//
// THE URL IS THE TRUTH about what is open:
//   /library                 → the home page
//   /library?note=<path>     → that note, as a docs article
//   /library?folder=<path>   → that folder's page: its notes and its Sources
//   /library?source=<id>     → one source FILE (the original upload)
// The classic screen rendered whatever the store had selected, which on a
// cold deep link briefly meant "the first note that loaded"; here nothing
// renders until the param resolves, a rename is recovered by note id, and a
// genuinely missing target says so instead of silently showing something
// else. Navigation uses router.push, so the browser's own Back walks the
// trail — no custom tab strip or history buttons.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { useMediaQuery } from "@/components/workspace/shell/use-media-query";
import { useResponsiveSidebar } from "@/components/workspace/shell/use-responsive-sidebar";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { findLibraryNote, libraryRouteBase } from "@/lib/workspace/library-links";
import { loadNoteIdsForSource } from "@/lib/workspace/library-provenance";
import { loadLibrarySources, sourcesInFolder, type LibrarySource } from "@/lib/workspace/library-sources";
import { buildLibraryTree, findLibraryFolder } from "@/lib/workspace/library-tree";
import { extractNoteOutline } from "@/lib/workspace/note-outline";
import { cn } from "@/lib/utils";

import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";

import { DocsFolder } from "./docs-folder";
import { DocsHome } from "./docs-home";
import { DocsNav } from "./docs-nav";
import { DocsSource } from "./docs-source";
import { DocsToc } from "./docs-toc";
import { NoteArticle } from "./note-article";
import { LIBRARY_IMPORT_ACCEPT, useLibraryImport } from "../library/use-library-import";

export function LibraryDocsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const libraryBase = libraryRouteBase(pathname);
  const { libraryFullScreen } = useTheme();
  const narrowViewport = useMediaQuery("(max-width: 768px)");
  const { open: navOpen, setOpen: setNavOpen } = useResponsiveSidebar(narrowViewport, "nemesis.web.library-sidebar");
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("note");
  const requestedFolder = searchParams.get("folder");
  const requestedSource = searchParams.get("source");
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { status, notes, folders, select, createNote, saveNote, deleteNote } = useCloudLibrary();

  const [articleContent, setArticleContent] = useState("");
  const [librarySources, setLibrarySources] = useState<LibrarySource[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [sourceNoteIds, setSourceNoteIds] = useState<string[]>([]);
  const articleRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastOpenIdRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loading = status === "idle" || status === "loading";
  const note = requestedPath ? (notes.find((item) => item.path === requestedPath) ?? null) : null;

  const openPath = useCallback(
    (path: string) => {
      select(path);
      router.push(`${libraryBase}?note=${encodeURIComponent(path)}`);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [libraryBase, router, select],
  );

  const openFolder = useCallback(
    (path: string) => {
      router.push(`${libraryBase}?folder=${encodeURIComponent(path)}`);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [libraryBase, router],
  );

  const openSource = useCallback(
    (id: string) => {
      router.push(`${libraryBase}?source=${encodeURIComponent(id)}`);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [libraryBase, router],
  );

  const goHome = useCallback(() => {
    router.push(libraryBase);
  }, [libraryBase, router]);

  const { importFiles, importing } = useLibraryImport({ createNote, folders, notes, onImported: openPath, saveNote, uid });

  // Source files: one load per account (fixtures when signed out / previewing).
  // The table doesn't exist until the file-storage migrations land, so a real
  // account quietly gets [] — pills stay inert and folder pages show no
  // Sources section, which is the truthful state.
  useEffect(() => {
    let cancelled = false;
    setSourcesLoaded(false);
    void loadLibrarySources(uid).then((loaded) => {
      if (cancelled) return;
      setLibrarySources(loaded);
      setSourcesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Keep the store's selection in step with the URL — the Graph pre-warms it
  // the other way around, and live-refresh repair logic keys off it.
  useEffect(() => {
    if (note) {
      lastOpenIdRef.current = note.id;
      select(note.path);
    }
  }, [note, select]);

  // A rename (from the tree, or another device) changes the note's PATH while
  // the URL still holds the old one. The id survives renames, so recover by id
  // and quietly fix the URL rather than declaring the note missing.
  useEffect(() => {
    if (!requestedPath || note || status !== "loaded") return;
    const renamed = lastOpenIdRef.current ? notes.find((item) => item.id === lastOpenIdRef.current) : null;
    if (renamed) router.replace(`${libraryBase}?note=${encodeURIComponent(renamed.path)}`);
  }, [libraryBase, note, notes, requestedPath, router, status]);

  const tree = useMemo(() => buildLibraryTree(notes, folders, "az"), [folders, notes]);
  const outline = useMemo(() => (note ? extractNoteOutline(articleContent) : []), [articleContent, note]);
  const openableSourceIds = useMemo(() => new Set(librarySources.map((source) => source.id)), [librarySources]);

  const openedFolder = requestedFolder !== null && !note ? findLibraryFolder(tree, requestedFolder) : null;
  const openedSource =
    requestedSource !== null && !note && !requestedFolder
      ? (librarySources.find((source) => source.id === requestedSource) ?? null)
      : null;

  // "Notes from this file" on a source page — provenance walked in reverse.
  useEffect(() => {
    if (!openedSource) {
      setSourceNoteIds([]);
      return;
    }
    let cancelled = false;
    void loadNoteIdsForSource(openedSource.id, { preview: !uid }).then((ids) => {
      if (!cancelled) setSourceNoteIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [openedSource, uid]);

  const sourceNotes = useMemo(() => notes.filter((item) => sourceNoteIds.includes(item.id)), [notes, sourceNoteIds]);

  async function openWikiTarget(target: string, fromPath: string) {
    const existing = findLibraryNote(notes, target);
    if (existing) {
      openPath(existing.path);
      return;
    }
    const parentFolder = fromPath.split("/").slice(0, -1).join("/");
    const targetTitle = target.split("/").pop()?.trim() || target;
    const created = await createNote({ title: targetTitle, folder: parentFolder, content: "" });
    openPath(created.path);
  }

  async function createBlankNote() {
    const created = await createNote({ title: "Untitled note", folder: "", content: "" });
    openPath(created.path);
  }

  async function removeNote(noteId: string) {
    await deleteNote(noteId);
    lastOpenIdRef.current = null;
    router.replace(libraryBase);
  }

  const deepLinkPending = Boolean(requestedPath || requestedFolder || requestedSource);
  const missingRequested = Boolean(requestedPath) && !note && status === "loaded";

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-(--ui-bg-chrome)">
      {navOpen && (
        <>
          {narrowViewport && <button aria-label="Close Library sidebar" className="absolute inset-0 z-30 bg-black/25" onClick={() => setNavOpen(false)} type="button" />}
          <div className={cn(narrowViewport ? "absolute inset-y-0 left-0 z-40 shadow-2xl" : "contents")}>
            <DocsNav
              homeActive={!note && !requestedFolder && !requestedSource}
              onGoHome={goHome}
              onNavigate={() => narrowViewport && setNavOpen(false)}
              onOpenNote={openPath}
              openNotePath={note?.path ?? null}
              showBack={libraryFullScreen && !narrowViewport}
            />
          </div>
        </>
      )}

      {!navOpen && (
        <Button aria-label="Expand Library sidebar" className="workspace-inline-sidebar-toggle absolute left-2 top-2 z-20" onClick={() => setNavOpen(true)} size="icon-xs" variant="ghost">
          <IconLayoutSidebarLeftExpand size={14} stroke={1.7} />
        </Button>
      )}

      <main className="flex h-full min-w-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" ref={scrollRef}>
          {loading && deepLinkPending ? (
            <ArticleSkeleton />
          ) : note ? (
            <NoteArticle
              articleRef={articleRef}
              note={note}
              notes={notes}
              onContentChange={setArticleContent}
              onDelete={removeNote}
              onOpenFolder={openFolder}
              onOpenHome={goHome}
              onOpenPath={openPath}
              onOpenSource={openSource}
              onOpenWikiTarget={(target, fromPath) => void openWikiTarget(target, fromPath)}
              openableSourceIds={openableSourceIds}
              saveNote={saveNote}
            />
          ) : missingRequested ? (
            <MissingPanel description="It may have been renamed or deleted on another device." onGoHome={goHome} title="That note isn't here" />
          ) : requestedFolder !== null ? (
            openedFolder ? (
              <DocsFolder
                folder={openedFolder}
                onOpenFolder={openFolder}
                onOpenHome={goHome}
                onOpenPath={openPath}
                onOpenSource={openSource}
                sources={sourcesInFolder(librarySources, openedFolder.path)}
              />
            ) : (
              <MissingPanel description="It may have been renamed or emptied on another device." onGoHome={goHome} title="That folder isn't here" />
            )
          ) : requestedSource !== null ? (
            !sourcesLoaded ? (
              <ArticleSkeleton />
            ) : openedSource ? (
              <DocsSource
                notesFromSource={sourceNotes}
                onOpenFolder={openFolder}
                onOpenHome={goHome}
                onOpenPath={openPath}
                source={openedSource}
              />
            ) : (
              <MissingPanel description="It may have been removed, or its link is out of date." onGoHome={goHome} title="That file isn't here" />
            )
          ) : (
            <DocsHome
              notes={notes}
              onCreateNote={() => void createBlankNote()}
              onImport={() => importInputRef.current?.click()}
              onOpenFolder={openFolder}
              onOpenPath={openPath}
              tree={tree}
            />
          )}
        </div>
        {note && <DocsToc articleRef={articleRef} outline={outline} scrollRef={scrollRef} />}
      </main>

      <input
        accept={LIBRARY_IMPORT_ACCEPT}
        className="hidden"
        disabled={importing}
        multiple
        onChange={(event) => {
          void importFiles(Array.from(event.target.files ?? [])).then(() => {
            if (importInputRef.current) importInputRef.current.value = "";
          });
        }}
        ref={importInputRef}
        type="file"
      />
    </div>
  );
}

function MissingPanel({ title, description, onGoHome }: { title: string; description: string; onGoHome: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
      <EmptyState description={description} title={title} />
      <Button onClick={onGoHome} size="sm" variant="secondary">Go to Library home</Button>
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-3xl px-8 pt-10 max-sm:px-4">
      <div className="h-3 w-40 animate-pulse rounded bg-(--ui-bg-quaternary)" />
      <div className="mt-4 h-7 w-72 animate-pulse rounded bg-(--ui-bg-quaternary)" />
      <div className="mt-6 grid gap-2.5">
        {["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"].map((width, index) => (
          <div className={cn("h-3 animate-pulse rounded bg-(--ui-bg-quaternary)", width)} key={index} />
        ))}
      </div>
    </div>
  );
}
