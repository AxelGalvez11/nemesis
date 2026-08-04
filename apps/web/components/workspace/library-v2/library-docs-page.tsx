"use client";

// The docs-style Library (v2) — owner 2026-08-03: "a personal study wiki…
// left side all courses, folders, and notes; middle the note they are
// reading; right side a table of contents for that note."
//
// THE URL IS THE TRUTH about what is open:
//   /library                 → the landing NOTE (see lib/workspace/library-home)
//   /library?note=<path>     → that note, as a docs article
//   /library?source=<id>     → one source FILE (the original upload)
// THERE IS NO HOME DASHBOARD (owner 2026-08-04: "this isnt a NOTE, the 'home'
// is supposed to be a NOTE" — obsidian.md/help lands on a note titled Home).
// Bare /library shows a note named Home if the student has one, else their
// most recently edited note; a brand-new empty account gets a seeded Home
// note it fully owns. Folders are deliberately NOT pages either (owner: "the
// entirety should be notes only"): clicking a folder anywhere reveals it in
// the left tree instead of navigating. A rename is recovered by note id, and
// a genuinely missing target says so instead of silently showing something
// else. Navigation uses router.push, so the browser's own Back walks the trail.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { useMediaQuery } from "@/components/workspace/shell/use-media-query";
import { useResponsiveSidebar } from "@/components/workspace/shell/use-responsive-sidebar";
import { seedChatIntent } from "@/lib/workspace/composer-seed";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { LIBRARY_HOME_SEED, pickLibraryLandingNote } from "@/lib/workspace/library-home";
import { findLibraryNote, libraryRouteBase } from "@/lib/workspace/library-links";
import { loadNoteIdsForSource } from "@/lib/workspace/library-provenance";
import { loadLibrarySources, type LibrarySource } from "@/lib/workspace/library-sources";
import { extractNoteOutline } from "@/lib/workspace/note-outline";
import { cn } from "@/lib/utils";

import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";

import type { LibraryTreeReveal } from "../library/library-tree-view";
import { DocsNav } from "./docs-nav";
import { DocsSource } from "./docs-source";
import { DocsToc } from "./docs-toc";
import { NoteArticle, type NoteStudyAction } from "./note-article";

