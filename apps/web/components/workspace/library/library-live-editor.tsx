"use client";

import { indentLess, indentMore } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, ViewPlugin, type DecorationSet, type ViewUpdate, WidgetType } from "@codemirror/view";
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

const HIDDEN_MARKS = new Set([
  "BlockquoteMark",
  "CodeMark",
  "EmphasisMark",
  "HeaderMark",
  "LinkMark",
  "StrikethroughMark",
  "StrongEmphasisMark",
]);

const hiddenSyntax = Decoration.replace({});
const wikiLink = Decoration.mark({ class: "cm-wiki-link" });
const obsidianTag = Decoration.mark({ class: "cm-obsidian-tag" });
const obsidianHighlight = Decoration.mark({ class: "cm-obsidian-highlight" });

/** Strip inline markdown marks for table-cell display (the widget is
 *  read-only; clicking it reveals the raw syntax for editing). */
function displayCellText(raw: string): string {
  return raw
    .trim()
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?u>/g, "");
}

/** Split one markdown table row into cells (leading/trailing pipes dropped,
 *  escaped pipes kept). */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "\\" && trimmed[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function columnAlignments(delimiter: string): Array<"left" | "center" | "right"> {
  return splitTableRow(delimiter).map((cell) => {
    const spec = cell.trim();
    if (spec.startsWith(":") && spec.endsWith(":")) return "center";
    if (spec.endsWith(":")) return "right";
    return "left";
  });
}

/** Rendered GFM table shown while the cursor is OUTSIDE the table block.
 *  Clicking a row moves the cursor to that row, which swaps back to syntax. */
class MarkdownTableWidget extends WidgetType {
  constructor(private readonly source: string, private readonly from: number) { super(); }

  override eq(other: MarkdownTableWidget) {
    return other.source === this.source && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const lines = this.source.split("\n");
    const aligns = columnAlignments(lines[1] ?? "");
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table";
    const table = document.createElement("table");

    let offset = 0;
    lines.forEach((line, lineIndex) => {
      if (lineIndex === 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(line)) {
        offset += line.length + 1;
        return;
      }
      const row = document.createElement("tr");
      row.dataset.offset = String(offset);
      for (const [cellIndex, cell] of splitTableRow(line).entries()) {
        const el = document.createElement(lineIndex === 0 ? "th" : "td");
        el.textContent = displayCellText(cell);
        el.style.textAlign = aligns[cellIndex] ?? "left";
        row.appendChild(el);
      }
      (lineIndex === 0 ? table.createTHead() : table.tBodies[0] ?? table.createTBody()).appendChild(row);
      offset += line.length + 1;
    });

    wrap.appendChild(table);
    wrap.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const rowEl = (event.target as HTMLElement).closest("tr");
      const rowOffset = Number(rowEl?.dataset.offset ?? 0);
      const anchor = Math.min(this.from + rowOffset, view.state.doc.length);
      view.dispatch({ selection: { anchor } });
      view.focus();
    });
    return wrap;
  }
}

function tableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const touched = state.selection.ranges.some((range) => range.from <= node.to && range.to >= node.from);
      if (touched) return;
      const source = state.doc.sliceString(node.from, node.to);
      ranges.push(Decoration.replace({ block: true, widget: new MarkdownTableWidget(source, node.from) }).range(node.from, node.to));
    },
  });
  return Decoration.set(ranges, true);
}

// Block replacements must come from a StateField (view plugins may not supply
// block decorations). Recomputed on doc/selection changes AND when the async
// markdown parse advances (tree identity changes), so a table that finishes
// parsing after mount still renders without user input.
const liveTables = StateField.define<DecorationSet>({
  create: tableDecorations,
  update(value, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)) return tableDecorations(tr.state);
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-horizontal-rule";
    rule.setAttribute("aria-hidden", "true");
    return rule;
  }
}

class ListMarkerWidget extends WidgetType {
  constructor(private readonly label: string) { super(); }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-list-marker";
    marker.textContent = /^\d/.test(this.label) ? this.label.replace(/[.)]$/, ".") : "•";
    marker.setAttribute("aria-hidden", "true");
    return marker;
  }
}

function selectedLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const start = view.state.doc.lineAt(range.from).number;
    const end = view.state.doc.lineAt(range.to).number;
    for (let line = start; line <= end; line += 1) lines.add(line);
  }
  return lines;
}

function previewDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const activeLines = selectedLines(view);
  const doc = view.state.doc;

  syntaxTree(view.state).iterate({
    enter(node) {
      const line = doc.lineAt(node.from);
      const active = activeLines.has(line.number);

      if (/^ATXHeading[1-6]$/.test(node.name)) {
        ranges.push(Decoration.line({ attributes: { class: `cm-${node.name.toLowerCase()}` } }).range(line.from));
      }

      if (active) return;
      if (HIDDEN_MARKS.has(node.name)) ranges.push(hiddenSyntax.range(node.from, node.to));
      if (node.name === "HorizontalRule") {
        ranges.push(Decoration.replace({ widget: new HorizontalRuleWidget(), block: false }).range(node.from, node.to));
      }
      if (node.name === "ListMark") {
        const raw = doc.sliceString(node.from, node.to);
        ranges.push(Decoration.replace({ widget: new ListMarkerWidget(raw) }).range(node.from, node.to));
      }
    },
  });

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    if (activeLines.has(lineNumber)) continue;
    const line = doc.line(lineNumber);
    const raw = line.text;

    for (const match of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
      if (match.index === undefined || !match[1]) continue;
      const from = line.from + match.index;
      ranges.push(hiddenSyntax.range(from, from + 2));
      ranges.push(wikiLink.range(from + 2, from + 2 + match[1].length));
      ranges.push(hiddenSyntax.range(from + match[0].length - 2, from + match[0].length));
    }

    for (const match of raw.matchAll(/(?:^|\s)(#[\p{L}\d_-]+)/gu)) {
      if (match.index === undefined || !match[1]) continue;
      const from = line.from + match.index + match[0].length - match[1].length;
      ranges.push(obsidianTag.range(from, from + match[1].length));
    }

    for (const match of raw.matchAll(/==([^=\n]+)==/g)) {
      if (match.index === undefined || !match[1]) continue;
      const from = line.from + match.index;
      ranges.push(hiddenSyntax.range(from, from + 2));
      ranges.push(obsidianHighlight.range(from + 2, from + 2 + match[1].length));
      ranges.push(hiddenSyntax.range(from + match[0].length - 2, from + match[0].length));
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = previewDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = previewDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "var(--conversation-text-font-size)",
    minHeight: "38rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    lineHeight: "var(--dt-line-height)",
    overflow: "visible",
  },
  ".cm-content": { caretColor: "var(--foreground)", padding: "0.25rem" },
  ".cm-line": { padding: "0", transition: "font-size 120ms ease, line-height 120ms ease" },
  ".cm-gutters": { display: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--theme-primary) 22%, transparent) !important",
  },
  ".cm-atxheading1": { fontSize: "2rem", fontWeight: "750", lineHeight: "1.2", paddingTop: "0.9rem", paddingBottom: "0.4rem" },
  ".cm-atxheading2": { fontSize: "1.55rem", fontWeight: "720", lineHeight: "1.25", paddingTop: "0.75rem", paddingBottom: "0.3rem" },
  ".cm-atxheading3": { fontSize: "1.25rem", fontWeight: "700", lineHeight: "1.3", paddingTop: "0.6rem", paddingBottom: "0.25rem" },
  ".cm-atxheading4": { fontSize: "1.08rem", fontWeight: "680", lineHeight: "1.35", paddingTop: "0.45rem" },
  ".cm-atxheading5, .cm-atxheading6": { fontSize: "1rem", fontWeight: "650", paddingTop: "0.35rem" },
  ".cm-atxheading1, .cm-atxheading2, .cm-atxheading3, .cm-atxheading4, .cm-atxheading5, .cm-atxheading6, .cm-atxheading1 *, .cm-atxheading2 *, .cm-atxheading3 *, .cm-atxheading4 *, .cm-atxheading5 *, .cm-atxheading6 *": {
    textDecoration: "none !important",
  },
  ".cm-wiki-link": { color: "var(--theme-primary)", textDecoration: "underline", textDecorationThickness: "1.5px", textUnderlineOffset: "0.2em" },
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
  ".cm-horizontal-rule": {
    borderTop: "1px solid var(--ui-stroke-secondary)",
    display: "inline-block",
    marginBottom: "0.2rem",
    width: "100%",
  },
  ".cm-list-marker": { color: "var(--ui-text-secondary)", display: "inline-block", minWidth: "0.85rem" },
  ".cm-md-table": { cursor: "pointer", overflowX: "auto", padding: "0.35rem 0" },
  ".cm-md-table table": { borderCollapse: "collapse", fontSize: "0.925em", width: "100%" },
  ".cm-md-table th, .cm-md-table td": {
    border: "1px solid var(--ui-stroke-secondary)",
    padding: "0.4rem 0.65rem",
    verticalAlign: "top",
  },
  ".cm-md-table th": {
    backgroundColor: "color-mix(in srgb, var(--ui-base) 5%, transparent)",
    fontWeight: "650",
  },
  ".cm-md-table tr:hover td": { backgroundColor: "color-mix(in srgb, var(--ui-base) 3%, transparent)" },
});

