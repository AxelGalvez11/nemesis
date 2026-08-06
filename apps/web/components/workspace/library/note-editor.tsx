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

import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";
import { citationSourceId } from "@/lib/workspace/note-citations";
import { docToMarkdown, markdownToDoc } from "@/lib/workspace/note-doc";
import { hasEdits } from "@/lib/workspace/note-markdown";
import { noteSchema } from "@/lib/workspace/note-schema";

export interface NoteEditorWikiLinks {
  /** Does a note exist for this target? Drives found/uncreated styling. */
  isAvailable: (target: string) => boolean;
  /** Open (or create-then-open) the target — same behaviour as the reader. */
  onOpen: (target: string) => void;
}

/** Clicks on the note's OUTWARD links — owner 2026-08-04: "a research report
 *  should be able to have hyperlinks that route to the source page … clicking
 *  on should reveal a preview". */
export interface NoteEditorLinks {
  /** A link or citation was clicked: an http(s) URL, or "?source=<id>". */
  onOpen: (href: string) => void;
  /** A picture was clicked — the article opens its lightbox. */
  onOpenImage: (src: string, alt: string) => void;
  /**
   * What a Library-source citation should SAY: "Con Law slides · Slide 18".
   *
   * The editor deliberately does not know this. A pill's words come from the
   * source FILE — its name, plus the anchor in the href — and the list of
   * sources belongs to the article, so the article answers and this only draws.
   * Returning null falls back to the bare dot rather than inventing a caption
   * for a source that cannot be found.
   */
  describe?: (href: string) => string | null;
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
  noteLinks?: NoteEditorLinks;
  /** The live view, for the article's toolbar (null again on unmount). */
  onViewReady?: (view: EditorView | null) => void;
  /** Editing focus — what shows and hides the toolbar. Blur is debounced so
   *  a click that lands on the toolbar never counts as leaving. */
  onFocusChange?: (focused: boolean) => void;
  /** Fired after EVERY transaction (caret moves included) so the toolbar's
   *  active states track the selection, not just the text. */
  onTransaction?: () => void;
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

/** A single plain left click, not a modifier gesture or a drag-select. */
function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.detail === 1;
}

function citationNumber(n: number): HTMLElement {
  const span = document.createElement("span");
  span.className = "note-citation-n";
  span.textContent = String(n);
  return span;
}

/**
 * Draw one citation pill into `dom`, replacing whatever was there.
 *
 * Split out of the node view because the pill's WORDS arrive later than the
 * pill does. A Library-source label is looked up from the source file, and the
 * list of sources is fetched after the note opens — but a ProseMirror node view
 * is built once and never asked again, so a pill created in that window would
 * stay a bare dot for the rest of the session. `repaintCitations` below runs
 * this again over the live document the moment the sources land.
 */
function paintCitation(dom: HTMLElement, href: string, n: number, noteLinks: NoteEditorLinks | undefined): void {
  const sourceId = citationSourceId(href);
  const host = sourceId ? null : hostnameOf(href);
  // A Library source gets its NAME and its place in the file — "Con Law slides
  // · Slide 18" — because that is what makes a claim checkable without leaving
  // the sentence. A web citation stays a dot: its identity is the favicon, and
  // a research paragraph would drown in labelled chips.
  const label = sourceId ? (noteLinks?.describe?.(href) ?? null) : null;

  dom.className = label ? "note-citation note-citation-labelled" : "note-citation";
  dom.title = sourceId
    ? `${label ?? "Open this source file"} — click to open it, double-click to edit the citation`
    : `${sourceLabel(href) ?? host ?? href} — double-click to edit the citation`;
  dom.replaceChildren();

  if (sourceId) {
    const glyph = document.createElement("span");
    glyph.className = "codicon codicon-file note-citation-glyph";
    glyph.setAttribute("aria-hidden", "true");
    dom.appendChild(glyph);
    if (label) {
      const text = document.createElement("span");
      text.className = "note-citation-label";
      text.textContent = label;
      dom.appendChild(text);
    }
    return;
  }
  if (host) {
    const icon = document.createElement("img");
    icon.className = "note-citation-favicon";
    icon.alt = sourceLabel(href) ?? host;
    icon.src = faviconUrl(host);
    // A dead favicon service must degrade to the number, not a broken image.
    icon.addEventListener("error", () => { icon.replaceWith(citationNumber(n)); });
    dom.appendChild(icon);
    return;
  }
  dom.appendChild(citationNumber(n));
}

