// A mind map as a tree, and the tree as boxes on a plane.
//
// 🔴🔴 THE OWNER ASKED FOR A MAP HE CAN OPEN, NOT A PICTURE OF ONE (2026-09-03): *"if I want a mind
// map, I should be able to get one that's interactive, one that I can click on and then reveals more
// nodes"*, and the shape it has to take: *"a hierarchical mind map... a ladder of things you need to
// know from shallow to deeply detailed."* The model already writes mermaid `mindmap` fences, and
// today they are drawn once, as a static picture. A picture cannot be a ladder, because every rung
// is showing at once. This file reads the fence into a tree and lays the tree out with only the
// rungs the learner has opened.
//
// 🔴 PURE. No React, no DOM, no measuring of real text. Everything that can be wrong about a map (a
// node the parser dropped, two boxes on top of each other, a branch that stays when its parent
// folds) is provable here without a browser, and the view can be checked by reading its source.

export interface MindmapNode {
  /** Positional: "n0" for the root, "n0.2" for its third child, "n0.2.0" for that child's first. */
  id: string;
  label: string;
  children: MindmapNode[];
}

/** One line of source before it is a node: how far in it sits, and what it says. */
interface Row {
  depth: number;
  label: string;
}

/**
 * Rows into one tree.
 *
 * 🔴 EXACTLY ONE ROOT, EVEN WHEN THE TEXT HAS TWO. A model that writes a second column-zero node has
 * not written two maps, it has forgotten an indent. Folding the stray under the first root keeps
 * every node the learner was promised; refusing the parse would lose all of them, silently, on the
 * turn where the map was the answer.
 *
 * 🔴 IDS COME FROM POSITION, NOT FROM TEXT. The view keys its elements and the learner's set of
 * opened nodes by id, and a streamed fence is parsed again on every chunk. Position survives that.
 * A hash of the label would not survive the model finishing a word.
 */
function buildTree(rows: readonly Row[]): MindmapNode | null {
  const first = rows[0];
  if (!first) return null;
  const root: MindmapNode = { id: "n0", label: first.label, children: [] };
  const open: { depth: number; node: MindmapNode }[] = [{ depth: first.depth, node: root }];
  for (const row of rows.slice(1)) {
    // Deeper than the line above is a child, level with it a sibling, shallower pops back out. The
    // root is never popped, which is how a stray column-zero node lands under it.
    while (open.length > 1 && open[open.length - 1]!.depth >= row.depth) open.pop();
    const parent = open[open.length - 1]!.node;
    const node: MindmapNode = { id: `${parent.id}.${parent.children.length}`, label: row.label, children: [] };
    parent.children.push(node);
    open.push({ depth: row.depth, node });
  }
  return root;
}

/** Indentation as columns, so a tab and a run of spaces compare. A tab reaches the next stop of four. */
function indentColumns(line: string): number {
  let column = 0;
  for (const char of line) {
    if (char === " ") column += 1;
    else if (char === "\t") column += 4 - (column % 4);
    else break;
  }
  return column;
}

