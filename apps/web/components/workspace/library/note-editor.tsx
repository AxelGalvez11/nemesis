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
// EDITS LIKE GOOGLE DOCS, LINKS LIKE A WIKI (owner 2026-08-03): this surface
// is the note's ONLY face in the docs Library — there is no separate read
// mode — so equations render as equations (KaTeX node views) and [[wiki
// links]] render as live links while you type around them. Typing `]]`
// closes a link into an atom; typing the closing `$` turns $...$ into maths;
// double-clicking an equation or a link melts it back to raw text for
// editing, because a typo in LaTeX must be fixable without asking the AI.
//
// 🔴 IT NEVER SAVES A NOTE NOBODY EDITED. See note-markdown.ts: the serializer
// cannot be made byte-perfect for every note (something has to choose between
// "-" and "*" bullets), so the owner's rule — opening a note must not reword it
// — is kept by not writing at all unless the text actually changed. `hasEdits`
// compares against the NORMALISED original, because normalised markdown is the
// only thing this editor can emit.

import katex from "katex";
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { InputRule, inputRules } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Node as PmNode } from "prosemirror-model";
import { liftListItem, splitListItem, sinkListItem } from "prosemirror-schema-list";
import { EditorState, Plugin } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { useEffect, useRef } from "react";

import { docToMarkdown, markdownToDoc } from "@/lib/workspace/note-doc";
import { hasEdits } from "@/lib/workspace/note-markdown";
import { noteSchema } from "@/lib/workspace/note-schema";

export interface NoteEditorWikiLinks {
  /** Does a note exist for this target? Drives found/uncreated styling. */
  isAvailable: (target: string) => boolean;
  /** Open (or create-then-open) the target — same behaviour as the reader. */
  onOpen: (target: string) => void;
}

interface NoteEditorProps {
  /** The note as stored. Only read when the note IDENTITY changes — see below. */
  markdown: string;
  /** Called with new markdown, and only when something genuinely changed. */
  onChange: (markdown: string) => void;
  /** Changing this rebuilds the document. Must be the note's id, not its text. */
  noteId: string;
  className?: string;
  wikiLinks?: NoteEditorWikiLinks;
}

/**
 * Render LaTeX into an element; on bad input show the raw source instead.
 * innerHTML is safe here BECAUSE the markup comes from KaTeX, not the note:
 * with `trust: false` KaTeX escapes the input and refuses every HTML-emitting
 * command (\href, \htmlClass, …) — the same contract rehype-katex gives the
 * chat renderer, which feeds it the same student-written LaTeX.
 */
