"use client";

import {
  IconArrowLeft,
  IconArrowNarrowLeft,
  IconArrowRight,
  IconDots,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconList,
  IconPlus,
  IconTags,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { AssistantMarkdown, slugifyHeading } from "@/lib/workspace/chat-markdown";
import { isEditableNote } from "@/lib/workspace/note-markdown";

import { NoteEditor } from "./note-editor";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { backlinksFor, extractLibraryLinks, findLibraryNote, libraryRouteBase } from "@/lib/workspace/library-links";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/components/workspace/shell/use-media-query";
import { useResponsiveSidebar } from "@/components/workspace/shell/use-responsive-sidebar";

// Owner 2026-08-01: a note is READ here, never authored. The markdown editor
// (library-live-editor + its decorations) is no longer mounted by this screen.
//
// Why the whole editor and not another round of hiding: the syntax characters
// were always still IN the note, only painted at zero width, so deleting into
// a construct orphaned its partner marker and the leftover became visible —
// `**bold**` minus its word parses as `****`, a horizontal rule. And every
// construct the decorator was never taught (images, checkboxes, autolinks,
// escapes) rendered raw with no deletion at all. Rendering through
// AssistantMarkdown — the same real renderer the chat uses — ends both:
// there are no hidden characters to leak, because the markdown is converted
// to formatted output rather than disguised.
//
// Notes are written and corrected by the chat (create/replace/append/rename
// in lib/workspace/agent-tools.ts). The title below stays typeable.
type RightPanel = "links" | "backlinks" | "contents" | "tags";

// "Second brain" used to be the first tab here (owner 2026-07-31: removed).
// The name belongs to the CHAT, which is the thing that gets better the more a
// student uses it; a note-connection suggester in a sidebar was borrowing it.
// The brain itself is untouched — lib/workspace/brain-api.ts, the
// /api/v1/brain route and the chat's retrieval in chat-api.ts all still run.
// Only this surface is gone.
const RIGHT_PANELS = [
  { id: "links", label: "Links on page", icon: IconLink },
  { id: "backlinks", label: "Backlinks", icon: IconArrowNarrowLeft },
  { id: "contents", label: "Table of contents", icon: IconList },
  { id: "tags", label: "Tags", icon: IconTags },
] as const;

interface NoteDraft {
  id: string;
  title: string;
  content: string;
  dirty: boolean;
}

function headingsFromMarkdown(content: string) {
  return Array.from(content.matchAll(/^(#{1,4})\s+(.+?)\s*#*$/gm), (match) => ({
    depth: match[1]?.length ?? 1,
    label: match[2]?.trim() ?? "",
  })).filter((heading) => heading.label);
}

function tagsFromMarkdown(content: string) {
  const tags = new Set<string>();
  for (const match of content.matchAll(/^\s*tags:\s*\[([^\]]*)\]/gim)) {
    const inline = match[1] ?? "";
    inline.split(",").map((tag) => tag.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean).forEach((tag) => tags.add(tag));
  }
  for (const match of content.matchAll(/(?:^|\s)#([\p{L}\d_-]+)/gu)) if (match[1]) tags.add(match[1]);
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

interface LibraryMainProps {
  leftSidebarOpen: boolean;
  onCollapseLeft: () => void;
  onExpandLeft: () => void;
}

export function LibraryMain({ leftSidebarOpen, onCollapseLeft, onExpandLeft }: LibraryMainProps) {
  const router = useRouter();
  const pathname = usePathname();
  const libraryBase = libraryRouteBase(pathname);
  const { notes, selectedPath, select, createNote, saveNote, deleteNote } = useCloudLibrary();
  const note = selectedPath ? (notes.find((item) => item.path === selectedPath) ?? null) : null;
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [rightPanel, setRightPanel] = useState<RightPanel>("links");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const narrowViewport = useMediaQuery("(max-width: 768px)");
  const { open: linksSidebarOpen, setOpen: setLinksSidebarOpen } = useResponsiveSidebar(narrowViewport, "nemesis.web.library-right-panel");
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<{ entries: string[]; index: number }>({ entries: [], index: -1 });
  const draftRef = useRef<NoteDraft | null>(null);
  const replaceTabPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedPath) return;
    if (replaceTabPathRef.current === selectedPath) replaceTabPathRef.current = null;
    else setOpenPaths((paths) => (paths.includes(selectedPath) ? paths : [...paths, selectedPath]));
    setNavigation((current) => {
      if (current.entries[current.index] === selectedPath) return current;
      const entries = [...current.entries.slice(0, current.index + 1), selectedPath].slice(-50);
      return { entries, index: entries.length - 1 };
    });
  }, [selectedPath]);

  useEffect(() => {
    const available = new Set(notes.map((item) => item.path));
    setOpenPaths((paths) => paths.filter((path) => available.has(path)));
  }, [notes]);

  useEffect(() => {
    const previous = draftRef.current;
    if (previous?.dirty && previous.id !== note?.id) {
      // This switch-away save can now fail without any user action: a live
      // event may have removed the note (deleted on the phone or another tab)
      // while it was open here with unsaved edits. Say so instead of dropping
      // the edit silently with an uncaught error.
      saveNote({ id: previous.id, title: previous.title, content: previous.content }).catch(() => {
        setMessage(`"${previous.title}" couldn't keep its last unsaved edit — it may have been deleted on another device.`);
      });
    }
    if (previous?.id === note?.id) {
      // Live refresh changed the OPEN note (a phone edit or another tab).
      // Adopt it only while nothing is unsaved here — local typing always
      // wins, and the next autosave settles it (last write wins, same rule
      // the phone editor documents).
      if (note && previous && !previous.dirty && (previous.title !== note.title || previous.content !== note.content)) {
        setTitle(note.title);
        setContent(note.content);
        draftRef.current = { id: note.id, title: note.title, content: note.content, dirty: false };
      }
      return;
    }
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setMessage(null);
    draftRef.current = note ? { id: note.id, title: note.title, content: note.content, dirty: false } : null;
  }, [note, saveNote]);

  useEffect(() => {
    const draft = draftRef.current;
    if (!draft?.dirty || draft.id !== note?.id) return;
    const timer = window.setTimeout(() => {
      const pending = draftRef.current;
      if (!pending?.dirty || pending.id !== note.id) return;
      const snapshot = { ...pending };
      setSaving(true);
      setMessage(null);
      void saveNote({ id: snapshot.id, title: snapshot.title, content: snapshot.content })
        .then(() => {
          const current = draftRef.current;
          if (current?.id === snapshot.id && current.title === snapshot.title && current.content === snapshot.content) current.dirty = false;
        })
        .catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : "Couldn't save this note."))
        .finally(() => setSaving(false));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [content, note?.id, saveNote, title]);

  const outgoing = useMemo(() => extractLibraryLinks(content), [content]);
  const backlinks = useMemo(() => (note ? backlinksFor(notes, note) : []), [note, notes]);
  const headings = useMemo(() => headingsFromMarkdown(content), [content]);
  const tags = useMemo(() => tagsFromMarkdown(content), [content]);

  function updateDraft(next: { title?: string; content?: string }) {
    if (!note) return;
    const current = draftRef.current ?? { id: note.id, title, content, dirty: false };
    const updated = { ...current, ...next };
    updated.dirty = updated.title !== note.title || updated.content !== note.content;
    draftRef.current = updated;
    if (next.title !== undefined) setTitle(next.title);
    if (next.content !== undefined) setContent(next.content);
  }

  function openPath(path: string) {
    select(path);
    router.replace(`${libraryBase}?note=${encodeURIComponent(path)}`);
  }

  function openPathInCurrentTab(path: string) {
    replaceTabPathRef.current = path;
    setOpenPaths((paths) => {
      const currentIndex = selectedPath ? paths.indexOf(selectedPath) : -1;
      const next = [...paths];
      if (currentIndex >= 0) next[currentIndex] = path;
      else next.push(path);
      return next.filter((item, index) => next.indexOf(item) === index);
    });
    openPath(path);
  }

  async function openWikiTarget(target: string) {
    const existing = findLibraryNote(notes, target);
    if (existing) {
      openPathInCurrentTab(existing.path);
      return;
    }
    const parentFolder = note?.path.split("/").slice(0, -1).join("/") ?? "";
    const targetTitle = target.split("/").pop()?.trim() || target;
    try {
      const created = await createNote({ title: targetTitle, folder: parentFolder, content: "" });
      openPathInCurrentTab(created.path);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Couldn't create that linked note.");
    }
  }

  async function createBlankNote() {
    setMessage(null);
    try {
      const created = await createNote({ title: "Untitled note", folder: "", content: "" });
      setOpenPaths((paths) => paths.includes(created.path) ? paths : [...paths, created.path]);
      openPath(created.path);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Couldn't create a new note.");
    }
  }

  function travelHistory(delta: number) {
    const index = navigation.index + delta;
    const path = navigation.entries[index];
    if (!path) return;
    setNavigation((current) => ({ ...current, index }));
    select(path);
    router.replace(`${libraryBase}?note=${encodeURIComponent(path)}`);
  }

  function closeTab(path: string) {
    setOpenPaths((paths) => {
      const index = paths.indexOf(path);
      const remaining = paths.filter((item) => item !== path);
      if (path === selectedPath) {
        const next = remaining[Math.min(index, remaining.length - 1)] ?? null;
        select(next);
        if (next) router.replace(`${libraryBase}?note=${encodeURIComponent(next)}`);
        else router.replace(`${libraryBase}`);
      }
      return remaining;
    });
  }

  function moveTabBefore(targetPath: string) {
    if (!draggedTab || draggedTab === targetPath) return;
    setOpenPaths((paths) => {
      const next = paths.filter((path) => path !== draggedTab);
      const targetIndex = next.indexOf(targetPath);
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedTab);
      return next;
    });
  }

  async function removeCurrentNote() {
    if (!note) return;
    if (draftRef.current?.id === note.id) draftRef.current.dirty = false;
    await deleteNote(note.id);
    setConfirmDelete(false);
  }

  if (!note) {
    return (
      <main className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-(--ui-bg-chrome)">
        {!leftSidebarOpen && <Button aria-label="Expand Library sidebar" className="workspace-inline-sidebar-toggle absolute left-2 top-2" onClick={onExpandLeft} size="icon-xs" variant="ghost"><IconLayoutSidebarLeftExpand size={14} stroke={1.7} /></Button>}
        <EmptyState description="Create a note, then connect ideas with [[double brackets]]." title="No note open" />
        <Button onClick={() => void createBlankNote()} size="sm" variant="secondary">New note</Button>
      </main>
    );
  }

  return (
    // A note is a PAGE, not a card (owner 2026-07-22): it reads on
    // --ui-bg-chrome (pure black in dark mode), never --ui-bg-editor, which is
    // the CARD colour (~#151516) and is what --dt-card is built from. Boxes and
    // pills inside the note keep that card colour and stay lifted.
    <main className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-(--ui-bg-chrome)">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="library-tab-strip workspace-page-header flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-text-primary)_5%,var(--ui-bg-chrome))] px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-library-sidebar-open={leftSidebarOpen ? "true" : "false"}
        >
          <Button
            aria-label={leftSidebarOpen ? "Collapse Library sidebar" : "Expand Library sidebar"}
            className="mb-0.5 shrink-0 self-center"
            onClick={leftSidebarOpen ? onCollapseLeft : onExpandLeft}
            size="icon-xs"
            variant="ghost"
          >
            {leftSidebarOpen ? <IconLayoutSidebarLeftCollapse size={14} stroke={1.7} /> : <IconLayoutSidebarLeftExpand size={14} stroke={1.7} />}
          </Button>
          {openPaths.length > 0 && (
            <>
            {openPaths.map((path) => {
              const tabNote = notes.find((item) => item.path === path);
              if (!tabNote) return null;
              const active = path === selectedPath;
              return (
                <div
                  className={cn(
                    "group relative -mb-px flex h-8 min-w-32 max-w-52 items-center gap-1.5 rounded-t-[1rem] border px-3 text-xs before:pointer-events-none before:absolute before:-left-2 before:bottom-0 before:size-2 before:rounded-br-[0.65rem] after:pointer-events-none after:absolute after:-right-2 after:bottom-0 after:size-2 after:rounded-bl-[0.65rem]",
                    active
                      // Tracks the pane below so the active tab still merges
                      // into it — these four must stay the same token as the
                      // <main> above, or the tab floats as a grey box on black.
                      ? "z-10 border-(--ui-stroke-secondary) border-b-(--ui-bg-chrome) bg-(--ui-bg-chrome) text-foreground before:shadow-[3px_3px_0_var(--ui-bg-chrome)] after:shadow-[-3px_3px_0_var(--ui-bg-chrome)]"
                      : "border-transparent bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
                    draggedTab === path && "opacity-55",
                  )}
                  draggable
                  key={path}
                  onDragEnd={() => setDraggedTab(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    moveTabBefore(path);
                  }}
                  onDragStart={(event) => {
                    setDraggedTab(path);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", path);
                  }}
                >
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => openPath(path)} type="button">{tabNote.title}</button>
                  <button aria-label={`Close ${tabNote.title}`} className="rounded p-0.5 opacity-50 hover:bg-(--ui-control-hover-background) hover:opacity-100" onClick={() => closeTab(path)} type="button"><IconX size={11} /></button>
                </div>
              );
            })}
            </>
          )}
          <Button aria-label="New note tab" className="mb-0.5 shrink-0 self-center rounded-full" onClick={() => void createBlankNote()} size="icon-xs" variant="ghost"><IconPlus size={13} /></Button>
          <Button
            aria-label={linksSidebarOpen ? "Collapse Library details" : "Expand Library details"}
            className="mb-0.5 ml-auto shrink-0 self-center"
            onClick={() => setLinksSidebarOpen((open) => !open)}
            size="icon-xs"
            variant="ghost"
          >
            {linksSidebarOpen ? <IconLayoutSidebarRightCollapse /> : <IconLayoutSidebarRightExpand />}
          </Button>
        </div>

        <header className="flex flex-wrap items-center gap-2 border-b border-(--ui-stroke-tertiary) px-5 py-2.5">
          <div className="flex items-center gap-0.5">
            <Button aria-label="Previous note" disabled={navigation.index <= 0} onClick={() => travelHistory(-1)} size="icon-xs" variant="ghost"><IconArrowLeft /></Button>
            <Button aria-label="Next note" disabled={navigation.index >= navigation.entries.length - 1} onClick={() => travelHistory(1)} size="icon-xs" variant="ghost"><IconArrowRight /></Button>
          </div>
          {/* The TITLE stays editable. Renaming is not authoring: it is one
              plain-text field that can never contain a markdown construct, so
              it cannot produce the stray-marker bug the body could. */}
          <input aria-label="Note title" className="min-w-48 flex-1 bg-transparent px-1 py-1 text-lg font-semibold tracking-tight text-foreground outline-none placeholder:text-(--ui-text-quaternary)" onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Untitled note" spellCheck value={title} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button aria-label="Note actions" size="icon-xs" variant="ghost"><IconDots /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setConfirmDelete(true)} variant="destructive"><IconTrash /> Delete note</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(saving || message) && <span aria-live="polite" className={message ? "w-full text-right text-[0.6875rem] text-muted-foreground" : "sr-only"}>{message ?? "Saving…"}</span>}
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-(--composer-width) min-w-0 flex-col px-6 pb-12 pt-5 max-sm:px-4">
            {/* Notes are WRITTEN here and READ below. The editor understands
                everything the renderer does — headings, lists, tables, maths,
                task lists — but a note holding something it cannot model
                (raw HTML, a footnote, front matter) stays read-only rather
                than being quietly flattened by the first save. Same rule as
                the crawler: say what you cannot handle, never mangle it. */}
            {/* 🔴 WAIT FOR THE TEXT BEFORE MOUNTING THE EDITOR. `note` is set a
                render before `content` is — the effect above copies the note
                into local state — so mounting on `note` alone seeded the editor
                with an EMPTY document and then never re-read it, because it is
                keyed on the note id and deliberately owns the document from
                then on. Observed exactly that: the note open, its links listed
                in the sidebar from the same `content`, and a blank page.
                `draftRef` is set in that same effect, so this is the honest
                test of "the text for THIS note has arrived". */}
            {note && draftRef.current?.id === note.id && isEditableNote(content) ? (
              <NoteEditor
                className="note-editor min-h-[28rem] bg-transparent p-1"
                key={note.id}
                markdown={content}
                noteId={note.id}
                onChange={(next) => updateDraft({ content: next })}
              />
            ) : (
              <>
                {note && draftRef.current?.id === note.id && (
                  <p className="mb-3 rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)">
                    This note contains formatting the editor cannot safely change yet, so it is shown as read-only.
                  </p>
                )}
                <article className="min-h-[28rem] bg-transparent p-1"><AssistantMarkdown className="[&_h1]:!mb-3 [&_h1]:!mt-7 [&_h1]:!text-4xl [&_h1]:!font-bold [&_h2]:!mb-2.5 [&_h2]:!mt-6 [&_h2]:!text-2xl [&_h3]:!mb-2 [&_h3]:!mt-5 [&_h3]:!text-xl [&_h4]:!mt-4 [&_h4]:!text-base" externalLinksInNewTab={false} isWikiLinkAvailable={(target) => Boolean(findLibraryNote(notes, target))} obsidianHighlights obsidianTags obsidianUnderline onWikiLink={(target) => void openWikiTarget(target)} text={content} /></article>
              </>
            )}
          </div>
        </div>
      </section>

      {linksSidebarOpen ? (
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(16rem,88vw)] max-md:shadow-2xl">
          <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-(--ui-stroke-tertiary) px-2">
            {RIGHT_PANELS.map(({ id, label, icon: Icon }) => (
              <Button aria-label={label} className={cn(rightPanel === id && "bg-(--ui-control-active-background) text-foreground")} key={id} onClick={() => setRightPanel(id)} size="icon-xs" title={label} variant="ghost"><Icon /></Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {rightPanel === "links" && (
              <LinkSection title="Links on page">
                {outgoing.length === 0 ? <PanelEmpty>Type [[Note name]] to connect an idea.</PanelEmpty> : outgoing.map((link) => {
                  const linked = findLibraryNote(notes, link.target);
                  return linked ? (
                    <a className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-[var(--theme-primary)] underline decoration-2 underline-offset-4 hover:bg-(--chrome-action-hover)" href={`${libraryBase}?note=${encodeURIComponent(linked.path)}`} key={link.target} onClick={(event) => { event.preventDefault(); void openWikiTarget(link.target); }} style={{ color: "var(--theme-primary)", textDecorationColor: "currentColor", textDecorationLine: "underline", textDecorationThickness: "2px", textUnderlineOffset: "0.25rem" }}>{link.label}</a>
                  ) : (
                    <button className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-(--ui-text-quaternary) underline decoration-current/35 underline-offset-4 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-secondary)" key={link.target} onClick={() => void openWikiTarget(link.target)} title="Create this note in the current folder" type="button">{link.label}</button>
                  );
                })}
              </LinkSection>
            )}
            {rightPanel === "backlinks" && (
              <LinkSection title="Backlinks">
                {backlinks.length === 0 ? <PanelEmpty>No other note links here yet.</PanelEmpty> : backlinks.map((backlink) => (
                  <a className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-[var(--theme-primary)] underline decoration-2 underline-offset-4 hover:bg-(--chrome-action-hover)" href={`${libraryBase}?note=${encodeURIComponent(backlink.path)}`} key={backlink.id} onClick={(event) => { event.preventDefault(); openPathInCurrentTab(backlink.path); }} style={{ color: "var(--theme-primary)", textDecorationColor: "currentColor", textDecorationLine: "underline", textDecorationThickness: "2px", textUnderlineOffset: "0.25rem" }}>{backlink.title}</a>
                ))}
              </LinkSection>
            )}
            {rightPanel === "contents" && (
              <LinkSection title="Table of contents">
                {headings.length === 0 ? <PanelEmpty>Add headings to build an outline.</PanelEmpty> : headings.map((heading, index) => (
                  <button
                    className="w-full truncate rounded-lg py-1.5 pr-2 text-left text-xs text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground"
                    key={`${heading.label}:${index}`}
                    onClick={() => {
                      // The rendered article carries heading DOM ids, so the
                      // jump is a plain scrollIntoView. (It used to need the
                      // editor's imperative API, because CodeMirror has no
                      // heading elements to scroll to.)
                      document.getElementById(slugifyHeading(heading.label))?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    style={{ paddingLeft: `${Math.max(0.5, (heading.depth - 1) * 0.75 + 0.5)}rem` }}
                    type="button"
                  >{heading.label}</button>
                ))}
              </LinkSection>
            )}
            {rightPanel === "tags" && (
              <LinkSection title="Tags">
                {tags.length === 0 ? <PanelEmpty>Add #tags to this note.</PanelEmpty> : tags.map((tag) => <span className="w-fit rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_12%,transparent)] px-2 py-1 text-xs font-medium text-[var(--theme-primary)]" key={tag}>#{tag}</span>)}
              </LinkSection>
            )}
          </div>
        </aside>
      ) : null}

      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Are you sure you want to delete “{note.title}”?</DialogTitle><DialogDescription>The note will disappear from your Library and Graph. Existing [[links]] to it will become uncreated nodes.</DialogDescription></DialogHeader>
          <DialogFooter><Button onClick={() => setConfirmDelete(false)} variant="ghost">Cancel</Button><Button onClick={() => void removeCurrentNote()} variant="destructive">Delete note</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function LinkSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-2"><h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">{title}</h2><div className="grid gap-0.5">{children}</div></section>;
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">{children}</p>;
}
