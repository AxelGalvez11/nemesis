// Markdown in, editable document out, and back again — with nothing lost.
//
// 🔴 NO DOM. See note-markdown.ts. The phone will need this exact mapping and
// must not grow a second copy of it.
//
// WHY THROUGH mdast AND NOT prosemirror-markdown. The stock ProseMirror
// markdown parser knows nothing about GFM tables, task lists, strikethrough or
// LaTeX — every one of which the app's renderer already shows, which means
// every one of which can be sitting in a note today. Opening such a note with
// the stock parser and saving it returns it WITHOUT its table. Going through
// remark means the editor reads a note with the very same parser that renders
// it, so what you can see is exactly what you can edit.

import type { Node as PmNode } from "prosemirror-model";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { splitWikiLinks } from "./library-links";
import { NOTE_GFM_OPTIONS, NOTE_STRINGIFY_OPTIONS, restoreWikiBrackets } from "./note-markdown";
import { noteSchema } from "./note-schema";

/** A minimal mdast shape — typed here so this file needs no extra dependency. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  url?: string;
  title?: string | null;
  align?: (string | null)[];
  [key: string]: unknown;
}

// BOTH halves must carry the SAME options. If the parser and the serializer
// disagree about tables, a note reformats every single time it is opened.
const parser = unified().use(remarkParse).use(remarkGfm, NOTE_GFM_OPTIONS).use(remarkMath);
const serializer = unified()
  .use(remarkStringify, NOTE_STRINGIFY_OPTIONS)
  .use(remarkGfm, NOTE_GFM_OPTIONS)
  .use(remarkMath);

// ── markdown → document ──────────────────────────────────────────────────────

const MARK_BY_TYPE: Record<string, string> = {
  delete: "strike",
  emphasis: "em",
  strong: "strong",
};

/** Inline mdast → an array of ProseMirror inline nodes. */
function inlineFrom(nodes: readonly MdNode[], marks: readonly string[] = []): PmNode[] {
  const out: PmNode[] = [];
  const applied = marks.map((name) => noteSchema.marks[name]!.create());

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        // Lift [[Target]] / [[Target|Label]] out of plain text into atomic
        // wiki-link nodes, so links render and click like a wiki while the
        // words around them stay ordinary editable text.
        for (const piece of node.value ? splitWikiLinks(node.value) : []) {
          if (piece.kind === "wiki") {
            out.push(noteSchema.nodes.wiki_link!.create({ label: piece.label === piece.target ? null : piece.label, target: piece.target }));
          } else if (piece.text) {
            out.push(noteSchema.text(piece.text, applied));
          }
        }
        break;
      case "inlineCode":
        if (node.value) out.push(noteSchema.text(node.value, [...applied, noteSchema.marks.code!.create()]));
        break;
      case "break":
        out.push(noteSchema.nodes.hard_break!.create());
        break;
      case "inlineMath":
        out.push(noteSchema.nodes.math_inline!.create({ latex: node.value ?? "" }));
        break;
      case "link": {
        const link = noteSchema.marks.link!.create({ href: node.url ?? "", title: node.title ?? null });
        for (const child of inlineFrom(node.children ?? [], marks)) {
          out.push(child.mark([...child.marks, link]));
        }
        break;
      }
      default: {
        const mark = MARK_BY_TYPE[node.type];
        if (mark) out.push(...inlineFrom(node.children ?? [], [...marks, mark]));
        // Anything else inline is dropped ONLY because isEditableNote refuses
        // the note before it reaches here. Keep those two in step.
        else if (node.children) out.push(...inlineFrom(node.children, marks));
        else if (node.value) out.push(noteSchema.text(node.value, applied));
      }
    }
  }
  return out;
}

/** Block mdast → ProseMirror block nodes. */
function blocksFrom(nodes: readonly MdNode[]): PmNode[] {
  const out: PmNode[] = [];
  for (const node of nodes) {
    const block = blockFrom(node);
    if (block) out.push(...(Array.isArray(block) ? block : [block]));
  }
  return out;
}

function blockFrom(node: MdNode): PmNode | PmNode[] | null {
  const N = noteSchema.nodes;
  switch (node.type) {
    case "paragraph":
      return N.paragraph!.create(null, inlineFrom(node.children ?? []));
    case "heading":
      return N.heading!.create({ level: node.depth ?? 1 }, inlineFrom(node.children ?? []));
    case "blockquote":
      return N.blockquote!.create(null, blocksFrom(node.children ?? []));
    case "code":
      return N.code_block!.create(
        { language: node.lang ?? "" },
        node.value ? [noteSchema.text(node.value)] : [],
      );
    case "thematicBreak":
      return N.horizontal_rule!.create();
    case "math":
      return N.math_block!.create({ latex: node.value ?? "" });
    case "list": {
      const items = (node.children ?? []).map((item) =>
        N.list_item!.create(
          { checked: item.checked ?? null },
          // An empty list item still needs a paragraph — `block+` demands one,
          // and without it the whole document fails to build.
          blocksFrom(item.children ?? []).length > 0
            ? blocksFrom(item.children ?? [])
            : [N.paragraph!.create()],
        ),
      );
      return node.ordered
        ? N.ordered_list!.create({ start: node.start ?? 1 }, items)
        : N.bullet_list!.create(null, items);
    }
    case "table": {
      const align = node.align ?? [];
      const rows = (node.children ?? []).map((row, rowIndex) =>
        N.table_row!.create(
          null,
          (row.children ?? []).map((cell, cellIndex) => {
            const type = rowIndex === 0 ? N.table_header! : N.table_cell!;
            return type.create({ align: align[cellIndex] ?? null }, inlineFrom(cell.children ?? []));
          }),
        ),
      );
      return N.table!.create(null, rows);
    }
    default:
      return null;
  }
}

