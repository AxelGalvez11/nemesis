import type { Mark, Node as PmNode } from "prosemirror-model";

import { markdownToDoc } from "@/lib/workspace/note-doc";

// ── The old Library's notes, as workspace pages ─────────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-11: the new workspace library "should supersede" the old one (docs/space/PLAN.md, M10). A note is
// Markdown; it goes through the Library's own parser (markdownToDoc, the one its editor uses) and comes out as the
// workspace's blocks. Nothing here reads or writes a database: the runtime fetches the notes and saves the pages.

/** Rich text as the workspace stores it: [text] or [text, marks], a mark being ['b'] or ['a', href]. */
export type Mark1 = [string] | [string, string];
export type RichSegment = [string] | [string, Mark1[]];

export interface ImportNote {
  id: string;
  title: string;
  content: string;
}

export interface SpaceBlock {
  id: string;
  type: string;
  title: RichSegment[];
  children: string[];
  parent: string;
  checked?: boolean;
  language?: string;
  rows?: string[][];
  headerRow?: boolean;
  widths?: number[];
  src?: string;
  name?: string;
  pageId?: string;
}

export interface SpacePage {
  id: string;
  kind: "page";
  parent: string | null;
  title: string;
  icon: { emoji: string } | null;
  content: string[];
  section: "private";
  lastEdited: number;
  /** The Library note this page was made from. */
  importedFrom?: string;
}

const MARKS: Record<string, (mark: Mark) => Mark1> = {
  strong: () => ["b"],
  em: () => ["i"],
  strike: () => ["s"],
  code: () => ["c"],
  link: (mark) => ["a", String(mark.attrs.href ?? "")],
};

const sameMarks = (a: Mark1[], b: Mark1[]) => JSON.stringify(a) === JSON.stringify(b);

/** A node's inline content as rich text. Images are collected for blocks of their own. */
function inline(node: PmNode, images: PmNode[]): RichSegment[] {
  const out: RichSegment[] = [];
  const push = (text: string, marks: Mark1[]) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && sameMarks(last[1] ?? [], marks)) {
      last[0] = last[0] + text;
      return;
    }
    out.push(marks.length ? [text, marks] : [text]);
  };
  node.forEach((child) => {
    const marks = child.marks.map((mark) => MARKS[mark.type.name]?.(mark)).filter((m): m is Mark1 => Boolean(m));
    switch (child.type.name) {
      case "text":
        push(child.text ?? "", marks);
        break;
      case "hard_break":
        push("\n", []);
        break;
      case "math_inline":
        push(`$${String(child.attrs.latex ?? "")}$`, marks);
        break;
      case "wiki_link":
        push(String(child.attrs.label || child.attrs.target || ""), marks);
        break;
      case "citation":
        push(`[${String(child.attrs.n ?? "")}]`, [["a", String(child.attrs.href ?? "")]]);
        break;
      case "image":
        images.push(child);
        break;
      default:
        push(child.textContent, marks);
    }
  });
  return out;
}

const HEADINGS = ["header", "sub_header", "sub_sub_header", "header_4"];

