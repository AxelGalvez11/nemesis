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
