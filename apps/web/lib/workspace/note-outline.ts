// The "On this page" outline for the docs-style Library: heading entries in
// DOCUMENT ORDER, extracted with the SAME remark parser family that renders
// the note (react-markdown + remark-gfm + remark-math in chat-markdown.tsx).
//
// Why a parser and not a regex: the old right-panel ToC scanned lines with
// /^#{1,4}\s/, which also matches a `# comment` inside a ```bash fence and
// misses setext (`Title\n====`) and blockquote-nested headings. The v2 rail
// scrolls by POSITION — "the Nth outline entry is the Nth <h1-4> in the
// article" — so the extractor must agree with the renderer about exactly
// which headings exist, or every click after the first disagreement lands on
// the wrong section. Only sharing the parser guarantees that.
//
// Two deliberate exclusions that keep the index mapping honest:
// - depth 5-6 stay out (the reader styles and anchors h1-h4 only, and the
//   rail queries "h1,h2,h3,h4").
// - footnote definitions are skipped: GFM renders their content in a section
//   at the very END of the article, not where they sit in the source, so a
//   heading inside one would corrupt the order of everything after it.
//
// NO DOM in this file — same rule as note-markdown.ts, so the phone can
// reuse it when it grows a reader.

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { NOTE_GFM_OPTIONS } from "./note-markdown";

export interface NoteOutlineEntry {
  /** 1-4; matches the h1-h4 elements the reader renders and queries. */
  depth: 1 | 2 | 3 | 4;
  label: string;
}

const parser = unified().use(remarkParse).use(remarkGfm, NOTE_GFM_OPTIONS).use(remarkMath);

interface MdNode {
  type: string;
  depth?: number;
  value?: string;
  alt?: string | null;
  children?: MdNode[];
}

/** Readable text of a heading node: text + inline code + image alts, in order. */
function textOf(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  if (node.type === "image") return node.alt ?? "";
  return (node.children ?? []).map(textOf).join("");
}

/** Strip note-only syntax the renderer would have converted before display. */
function cleanLabel(raw: string): string {
  return raw
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\]\]/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function walk(node: MdNode, out: NoteOutlineEntry[]): void {
  if (node.type === "footnoteDefinition") return;
  if (node.type === "heading" && typeof node.depth === "number" && node.depth <= 4) {
    const label = cleanLabel(textOf(node));
    out.push({ depth: node.depth as NoteOutlineEntry["depth"], label: label || "Untitled section" });
    return;
  }
  for (const child of node.children ?? []) walk(child, out);
}

export function extractNoteOutline(markdown: string): NoteOutlineEntry[] {
  if (!markdown.trim()) return [];
  const entries: NoteOutlineEntry[] = [];
  walk(parser.parse(markdown) as unknown as MdNode, entries);
  return entries;
}