export function LibraryDocsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const libraryBase = libraryRouteBase(pathname);
  const { libraryFullScreen } = useTheme();
  const narrowViewport = useMediaQuery("(max-width: 768px)");
  const { open: navOpen, setOpen: setNavOpen } = useResponsiveSidebar(narrowViewport, "nemesis.web.library-sidebar");
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("note");
  const requestedSource = searchParams.get("source");
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { status, notes, select, createNote, saveNote, deleteNote } = useCloudLibrary();

  const [articleContent, setArticleContent] = useState("");
  const [librarySources, setLibrarySources] = useState<LibrarySource[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [sourcesVersion, setSourcesVersion] = useState(0);
  const [sourceNoteIds, setSourceNoteIds] = useState<string[]>([]);
  const [reveal, setReveal] = useState<LibraryTreeReveal | null>(null);
  const articleRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastOpenIdRef = useRef<string | null>(null);
  const seededHomeRef = useRef(false);

  const loading = status === "idle" || status === "loading";
  // Bare /library = the landing NOTE, never a dashboard: a note named Home if
  // one exists, else the most recently edited note. The URL stays bare — it
  // means "the landing note", the way obsidian.md/help means Home.
  const landingNote = useMemo(() => pickLibraryLandingNote(notes), [notes]);
  const note = requestedPath
    ? (notes.find((item) => item.path === requestedPath) ?? null)
    : requestedSource !== null
      ? null
      : landingNote;

  // A brand-new EMPTY account gets a seeded Home note — created once, owned by
  // the student, and never resurrected: accounts with any notes at all land on
  // a note they already have instead.
  useEffect(() => {
    if (status !== "loaded" || notes.length > 0 || !uid || seededHomeRef.current) return;
    seededHomeRef.current = true;
    createNote({ title: "Home", folder: "", content: LIBRARY_HOME_SEED }).catch(() => {
      seededHomeRef.current = false;
    });
  }, [createNote, notes.length, status, uid]);

  const openPath = useCallback(
    (path: string) => {
      select(path);
      router.push(`${libraryBase}?note=${encodeURIComponent(path)}`);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [libraryBase, router, select],
  );

  const openSource = useCallback(
    (id: string) => {
      router.push(`${libraryBase}?source=${encodeURIComponent(id)}`);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [libraryBase, router],
  );

  // Folders are never pages: a folder click (breadcrumb, home card) expands
  // and scrolls the left tree to it — Obsidian's behavior. The nonce lets the
  // same crumb be clicked twice in a row.
  const revealFolder = useCallback(
    (path: string) => {
      setNavOpen(true);
      setReveal((current) => ({ nonce: (current?.nonce ?? 0) + 1, path }));
    },
    [setNavOpen],
  );

  const goHome = useCallback(() => {
    router.push(libraryBase);
  }, [libraryBase, router]);

  // The "Library" crumb is the sidebar's control (owner 2026-08-04): hovering
  // PEEKS the tree as a floating panel, clicking LOCKS it open (or unlocks
  // it). Peek is transient and wide-viewport only — touch has no hover, so
  // narrow keeps its drawer. The grace timer lets the pointer cross the gap
  // between the crumb and the panel without the panel vanishing mid-journey.
  const [peek, setPeek] = useState(false);
  const peekTimerRef = useRef<number | null>(null);
  const clearPeekTimer = useCallback(() => {
    if (peekTimerRef.current !== null) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearPeekTimer, [clearPeekTimer]);
  const handleLibraryHover = useCallback(
    (hovering: boolean) => {
      if (narrowViewport || navOpen) return;
      clearPeekTimer();
      if (hovering) {
        setPeek(true);
        return;
      }
      peekTimerRef.current = window.setTimeout(() => {
        peekTimerRef.current = null;
        setPeek(false);
      }, 220);
    },
    [clearPeekTimer, narrowViewport, navOpen],
  );
  const handleLibraryClick = useCallback(() => {
    clearPeekTimer();
    setPeek(false);
    setNavOpen(narrowViewport ? true : !navOpen);
  }, [clearPeekTimer, narrowViewport, navOpen, setNavOpen]);

  // Teach me / Flashcards / Test on the open note (owner 2026-08-03, the
  // learning loop): the note rides along as the same virtual .md attachment
  // "Attach to AI chat" builds, and the request is sent the moment Sessions
  // mounts — the student clicked a verb, not "open a composer". Prompts are
  // phrased to trip the matching chat skill (teach → guided teaching with
  // understanding checks; flashcards/tests → the Auto-defaults craft skills).
  const startStudyAction = useCallback(
    (action: NoteStudyAction) => {
      if (!note) return;
      const attachment = new File([note.content], `${(note.title || "Note").replace(/[\\/:]/g, "-")}.md`, { type: "text/markdown" });
      const prompt =
        action === "teach"
          ? `Teach me "${note.title}" from my attached notes — step by step, checking my understanding as we go.`
          : action === "flashcards"
            ? `Make flashcards from "${note.title}".`
            : `Make a practice test from "${note.title}".`;
      seedChatIntent({ files: [attachment], prompt });
      const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
      router.push(`${navigationRoot}/sessions`);
    },
    [note, pathname, router],
  );

  const bumpSources = useCallback(() => setSourcesVersion((version) => version + 1), []);

  // Source files: loaded per account (fixtures when signed out / previewing)
  // and re-loaded whenever an import stores an original or a folder operation
  // re-files them (sourcesVersion bumps).
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
  }, [sourcesVersion, uid]);

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

  const outline = useMemo(() => (note ? extractNoteOutline(articleContent) : []), [articleContent, note]);
  const openableSourceIds = useMemo(() => new Set(librarySources.map((source) => source.id)), [librarySources]);

  const openedSource =
    requestedSource !== null && !note ? (librarySources.find((source) => source.id === requestedSource) ?? null) : null;

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

  const missingRequested = Boolean(requestedPath) && !note && status === "loaded";

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-(--ui-bg-chrome)">
      {(navOpen || (peek && !narrowViewport)) && (
        <>
          {navOpen && narrowViewport && <button aria-label="Close Library sidebar" className="absolute inset-0 z-30 bg-black/25" onClick={() => setNavOpen(false)} type="button" />}
          {/* Locked = docked in flow with a gutter around the rounded panel.
              Unlocked-but-hovered = the same panel floating OVER the page
              (Notion-style peek), kept alive while the pointer stays on it. */}
          <div
            className={cn(
              navOpen && !narrowViewport && "flex shrink-0 py-2 pl-2 pt-[calc(var(--titlebar-height)+0.5rem)]",
              navOpen && narrowViewport && "absolute inset-y-0 left-0 z-40 p-2 pt-[calc(var(--titlebar-height)+0.5rem)]",
              // Peek starts BELOW the crumb row so the "Library" trigger stays
              // visible and clickable while the panel is out — clicking it is
              // how the peek becomes a lock.
              !navOpen && "library-peek-panel absolute bottom-2 left-2 top-[calc(var(--titlebar-height)+3.25rem)] z-40",
            )}
            data-testid={navOpen ? "library-sidebar-locked" : "library-sidebar-peek"}
            onMouseEnter={!navOpen ? () => handleLibraryHover(true) : undefined}
            onMouseLeave={!navOpen ? () => handleLibraryHover(false) : undefined}
          >
            <DocsNav
              onNavigate={() => narrowViewport && setNavOpen(false)}
              onOpenNote={openPath}
              onOpenSource={openSource}
              onSourcesChanged={bumpSources}
              openNotePath={note?.path ?? null}
              openSourceId={openedSource?.id ?? null}
              revealFolder={reveal}
              showBack={libraryFullScreen && !narrowViewport}
              sources={librarySources}
            />
          </div>
        </>
      )}

      {/* Wide viewports open the sidebar from the "Library" crumb; this
          floating opener stays for narrow viewports (no hover there) and for
          pages with no crumb row to hover (missing note, empty library). */}
      {!navOpen && (narrowViewport || (!note && !openedSource)) && (
        <Button aria-label="Expand Library sidebar" className="workspace-inline-sidebar-toggle absolute left-2 top-2 z-20" onClick={() => setNavOpen(true)} size="icon-xs" variant="ghost">
          <IconLayoutSidebarLeftExpand size={14} stroke={1.7} />
        </Button>
      )}

      <main className="flex h-full min-w-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" ref={scrollRef}>
          {loading ? (
            <ArticleSkeleton />
          ) : note ? (
            <NoteArticle
              articleRef={articleRef}
              note={note}
              notes={notes}
              onContentChange={setArticleContent}
              onDelete={removeNote}
              onLibraryClick={handleLibraryClick}
              onLibraryHover={handleLibraryHover}
              onOpenPath={openPath}
              onOpenSource={openSource}
              onOpenWikiTarget={(target, fromPath) => void openWikiTarget(target, fromPath)}
              onRevealFolder={revealFolder}
              onStudyAction={startStudyAction}
              openableSourceIds={openableSourceIds}
              saveNote={saveNote}
            />
          ) : missingRequested ? (
            <MissingPanel description="It may have been renamed or deleted on another device." onGoHome={goHome} title="That note isn't here" />
          ) : requestedSource !== null ? (
            !sourcesLoaded ? (
              <ArticleSkeleton />
            ) : openedSource ? (
              <DocsSource
                notesFromSource={sourceNotes}
                onLibraryClick={handleLibraryClick}
                onLibraryHover={handleLibraryHover}
                onOpenPath={openPath}
                onRevealFolder={revealFolder}
                source={openedSource}
              />
            ) : (
              <MissingPanel description="It may have been removed, or its link is out of date." onGoHome={goHome} title="That file isn't here" />
            )
          ) : (
            // Zero notes: the seed effect above is creating Home right now for
            // signed-in accounts, so this is a blink — or, if that write
            // failed, an honest empty state rather than a dashboard.
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
              <EmptyState description="Make your first note, or import a document from the sidebar." title="Your Library is empty" />
              <Button onClick={() => void createBlankNote()} size="sm" variant="secondary">New note</Button>
            </div>
          )}
        </div>
        {note && <DocsToc articleRef={articleRef} outline={outline} scrollRef={scrollRef} />}
      </main>
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
