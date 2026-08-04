"use client";

// The middle pane of the docs-style Library: one note, presented like a docs
// article. Breadcrumbs, an editable title (renaming is not authoring — one
// plain-text field that can never hold a markdown construct), source pills
// showing where the note came from, the rendered body with clickable
// [[wiki links]], and a "Linked from" footer built from backlinks.
//
// READ FIRST, EDIT ON PURPOSE. The docs feel comes from rendering the note
// through AssistantMarkdown — the same renderer the chat uses — where wiki
// links, tags and highlights are live. The ProseMirror editor mounts only
// when the student presses Edit; Done returns to the article. (The classic
// screen kept every editable note permanently inside the editor, where wiki
// links are inert text — reading is the default here, so links work by
// default.) Draft/autosave/live-merge rules are carried over from
// library-main.tsx unchanged.

import { IconArrowNarrowLeft, IconCheck, IconDots, IconEdit, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
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
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { backlinksFor, findLibraryNote } from "@/lib/workspace/library-links";
import { loadNoteSources, sourceKindIcon, sourceKindLabel, type NoteSource } from "@/lib/workspace/library-provenance";
import { isEditableNote } from "@/lib/workspace/note-markdown";
import { stripLeadingTitleHeading } from "@/lib/workspace/note-outline";
import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import { cn } from "@/lib/utils";

import { NoteEditor } from "../library/note-editor";

interface NoteDraft {
  id: string;
  title: string;
  content: string;
  dirty: boolean;
}

interface NoteArticleProps {
  note: CloudLibraryNote;
  notes: readonly CloudLibraryNote[];
  /** Edit mode is the PAGE's state: the ToC rail hides while it is on. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Notify the page that content changed so the ToC can re-extract. */
  onContentChange: (content: string) => void;
  onOpenPath: (path: string) => void;
  onOpenWikiTarget: (target: string, fromPath: string) => void;
  onDelete: (noteId: string) => Promise<void>;
  saveNote: (input: { id: string; title: string; content: string }) => Promise<unknown>;
  /** The note body wrapper — the ToC queries its h1-h4 by position. */
  articleRef: React.RefObject<HTMLDivElement | null>;
}

export function NoteArticle({ note, notes, editing, onEditingChange, onContentChange, onOpenPath, onOpenWikiTarget, onDelete, saveNote, articleRef }: NoteArticleProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sources, setSources] = useState<NoteSource[]>([]);
  const draftRef = useRef<NoteDraft | null>(null);

  // Draft lifecycle — carried over from library-main.tsx: save a dirty draft
  // when switching notes (with the deleted-elsewhere failure surfaced), adopt
  // live edits from other devices only while nothing is unsaved here.
  useEffect(() => {
    const previous = draftRef.current;
    if (previous?.dirty && previous.id !== note.id) {
      saveNote({ id: previous.id, title: previous.title, content: previous.content }).catch(() => {
        setMessage(`"${previous.title}" couldn't keep its last unsaved edit — it may have been deleted on another device.`);
      });
    }
    if (previous?.id === note.id) {
      if (previous && !previous.dirty && (previous.title !== note.title || previous.content !== note.content)) {
        setTitle(note.title);
        setContent(note.content);
        draftRef.current = { id: note.id, title: note.title, content: note.content, dirty: false };
      }
      return;
    }
    setTitle(note.title);
    setContent(note.content);
    setMessage(null);
    draftRef.current = { id: note.id, title: note.title, content: note.content, dirty: false };
  }, [note, saveNote]);

  // Autosave, 650ms after the last change — same cadence as the classic screen.
  useEffect(() => {
    const draft = draftRef.current;
    if (!draft?.dirty || draft.id !== note.id) return;
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
  }, [content, note.id, saveNote, title]);

  // The reader hides a leading h1 that just repeats the title (docs pages say
  // their name once). Display-only — the stored markdown keeps its heading —
  // and the ToC extracts from this SAME text, keeping entry↔element indexes
  // aligned with what is actually on screen.
  const displayContent = useMemo(() => stripLeadingTitleHeading(content, title), [content, title]);

  useEffect(() => {
    onContentChange(displayContent);
  }, [displayContent, onContentChange]);

  // Source pills. Errors degrade to none; a note without provenance simply
  // shows no pills, which is the truthful state. (Preview fixtures are keyed
  // off the preview- id prefix inside the loader.)
  useEffect(() => {
    let cancelled = false;
    void loadNoteSources(note.id).then((loaded) => {
      if (!cancelled) setSources(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  const backlinks = useMemo(() => backlinksFor(notes, note), [note, notes]);
  const editable = isEditableNote(content);
  const textArrived = draftRef.current?.id === note.id;
  const crumbs = note.path.split("/").filter(Boolean).slice(0, -1);

  function updateDraft(next: { title?: string; content?: string }) {
    const current = draftRef.current ?? { id: note.id, title, content, dirty: false };
    const updated = { ...current, ...next };
    updated.dirty = updated.title !== note.title || updated.content !== note.content;
    draftRef.current = updated;
    if (next.title !== undefined) setTitle(next.title);
    if (next.content !== undefined) setContent(next.content);
  }

  async function removeNote() {
    if (draftRef.current?.id === note.id) draftRef.current.dirty = false;
    await onDelete(note.id);
    setConfirmDelete(false);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl min-w-0 flex-col px-8 pb-16 pt-6 max-sm:px-4">
      <header className="mb-1">
        <div className="flex items-center gap-2 text-[0.6875rem] text-(--ui-text-tertiary)">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
            {crumbs.length === 0 ? <span>Library</span> : crumbs.map((crumb, index) => (
              <span className="flex min-w-0 items-center gap-1" key={`${crumb}:${index}`}>
                {index > 0 && <span className="text-(--ui-text-quaternary)">/</span>}
                <span className="truncate">{crumb}</span>
              </span>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-0.5">
            {(saving || message) && <span aria-live="polite" className={message ? "max-w-64 truncate text-(--ui-text-tertiary)" : "sr-only"}>{message ?? "Saving…"}</span>}
            {editing ? (
              <Button aria-label="Done editing" onClick={() => onEditingChange(false)} size="xs" variant="secondary"><IconCheck /> Done</Button>
            ) : (
              <Button
                aria-label="Edit note"
                disabled={!editable}
                onClick={() => onEditingChange(true)}
                size="xs"
                title={editable ? "Edit this note" : "This note contains formatting the editor can't safely change yet."}
                variant="ghost"
              >
                <IconEdit /> Edit
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button aria-label="Note actions" size="icon-xs" variant="ghost"><IconDots /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setConfirmDelete(true)} variant="destructive"><IconTrash /> Delete note</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <input
          aria-label="Note title"
          className="mt-2 w-full bg-transparent text-[1.75rem] font-bold tracking-tight text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
          onChange={(event) => updateDraft({ title: event.target.value })}
          placeholder="Untitled note"
          spellCheck
          value={title}
        />
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="note-sources">
            {sources.map((source) => (
              <span
                className="inline-flex max-w-60 items-center gap-1.5 rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-1 text-[0.6875rem] text-(--ui-text-secondary)"
                key={source.id}
                title={`${sourceKindLabel(source.kind)}${source.excerpt ? ` — ${source.excerpt}` : ""}. The original file isn't stored yet, so this pill names the source without opening it.`}
              >
                <Codicon className="text-(--ui-text-tertiary)" name={sourceKindIcon(source.kind)} size="0.75rem" />
                <span className="truncate">{source.label}</span>
                {source.location && <span className="shrink-0 text-(--ui-text-quaternary)">{source.location}</span>}
              </span>
            ))}
          </div>
        )}
      </header>

      {editing && textArrived && editable ? (
        <NoteEditor
          className="note-editor min-h-[24rem] bg-transparent py-2"
          key={note.id}
          markdown={content}
          noteId={note.id}
          onChange={(next) => updateDraft({ content: next })}
        />
      ) : (
        <>
          {!editable && textArrived && displayContent.trim().length > 0 && (
            <p className="mb-3 rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)">
              This note contains formatting the editor cannot safely change yet, so it is shown read-only.
            </p>
          )}
          <div className="min-h-[16rem]" ref={articleRef}>
            <AssistantMarkdown
              className="[&_h1]:!mb-3 [&_h1]:!mt-8 [&_h1]:!text-[1.5rem] [&_h1]:!font-bold [&_h2]:!mb-2.5 [&_h2]:!mt-7 [&_h2]:!border-b [&_h2]:!border-(--ui-stroke-tertiary) [&_h2]:!pb-1.5 [&_h2]:!text-[1.25rem] [&_h2]:!font-semibold [&_h3]:!mb-2 [&_h3]:!mt-5 [&_h3]:!text-[1.0625rem] [&_h4]:!mt-4 [&_h4]:!text-[0.9375rem] [&_p]:!leading-relaxed"
              externalLinksInNewTab={false}
              isWikiLinkAvailable={(target) => Boolean(findLibraryNote(notes, target))}
              obsidianHighlights
              obsidianTags
              obsidianUnderline
              onWikiLink={(target) => onOpenWikiTarget(target, note.path)}
              text={displayContent}
            />
            {displayContent.trim().length === 0 && (
              <button className="text-left text-sm text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)" disabled={!editable} onClick={() => onEditingChange(true)} type="button">
                This page is empty. {editable ? "Press Edit — or just start here — and connect ideas with [[double brackets]]." : ""}
              </button>
            )}
          </div>
        </>
      )}

      {backlinks.length > 0 && (
        <footer className="mt-10 border-t border-(--ui-stroke-tertiary) pt-4" data-testid="note-backlinks">
          <h2 className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">
            <IconArrowNarrowLeft size={13} /> Linked from
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {backlinks.map((backlink) => (
              <button
                className={cn(
                  "rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-1 text-xs font-medium",
                  "text-(--ui-text-secondary) hover:border-(--ui-stroke-secondary) hover:text-foreground",
                )}
                key={backlink.id}
                onClick={() => onOpenPath(backlink.path)}
                type="button"
              >
                {backlink.title}
              </button>
            ))}
          </div>
        </footer>
      )}

      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Are you sure you want to delete “{note.title}”?</DialogTitle><DialogDescription>The note will disappear from your Library and Graph. Existing [[links]] to it will become uncreated nodes.</DialogDescription></DialogHeader>
          <DialogFooter><Button onClick={() => setConfirmDelete(false)} variant="ghost">Cancel</Button><Button onClick={() => void removeNote()} variant="destructive">Delete note</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