/** Parse a note into an editable document. */
export function markdownToDoc(markdown: string): PmNode {
  const tree = parser.parse(markdown) as unknown as MdNode;
  const blocks = blocksFrom(tree.children ?? []);
  // A document must hold at least one block, or ProseMirror refuses it — an
  // empty note is a single empty paragraph, which is also what the student
  // expects to see a cursor in.
  return noteSchema.nodes.doc!.create(null, blocks.length > 0 ? blocks : [noteSchema.nodes.paragraph!.create()]);
}

// ── document → markdown ──────────────────────────────────────────────────────

function inlineToMd(node: PmNode): MdNode[] {
  if (node.type === noteSchema.nodes.hard_break) return [{ type: "break" }];
  if (node.type === noteSchema.nodes.math_inline) {
    return [{ type: "inlineMath", value: node.attrs.latex as string }];
  }
  if (node.type === noteSchema.nodes.wiki_link) {
    const target = node.attrs.target as string;
    const label = node.attrs.label as string | null;
    // Serialised as text; the stringifier escapes the brackets and
    // restoreWikiBrackets puts them back — same path raw-typed links take.
    return [{ type: "text", value: label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]` }];
  }
  if (!node.isText) return [];

  // `code` is innermost in markdown, so it wraps the text before anything else.
  let built: MdNode = node.marks.some((mark) => mark.type === noteSchema.marks.code)
    ? { type: "inlineCode", value: node.text ?? "" }
    : { type: "text", value: node.text ?? "" };

  for (const mark of node.marks) {
    if (mark.type === noteSchema.marks.code) continue;
    if (mark.type === noteSchema.marks.em) built = { children: [built], type: "emphasis" };
    else if (mark.type === noteSchema.marks.strong) built = { children: [built], type: "strong" };
    else if (mark.type === noteSchema.marks.strike) built = { children: [built], type: "delete" };
    else if (mark.type === noteSchema.marks.link) {
      built = { children: [built], title: (mark.attrs.title as string) ?? null, type: "link", url: mark.attrs.href as string };
    }
  }
  return [built];
}

function inlineChildren(node: PmNode): MdNode[] {
  const out: MdNode[] = [];
  node.forEach((child) => out.push(...inlineToMd(child)));
  return out;
}

function blockToMd(node: PmNode): MdNode | null {
  const N = noteSchema.nodes;
  const kids = (): MdNode[] => {
    const out: MdNode[] = [];
    node.forEach((child) => {
      const built = blockToMd(child);
      if (built) out.push(built);
    });
    return out;
  };

  switch (node.type) {
    case N.paragraph:
      return { children: inlineChildren(node), type: "paragraph" };
    case N.heading:
      return { children: inlineChildren(node), depth: node.attrs.level as number, type: "heading" };
    case N.blockquote:
      return { children: kids(), type: "blockquote" };
    case N.code_block:
      return { lang: (node.attrs.language as string) || null, type: "code", value: node.textContent };
    case N.horizontal_rule:
      return { type: "thematicBreak" };
    case N.math_block:
      return { type: "math", value: node.attrs.latex as string };
    case N.bullet_list:
    case N.ordered_list: {
      const items: MdNode[] = [];
      node.forEach((item) => {
        const content: MdNode[] = [];
        item.forEach((child) => {
          const built = blockToMd(child);
          if (built) content.push(built);
        });
        items.push({ checked: item.attrs.checked as boolean | null, children: content, spread: false, type: "listItem" });
      });
      return {
        children: items,
        ordered: node.type === N.ordered_list,
        spread: false,
        start: node.type === N.ordered_list ? (node.attrs.start as number) : null,
        type: "list",
      };
    }
    case N.table: {
      const align: (string | null)[] = [];
      const rows: MdNode[] = [];
      node.forEach((row) => {
        const cells: MdNode[] = [];
        row.forEach((cell, _offset, index) => {
          if (align[index] === undefined) align[index] = (cell.attrs.align as string) ?? null;
          cells.push({ children: inlineChildren(cell), type: "tableCell" });
        });
        rows.push({ children: cells, type: "tableRow" });
      });
      return { align, children: rows, type: "table" };
    }
    default:
      return null;
  }
}

/** Serialise the document back to the markdown that gets stored. */
export function docToMarkdown(doc: PmNode): string {
  const children: MdNode[] = [];
  doc.forEach((child) => {
    const built = blockToMd(child);
    if (built) children.push(built);
  });
  // restoreWikiBrackets: keep [[wiki links]] alive across a save — must stay
  // in lockstep with normalizeNoteMarkdown (see its comment in note-markdown).
  return restoreWikiBrackets(serializer.stringify({ children, type: "root" } as never));
}

/** Parse and serialise in one hop — what a save does to an untouched note. */
export function roundTrip(markdown: string): string {
  return docToMarkdown(markdownToDoc(markdown));
}
