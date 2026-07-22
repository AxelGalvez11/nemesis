"use client";

import { indentLess, indentMore } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import {
  IconBlockquote,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconHighlight,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconMinus,
  IconTable,
  IconUnderline,
} from "@tabler/icons-react";
import { basicSetup } from "codemirror";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/desktop-ui/button";
import { toggleInlineFormat, type ToggleFormat } from "@/lib/workspace/library-inline-format";

import { livePreview, liveTables } from "./library-preview-decorations";

/** Imperative surface the parent uses to drive the editor (TOC clicks). */
export interface LibraryEditorApi {
  scrollToHeading: (label: string) => void;
}

interface LibraryLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  showToolbar?: boolean;
  apiRef?: RefObject<LibraryEditorApi | null>;
}

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "hsl(var(--foreground))",
    fontSize: "var(--conversation-text-font-size)",
    minHeight: "38rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    lineHeight: "var(--dt-line-height)",
    overflow: "visible",
  },
  // The content area must fill the editor's height itself: percentage heights
  // don't resolve against the root's min-height, so on a short/new note the
  // editable region is one line tall and a click in the empty area below lands
  // outside it — blurring the editor and hiding the caret. With the min-height
  // here, that click hits the content and places the caret at the end.
  ".cm-content": { caretColor: "hsl(var(--foreground))", minHeight: "38rem", padding: "0.25rem" },
  // The caretColor above is defensive only: basicSetup bundles drawSelection,
  // which hides the native caret (caret-color: transparent !important) and
  // paints its own .cm-cursor instead. That cursor's colour comes from
  // CodeMirror's light/dark flag, and this theme is never marked dark, so CM
  // fell back to its light default — a BLACK cursor, invisible on a dark page.
  // Drive it from --foreground so it tracks the app theme (white on dark,
  // black on light). !important because CM's own rule is equally specific.
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--foreground)) !important" },
  ".cm-line": { padding: "0", transition: "font-size 120ms ease, line-height 120ms ease" },
  ".cm-gutters": { display: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--theme-primary) 22%, transparent) !important",
  },
  // Heading sizes/weights measured off read mode (library-main's overrides:
  // h1 text-4xl bold, h2 2xl, h3 xl, h4 base) so the two modes match.
  ".cm-atxheading1": { fontSize: "2.25rem", fontWeight: "700", lineHeight: "1.15", paddingTop: "0.9rem", paddingBottom: "0.4rem" },
  ".cm-atxheading2": { fontSize: "1.5rem", fontWeight: "700", lineHeight: "1.25", paddingTop: "0.75rem", paddingBottom: "0.3rem" },
  ".cm-atxheading3": { fontSize: "1.25rem", fontWeight: "600", lineHeight: "1.3", paddingTop: "0.6rem", paddingBottom: "0.25rem" },
  ".cm-atxheading4": { fontSize: "1rem", fontWeight: "600", lineHeight: "1.35", paddingTop: "0.45rem" },
  ".cm-atxheading5, .cm-atxheading6": { fontSize: "1rem", fontWeight: "600", paddingTop: "0.35rem" },
  ".cm-atxheading1, .cm-atxheading2, .cm-atxheading3, .cm-atxheading4, .cm-atxheading5, .cm-atxheading6, .cm-atxheading1 *, .cm-atxheading2 *, .cm-atxheading3 *, .cm-atxheading4 *, .cm-atxheading5 *, .cm-atxheading6 *": {
    textDecoration: "none !important",
  },
  ".cm-wiki-link": { color: "var(--theme-primary)", textDecoration: "underline", textDecorationThickness: "1.5px", textUnderlineOffset: "0.2em" },
  ".cm-md-link": { color: "var(--theme-primary)", textDecoration: "underline", textDecorationThickness: "1.5px", textUnderlineOffset: "0.2em" },
  ".cm-underline": { textDecoration: "underline", textUnderlineOffset: "0.2em" },
  ".cm-obsidian-tag": {
    backgroundColor: "color-mix(in srgb, var(--theme-primary) 13%, transparent)",
    borderRadius: "999px",
    color: "var(--theme-primary)",
    fontWeight: "600",
    padding: "0.08rem 0.42rem",
  },
  ".cm-obsidian-highlight": {
    backgroundColor: "color-mix(in srgb, var(--theme-primary) 24%, transparent)",
    borderRadius: "0.2rem",
    boxDecorationBreak: "clone",
    padding: "0.04rem 0.12rem",
  },
  // Read-mode parity, measured off the rendered article (chat-markdown.tsx).
  // The app's --border/--muted-foreground variables are HSL component
  // triples, so every use needs the hsl() wrapper.
  ".cm-blockquote": {
    borderInlineStart: "2px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
    fontStyle: "italic",
    paddingInlineStart: "0.75rem",
  },
  ".cm-codeblock": {
    backgroundColor: "color-mix(in srgb, var(--ui-base) 5%, transparent)",
    borderLeft: "1px solid hsl(var(--border))",
    borderRight: "1px solid hsl(var(--border))",
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    fontSize: "0.8em",
    paddingInline: "0.625rem",
  },
  ".cm-codeblock-first": {
    borderTop: "1px solid hsl(var(--border))",
    borderTopLeftRadius: "0.375rem",
    borderTopRightRadius: "0.375rem",
    marginTop: "0.5rem",
  },
  ".cm-codeblock-last": {
    borderBottom: "1px solid hsl(var(--border))",
    borderBottomLeftRadius: "0.375rem",
    borderBottomRightRadius: "0.375rem",
    marginBottom: "0.5rem",
  },
  // Read mode's inline code is mono with no fill (prose-code) — match it.
  ".cm-inline-code": {
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    fontSize: "0.9em",
    padding: "0 0.1875rem",
  },
  ".cm-horizontal-rule": {
    borderTop: "1px solid var(--ui-stroke-secondary)",
    display: "inline-block",
    marginBottom: "0.2rem",
    width: "100%",
  },
  ".cm-list-marker": { color: "var(--ui-text-secondary)", display: "inline-block", minWidth: "0.85rem" },
  // Table skin copied from read mode: bordered rounded wrapper, header wash,
  // horizontal row separators only — no vertical cell grid.
  ".cm-md-table": {
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.375rem",
    margin: "0.45rem 0",
    overflowX: "auto",
  },
  ".cm-md-table table": { borderCollapse: "collapse", fontSize: "0.8125rem", width: "100%" },
  ".cm-md-table thead": { backgroundColor: "color-mix(in srgb, var(--ui-base) 5%, transparent)" },
  ".cm-md-table tr": { borderBottom: "1px solid hsl(var(--border))" },
  ".cm-md-table tbody tr:last-child": { borderBottom: "none" },
  ".cm-md-table th, .cm-md-table td": {
    minWidth: "2.5rem",
    padding: "0.375rem 0.625rem",
    verticalAlign: "top",
  },
  ".cm-md-table th": {
    color: "hsl(var(--muted-foreground))",
    fontSize: "0.75rem",
    fontWeight: "500",
    whiteSpace: "nowrap",
  },
  // The per-cell <input> disappears into the cell until focused.
  ".cm-md-table th input, .cm-md-table td input": {
    backgroundColor: "transparent",
    border: "none",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    outline: "none",
    padding: "0",
    width: "100%",
  },
  ".cm-md-table th:focus-within, .cm-md-table td:focus-within": {
    outline: "2px solid color-mix(in srgb, var(--theme-primary) 55%, transparent)",
    outlineOffset: "-2px",
  },
});