type InlineFormat = "bold" | "italic" | "underline" | "link" | "code" | "highlight";

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

function formatInline(view: EditorView, format: InlineFormat) {
  if (format === "bold") wrapSelection(view, "**", "**", "bold text");
  else if (format === "italic") wrapSelection(view, "*", "*", "italic text");
  else if (format === "underline") wrapSelection(view, "<u>", "</u>", "underlined text");
  else if (format === "code") wrapSelection(view, "`", "`", "code");
  else if (format === "highlight") wrapSelection(view, "==", "==", "highlighted text");
  else wrapSelection(view, "[", "](https://)", "link text");
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
      <ToolbarButton label="Bold" onClick={() => run((view) => formatInline(view, "bold"))}><IconBold /></ToolbarButton>
      <ToolbarButton label="Italic" onClick={() => run((view) => formatInline(view, "italic"))}><IconItalic /></ToolbarButton>
      <ToolbarButton label="Underline" onClick={() => run((view) => formatInline(view, "underline"))}><IconUnderline /></ToolbarButton>
      <ToolbarButton label="Highlight" onClick={() => run((view) => formatInline(view, "highlight"))}><IconHighlight /></ToolbarButton>
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-(--ui-stroke-tertiary)" />
      <ToolbarButton label="Bulleted list" onClick={() => run((view) => applyLinePrefix(view, "- "))}><IconList /></ToolbarButton>
      <ToolbarButton label="Numbered list" onClick={() => run((view) => applyLinePrefix(view, "", true))}><IconListNumbers /></ToolbarButton>
      <ToolbarButton label="Link" onClick={() => run((view) => formatInline(view, "link"))}><IconLink /></ToolbarButton>
      <ToolbarButton label="Inline code" onClick={() => run((view) => formatInline(view, "code"))}><IconCode /></ToolbarButton>
      <ToolbarButton label="Quote" onClick={() => run((view) => applyLinePrefix(view, "> "))}><IconBlockquote /></ToolbarButton>
      <ToolbarButton label="Divider" onClick={() => run((view) => insertBlock(view, "\n---\n"))}><IconMinus /></ToolbarButton>
      <ToolbarButton label="Table" onClick={() => run((view) => insertBlock(view, "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |"))}><IconTable /></ToolbarButton>
    </div>
  );
}

function ToolbarButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return <Button aria-label={label} className="shrink-0" onClick={onClick} size="icon-xs" title={label} type="button" variant="ghost">{children}</Button>;
}

/** Obsidian-style Live Preview: Markdown is stored losslessly, but formatting
 * marks are concealed everywhere except the line containing the selection. */
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