/** A parsed note's blocks, top level first in `content`, every block pointing at its parent. */
export function docToBlocks(doc: PmNode, pageId: string, makeId: () => string): { content: string[]; blocks: SpaceBlock[] } {
  const blocks: SpaceBlock[] = [];
  const add = (block: Omit<SpaceBlock, "id" | "children">): SpaceBlock => {
    const made: SpaceBlock = { id: makeId(), children: [], ...block };
    blocks.push(made);
    return made;
  };
  const images = (found: PmNode[], parent: string, into: string[]) => {
    for (const image of found) {
      const src = String(image.attrs.src ?? "");
      const alt = String(image.attrs.alt ?? "");
      // An image the browser can fetch becomes an image block; one stored somewhere else would only show broken.
      if (/^https?:\/\//i.test(src)) into.push(add({ type: "image", title: [], parent, src, name: alt }).id);
      else if (alt) into.push(add({ type: "text", title: [[`Image: ${alt}`]], parent }).id);
    }
  };
  const convert = (node: PmNode, parent: string, into: string[]) => {
    const found: PmNode[] = [];
    switch (node.type.name) {
      case "paragraph": {
        const title = inline(node, found);
        if (title.length) into.push(add({ type: "text", title, parent }).id);
        break;
      }
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs.level) || 1, 1), 4);
        into.push(add({ type: HEADINGS[level - 1]!, title: inline(node, found), parent }).id);
        break;
      }
      case "blockquote": {
        const quote = add({ type: "quote", title: [], parent });
        into.push(quote.id);
        node.forEach((inner) => {
          if (inner.type.name === "paragraph") {
            const text = inline(inner, found);
            if (quote.title.length && text.length) quote.title.push(["\n"]);
            quote.title.push(...text);
          } else {
            convert(inner, quote.id, quote.children);
          }
        });
        break;
      }
      case "code_block":
        into.push(add({ type: "code", title: node.textContent ? [[node.textContent]] : [], parent, language: String(node.attrs.language ?? "") }).id);
        break;
      case "horizontal_rule":
        into.push(add({ type: "divider", title: [], parent }).id);
        break;
      case "math_block":
        into.push(add({ type: "equation", title: node.attrs.latex ? [[String(node.attrs.latex)]] : [], parent }).id);
        break;
      case "bullet_list":
      case "ordered_list": {
        node.forEach((item) => {
          const checked = item.attrs.checked;
          const type = checked === null || checked === undefined ? (node.type.name === "ordered_list" ? "numbered_list" : "bulleted_list") : "to_do";
          const block = add({ type, title: [], parent, ...(type === "to_do" ? { checked: Boolean(checked) } : {}) });
          into.push(block.id);
          let first = true;
          item.forEach((inner) => {
            if (first && inner.type.name === "paragraph") block.title = inline(inner, found);
            else convert(inner, block.id, block.children);
            first = false;
          });
        });
        break;
      }
      case "table": {
        const rows: string[][] = [];
        let headerRow = false;
        node.forEach((row, _offset, index) => {
          const cells: string[] = [];
          row.forEach((cell) => {
            if (index === 0 && cell.type.name === "table_header") headerRow = true;
            cells.push(cell.textContent);
          });
          rows.push(cells);
        });
        if (rows.length) {
          const columns = Math.max(...rows.map((r) => r.length));
          const even = rows.map((r) => [...r, ...Array.from({ length: columns - r.length }, () => "")]);
          into.push(add({ type: "table", title: [], parent, rows: even, headerRow, widths: Array.from({ length: columns }, () => 240) }).id);
        }
        break;
      }
      default:
        if (node.textContent.trim()) into.push(add({ type: "text", title: [[node.textContent]], parent }).id);
    }
    images(found, parent, into);
  };
  const content: string[] = [];
  doc.forEach((node) => convert(node, pageId, content));
  return { content, blocks };
}

/** Notes the parser refuses still come across, a paragraph per blank-line-separated chunk. */
function plainBlocks(text: string, pageId: string, makeId: () => string): { content: string[]; blocks: SpaceBlock[] } {
  const blocks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): SpaceBlock => ({ id: makeId(), type: "text", title: [[chunk]], children: [], parent: pageId }));
  return { content: blocks.map((b) => b.id), blocks };
}

/** One note as one page. */
export function noteToPage(note: ImportNote, parent: string | null, makeId: () => string, now: number): { page: SpacePage; blocks: SpaceBlock[] } {
  const id = makeId();
  let parsed: { content: string[]; blocks: SpaceBlock[] };
  try {
    parsed = docToBlocks(markdownToDoc(note.content || ""), id, makeId);
  } catch {
    parsed = plainBlocks(note.content || "", id, makeId);
  }
  const page: SpacePage = {
    id,
    kind: "page",
    parent,
    title: note.title.trim() || "Untitled note",
    icon: null,
    content: parsed.content,
    section: "private",
    lastEdited: now,
    importedFrom: note.id,
  };
  return { page, blocks: parsed.blocks };
}

export interface LibraryImportPlan {
  parent: SpacePage;
  pages: SpacePage[];
  blocks: SpaceBlock[];
  count: number;
}

/**
 * Every note not imported before, as a page inside one "From your old Library" page, in the order given. Null when
 * there is nothing new, so a second run does nothing.
 */
