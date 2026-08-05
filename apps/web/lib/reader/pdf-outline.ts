// A PDF's own bookmarks, flattened into the list the sidebar renders.
//
// pdf.js hands back a nested tree whose destinations are either a NAMED
// destination (a string that has to be looked up) or an EXPLICIT one (an array
// whose first element is a page reference). Resolving either to a page number
// needs the document, so that step stays in the component; this module does the
// part that is pure — walking, flattening, depth, and dropping the entries that
// cannot lead anywhere.

export interface RawOutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items?: RawOutlineNode[];
  bold?: boolean;
  italic?: boolean;
}

export interface OutlineEntry {
  id: string;
  title: string;
  /** 0 for a top-level bookmark. */
  depth: number;
  dest: string | unknown[] | null;
  /** Filled in once the destination has been resolved against the document. */
  unit?: number;
}

const MAX_DEPTH = 6;

/** Depth-first, in document order — the order a person expects a contents list
 *  to be in. Entries with no destination are KEPT when they have children (they
 *  are section groupings and clicking them should still expand nothing but
 *  read correctly) and dropped when they are leaves that go nowhere. */
export function flattenOutline(nodes: readonly RawOutlineNode[] | null | undefined, depth = 0): OutlineEntry[] {
  // 🔴 The id must be unique across the WHOLE list, not just among one parent's
  // children. A course packet is very often several articles concatenated into
  // one PDF, and every article carries a "Disclosures" and a "References" at the
  // same depth and the same sibling position — so keying on
  // (depth, sibling index, title) collided, and React quietly dropped or
  // duplicated outline rows. Measured on a real two-article Journal of Cardiac
  // Failure packet. Position in the flattened list cannot collide.
  return walkOutline(nodes, depth).map((entry, position) => ({ ...entry, id: `o${position}-${entry.title.slice(0, 40)}` }));
}

function walkOutline(nodes: readonly RawOutlineNode[] | null | undefined, depth: number): OutlineEntry[] {
  if (!nodes || depth > MAX_DEPTH) return [];
  const entries: OutlineEntry[] = [];
  nodes.forEach((node) => {
    const title = typeof node.title === "string" ? node.title.replace(/\s+/g, " ").trim() : "";
    const children = walkOutline(node.items, depth + 1);
    if (title && (node.dest !== null || children.length > 0)) {
      entries.push({ id: "", title, depth, dest: node.dest ?? null });
    }
    entries.push(...children);
  });
  return entries;
}

/** A contents list built from the document's own headings, for the many PDFs
 *  that carry no bookmarks at all. Same shape, so the sidebar renders one thing.
 *  Levels come from measured font sizes (see pdf-blocks.ts), never from words. */
export function outlineFromHeadings(
  blocks: readonly { kind: string; text: string; unit: number; level?: number }[],
): OutlineEntry[] {
  return blocks
    .filter((block) => block.kind === "heading")
    .map((block, index) => ({
      id: `h-${index}-${block.unit}`,
      title: block.text,
      depth: Math.max(0, (block.level ?? 1) - 1),
      dest: null,
      unit: block.unit,
    }));
}