/** Re-draw every citation in the open document. Called when the article learns
 *  something the pills depend on — today, which source files exist. */
function repaintCitations(view: EditorView, noteLinks: NoteEditorLinks | undefined): void {
  view.state.doc.descendants((node, pos) => {
    if (node.type !== noteSchema.nodes.citation) return true;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) paintCitation(dom, node.attrs.href as string, node.attrs.n as number, noteLinks);
    return false;
  });
}

/** A citation pill, atomic in the document. Click opens the source;
 *  double-click melts to raw [n](target) text like a wiki link. */
class CitationView {
  dom: HTMLElement;

  constructor(node: PmNode, noteLinks: NoteEditorLinks | undefined) {
    const href = node.attrs.href as string;
    this.dom = document.createElement("span");
    paintCitation(this.dom, href, node.attrs.n as number, noteLinks);
    this.dom.addEventListener("mousedown", (event) => {
      if (!plainClick(event)) return;
      event.preventDefault();
      noteLinks?.onOpen(href);
    });
  }
}

/** A picture in the note. Click opens the article's lightbox preview; the
 *  node stays atomic, so Backspace removes the whole image cleanly. */
class ImageView {
  dom: HTMLElement;

  constructor(node: PmNode, noteLinks: NoteEditorLinks | undefined) {
    const src = node.attrs.src as string;
    const alt = (node.attrs.alt as string) || "";
    const image = document.createElement("img");
    image.className = "note-image";
    image.src = src;
    image.alt = alt;
    image.title = (node.attrs.title as string | null) ?? "Click to view full size";
    image.addEventListener("mousedown", (event) => {
      if (!plainClick(event)) return;
      event.preventDefault();
      noteLinks?.onOpenImage(src, alt);
    });
    this.dom = image;
  }
}

/** A list item that carries a checkbox (checked true/false — null items are
 *  plain bullets and use the default rendering). The box is real and
 *  clickable; ticking it writes the attribute, which saves as "- [x]". */