export function planLibraryImport(
  notes: readonly ImportNote[],
  alreadyImported: ReadonlySet<string>,
  idFor: (key: string) => string,
  now: number,
): LibraryImportPlan | null {
  const fresh = notes.filter((note) => !alreadyImported.has(note.id));
  if (!fresh.length) return null;
  const parentId = idFor("holder");
  const pages: SpacePage[] = [];
  const blocks: SpaceBlock[] = [];
  const content: string[] = [];
  const intro: SpaceBlock = {
    id: idFor("intro"),
    type: "text",
    title: [["Your notes from the old Library, one page each. The originals are still in the Library."]],
    children: [],
    parent: parentId,
  };
  blocks.push(intro);
  content.push(intro.id);
  for (const note of fresh) {
    // Numbered within the note, so a note added to the Library later changes no other note's ids.
    let n = 0;
    const made = noteToPage(note, parentId, () => idFor(`note:${note.id}:${n++}`), now);
    pages.push(made.page);
    blocks.push(...made.blocks);
    const link: SpaceBlock = { id: idFor(`link:${note.id}`), type: "page", title: [], children: [], parent: parentId, pageId: made.page.id };
    blocks.push(link);
    content.push(link.id);
  }
  const parent: SpacePage = {
    id: parentId,
    kind: "page",
    parent: null,
    title: "From your old Library",
    icon: { emoji: "📚" },
    content,
    section: "private",
    lastEdited: now,
  };
  return { parent, pages, blocks, count: fresh.length };
}

/** The part of the editor's state an import writes into. */
export interface ImportState {
  pages: Record<string, { content?: unknown } | undefined>;
  blocks: Record<string, { children?: unknown } | undefined>;
}

/**
 * Adds to the state what a plan holds and the state lacks, and changes nothing already there. An earlier run that
 * stopped halfway may have saved a page but only some of its blocks, so pages already saved must be loaded whole first:
 * a page's list of blocks (and a block's list of children) is how the missing ones are found. A block the person deleted
 * since is no longer listed, so it stays deleted.
 */
export function placeLibraryImport(S: ImportState, plan: LibraryImportPlan): { holder: boolean; pages: string[]; records: number } {
  const planned = new Map(plan.blocks.map((block) => [block.id, block]));
  const linkOf = new Map(plan.blocks.filter((block) => block.type === "page").map((block) => [block.pageId, block.id]));
  const visited = new Set<string>();
  let records = 0;
  const fill = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const id of list) {
      if (typeof id !== "string" || visited.has(id)) continue;
      visited.add(id);
      if (!S.blocks[id]) {
        const block = planned.get(id);
        if (!block) continue;
        S.blocks[id] = block;
        records++;
      }
      fill(S.blocks[id]?.children);
    }
  };

  const holder = !S.pages[plan.parent.id];
  if (holder) {
    S.pages[plan.parent.id] = plan.parent;
    records++;
  }
  const listed = S.pages[plan.parent.id]?.content;
  const pages: string[] = [];
  for (const page of plan.pages) {
    if (S.pages[page.id]) continue;
    S.pages[page.id] = page;
    records++;
    pages.push(page.id);
    const link = linkOf.get(page.id);
    if (link && Array.isArray(listed) && !listed.includes(link)) listed.push(link);
  }
  fill(listed);
  for (const page of plan.pages) fill(S.pages[page.id]?.content);
  return { holder, pages, records };
}

// ── Ids made from the note ──────────────────────────────────────────────────────────────────────────────────────────
//
// An import that stops halfway (a closed tab) runs again on the next load, and two tabs can run it at the same time.
// Every record's id is made from the workspace, the person and the note, so every run names the same records: ws_apply
// answers "existed" for a create it already holds, and only what is missing is added. Name-based ids per RFC 9562
// (version 5, SHA-1); nothing here is secret.

const IMPORT_NAMESPACE = "011b5d4c-f6f9-464c-89ab-19e2868b5cdf";

function sha1(message: Uint8Array): Uint8Array {
  const total = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(total);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = message.length * 8;
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(total - 4, bits >>> 0);
  const w = new Uint32Array(80);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h));
  return out;
}

/** A name-based id (RFC 9562, version 5): the same namespace and name always give the same id. */
export function nameId(namespace: string, name: string): string {
  const ns = namespace.replace(/-/g, "");
  const text = new TextEncoder().encode(name);
  const message = new Uint8Array(16 + text.length);
  for (let i = 0; i < 16; i++) message[i] = parseInt(ns.slice(i * 2, i * 2 + 2), 16);
  message.set(text, 16);
  const hash = sha1(message);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = Array.from(hash.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Ids for one person's import into one workspace, by key: "holder", "intro", "link:<note>", "note:<note>:<n>". */
export function importIds(spaceId: string, userId: string): (key: string) => string {
  return (key) => nameId(IMPORT_NAMESPACE, `${spaceId}:${userId}:${key}`);
}