/** The text as lines with the code fence gone: a fence is how the model hands a map over, not a node. */
function sourceLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*(?:```|~~~)/.test(line));
}

/** Mermaid keeps a diagram's title in `---` front matter above the header. It is not a node either. */
function withoutFrontMatter(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() !== "");
  if (start < 0 || lines[start]!.trim() !== "---") return lines;
  const close = lines.findIndex((line, index) => index > start && line.trim() === "---");
  return close < 0 ? lines : [...lines.slice(0, start), ...lines.slice(close + 1)];
}

/** `::icon(...)` and `:::class` are dressing on the node above, on their own line or at the end of its line. */
const DECORATION_ONLY = /^(?:::icon\(|:::)/;
const ICON = /\s*::icon\([^)]*\)/g;
const CLASS_TAG = /\s*:::.*$/;

/** Mermaid's node shapes, outermost first so `((` is never read as `(`. The id before the bracket is optional. */
const SHAPES: readonly RegExp[] = [
  /^([\w-]*)\)\)(.*)\(\($/, // id))bang((
  /^([\w-]*)\(\((.*)\)\)$/, // id((circle))
  /^([\w-]*)\{\{(.*)\}\}$/, // id{{hexagon}}
  /^([\w-]*)\)(.*)\($/, // id)cloud(
  /^([\w-]*)\[(.*)\]$/, // id[square]
  /^([\w-]*)\((.*)\)$/, // id(rounded)
];

/** Quotes, backticks, `<br/>` and runs of whitespace go; what is left is the label a person reads. */
function plainWords(text: string): string {
  return text
    .trim()
    .replace(/^"(.*)"$/s, "$1")
    .replace(/`/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words of one mermaid node line, with shape brackets, icon and class tag taken off. */
function mermaidLabel(line: string): string {
  let text = line.replace(ICON, "").replace(CLASS_TAG, "").trim();
  for (const shape of SHAPES) {
    const match = shape.exec(text);
    if (match) {
      // A shape with nothing inside keeps its id, which is the only name it has.
      text = (match[2] ?? "").trim() || (match[1] ?? "");
      break;
    }
  }
  return plainWords(text);
}

/**
 * A mermaid `mindmap` fence as a tree, or null when the text is not one.
 *
 * 🔴 NULL, NOT A GUESS. A flowchart, a sequence diagram or plain prose handed to this parser must
 * come back as "not a mind map" so the caller can draw it the way it draws today. A tree built out
 * of a flowchart's lines would be a confident picture of nothing.
 */
export function parseMermaidMindmap(text: string): MindmapNode | null {
  const rows: Row[] = [];
  let headed = false;
  for (const line of withoutFrontMatter(sourceLines(text))) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("%%")) continue;
    if (!headed) {
      if (!/^mindmap$/i.test(trimmed)) return null;
      headed = true;
      continue;
    }
    if (DECORATION_ONLY.test(trimmed)) continue;
    const label = mermaidLabel(trimmed);
    if (label === "") continue;
    rows.push({ depth: indentColumns(line), label });
  }
  return headed ? buildTree(rows) : null;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+?)\s*$/;

/**
 * A markdown outline as a tree: a `# Title` root, `##` headings a level down, bullets under whichever
 * heading came last, nested by indent. The same reading `outlineToMermaidMindmap` gives the study
 * shelf's saved maps, so a saved outline and a fresh fence open the same way.
 *
 * 🔴 THE INDENT UNIT IS READ OFF THE TEXT, NOT ASSUMED. Two spaces and four spaces are both common
 * and a model picks either; the smallest indent present is one level, and everything else is
 * measured against it. A fixed "two spaces" would read a four-space outline as twice as deep.
 */
export function parseOutlineMindmap(text: string): MindmapNode | null {
  const found: { heading: number | null; indent: number; label: string }[] = [];
  for (const line of sourceLines(text)) {
    const heading = HEADING.exec(line);
    if (heading) {
      found.push({ heading: heading[1]!.length - 1, indent: 0, label: plainWords(heading[2]!) });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) found.push({ heading: null, indent: indentColumns(bullet[1]!), label: plainWords(bullet[2]!) });
  }
  const indents = found.filter((row) => row.heading === null && row.indent > 0).map((row) => row.indent);
  const unit = indents.length > 0 ? Math.min(...indents) : 2;
  const rows: Row[] = [];
  let headingDepth = -1;
  for (const row of found) {
    if (row.label === "") continue;
    if (row.heading !== null) {
      headingDepth = row.heading;
      rows.push({ depth: row.heading, label: row.label });
    } else {
      rows.push({ depth: headingDepth + 1 + Math.round(row.indent / unit), label: row.label });
    }
  }
  return buildTree(rows);
}

/** How big a map is: every node, how many levels it goes down (the root alone is 1), and the leaves. */
export function mindmapStats(root: MindmapNode): { nodes: number; depth: number; leaves: number } {
  let nodes = 0;
  let depth = 0;
  let leaves = 0;
  const walk = (node: MindmapNode, level: number) => {
    nodes += 1;
    depth = Math.max(depth, level);
    if (node.children.length === 0) leaves += 1;
    for (const child of node.children) walk(child, level + 1);
  };
  walk(root, 1);
  return { nodes, depth, leaves };
}

export interface MindmapMetrics {
  charWidth?: number;
  padX?: number;
  nodeHeight?: number;
  gapX?: number;
  gapY?: number;
}

/**
 * The measurements the layout assumes, exported so the view draws with the numbers it was laid out with.
 *
 * 🔴 `charWidth` IS A GUESS AT 13px SYSTEM TYPE, NOT A MEASUREMENT, and it guesses wide on purpose:
 * a box a little roomier than its word is a box; a box narrower than its word is a word hanging out
 * of a box. Measuring real glyphs would need a canvas, and this file has none.
 */
export const MINDMAP_METRICS: Readonly<Required<MindmapMetrics>> = Object.freeze({
  charWidth: 7.2,
  padX: 12,
  nodeHeight: 30,
  gapX: 40,
  gapY: 10,
});

/** The root is set a size up (14px semibold over 13px regular), so its box is measured a size up. */
const ROOT_SCALE = 1.12;
/** Breathing room around the drawing, so no box's stroke sits on the clipped edge. */
const MARGIN = 8;
/** Room to the right of a folded node for the "+N" the view hangs there. Paid only where a node is folded. */
const BADGE_ROOM = 30;

export interface LaidNode {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** Every direct child, drawn or not. The view's "+N" is this number. */
  childCount: number;
  /** True only when the node has children AND they are drawn. */
  expanded: boolean;
}

export interface MindmapEdge {
  from: string;
  to: string;
  /** An SVG path: a cubic from the parent's right edge to the child's left edge. */
  d: string;
}

export interface MindmapLayout {
  nodes: LaidNode[];
  edges: MindmapEdge[];
  width: number;
  height: number;
}

interface Placed {
  node: LaidNode;
  children: Placed[];
}

const tenth = (value: number) => String(Math.round(value * 10) / 10);

/** Leaves level and arrives level: both handles sit in the middle of the gap between the two columns. */
function curve(from: LaidNode, to: LaidNode): string {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const mid = (x1 + x2) / 2;
  return `M${tenth(x1)} ${tenth(y1)} C${tenth(mid)} ${tenth(y1)}, ${tenth(mid)} ${tenth(y2)}, ${tenth(x2)} ${tenth(y2)}`;
}

/**
 * Where every open box goes: a tidy tree, root at the left, children stacked down the column to its
 * right, each parent level with the middle of its children.
 *
 * 🔴 A FOLDED NODE IS DRAWN AND ITS SUBTREE IS NOT. That is the whole ladder: what the learner has
 * not opened takes no room, so the map is as small as the depth they have chosen to look at.
 *
 * 🔴 ONE COLUMN PER DEPTH, AS WIDE AS ITS WIDEST BOX, rather than each box hugging its own parent.
 * Ragged columns read as a diagram of something; aligned ones read as levels, which is what the
 * owner's "shallow to deeply detailed" is.
 *
 * 🔴 SUBTREES NEVER OVERLAP because each one owns a band of rows and the bands are stacked, never
 * interleaved. The test file proves it on every pair of boxes rather than trusting this sentence.
 */
export function layoutMindmap(
  root: MindmapNode,
  expanded: ReadonlySet<string>,
  metrics: MindmapMetrics = {},
): MindmapLayout {
  const m: Required<MindmapMetrics> = {
    charWidth: metrics.charWidth ?? MINDMAP_METRICS.charWidth,
    padX: metrics.padX ?? MINDMAP_METRICS.padX,
    nodeHeight: metrics.nodeHeight ?? MINDMAP_METRICS.nodeHeight,
    gapX: metrics.gapX ?? MINDMAP_METRICS.gapX,
    gapY: metrics.gapY ?? MINDMAP_METRICS.gapY,
  };
  const boxWidth = (label: string, depth: number) =>
    Math.ceil(label.length * m.charWidth * (depth === 0 ? ROOT_SCALE : 1)) + 2 * m.padX;

  // 1. Which boxes exist. A folded node is one box; what hangs below it is nothing.
  const build = (node: MindmapNode, depth: number): Placed => {
    const open = node.children.length > 0 && expanded.has(node.id);
    const laid: LaidNode = {
      id: node.id,
      label: node.label,
      x: 0,
      y: 0,
      w: boxWidth(node.label, depth),
      h: m.nodeHeight,
      depth,
      childCount: node.children.length,
      expanded: open,
    };
    return { node: laid, children: open ? node.children.map((child) => build(child, depth + 1)) : [] };
  };
  const tree = build(root, 0);

  // 2. Columns: one per depth, as wide as its widest box.
  const columnWidth: number[] = [];
  const measure = (placed: Placed) => {
    const depth = placed.node.depth;
    columnWidth[depth] = Math.max(columnWidth[depth] ?? 0, placed.node.w);
    for (const child of placed.children) measure(child);
  };
  measure(tree);
  const columnX: number[] = [];
  let x = MARGIN;
  for (const width of columnWidth) {
    columnX.push(x);
    x += width + m.gapX;
  }

  // 3. Rows: children stack down from the top of their band; the parent sits level with the middle
  //    of its first and last child. Returns the band's height.
  const place = (placed: Placed, top: number): number => {
    placed.node.x = columnX[placed.node.depth] ?? MARGIN;
    if (placed.children.length === 0) {
      placed.node.y = top;
      return m.nodeHeight;
    }
    let cursor = top;
    for (const child of placed.children) cursor += place(child, cursor) + m.gapY;
    const first = placed.children[0]!.node;
    const last = placed.children[placed.children.length - 1]!.node;
    placed.node.y = (first.y + last.y) / 2;
    return Math.max(m.nodeHeight, cursor - m.gapY - top);
  };
  const bandHeight = place(tree, MARGIN);

  // 4. Read the tree out in drawing order, parents before children, with the edge to each child.
  const nodes: LaidNode[] = [];
  const edges: MindmapEdge[] = [];
  const collect = (placed: Placed) => {
    nodes.push(placed.node);
    for (const child of placed.children) {
      edges.push({ from: placed.node.id, to: child.node.id, d: curve(placed.node, child.node) });
      collect(child);
    }
  };
  collect(tree);

  let right = 0;
  for (const node of nodes) {
    const badge = node.childCount > 0 && !node.expanded ? BADGE_ROOM : 0;
    right = Math.max(right, node.x + node.w + badge);
  }
  return { nodes, edges, width: right + MARGIN, height: bandHeight + 2 * MARGIN };
}

/**
 * What a map shows before anyone has touched it: the root and its direct children are open, so
 * the first two rungs below the root are visible and the third is one click away.
 */
export function initiallyExpanded(root: MindmapNode): Set<string> {
  return new Set([root.id, ...root.children.map((child) => child.id)]);
}

/** Open a folded node, fold an open one. Never mutates the set it was given; the view keeps sets in state. */
export function toggleNode(expanded: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Every node that has children, open: the whole ladder at once. */
export function fullyExpanded(root: MindmapNode): Set<string> {
  const ids = new Set<string>();
  const walk = (node: MindmapNode) => {
    if (node.children.length > 0) ids.add(node.id);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return ids;
}

/** Only the root open: the shallowest view that is still a map. */
export function topExpanded(root: MindmapNode): Set<string> {
  return new Set([root.id]);
}

/** Every node's labels from the root down to it, by id, so a picked leaf can say where it sits. */
export function labelPaths(root: MindmapNode): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  const walk = (node: MindmapNode, trail: readonly string[]) => {
    const path = [...trail, node.label];
    paths.set(node.id, path);
    for (const child of node.children) walk(child, path);
  };
  walk(root, []);
  return paths;
}
