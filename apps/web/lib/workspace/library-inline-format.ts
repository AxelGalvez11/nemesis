// Toggle-style inline formatting for the Library editor's toolbar: one click
// wraps the selection (or the word under a bare cursor), a second click on
// already-formatted text removes the same format instead of stacking another
// layer of syntax (owner 2026-07-21). Bold/italic/code resolve through the
// markdown syntax tree so `*` vs `**` never mis-detects; highlight `==…==`
// and underline `<u>…</u>` (which the tree doesn't model) resolve by line
// scan. Pure state-in/spec-out so the whole matrix is unit-testable.

import { ensureSyntaxTree } from "@codemirror/language";
import type { ChangeSpec, EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export type ToggleFormat = "bold" | "italic" | "code" | "highlight" | "underline";

interface FormatSpec {
  /** Syntax-tree node that represents this format, when the tree models it. */
  nodeName?: string;
  /** Delimiter pair used when wrapping (and for textual fallback detection). */
  before: string;
  after: string;
  /** Line-scan pattern whose single capture group is the formatted text. */
  pattern?: RegExp;
  placeholder: string;
}

const FORMATS: Record<ToggleFormat, FormatSpec> = {
  bold: { after: "**", before: "**", nodeName: "StrongEmphasis", placeholder: "bold text" },
  code: { after: "`", before: "`", nodeName: "InlineCode", placeholder: "code" },
  highlight: { after: "==", before: "==", pattern: /==([^=\n]+)==/g, placeholder: "highlighted text" },
  italic: { after: "*", before: "*", nodeName: "Emphasis", placeholder: "italic text" },
  underline: { after: "</u>", before: "<u>", pattern: /<u>([^<\n]*)<\/u>/g, placeholder: "underlined text" },
};

export interface ToggleResult {
  changes: ChangeSpec[];
  selection: { anchor: number; head?: number };
}

/** The toolbar entry point: what one click of `format` should do to `state`.
 *  Never returns null — there is always either an unwrap or a wrap to apply. */
export function toggleInlineFormat(state: EditorState, format: ToggleFormat): ToggleResult {
  const spec = FORMATS[format];
  const range = state.selection.main;

  if (spec.nodeName) {
    const node = enclosingNode(state, range.from, range.to, spec.nodeName);
    if (node) return removeMarks(node, range);
  }
  if (spec.pattern) {
    const hit = enclosingPattern(state, range.from, range.to, spec);
    if (hit) return removeDelimiters(hit, range);
  }

  // Textual fallback: the selected text itself carries the delimiters (e.g. a
  // selection of `**word**` in a spot the parser hasn't reached).
  const selected = state.sliceDoc(range.from, range.to);
  if (
    !range.empty &&
    selected.startsWith(spec.before) &&
    selected.endsWith(spec.after) &&
    selected.length >= spec.before.length + spec.after.length
  ) {
    return {
      changes: [
        { from: range.from, insert: "", to: range.from + spec.before.length },
        { from: range.to - spec.after.length, insert: "", to: range.to },
      ],
      selection: { anchor: range.from, head: range.to - spec.before.length - spec.after.length },
    };
  }

  return wrap(state, range.from, range.to, spec);
}

/** Innermost node named `name` that contains the whole [from, to] range —
 *  checked from both sides of the cursor so a caret sitting just inside or
 *  just after the closing delimiter still counts as "in" the element. */
function enclosingNode(state: EditorState, from: number, to: number, name: string): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, to + 500), 300);
  if (!tree) return null;
  for (const side of [1, -1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(from, side);
    while (node) {
      if (node.name === name && node.from <= from && node.to >= to) return node;
      node = node.parent;
    }
  }
  return null;
}

/** Remove a tree node's delimiter children (EmphasisMark/CodeMark/…),
 *  keeping the selection on the unwrapped text. */
function removeMarks(node: SyntaxNode, range: { from: number; to: number }): ToggleResult {
  const marks: Array<{ from: number; to: number }> = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith("Mark")) marks.push({ from: child.from, to: child.to });
  }
  const [open, close] = marks;
  if (marks.length !== 2 || !open || !close) {
    // Malformed/unexpected shape — leave the document alone rather than guess.
    return { changes: [], selection: { anchor: range.from, head: range.to } };
  }
  return removeDelimiters({ end: node.to, innerFrom: open.to, innerTo: close.from, start: node.from }, range);
}

interface PatternHit {
  start: number;
  innerFrom: number;
  innerTo: number;
  end: number;
}

/** Line-scan for a delimiter pair that encloses the range (or that the range
 *  fully covers). Single-line only — multi-line selections always wrap. */
function enclosingPattern(state: EditorState, from: number, to: number, spec: FormatSpec): PatternHit | null {
  if (!spec.pattern) return null;
  const line = state.doc.lineAt(from);
  if (to > line.to) return null;
  for (const match of line.text.matchAll(spec.pattern)) {
    if (match.index === undefined) continue;
    const start = line.from + match.index;
    const end = start + match[0].length;
    const encloses = start <= from && to <= end;
    const covered = from <= start && end <= to;
    if (encloses || covered) {
      return { end, innerFrom: start + spec.before.length, innerTo: end - spec.after.length, start };
    }
  }
  return null;
}

/** Delete [start, innerFrom) and [innerTo, end), keeping the selection on the
 *  text between them. */
function removeDelimiters(hit: PatternHit, range: { from: number; to: number }): ToggleResult {
  const openLength = hit.innerFrom - hit.start;
  const clamp = (pos: number) => Math.min(Math.max(pos, hit.innerFrom), hit.innerTo);
  return {
    changes: [
      { from: hit.start, insert: "", to: hit.innerFrom },
      { from: hit.innerTo, insert: "", to: hit.end },
    ],
    selection: { anchor: clamp(range.from) - openLength, head: clamp(range.to) - openLength },
  };
}

/** Wrap the selection — or the word under a bare cursor, or a placeholder on
 *  empty ground — leaving the body selected so a second click can unwrap. */
function wrap(state: EditorState, from: number, to: number, spec: FormatSpec): ToggleResult {
  let start = from;
  let end = to;
  if (start === end) {
    const line = state.doc.lineAt(start);
    const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}_]/u.test(char);
    while (start > line.from && isWordChar(line.text[start - line.from - 1])) start -= 1;
    while (end < line.to && isWordChar(line.text[end - line.from])) end += 1;
  }
  const body = state.sliceDoc(start, end) || spec.placeholder;
  return {
    changes: [{ from: start, insert: `${spec.before}${body}${spec.after}`, to: end }],
    selection: { anchor: start + spec.before.length, head: start + spec.before.length + body.length },
  };
}
