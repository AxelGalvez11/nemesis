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
  IconTextSize,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { AssistantMarkdown, slugifyHeading } from "@/lib/workspace/chat-markdown";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { backlinksFor, extractLibraryLinks, findLibraryNote } from "@/lib/workspace/library-links";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/components/workspace/shell/use-media-query";

import { LibraryLiveEditor, type LibraryEditorApi } from "./library-live-editor";

type EditorMode = "edit" | "read";
type RightPanel = "links" | "backlinks" | "contents" | "tags";

const EDITOR_MODES = [
  { id: "edit", label: "Edit" },
  { id: "read", label: "Read" },
] as const;

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
  const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
  const { notes, selectedPath, select, createNote, saveNote, deleteNote } = useCloudLibrary();
  const note = selectedPath ? (notes.find((item) => item.path === selectedPath) ?? null) : null;
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [mode, setMode] = useState<EditorMode>("edit");
  const [editingBarOpen, setEditingBarOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("links");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linksSidebarOpen, setLinksSidebarOpen] = useState(true);
  const narrowViewport = useMediaQuery("(max-width: 768px)");
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<{ entries: string[]; index: number }>({ entries: [], index: -1 });
  const draftRef = useRef<NoteDraft | null>(null);
  const replaceTabPathRef = useRef<string | null>(null);
  const editorApiRef = useRef<LibraryEditorApi | null>(null);

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
    if (narrowViewport) setLinksSidebarOpen(false);
  }, [narrowViewport]);

  useEffect(() => {
    const previous = draftRef.current;
    if (previous?.dirty && previous.id !== note?.id) {
      void saveNote({ id: previous.id, title: previous.title, content: previous.content });
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
    router.replace(`${navigationRoot}/library?note=${encodeURIComponent(path)}`);
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
      setMode("edit");
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
    router.replace(`${navigationRoot}/library?note=${encodeURIComponent(path)}`);
  }

  function closeTab(path: string) {
    setOpenPaths((paths) => {
      const index = paths.indexOf(path);
      const remaining = paths.filter((item) => item !== path);
      if (path === selectedPath) {
        const next = remaining[Math.min(index, remaining.length - 1)] ?? null;
        select(next);
        if (next) router.replace(`${navigationRoot}/library?note=${encodeURIComponent(next)}`);
        else router.replace(`${navigationRoot}/library`);
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
      <main className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-(--ui-bg-editor)">
        {!leftSidebarOpen && <Button aria-label="Expand Library sidebar" className="workspace-inline-sidebar-toggle absolute left-2 top-2" onClick={onExpandLeft} size="icon-xs" variant="ghost"><IconLayoutSidebarLeftExpand size={14} stroke={1.7} /></Button>}
        <EmptyState description="Create a note, then connect ideas with [[double brackets]]." title="No note open" />
        <Button onClick={() => void createBlankNote()} size="sm" variant="secondary">New note</Button>
      </main>
    );
  }

  return (
    <main className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-(--ui-bg-editor)">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="library-tab-strip workspace-page-header flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-text-primary)_5%,var(--ui-bg-editor))] px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      ? "z-10 border-(--ui-stroke-secondary) border-b-(--ui-bg-editor) bg-(--ui-bg-editor) text-foreground before:shadow-[3px_3px_0_var(--ui-bg-editor)] after:shadow-[-3px_3px_0_var(--ui-bg-editor)]"
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
          <input aria-label="Note title" className={cn("min-w-48 flex-1 bg-transparent px-1 py-1 text-lg font-semibold tracking-tight text-foreground outline-none placeholder:text-(--ui-text-quaternary)", mode !== "edit" && "cursor-default")} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Untitled note" readOnly={mode !== "edit"} spellCheck tabIndex={mode === "edit" ? 0 : -1} value={title} />
          <SegmentedControl className="bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)]" onChange={setMode} options={EDITOR_MODES} value={mode} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button aria-label="Note actions" size="icon-xs" variant="ghost"><IconDots /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => {
                setMode("edit");
                setEditingBarOpen((open) => !open);
              }}><IconTextSize /> {editingBarOpen ? "Hide editing bar" : "Show editing bar"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmDelete(true)} variant="destructive"><IconTrash /> Delete note</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(saving || message) && <span aria-live="polite" className={message ? "w-full text-right text-[0.6875rem] text-muted-foreground" : "sr-only"}>{message ?? "Saving…"}</span>}
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-(--composer-width) min-w-0 flex-col px-6 pb-12 pt-5 max-sm:px-4">
            {mode === "edit" ? (
              <LibraryLiveEditor apiRef={editorApiRef} autoFocus={note.content.trim().length === 0} key={note.id} onChange={(next) => updateDraft({ content: next })} showToolbar={editingBarOpen} value={content} />
            ) : (
              <article className="min-h-[28rem] bg-transparent p-1"><AssistantMarkdown className="[&_h1]:!mb-3 [&_h1]:!mt-7 [&_h1]:!text-4xl [&_h1]:!font-bold [&_h2]:!mb-2.5 [&_h2]:!mt-6 [&_h2]:!text-2xl [&_h3]:!mb-2 [&_h3]:!mt-5 [&_h3]:!text-xl [&_h4]:!mt-4 [&_h4]:!text-base" externalLinksInNewTab={false} isWikiLinkAvailable={(target) => Boolean(findLibraryNote(notes, target))} obsidianHighlights obsidianTags onWikiLink={(target) => void openWikiTarget(target)} text={content} /></article>
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
                    <a className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-[var(--theme-primary)] underline decoration-2 underline-offset-4 hover:bg-(--chrome-action-hover)" href={`${navigationRoot}/library?note=${encodeURIComponent(linked.path)}`} key={link.target} onClick={(event) => { event.preventDefault(); void openWikiTarget(link.target); }} style={{ color: "var(--theme-primary)", textDecorationColor: "currentColor", textDecorationLine: "underline", textDecorationThickness: "2px", textUnderlineOffset: "0.25rem" }}>{link.label}</a>
                  ) : (
                    <button className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-(--ui-text-quaternary) underline decoration-current/35 underline-offset-4 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-secondary)" key={link.target} onClick={() => void openWikiTarget(link.target)} title="Create this note in the current folder" type="button">{link.label}</button>
                  );
                })}
              </LinkSection>
            )}
            {rightPanel === "backlinks" && (
              <LinkSection title="Backlinks">
                {backlinks.length === 0 ? <PanelEmpty>No other note links here yet.</PanelEmpty> : backlinks.map((backlink) => (
                  <a className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-[var(--theme-primary)] underline decoration-2 underline-offset-4 hover:bg-(--chrome-action-hover)" href={`${navigationRoot}/library?note=${encodeURIComponent(backlink.path)}`} key={backlink.id} onClick={(event) => { event.preventDefault(); openPathInCurrentTab(backlink.path); }} style={{ color: "var(--theme-primary)", textDecorationColor: "currentColor", textDecorationLine: "underline", textDecorationThickness: "2px", textUnderlineOffset: "0.25rem" }}>{backlink.title}</a>
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
                      // Edit mode renders CodeMirror (no heading DOM ids), so
                      // route the jump through the editor's imperative API.
                      if (mode === "edit") {
                        editorApiRef.current?.scrollToHeading(heading.label);
                        return;
                      }
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