class TaskItemView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly plain: boolean;
  private box: HTMLInputElement | null = null;

  constructor(node: PmNode, view: EditorView, getPos: () => number | undefined) {
    this.plain = node.attrs.checked === null;
    const li = document.createElement("li");
    if (this.plain) {
      this.dom = li;
      this.contentDOM = li;
      return;
    }
    li.className = "note-task-item";
    li.dataset.checked = String(node.attrs.checked === true);
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "note-task-box";
    box.checked = node.attrs.checked === true;
    box.contentEditable = "false";
    box.addEventListener("mousedown", (event) => event.preventDefault());
    // No preventDefault here: cancelling a checkbox's click makes the browser
    // REVERT the tick after the handler returns. The native toggle stands,
    // and update() keeps the box aligned with the document from then on.
    box.addEventListener("click", () => {
      const pos = getPos();
      if (pos === undefined) return;
      const current = view.state.doc.nodeAt(pos);
      if (!current) return;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { checked: current.attrs.checked !== true }));
    });
    const content = document.createElement("div");
    content.className = "note-task-content";
    li.append(box, content);
    this.dom = li;
    this.contentDOM = content;
    this.box = box;
  }

  update(node: PmNode): boolean {
    if (node.type !== noteSchema.nodes.list_item) return false;
    // Growing or losing the box changes the DOM shape — rebuild instead.
    if ((node.attrs.checked === null) !== this.plain) return false;
    if (this.box) {
      this.box.checked = node.attrs.checked === true;
      this.dom.dataset.checked = String(node.attrs.checked === true);
    }
    return true;
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
  if (node.type === noteSchema.nodes.citation) return `[${node.attrs.n as number}](${node.attrs.href as string})`;
  if (node.type === noteSchema.nodes.wiki_link) {
    const target = node.attrs.target as string;
    const label = node.attrs.label as string | null;
    return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`;
  }
  return null;
}

export function NoteEditor({ className, markdown, noteId, onChange, wikiLinks, noteLinks, onViewReady, onFocusChange, onTransaction }: NoteEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const blurTimer = useRef<number | null>(null);
  // Read inside the ProseMirror callbacks, which are created once per note and
  // would otherwise capture the first render's props forever.
  const latest = useRef({ markdown, noteLinks, onChange, onFocusChange, onTransaction, onViewReady, wikiLinks });
  latest.current = { markdown, noteLinks, onChange, onFocusChange, onTransaction, onViewReady, wikiLinks };

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
        // The toolbar re-reads active states after every transaction — caret
        // moves included, or Bold would not light up on entering bold text.
        latest.current.onTransaction?.();
        // Only a transaction that CHANGED the document can change the note.
        // Moving the caret must not mark a note dirty.
        if (!transaction.docChanged) return;
        const produced = docToMarkdown(next.doc);
        if (hasEdits(original, produced)) latest.current.onChange(produced);
      },
      // A plain click on ordinary linked text opens the link, the way the
      // wiki-link atoms already behave — the note's links are for FOLLOWING
      // (owner 2026-08-04); the caret still lands anywhere else in the prose.
      handleClick(editorView, pos, event) {
        if (!plainClick(event)) return false;
        const open = latest.current.noteLinks?.onOpen;
        if (!open) return false;
        const clicked = editorView.state.doc.nodeAt(pos);
        const link = clicked?.isText ? clicked.marks.find((mark) => mark.type === noteSchema.marks.link) : undefined;
        if (!link) return false;
        open(link.attrs.href as string);
        return true;
      },
      // Double-clicking an inline equation, wiki link or citation melts it
      // back to its raw text so a one-character typo is a direct edit — not a
      // request to the AI. The input rules (or the next reopen) re-form it.
      // Block maths edits itself in place instead (MathBlockView).
      handleDoubleClickOn(editorView, _pos, node, nodePos) {
        const raw = meltedText(node);
        if (raw === null) return false;
        editorView.dispatch(editorView.state.tr.replaceWith(nodePos, nodePos + node.nodeSize, noteSchema.text(raw)));
        return true;
      },
      nodeViews: {
        citation: (node) => new CitationView(node, latest.current.noteLinks),
        image: (node) => new ImageView(node, latest.current.noteLinks),
        list_item: (node, editorView, getPos) => new TaskItemView(node, editorView, getPos as () => number | undefined),
        math_block: (node, editorView, getPos) => new MathBlockView(node, editorView, getPos),
        math_inline: (node) => new MathInlineView(node),
        wiki_link: (node) => new WikiLinkView(node, latest.current.wikiLinks),
      },
      state,
    });
    view.current = editor;
    latest.current.onViewReady?.(editor);

    // Focus drives the toolbar. Blur waits a beat: moving from the text to a
    // toolbar control (whose mousedown is prevented) must not read as leaving
    // the note, and the fade needs to lose the race against a re-focus.
    const clearBlurTimer = () => {
      if (blurTimer.current !== null) {
        window.clearTimeout(blurTimer.current);
        blurTimer.current = null;
      }
    };
    const onFocus = () => {
      clearBlurTimer();
      latest.current.onFocusChange?.(true);
    };
    const onBlur = () => {
      clearBlurTimer();
      blurTimer.current = window.setTimeout(() => {
        blurTimer.current = null;
        latest.current.onFocusChange?.(false);
      }, 120);
    };
    editor.dom.addEventListener("focus", onFocus);
    editor.dom.addEventListener("blur", onBlur);

    return () => {
      editor.dom.removeEventListener("focus", onFocus);
      editor.dom.removeEventListener("blur", onBlur);
      clearBlurTimer();
      latest.current.onFocusChange?.(false);
      latest.current.onViewReady?.(null);
      editor.destroy();
      view.current = null;
    };
    // 🔴 KEYED ON THE NOTE, NOT ON ITS TEXT. Rebuilding on every keystroke
    // would destroy and recreate the editor mid-word, losing the caret and the
    // undo history. The document is seeded once when the note opens; after
    // that the editor owns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // A citation pill's words come from the source FILE, and the list of source
  // files is fetched after the note opens. Node views are built once, so
  // without this every pill drawn during that window would stay a bare dot for
  // the rest of the session. Repainting touches only the pills — the document,
  // the selection and the undo history are untouched.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    repaintCitations(editor, latest.current.noteLinks);
  }, [noteLinks?.describe]);

  return <div className={className} ref={host} />;
}
