// Pure Graph-screen settings/labels logic shared by the 2D and 3D render
// paths (graph.tsx, GraphNodeView.tsx, GraphScene3D.tsx). Dependency-free,
// like note-graph.ts, so this Deno-tests. Persisting the 2D/3D mode choice
// itself lives in graph.tsx directly (expo-secure-store, the same idiom
// theme/ThemeProvider.tsx uses for its own appearance preference) rather
// than here, since expo-secure-store is a native module Deno can't load.

export type GraphMode = "2d" | "3d";
export const DEFAULT_GRAPH_MODE: GraphMode = "2d";
// Bumped ("_v1") the way theme/ThemeProvider.tsx's APPEARANCE_STORE and
// note-graph's other siblings version their stored shapes, in case the
// persisted value's shape ever needs to change later.
export const GRAPH_MODE_STORE_KEY = "nemesis_graph_mode_v1";

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
  /** 3D-only (auto-orbit strength when no finger is on the canvas) — see
   * GraphSettingsPanel.tsx. Harmless to carry in 2D mode; nothing reads it. */
  rotationSpeed: number;
  labelMode: LabelMode;
}

export const DEFAULT_FORCES: GraphForces = {
  gravity: 1,
  labelMode: DEFAULT_LABEL_MODE,
  linkDistance: 1,
  nodeSize: 1,
  repulsion: 1,
  rotationSpeed: 0,
};

/** The label-visibility rule shared by 2D (GraphNodeView) and 3D
 * (GraphScene3D): small graphs (<=40 nodes) always show every label even in
 * "hubs" mode; larger graphs only label nodes with 2+ connections. "all"/
 * "none" bypass the node-count check entirely. Originally graph.tsx's
 * private shouldShowLabel; hoisted here once GraphScene3D needed the exact
 * same rule too. */
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