function paintMath(dom: HTMLElement, latex: string, displayMode: boolean): void {
  try {
    dom.innerHTML = katex.renderToString(latex, { displayMode, throwOnError: true, trust: false });
  } catch {
    dom.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`;
    dom.classList.add("note-math-error");
  }
}

/**
 * Typing `]]` after `[[Target` or `[[Target|Label` closes the wiki link into
 * an atom on the spot — no reload needed to see it become a link.
 */
const wikiLinkRule = new InputRule(/\[\[([^\[\]|\n]+)(?:\|([^\[\]\n]+))?\]\]$/, (state, match, start, end) => {
  const target = match[1]?.trim() ?? "";
  if (!target) return null;
  const label = match[2]?.trim() || null;
  const node = noteSchema.nodes.wiki_link!.create({ label: label === target ? null : label, target });
  return state.tr.replaceWith(start, end, node);
});

/**
 * Typing the closing `$` turns $...$ into rendered maths. TeX's own guard
 * rails: the content must not start or end with whitespace ("costs $5 and $8"
 * stays prose), must not be empty, and must not itself contain a dollar.
 */
const inlineMathRule = new InputRule(/(?<!\$)\$([^$\n]+)\$$/, (state, match, start, end) => {
  const latex = match[1] ?? "";
  if (!latex.trim() || latex !== latex.trim()) return null;
  const node = noteSchema.nodes.math_inline!.create({ latex });
  return state.tr.replaceWith(start, end, node);
});

class MathInlineView {
  dom: HTMLElement;

  constructor(node: PmNode) {
    this.dom = document.createElement("span");
    this.dom.className = "note-math-inline";
    this.dom.title = `${node.attrs.latex as string} — double-click to edit`;
    paintMath(this.dom, node.attrs.latex as string, false);
  }
}

/**
 * A display equation edits IN PLACE: double-click swaps the rendered maths
 * for a LaTeX box, and confirming writes the new LaTeX back into the same
 * block. (Melting a block to `$$…$$` text would come back from the next save
 * as INLINE maths — a single-line $$…$$ is inline in this markdown dialect —
 * so the block never leaves node form.)
 */
class MathBlockView {
  dom: HTMLElement;
  private node: PmNode;
  private editing = false;

  constructor(node: PmNode, private readonly view: EditorView, private readonly getPos: () => number | undefined) {
    this.node = node;
    this.dom = document.createElement("div");
    this.dom.className = "note-math-block";
    this.dom.title = "Double-click to edit this equation";
    paintMath(this.dom, node.attrs.latex as string, true);
    this.dom.addEventListener("dblclick", (event) => {
      event.preventDefault();
      this.beginEdit();
    });
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.latex !== this.node.attrs.latex;
    this.node = node;
    if (changed && !this.editing) paintMath(this.dom, node.attrs.latex as string, true);
    return true;
  }

  /** While the LaTeX box is open, its keystrokes belong to the box. */
  stopEvent(): boolean {
    return this.editing;
  }

  ignoreMutation(): boolean {
    return true;
  }

  private beginEdit(): void {
    if (this.editing) return;
    this.editing = true;
    this.dom.textContent = "";
    const box = document.createElement("textarea");
    box.className = "note-math-editbox";
    box.value = this.node.attrs.latex as string;
    box.rows = Math.min(6, Math.max(1, box.value.split("\n").length));
    box.setAttribute("aria-label", "Edit LaTeX");
    const finish = (commit: boolean) => {
      if (!this.editing) return;
      this.editing = false;
      const latex = box.value;
      if (commit && latex !== this.node.attrs.latex) {
        const pos = this.getPos();
        if (pos !== undefined) {
          this.view.dispatch(this.view.state.tr.setNodeAttribute(pos, "latex", latex));
          return; // update() repaints from the new node
        }
      }
      paintMath(this.dom, this.node.attrs.latex as string, true);
    };
    box.addEventListener("blur", () => finish(true));
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    this.dom.appendChild(box);
    box.focus();
    box.select();
  }
}

class WikiLinkView {
  dom: HTMLElement;

  constructor(node: PmNode, wikiLinks: NoteEditorWikiLinks | undefined) {
    const target = node.attrs.target as string;
    const label = (node.attrs.label as string | null) || target;
    const available = wikiLinks?.isAvailable(target) ?? false;
    this.dom = document.createElement("span");
    this.dom.className = available ? "note-wiki-link" : "note-wiki-link note-wiki-link-missing";
    this.dom.textContent = label;
    this.dom.title = available ? `Open “${target}” — double-click to edit the link` : `Create “${target}” — double-click to edit the link`;
    this.dom.addEventListener("mousedown", (event) => {
      // Single click follows the link, like a wiki. Double click falls
      // through to the melt handler below; modifier clicks stay ProseMirror's.
      if (event.detail !== 1 || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      wikiLinks?.onOpen(target);
    });
  }
}

/** A truly empty note shows the "Start writing…" hint (globals.css owns the
 *  words) instead of a bare cursor that reads as broken. */
const emptyHintPlugin = new Plugin({
  props: {
    decorations(state) {
      const first = state.doc.firstChild;
      if (state.doc.childCount !== 1 || !first || first.type !== noteSchema.nodes.paragraph || first.content.size > 0) {
        return DecorationSet.empty;
      }
      return DecorationSet.create(state.doc, [Decoration.node(0, first.nodeSize, { class: "is-empty-first" })]);
    },
  },
});

/** Raw markdown a melted INLINE atom turns back into, editable in place.
 *  (Block maths edits through its own in-place LaTeX box — see MathBlockView.) */
function meltedText(node: PmNode): string | null {
  if (node.type === noteSchema.nodes.math_inline) return `$${node.attrs.latex as string}$`;
  if (node.type === noteSchema.nodes.wiki_link) {
    const target = node.attrs.target as string;
    const label = node.attrs.label as string | null;
    return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`;
  }
  return null;
}

export function NoteEditor({ className, markdown, noteId, onChange, wikiLinks }: NoteEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // Read inside the ProseMirror callbacks, which are created once per note and
  // would otherwise capture the first render's props forever.
  const latest = useRef({ markdown, onChange, wikiLinks });
  latest.current = { markdown, onChange, wikiLinks };

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    const original = latest.current.markdown;
    const state = EditorState.create({
      doc: markdownToDoc(original),
      plugins: [
        history(),
        emptyHintPlugin,
        inputRules({ rules: [wikiLinkRule, inlineMathRule] }),
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
      // Double-clicking an inline equation or a wiki link melts it back to
      // its raw text so a one-character typo is a direct edit — not a request
      // to the AI. The input rules (or the next reopen) re-form it. Block
      // maths edits itself in place instead (MathBlockView).
      handleDoubleClickOn(editorView, _pos, node, nodePos) {
        const raw = meltedText(node);
        if (raw === null) return false;
        editorView.dispatch(editorView.state.tr.replaceWith(nodePos, nodePos + node.nodeSize, noteSchema.text(raw)));
        return true;
      },
      nodeViews: {
        math_block: (node, editorView, getPos) => new MathBlockView(node, editorView, getPos),
        math_inline: (node) => new MathInlineView(node),
        wiki_link: (node) => new WikiLinkView(node, latest.current.wikiLinks),
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