function runToggle(view: EditorView, format: ToggleFormat) {
  const result = toggleInlineFormat(view.state, format);
  view.dispatch({
    changes: result.changes,
    scrollIntoView: true,
    selection: { anchor: result.selection.anchor, head: result.selection.head ?? result.selection.anchor },
  });
  view.focus();
}

function wrapSelection(view: EditorView, before: string, after: string, placeholder: string) {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const body = selected || placeholder;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${body}${after}` },
    selection: { anchor: range.from + before.length, head: range.from + before.length + body.length },
    scrollIntoView: true,
  });
  view.focus();
}

function applyLinePrefix(view: EditorView, prefix: string, numbered = false) {
  const range = view.state.selection.main;
  const first = view.state.doc.lineAt(range.from);
  const last = view.state.doc.lineAt(range.to);
  const lines: string[] = [];
  for (let lineNumber = first.number; lineNumber <= last.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const clean = line.text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s+|#{1,6}\s+)/, "");
    lines.push(`${numbered ? `${lineNumber - first.number + 1}. ` : prefix}${clean}`);
  }
  const insert = lines.join("\n");
  view.dispatch({
    changes: { from: first.from, to: last.to, insert },
    selection: { anchor: first.from, head: first.from + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

function insertBlock(view: EditorView, block: string) {
  const range = view.state.selection.main;
  const before = range.from > 0 && view.state.doc.sliceString(range.from - 1, range.from) !== "\n" ? "\n" : "";
  const after = range.to < view.state.doc.length && view.state.doc.sliceString(range.to, range.to + 1) !== "\n" ? "\n" : "";
  const insert = `${before}${block}${after}`;
  view.dispatch({ changes: { from: range.from, to: range.to, insert }, selection: { anchor: range.from + insert.length }, scrollIntoView: true });
  view.focus();
}

function EditingToolbar({ viewRef }: { viewRef: RefObject<EditorView | null> }) {
  const run = (action: (view: EditorView) => void) => {
    const view = viewRef.current;
    if (view) action(view);
  };
  return (
    // Neutral fill on purpose (no accent mix — owner 2026-07-20) and sticky so
    // the toolbar rides just under the note header while the note scrolls.
    <div aria-label="Note formatting" className="sticky top-0 z-20 mb-3 flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-[color-mix(in_srgb,var(--ui-base)_14%,transparent)] bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] p-1 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar">
      <ToolbarButton label="Heading 1" onClick={() => run((view) => applyLinePrefix(view, "# "))}><IconH1 /></ToolbarButton>
      <ToolbarButton label="Heading 2" onClick={() => run((view) => applyLinePrefix(view, "## "))}><IconH2 /></ToolbarButton>
      <ToolbarButton label="Heading 3" onClick={() => run((view) => applyLinePrefix(view, "### "))}><IconH3 /></ToolbarButton>
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-(--ui-stroke-tertiary)" />
      <ToolbarButton label="Bold" onClick={() => run((view) => runToggle(view, "bold"))}><IconBold /></ToolbarButton>
      <ToolbarButton label="Italic" onClick={() => run((view) => runToggle(view, "italic"))}><IconItalic /></ToolbarButton>
      <ToolbarButton label="Underline" onClick={() => run((view) => runToggle(view, "underline"))}><IconUnderline /></ToolbarButton>
      <ToolbarButton label="Highlight" onClick={() => run((view) => runToggle(view, "highlight"))}><IconHighlight /></ToolbarButton>
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-(--ui-stroke-tertiary)" />
      <ToolbarButton label="Bulleted list" onClick={() => run((view) => applyLinePrefix(view, "- "))}><IconList /></ToolbarButton>
      <ToolbarButton label="Numbered list" onClick={() => run((view) => applyLinePrefix(view, "", true))}><IconListNumbers /></ToolbarButton>
      <ToolbarButton label="Link" onClick={() => run((view) => wrapSelection(view, "[", "](https://)", "link text"))}><IconLink /></ToolbarButton>
      <ToolbarButton label="Inline code" onClick={() => run((view) => runToggle(view, "code"))}><IconCode /></ToolbarButton>
      <ToolbarButton label="Quote" onClick={() => run((view) => applyLinePrefix(view, "> "))}><IconBlockquote /></ToolbarButton>
      <ToolbarButton label="Divider" onClick={() => run((view) => insertBlock(view, "\n---\n"))}><IconMinus /></ToolbarButton>
      <ToolbarButton label="Table" onClick={() => run((view) => insertBlock(view, "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |"))}><IconTable /></ToolbarButton>
    </div>
  );
}

function ToolbarButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <Button
      aria-label={label}
      className="shrink-0"
      onClick={onClick}
      // Keep focus (and the selection the command acts on) in the editor —
      // otherwise every toolbar press blurs it, which also flashes the
      // live preview's unfocused fully-rendered state.
      onMouseDown={(event) => event.preventDefault()}
      size="icon-xs"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

/** Obsidian-style Live Preview: Markdown is stored losslessly, but syntax is
 * concealed everywhere except the ELEMENT the selection touches — see
 * library-preview-decorations.ts. Tables render (and edit) in place — see
 * library-table-widget.ts. */
export function LibraryLiveEditor({ value, onChange, autoFocus = false, showToolbar = false, apiRef }: LibraryLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      scrollToHeading: (label: string) => {
        const view = viewRef.current;
        if (!view) return;
        const target = label.trim().toLowerCase();
        for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
          const line = view.state.doc.line(lineNumber);
          const match = /^#{1,6}\s+(.*)$/.exec(line.text);
          if (match?.[1]?.trim().toLowerCase() === target) {
            // The editor auto-grows, so the scrolling element is a page
            // ancestor — CodeMirror's scroll effects can't reach it. Dispatch
            // applies the DOM update synchronously, so resolve the line's DOM
            // node and scroll the ancestor in the same tick (no rAF: throttled
            // frames, e.g. background panes, would swallow the callback).
            view.dispatch({ selection: { anchor: line.from } });
            const domPos = view.domAtPos(line.from);
            const base: Element | null = domPos.node instanceof Element ? domPos.node : domPos.node.parentElement;
            const lineEl = base?.closest(".cm-line") ?? base;
            if (!(lineEl instanceof HTMLElement)) return;
            let scroller: HTMLElement | null = lineEl.parentElement;
            while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
            if (!scroller) return;
            // 64px clears the sticky toolbar so the heading stays visible.
            scroller.scrollTop += lineEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 64;
            view.focus();
            return;
          }
        }
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: value,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        // GFM base so pipe tables parse as Table nodes (liveTables renders them).
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        keymap.of([
          { key: "Tab", run: indentMore },
          { key: "Shift-Tab", run: indentLess },
        ]),
        livePreview,
        liveTables,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    let focusTimer: number | null = null;
    if (autoFocus) focusTimer = window.setTimeout(() => {
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
      view.focus();
    }, 120);
    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      viewRef.current = null;
      view.destroy();
    };
    // The parent keys this component by note id, so initialization only belongs here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div className="min-h-[38rem] w-full">
      {showToolbar && <EditingToolbar viewRef={viewRef} />}
      <div aria-label="Edit note" className="min-h-[38rem] w-full" data-slot="library-live-editor" ref={hostRef} />
    </div>
  );
}
