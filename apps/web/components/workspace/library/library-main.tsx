"use client";

import {
  IconArrowBackUp,
  IconCards,
  IconDots,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconList,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
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

import { LibraryLiveEditor } from "./library-live-editor";

type EditorMode = "edit" | "read";
type RightPanel = "links" | "backlinks" | "contents";

const EDITOR_MODES = [
  { id: "edit", label: "Edit" },
  { id: "read", label: "Read" },
] as const;

const RIGHT_PANELS = [
  { id: "links", label: "Links on page", icon: IconLink },
  { id: "backlinks", label: "Backlinks", icon: IconArrowBackUp },
  { id: "contents", label: "Table of contents", icon: IconList },
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

export function LibraryMain() {
  const router = useRouter();
  const { notes, selectedPath, select, createNote, saveNote, deleteNote } = useCloudLibrary();
  const note = selectedPath ? (notes.find((item) => item.path === selectedPath) ?? null) : null;
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [mode, setMode] = useState<EditorMode>("edit");
  const [rightPanel, setRightPanel] = useState<RightPanel>("links");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linksSidebarOpen, setLinksSidebarOpen] = useState(true);
  const draftRef = useRef<NoteDraft | null>(null);

  useEffect(() => {
    if (!selectedPath) return;
    setOpenPaths((paths) => (paths.includes(selectedPath) ? paths : [...paths, selectedPath]));
  }, [selectedPath]);

  useEffect(() => {
    const available = new Set(notes.map((item) => item.path));
    setOpenPaths((paths) => paths.filter((path) => available.has(path)));
  }, [notes]);

  useEffect(() => {
    const previous = draftRef.current;
    if (previous?.dirty && previous.id !== note?.id) {
      void saveNote({ id: previous.id, title: previous.title, content: previous.content });
    }
    if (previous?.id === note?.id) return;
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
    router.replace(`/library?note=${encodeURIComponent(path)}`);
  }

  function openWikiTarget(target: string) {
    const existing = findLibraryNote(notes, target);
    if (existing) openPath(existing.path);
  }

  function closeTab(path: string) {
    setOpenPaths((paths) => {
      const index = paths.indexOf(path);
      const remaining = paths.filter((item) => item !== path);
      if (path === selectedPath) {
        const next = remaining[Math.min(index, remaining.length - 1)] ?? null;
        select(next);
        if (next) router.replace(`/library?note=${encodeURIComponent(next)}`);
        else router.replace("/library");
      }
      return remaining;
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
      <main className="flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-(--ui-bg-editor)">
        <EmptyState description="Create a note, then connect ideas with [[double brackets]]." title="No note open" />
        <Button onClick={() => void createNote({ title: "Untitled note" })} size="sm">New note</Button>
      </main>
    );
  }

  return (
    <main className="flex h-full min-w-0 flex-1 overflow-hidden bg-(--ui-bg-editor)">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {openPaths.length > 0 && (
          <div className="flex h-8 shrink-0 items-end gap-px overflow-x-auto border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-1.5 pt-1">
            {openPaths.map((path) => {
              const tabNote = notes.find((item) => item.path === path);
              if (!tabNote) return null;
              const active = path === selectedPath;
              return (
                <div className={cn("group flex h-7 min-w-28 max-w-48 items-center gap-1.5 rounded-t-lg px-2 text-xs", active ? "bg-(--ui-bg-editor) text-foreground" : "text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground")} key={path}>
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => openPath(path)} type="button">{tabNote.title}</button>
                  <button aria-label={`Close ${tabNote.title}`} className="rounded p-0.5 opacity-50 hover:bg-(--ui-control-hover-background) hover:opacity-100" onClick={() => closeTab(path)} type="button"><IconX size={11} /></button>
                </div>
              );
            })}
          </div>
        )}

        <header className="flex flex-wrap items-center gap-2 border-b border-(--ui-stroke-tertiary) px-5 py-2.5">
          <input aria-label="Note title" className="min-w-48 flex-1 bg-transparent px-1 py-1 text-lg font-semibold tracking-tight text-foreground outline-none placeholder:text-(--ui-text-quaternary)" onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Untitled note" spellCheck value={title} />
          <SegmentedControl className="bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)]" onChange={setMode} options={EDITOR_MODES} value={mode} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button aria-label="Note actions" size="icon-xs" variant="ghost"><IconDots /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => router.push(`/study?source=${encodeURIComponent(note.path)}`)}><IconCards /> Study this note</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmDelete(true)} variant="destructive"><IconTrash /> Delete note</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(saving || message) && <span aria-live="polite" className={message ? "w-full text-right text-[0.6875rem] text-muted-foreground" : "sr-only"}>{message ?? "Saving…"}</span>}
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-(--composer-width) min-w-0 flex-col px-6 pb-16 pt-5">
            {mode === "edit" ? (
              <LibraryLiveEditor isWikiLinkAvailable={(target) => Boolean(findLibraryNote(notes, target))} key={note.id} onChange={(next) => updateDraft({ content: next })} onWikiLink={openWikiTarget} value={content} />
            ) : (
              <article className="min-h-[28rem] bg-transparent p-1"><AssistantMarkdown isWikiLinkAvailable={(target) => Boolean(findLibraryNote(notes, target))} onWikiLink={openWikiTarget} text={content} /></article>
            )}
          </div>
        </div>
      </section>

      {linksSidebarOpen ? (
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background)">
          <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-(--ui-stroke-tertiary) px-2">
            {RIGHT_PANELS.map(({ id, label, icon: Icon }) => (
              <Button aria-label={label} className={cn(rightPanel === id && "bg-(--ui-control-active-background) text-foreground")} key={id} onClick={() => setRightPanel(id)} size="icon-xs" title={label} variant="ghost"><Icon /></Button>
            ))}
            <Button aria-label="Collapse Library details" className="ml-auto" onClick={() => setLinksSidebarOpen(false)} size="icon-xs" variant="ghost"><IconLayoutSidebarRightCollapse /></Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {rightPanel === "links" && (
              <LinkSection title="Links on page">
                {outgoing.length === 0 ? <PanelEmpty>Type [[Note name]] to connect an idea.</PanelEmpty> : outgoing.map((link) => {
                  const linked = findLibraryNote(notes, link.target);
                  return linked ? (
                    <a className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-(--theme-primary) underline decoration-current/30 underline-offset-4 hover:bg-(--chrome-action-hover)" href={`/library?note=${encodeURIComponent(linked.path)}`} key={link.target} onClick={(event) => { event.preventDefault(); openWikiTarget(link.target); }}>{link.label}</a>
                  ) : (
                    <span aria-disabled="true" className="w-full truncate px-2 py-1.5 text-xs text-(--ui-text-quaternary)" key={link.target} title="This note has not been created yet">{link.label}</span>
                  );
                })}
              </LinkSection>
            )}
            {rightPanel === "backlinks" && (
              <LinkSection title="Backlinks">
                {backlinks.length === 0 ? <PanelEmpty>No other note links here yet.</PanelEmpty> : backlinks.map((backlink) => (
                  <a className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-(--theme-primary) underline decoration-current/30 underline-offset-4 hover:bg-(--chrome-action-hover)" href={`/library?note=${encodeURIComponent(backlink.path)}`} key={backlink.id} onClick={(event) => { event.preventDefault(); openPath(backlink.path); }}>{backlink.title}</a>
                ))}
              </LinkSection>
            )}
            {rightPanel === "contents" && (
              <LinkSection title="Table of contents">
                {headings.length === 0 ? <PanelEmpty>Add headings to build an outline.</PanelEmpty> : headings.map((heading, index) => (
                  <button className="w-full truncate rounded-lg py-1.5 pr-2 text-left text-xs text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground" key={`${heading.label}:${index}`} onClick={() => document.getElementById(slugifyHeading(heading.label))?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ paddingLeft: `${Math.max(0.5, (heading.depth - 1) * 0.75 + 0.5)}rem` }} type="button">{heading.label}</button>
                ))}
              </LinkSection>
            )}
          </div>
        </aside>
      ) : (
        <aside className="flex w-8 shrink-0 flex-col items-center gap-1 border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-2">
          <Button aria-label="Expand Library details" onClick={() => setLinksSidebarOpen(true)} size="icon-xs" variant="ghost"><IconLayoutSidebarRightExpand /></Button>
          {RIGHT_PANELS.map(({ id, label, icon: Icon }) => (
            <Button aria-label={label} key={id} onClick={() => { setRightPanel(id); setLinksSidebarOpen(true); }} size="icon-xs" title={label} variant="ghost"><Icon /></Button>
          ))}
        </aside>
      )}

      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete “{note.title}”?</DialogTitle><DialogDescription>The note will disappear from your Library and Graph. Existing [[links]] to it will become uncreated nodes.</DialogDescription></DialogHeader>
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
