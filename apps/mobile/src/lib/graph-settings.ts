// Pure Graph-screen settings/labels logic (graph.tsx, GraphNodeView.tsx).
// Dependency-free, like note-graph.ts, so this Deno-tests. (The 2D/3D mode
// choice and its store key were removed with 3D mode itself, owner ask
// 2026-07-21 — git history has them.)

export type LabelMode = "all" | "hubs" | "none";
export const LABEL_MODES: { id: LabelMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hubs", label: "Hubs" },
  { id: "none", label: "None" },
];
export const DEFAULT_LABEL_MODE: LabelMode = "hubs";

export interface GraphForces {
  gravity: number;
  repulsion: number;
  nodeSize: number;
  linkDistance: number;
  labelMode: LabelMode;
}

export const DEFAULT_FORCES: GraphForces = {
  gravity: 1,
  labelMode: DEFAULT_LABEL_MODE,
  linkDistance: 1,
  nodeSize: 1,
  repulsion: 1,
};

/** The label-visibility rule (GraphNodeView): small graphs (<=40 nodes)
 * always show every label even in "hubs" mode; larger graphs only label
 * nodes with 2+ connections. "all"/"none" bypass the node-count check
 * entirely. */
export function shouldShowLabel(mode: LabelMode, node: { degree: number }, smallGraphAllLabels: boolean): boolean {
  if (mode === "all") return true;
  if (mode === "none") return false;
  return smallGraphAllLabels || node.degree >= 2;
}

export function isSmallGraph(nodeCount: number): boolean {
  return nodeCount <= 40;
}

/** Node radius, grown by how many notes reference it — Obsidian's defining
 *  rule ("the more nodes that reference a given node, the bigger it gets").
 *  Ported from web's graph-canvas-2d.ts nodeRadiusFor (PR #254), where the
 *  same fix landed: every circle used to draw the same size and a hub was
 *  marked only by a glow halo, which is the loudest tell that a graph ISN'T
 *  Obsidian — Obsidian is flat and sizes by degree.
 *
 *  sqrt on purpose: linear scaling lets one hub in a big vault swallow the
 *  screen. `multiplier` is the Node size slider. */
export function nodeRadiusFor(degree: number, maxDegree: number, multiplier: number): number {
  const base = 2.6 * multiplier;
  if (maxDegree <= 0) return base;
  const share = Math.min(1, Math.max(0, degree) / maxDegree);
  return base * (0.72 + 1.15 * Math.sqrt(share));
}

/** The zoom that fits `content` inside `viewport`, with a margin, clamped to
 *  the screen's pinch range. Returns 1 when either box is unmeasured — the
 *  phone graph had NO fit at all (scale pinned to 1), so a layout that spread
 *  past the canvas simply ran off screen with no hint that anything was there.
 *
 *  Web hit a neighbouring bug where the first fit ran at a 0x0 host and was
 *  never retried; guarding on a zero viewport here is what keeps the caller
 *  from baking in a nonsense scale on the first frame. */
export function fitScaleFor(
  content: { width: number; height: number },
  viewport: { width: number; height: number },
  minScale: number,
  maxScale: number,
  margin = 0.86,
): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  if (content.width <= 0 || content.height <= 0) return 1;
  const raw = Math.min(viewport.width / content.width, viewport.height / content.height) * margin;
  return Math.min(maxScale, Math.max(minScale, raw));
}

// Phone-sane node cap — see graph.tsx's top-of-file comment. The web Graph
// has no cap of its own (graph-notes.ts/graph-canvas*.tsx never truncate),
// so this is a phone-only addition, not a reconciliation to web behavior.
export const MAX_GRAPH_NOTES = 200;

/** Deterministically keep the graph phone-sized: sorts by `path` (the same
 * stable order note-graph.ts's buildNoteGraph itself sorts by) then keeps
 * the first `max` — so which notes get shown is stable across a background
 * refresh that reorders the input, not "whatever page happened to load
 * first". A no-op copy when already at/under the cap. */
export function capGraphNotes<T extends { path: string }>(notes: readonly T[], max: number = MAX_GRAPH_NOTES): T[] {
  if (notes.length <= max) return [...notes];
  return [...notes].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).slice(0, max);
}
