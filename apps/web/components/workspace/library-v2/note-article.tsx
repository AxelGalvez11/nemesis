"use client";

// The middle pane of the docs-style Library: one note, presented like a docs
// article. Breadcrumbs, an editable title (renaming is not authoring — one
// plain-text field that can never hold a markdown construct), source pills
// showing where the note came from, the body, and a "Linked from" footer
// built from backlinks.
//
// LOOKS LIKE DOCUMENTATION, EDITS LIKE GOOGLE DOCS (owner 2026-08-03). There
// is no Edit button and no mode: the body IS the editor, always. Click
// anywhere and type — if the AI wrote something wrong, fixing a typo is a
// keystroke, not a request. Equations render as equations and [[wiki links]]
// stay live links inside the editor (see note-editor.tsx). Only a note the
// editing model cannot represent (raw HTML, footnotes, front matter) falls
// back to a read-only rendering, and says so.
//
// Draft/autosave/live-merge rules are carried over from library-main.tsx
// unchanged: 650ms autosave, dirty-draft save on switch, remote edits adopted
// only while nothing is unsaved here.

import { IconArrowNarrowLeft, IconDots, IconTrash } from "@tabler/icons-react";
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
import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import { cn } from "@/lib/utils";

import { NoteEditor } from "../library/note-editor";
import { DocsCrumbs } from "./docs-crumbs";

interface NoteDraft {
  id: string;
  title: string;
  content: string;
  dirty: boolean;
}

interface NoteArticleProps {
  note: CloudLibraryNote;
  notes: readonly CloudLibraryNote[];
  /** Notify the page that content changed so the ToC can re-extract. */
  onContentChange: (content: string) => void;
  onOpenPath: (path: string) => void;
  onOpenWikiTarget: (target: string, fromPath: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenHome: () => void;
  /** Open a source FILE's page. Pills whose source id isn't in
   *  `openableSourceIds` stay inert text (nothing to open yet). */
  onOpenSource: (id: string) => void;
  openableSourceIds: ReadonlySet<string>;
  onDelete: (noteId: string) => Promise<void>;
  saveNote: (input: { id: string; title: string; content: string }) => Promise<unknown>;
  /** Wraps ONLY the note body — the ToC queries its h1-h4 by position. */
  articleRef: React.RefObject<HTMLDivElement | null>;
}

export function NoteArticle({ note, notes, onContentChange, onOpenPath, onOpenWikiTarget, onOpenFolder, onOpenHome, onOpenSource, openableSourceIds, onDelete, saveNote, articleRef }: NoteArticleProps) {
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

  useEffect(() => {
    onContentChange(content);
  }, [content, onContentChange]);

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
  const folderPath = note.path.split("/").filter(Boolean).slice(0, -1).join("/");
  // The editor resolves and follows [[links]] itself; both callbacks read the
  // freshest notes list through refs inside the editor, so a note created a
  // moment ago counts as available on the next render of its node.
  const wikiLinks = useMemo(
    () => ({
      isAvailable: (target: string) => Boolean(findLibraryNote(notes, target)),
      onOpen: (target: string) => onOpenWikiTarget(target, note.path),
    }),
    [note.path, notes, onOpenWikiTarget],
  );

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
          <DocsCrumbs className="flex-1" onOpenFolder={onOpenFolder} onOpenHome={onOpenHome} path={folderPath} />
          <div className="flex shrink-0 items-center gap-0.5">
            <span aria-live="polite" className={message ? "max-w-64 truncate text-(--ui-text-tertiary)" : "sr-only"}>{message ?? (saving ? "Saving…" : "")}</span>
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
            {sources.map((source) => {
              const pillBody = (
                <>
                  <Codicon className="text-(--ui-text-tertiary)" name={sourceKindIcon(source.kind)} size="0.75rem" />
                  <span className="truncate">{source.label}</span>
                  {source.location && <span className="shrink-0 text-(--ui-text-quaternary)">{source.location}</span>}
                </>
              );
              const pillClass = "inline-flex max-w-60 items-center gap-1.5 rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-1 text-[0.6875rem] text-(--ui-text-secondary)";
              // A pill opens the source file's page when that page exists;
              // otherwise it stays honest text naming where the note came from.
              return source.sourceId && openableSourceIds.has(source.sourceId) ? (
                <button
                  className={cn(pillClass, "hover:border-(--ui-stroke-secondary) hover:text-foreground")}
                  key={source.id}
                  onClick={() => onOpenSource(source.sourceId as string)}
                  title={`${sourceKindLabel(source.kind)}${source.excerpt ? ` — ${source.excerpt}` : ""}. Open this source.`}
                  type="button"
                >
                  {pillBody}
                </button>
              ) : (
                <span
                  className={pillClass}
                  key={source.id}
                  title={`${sourceKindLabel(source.kind)}${source.excerpt ? ` — ${source.excerpt}` : ""}. The original file isn't stored yet, so this pill names the source without opening it.`}
                >
                  {pillBody}
                </span>
              );
            })}
          </div>
        )}
      </header>

      <div className="min-h-[16rem]" ref={articleRef}>
        {textArrived && editable ? (
          <NoteEditor
            className="note-editor bg-transparent py-2"
            key={note.id}
            markdown={content}
            noteId={note.id}
            onChange={(next) => updateDraft({ content: next })}
            wikiLinks={wikiLinks}
          />
        ) : textArrived ? (
          <>
            <p className="mb-3 rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)">
              This note contains formatting the editor cannot safely change yet, so it is shown read-only.
            </p>
            <AssistantMarkdown
              className="[&_h1]:!mb-3 [&_h1]:!mt-8 [&_h1]:!text-[2.25rem] [&_h1]:!font-bold [&_h2]:!mb-2.5 [&_h2]:!mt-7 [&_h2]:!text-[1.5rem] [&_h2]:!font-semibold [&_h3]:!mb-2 [&_h3]:!mt-5 [&_h3]:!text-[1.25rem] [&_h4]:!mt-4 [&_h4]:!text-[1rem] [&_p]:!leading-relaxed"
              externalLinksInNewTab={false}
              isWikiLinkAvailable={(target) => Boolean(findLibraryNote(notes, target))}
              obsidianHighlights
              obsidianTags
              obsidianUnderline
              onWikiLink={(target) => onOpenWikiTarget(target, note.path)}
              text={content}
            />
          </>
        ) : null}
      </div>

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
