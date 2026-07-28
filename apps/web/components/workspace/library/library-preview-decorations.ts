import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

import { tableDecorations } from "./library-table-widget";

// Obsidian-grade live preview for the Library editor (owner 2026-07-21):
// edit mode reads like read mode. Block dress (quote bars, code-block boxes)
// stays on even while the cursor is inside; only the marker characters come
// and go.
//
// SYNTAX IS NOW ALWAYS HIDDEN — owner 2026-07-28: "the library still shows
// markdown language when the cursor is beside it, any markdown language should
// be hidden."
//
// The original rule revealed the markers of whichever ELEMENT the caret was
// touching, which is what Obsidian does and what an editor-literate user
// expects. It is the wrong default here: the point of this editor is that a
// student never learns what `##` means, and a student who has never seen the
// syntax reads its sudden appearance as the note breaking. The formatting
// toolbar and the "/" menu are how blocks get made now, so nothing depends on
// the markers being reachable.
//
// Kept as a named switch rather than deleted because every reveal path in this
// file routes through `touches()`; flipping this back restores the Obsidian
// behaviour exactly, and leaves the reasoning above with it.
const REVEAL_SYNTAX_AT_CURSOR = false;

const hiddenSyntax = Decoration.replace({});
const wikiLink = Decoration.mark({ class: "cm-wiki-link" });
const obsidianTag = Decoration.mark({ class: "cm-obsidian-tag" });
const obsidianHighlight = Decoration.mark({ class: "cm-obsidian-highlight" });
const inlineCode = Decoration.mark({ class: "cm-inline-code" });
const underlineMark = Decoration.mark({ class: "cm-underline" });
const linkText = Decoration.mark({ class: "cm-md-link" });

/** Marks revealed per parent ELEMENT (cursor anywhere inside the span). */
const ELEMENT_MARKS = new Set(["EmphasisMark", "StrikethroughMark"]);
/** Marks revealed per LINE (they lead a whole line: `#`, `>`). The quote
 *  marker's node name in lezer-markdown is QuoteMark, not BlockquoteMark. */
const LINE_MARKS = new Set(["HeaderMark", "QuoteMark"]);

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

  override eq(other: ListMarkerWidget) {
    return other.label === this.label;
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-list-marker";
    marker.textContent = /^\d/.test(this.label) ? this.label.replace(/[.)]$/, ".") : "•";
    marker.setAttribute("aria-hidden", "true");
    return marker;
  }
}

function previewDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const state = view.state;
  const doc = state.doc;
  // The single gate every reveal path in this file goes through. With
  // REVEAL_SYNTAX_AT_CURSOR off it is constant false, so markers are hidden
  // whether or not the editor has focus and wherever the caret sits.
  const touches = (from: number, to: number): boolean =>
    REVEAL_SYNTAX_AT_CURSOR
    && view.hasFocus
    && state.selection.ranges.some((range) => range.to >= from && range.from <= to);
  const lineTouched = (pos: number): boolean => {
    const line = doc.lineAt(pos);
    return touches(line.from, line.to);
  };
  /** Code spans/blocks where literal-syntax regexes must not fire. */
  const codeRanges: Array<{ from: number; to: number }> = [];
  const inCode = (from: number, to: number) => codeRanges.some((code) => from < code.to && to > code.from);

  syntaxTree(state).iterate({
    enter(node) {
      const name = node.name;

      if (/^ATXHeading[1-6]$/.test(name)) {
        ranges.push(Decoration.line({ attributes: { class: `cm-${name.toLowerCase()}` } }).range(doc.lineAt(node.from).from));
        return;
      }

      // Block dress applies unconditionally; markers below handle reveal.
      if (name === "Blockquote") {
        const first = doc.lineAt(node.from).number;
        const last = doc.lineAt(node.to).number;
        for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
          ranges.push(Decoration.line({ attributes: { class: "cm-blockquote" } }).range(doc.line(lineNumber).from));
        }
        return;
      }
      if (name === "FencedCode" || name === "CodeBlock") {
        codeRanges.push({ from: node.from, to: node.to });
        const first = doc.lineAt(node.from).number;
        const last = doc.lineAt(node.to).number;
        for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
          const edge = lineNumber === first ? " cm-codeblock-first" : lineNumber === last ? " cm-codeblock-last" : "";
          ranges.push(Decoration.line({ attributes: { class: `cm-codeblock${edge}` } }).range(doc.line(lineNumber).from));
        }
        return;
      }

      if (name === "InlineCode") {
        codeRanges.push({ from: node.from, to: node.to });
        ranges.push(inlineCode.range(node.from, node.to));
        return;
      }

      if (name === "Link") {
        if (touches(node.from, node.to)) return;
        // Hide the bracket/paren marks and the URL, keep the label styled.
        let cursor = node.node.firstChild;
        while (cursor) {
          if (cursor.name === "LinkMark" || cursor.name === "URL") ranges.push(hiddenSyntax.range(cursor.from, cursor.to));
          cursor = cursor.nextSibling;
        }
        ranges.push(linkText.range(node.from, node.to));
        return;
      }

      if (name === "CodeMark" || name === "CodeInfo") {
        // Fence backticks and the language tag reveal with the cursor on
        // their own line; inline-code backticks with the cursor in the span.
        const parent = node.node.parent;
        const revealed = parent?.name === "InlineCode" ? touches(parent.from, parent.to) : lineTouched(node.from);
        if (!revealed) ranges.push(hiddenSyntax.range(node.from, node.to));
        return;
      }

      if (ELEMENT_MARKS.has(name)) {
        const parent = node.node.parent;
        if (parent && !touches(parent.from, parent.to)) ranges.push(hiddenSyntax.range(node.from, node.to));
        return;
      }

      if (LINE_MARKS.has(name)) {
        if (!lineTouched(node.from)) {
          // Take the following space with the marker so hidden `# ` / `> `
          // doesn't leave a stray indent.
          const trailing = doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0;
          ranges.push(hiddenSyntax.range(node.from, node.to + trailing));
        }
        return;
      }

      if (name === "HorizontalRule") {
        if (!lineTouched(node.from)) {
          ranges.push(Decoration.replace({ widget: new HorizontalRuleWidget(), block: false }).range(node.from, node.to));
        }
        return;
      }

      if (name === "ListMark") {
        if (!lineTouched(node.from)) {
          const raw = doc.sliceString(node.from, node.to);
          ranges.push(Decoration.replace({ widget: new ListMarkerWidget(raw) }).range(node.from, node.to));
        }
      }
    },
  });

  // Literal constructs the markdown tree doesn't model: wikilinks, tags,
  // ==highlights==, <u>underline</u>. Element-scoped reveal via match range.
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const raw = line.text;

    for (const match of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
      if (match.index === undefined || !match[1]) continue;
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (inCode(from, to) || touches(from, to)) continue;
      ranges.push(hiddenSyntax.range(from, from + 2));
      ranges.push(wikiLink.range(from + 2, from + 2 + match[1].length));
      ranges.push(hiddenSyntax.range(to - 2, to));
    }

    for (const match of raw.matchAll(/(?:^|\s)(#[\p{L}\d_-]+)/gu)) {
      if (match.index === undefined || !match[1]) continue;
      const from = line.from + match.index + match[0].length - match[1].length;
      const to = from + match[1].length;
      if (inCode(from, to)) continue;
      ranges.push(obsidianTag.range(from, to));
    }

    for (const match of raw.matchAll(/==([^=\n]+)==/g)) {
      if (match.index === undefined || !match[1]) continue;
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (inCode(from, to)) continue;
      if (touches(from, to)) {
        ranges.push(obsidianHighlight.range(from + 2, to - 2));
        continue;
      }
      ranges.push(hiddenSyntax.range(from, from + 2));
      ranges.push(obsidianHighlight.range(from + 2, to - 2));
      ranges.push(hiddenSyntax.range(to - 2, to));
    }

    for (const match of raw.matchAll(/<u>([^<\n]*)<\/u>/g)) {
      if (match.index === undefined) continue;
      const from = line.from + match.index;
      const to = from + match[0].length;
      const innerFrom = from + 3;
      const innerTo = to - 4;
      if (inCode(from, to) || touches(from, to)) continue;
      ranges.push(hiddenSyntax.range(from, innerFrom));
      if (innerTo > innerFrom) ranges.push(underlineMark.range(innerFrom, innerTo));
      ranges.push(hiddenSyntax.range(innerTo, to));
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = previewDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
        this.decorations = previewDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// Block replacements must come from a StateField (view plugins may not supply
// block decorations). Recomputed on doc/selection changes AND when the async
// markdown parse advances (tree identity changes), so a table that finishes
// parsing after mount still renders without user input.
export const liveTables = StateField.define<DecorationSet>({
  create: tableDecorations,
  update(value, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)) return tableDecorations(tr.state);
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    // Rendered tables are atomic for cursor motion: one arrow press jumps the
    // whole block instead of stranding an invisible caret inside it.
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});
