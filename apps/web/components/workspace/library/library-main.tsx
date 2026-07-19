"use client";

import { IconCards, IconDeviceFloppy, IconLink, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/desktop-ui/badge";
import { Button } from "@/components/desktop-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { Input } from "@/components/desktop-ui/input";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { Textarea } from "@/components/desktop-ui/textarea";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { backlinksFor, extractLibraryLinks, findLibraryNote } from "@/lib/workspace/library-links";
import { titleFromPath } from "@/lib/workspace/library-tree";

type EditorMode = "edit" | "preview";
const EDITOR_MODES = [
  { id: "edit", label: "Edit" },
  { id: "preview", label: "Preview" },
] as const;

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

  useEffect(() => {
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setMessage(null);
  }, [note?.content, note?.id, note?.title]);

  const outgoing = useMemo(() => extractLibraryLinks(content), [content]);
  const backlinks = useMemo(() => (note ? backlinksFor(notes, note) : []), [note, notes]);
  const dirty = !!note && (title !== note.title || content !== note.content);

  async function handleSave() {
    if (!note || !dirty) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveNote({ id: note.id, title, content });
      setMessage("Saved");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Couldn't save this note.");
    } finally {
      setSaving(false);
    }
  }

  async function openWikiTarget(target: string) {
    const existing = findLibraryNote(notes, target);
    if (existing) {
      select(existing.path);
      return;
    }
    const pieces = target.replace(/\\/g, "/").split("/").filter(Boolean);
    const targetTitle = titleFromPath(pieces.pop() ?? target);
    const currentFolder = note?.path.split("/").slice(0, -1).join("/") ?? "";
    const created = await createNote({ title: targetTitle, folder: pieces.join("/") || currentFolder });
    select(created.path);
  }

  async function removeCurrentNote() {
    if (!note) return;
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
        <header className="flex flex-wrap items-center gap-2 border-b border-(--ui-stroke-tertiary) px-5 pb-3 pt-[calc(var(--titlebar-height)+1rem)]">
          <Input
            aria-label="Note title"
            className="min-w-48 flex-1 border-transparent bg-transparent px-1 text-lg font-semibold shadow-none focus-visible:bg-(--ui-bg-elevated)"
            onChange={(event) => setTitle(event.target.value)}
            spellCheck
            value={title}
          />
          <SegmentedControl onChange={setMode} options={EDITOR_MODES} value={mode} />
          <Button disabled={!dirty || saving} onClick={() => void handleSave()} size="sm" variant={dirty ? "default" : "ghost"}>
            <IconDeviceFloppy size={13} /> {saving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={() => router.push(`/study?source=${encodeURIComponent(note.path)}`)} size="sm" variant="outline">
            <IconCards size={13} /> Study
          </Button>
          <Button aria-label="Delete note" onClick={() => setConfirmDelete(true)} size="icon-xs" variant="ghost">
            <IconTrash />
          </Button>
          {message && <span className="w-full text-[0.6875rem] text-muted-foreground">{message}</span>}
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="mx-auto flex h-full w-full max-w-(--composer-width) min-w-0 flex-col px-6 pb-16 pt-6">
            {mode === "edit" ? (
              <Textarea
                aria-label="Note content"
                className="min-h-[28rem] flex-1 resize-none border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-5 font-mono text-[0.8125rem] leading-6"
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write in Markdown. Link another note with [[Note name]]."
                spellCheck
                value={content}
              />
            ) : (
              <article className="min-h-[28rem] rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-6">
                <AssistantMarkdown onWikiLink={(target) => void openWikiTarget(target)} text={content} />
              </article>
            )}
          </div>
        </div>
      </section>

      <aside className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-4 pb-6 pt-[calc(var(--titlebar-height)+1.25rem)] xl:flex">
        <LinkSection icon={<IconLink size={13} />} title="Links from this note">
          {outgoing.length === 0 ? (
            <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">Type [[Note name]] to connect an idea.</p>
          ) : (
            outgoing.map((link) => {
              const linked = findLibraryNote(notes, link.target);
              return (
                <button className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-(--chrome-action-hover)" key={link.target} onClick={() => void openWikiTarget(link.target)} type="button">
                  <span className="truncate">{link.label}</span>
                  {!linked && <Badge variant="outline">Create</Badge>}
                </button>
              );
            })
          )}
        </LinkSection>
        <LinkSection title="Backlinks">
          {backlinks.length === 0 ? (
            <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">No other note links here yet.</p>
          ) : (
            backlinks.map((backlink) => (
              <button className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs hover:bg-(--chrome-action-hover)" key={backlink.id} onClick={() => select(backlink.path)} type="button">
                {backlink.title}
              </button>
            ))
          )}
        </LinkSection>
      </aside>

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
