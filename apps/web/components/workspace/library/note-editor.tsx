"use client";

// The writing surface for a note.
//
// WHY PROSEMIRROR AND NOT THE OLD MARKDOWN EDITOR. Owner, 2026-08-02: "the
// markdown syntax is still there for users, i dont want users to see any
// syntax, especially if they are deleting words etc."
//
// The old editor kept the asterisks in the document and painted them at zero
// width. The characters were still there, so deleting a word next to bold text
// could orphan a "**" and make it appear somewhere the student never touched.
// Hiding syntax cannot fix that, because the syntax is the document.
//
// Here, bold is a PROPERTY OF A RANGE OF TEXT, not two characters sitting
// beside it. There is no marker to orphan. This is the same model ChatGPT uses
// for its long documents — checked directly, they are contenteditable
// ProseMirror regions, not read-only panes.
//
// 🔴 IT NEVER SAVES A NOTE NOBODY EDITED. See note-markdown.ts: the serializer
// cannot be made byte-perfect for every note (something has to choose between
// "-" and "*" bullets), so the owner's rule — opening a note must not reword it
// — is kept by not writing at all unless the text actually changed. `hasEdits`
// compares against the NORMALISED original, because normalised markdown is the
// only thing this editor can emit.

import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { liftListItem, splitListItem, sinkListItem } from "prosemirror-schema-list";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef } from "react";

import { docToMarkdown, markdownToDoc } from "@/lib/workspace/note-doc";
import { hasEdits } from "@/lib/workspace/note-markdown";
import { noteSchema } from "@/lib/workspace/note-schema";

interface NoteEditorProps {
  /** The note as stored. Only read when the note IDENTITY changes — see below. */
  markdown: string;
  /** Called with new markdown, and only when something genuinely changed. */
  onChange: (markdown: string) => void;
  /** Changing this rebuilds the document. Must be the note's id, not its text. */
  noteId: string;
  className?: string;
}

export function NoteEditor({ className, markdown, noteId, onChange }: NoteEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // Read inside the ProseMirror callback, which is created once per note and
  // would otherwise capture the first render's props forever.
  const latest = useRef({ markdown, onChange });
  latest.current = { markdown, onChange };

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    const original = latest.current.markdown;
    const state = EditorState.create({
      doc: markdownToDoc(original),
      plugins: [
        history(),
        keymap({
          "Mod-b": toggleMark(noteSchema.marks.strong!),
          "Mod-i": toggleMark(noteSchema.marks.em!),
          "Mod-y": redo,
          "Mod-z": undo,
          "Shift-Mod-z": redo,
          // Enter inside a list makes the NEXT item, and Tab nests it. Without
          // these a list is a trap: Enter drops a bare paragraph inside the
          // item and the list quietly ends.
          Enter: chainCommands(splitListItem(noteSchema.nodes.list_item!), baseKeymap.Enter!),
          "Shift-Tab": liftListItem(noteSchema.nodes.list_item!),
          Tab: sinkListItem(noteSchema.nodes.list_item!),
        }),
        keymap(baseKeymap),
      ],
    });

    const editor = new EditorView(mount, {
      attributes: { class: "note-prosemirror outline-none" },
      dispatchTransaction(transaction) {
        const next = editor.state.apply(transaction);
        editor.updateState(next);
        // Only a transaction that CHANGED the document can change the note.
        // Moving the caret must not mark a note dirty.
        if (!transaction.docChanged) return;
        const produced = docToMarkdown(next.doc);
        if (hasEdits(original, produced)) latest.current.onChange(produced);
      },
      state,
    });
    view.current = editor;

    return () => {
      editor.destroy();
      view.current = null;
    };
    // 🔴 KEYED ON THE NOTE, NOT ON ITS TEXT. Rebuilding on every keystroke
    // would destroy and recreate the editor mid-word, losing the caret and the
    // undo history. The document is seeded once when the note opens; after
    // that the editor owns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return <div className={className} ref={host} />;
}
