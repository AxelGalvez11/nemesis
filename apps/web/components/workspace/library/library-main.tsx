"use client";

import {
  IconCards,
  IconDots,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconTrash,
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
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { backlinksFor, extractLibraryLinks, findLibraryNote } from "@/lib/workspace/library-links";

type EditorMode = "edit" | "read";
const EDITOR_MODES = [
  { id: "edit", label: "Edit" },
  { id: "read", label: "Read" },
] as const;

interface NoteDraft {
  id: string;
  title: string;
  content: string;
  dirty: boolean;
}

export function LibraryMain() {
  const router = useRouter();
  const { notes, selectedPath, select, createNote, saveNote, deleteNote } = useCloudLibrary();
  const note = selectedPath ? (notes.find((item) => item.path === selectedPath) ?? null) : null;
  const [mode, setMode] = useState<EditorMode>("edit");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linksSidebarOpen, setLinksSidebarOpen] = useState(true);
  const draftRef = useRef<NoteDraft | null>(null);

  useEffect(() => {
    const previous = draftRef.current;
    if (previous?.dirty && previous.id !== note?.id) {
      void saveNote({ id: previous.id, title: previous.title, content: previous.content });
    }
    if (previous?.id === note?.id) return;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setMessage(null);
    draftRef.current = note
      ? { id: note.id, title: note.title, content: note.content, dirty: false }
      : null;
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
          if (current?.id === snapshot.id && current.title === snapshot.title && current.content === snapshot.content) {
            current.dirty = false;
          }
        })
        .catch((cause: unknown) => {
          setMessage(cause instanceof Error ? cause.message : "Couldn't save this note.");
        })
        .finally(() => setSaving(false));
    }, 650);

    return () => window.clearTimeout(timer);
  }, [content, note?.id, saveNote, title]);

  const outgoing = useMemo(() => extractLibraryLinks(content), [content]);
  const backlinks = useMemo(() => (note ? backlinksFor(notes, note) : []), [note, notes]);
  function updateDraft(next: { title?: string; content?: string }) {
    if (!note) return;
    const current = draftRef.current ?? { id: note.id, title, content, dirty: false };
    const updated = { ...current, ...next };
    updated.dirty = updated.title !== note.title || updated.content !== note.content;
    draftRef.current = updated;
    if (next.title !== undefined) setTitle(next.title);
    if (next.content !== undefined) setContent(next.content);
  }

  function openWikiTarget(target: string) {
    const existing = findLibraryNote(notes, target);
    if (!existing) return;
    select(existing.path);
    router.replace(`/library?note=${encodeURIComponent(existing.path)}`);
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
        <header className="flex flex-wrap items-center gap-2 border-b border-(--ui-stroke-tertiary) px-5 py-3">
          <input
            aria-label="Note title"
            className="min-w-48 flex-1 bg-transparent px-1 py-1 text-lg font-semibold tracking-tight text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={(event) => updateDraft({ title: event.target.value })}
            placeholder="Untitled note"
            spellCheck
            value={title}
          />
          <SegmentedControl
            className="bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)]"
            onChange={setMode}
            options={EDITOR_MODES}
            value={mode}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Note actions" size="icon-xs" variant="ghost">
                <IconDots />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => router.push(`/study?source=${encodeURIComponent(note.path)}`)}>
                <IconCards /> Study this note
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmDelete(true)} variant="destructive">
                <IconTrash /> Delete note
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(saving || message) && (
            <span aria-live="polite" className={message ? "w-full text-right text-[0.6875rem] text-muted-foreground" : "sr-only"}>
              {message ?? "Saving…"}
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="mx-auto flex h-full w-full max-w-(--composer-width) min-w-0 flex-col px-6 pb-16 pt-6">
            {mode === "edit" ? (
              <textarea
                aria-label="Note content"
                className="min-h-[28rem] flex-1 resize-none bg-transparent p-1 font-mono text-[0.8125rem] leading-6 text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
                onChange={(event) => updateDraft({ content: event.target.value })}
                placeholder="Write in Markdown. Link another note with [[Note name]]."
                spellCheck
                value={content}
              />
            ) : (
              <article className="min-h-[28rem] bg-transparent p-1">
                <AssistantMarkdown
                  isWikiLinkAvailable={(target) => Boolean(findLibraryNote(notes, target))}
                  onWikiLink={openWikiTarget}
                  text={content}
                />
              </article>
            )}
          </div>
        </div>
      </section>

      {linksSidebarOpen ? (
      <aside className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-4 pb-6 pt-3 xl:flex">
        <Button
          aria-label="Collapse links sidebar"
          className="ml-auto"
          onClick={() => setLinksSidebarOpen(false)}
          size="icon-xs"
          variant="ghost"
        >
          <IconLayoutSidebarRightCollapse />
        </Button>
        <LinkSection icon={<IconLink size={13} />} title="Links from this note">
          {outgoing.length === 0 ? (
            <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">Type [[Note name]] to connect an idea.</p>
          ) : (
            outgoing.map((link) => {
              const linked = findLibraryNote(notes, link.target);
              return linked ? (
                <a
                  className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-(--ui-blue) underline decoration-current/30 underline-offset-4 hover:bg-(--chrome-action-hover) hover:decoration-current"
                  href={`/library?note=${encodeURIComponent(linked.path)}`}
                  key={link.target}
                  onClick={(event) => {
                    event.preventDefault();
                    openWikiTarget(link.target);
                  }}
                >
                  {link.label}
                </a>
              ) : (
                <span aria-disabled="true" className="w-full truncate px-2 py-1.5 text-xs text-(--ui-text-quaternary)" key={link.target} title="This note has not been created yet">
                  {link.label}
                </span>
              );
            })
          )}
        </LinkSection>
        <LinkSection title="Backlinks">
          {backlinks.length === 0 ? (
            <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">No other note links here yet.</p>
          ) : (
            backlinks.map((backlink) => (
              <a
                className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-(--ui-blue) underline decoration-current/30 underline-offset-4 hover:bg-(--chrome-action-hover) hover:decoration-current"
                href={`/library?note=${encodeURIComponent(backlink.path)}`}
                key={backlink.id}
                onClick={(event) => {
                  event.preventDefault();
                  select(backlink.path);
                  router.replace(`/library?note=${encodeURIComponent(backlink.path)}`);
                }}
              >
                {backlink.title}
              </a>
            ))
          )}
        </LinkSection>
      </aside>
      ) : (
        <aside className="hidden w-10 shrink-0 justify-center border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-2 xl:flex">
          <Button aria-label="Expand links sidebar" onClick={() => setLinksSidebarOpen(true)} size="icon-xs" variant="ghost">
            <IconLayoutSidebarRightExpand />
          </Button>
        </aside>
      )}

      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{note.title}”?</DialogTitle>
            <DialogDescription>The note will disappear from your Library and Graph. Existing [[links]] to it will become uncreated nodes.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmDelete(false)} variant="ghost">Cancel</Button>
            <Button onClick={() => void removeCurrentNote()} variant="destructive">Delete note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function LinkSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">{icon}{title}</h2>
      <div className="grid gap-0.5">{children}</div>
    </section>
  );
}
