"use client";

import { syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate, WidgetType } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

interface LibraryLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
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
  ".cm-wiki-link": { color: "var(--theme-primary)", textDecoration: "underline", textDecorationThickness: "1.5px", textUnderlineOffset: "0.2em" },
  ".cm-obsidian-tag": {
    backgroundColor: "color-mix(in srgb, var(--theme-primary) 13%, transparent)",
    borderRadius: "999px",
    color: "var(--theme-primary)",
    fontWeight: "600",
    padding: "0.08rem 0.42rem",
  },
  ".cm-horizontal-rule": {
    borderTop: "1px solid var(--ui-stroke-secondary)",
    display: "inline-block",
    marginBottom: "0.2rem",
    width: "100%",
  },
  ".cm-list-marker": { color: "var(--ui-text-secondary)", display: "inline-block", minWidth: "0.85rem" },
});

/** Obsidian-style Live Preview: Markdown is stored losslessly, but formatting
 * marks are concealed everywhere except the line containing the selection. */
export function LibraryLiveEditor({ value, onChange }: LibraryLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: value,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        livePreview,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    return () => {
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

  return <div aria-label="Edit note" className="min-h-[38rem] w-full" data-slot="library-live-editor" ref={hostRef} />;
}
