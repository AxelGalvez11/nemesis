// Pure helpers for the WebGL mount (graph-canvas.tsx): styling constants,
// adjacency precompute, per-frame node/link accessors, and the always-on
// label-sprite factory. Split out so graph-canvas.tsx stays focused on the
// mount/lifecycle effect. Constants verbatim from desktop graph/index.tsx §B.3.

import type { LinkObject } from "3d-force-graph";
import type SpriteText from "three-spritetext";

import type { GraphControlsState } from "./graph-settings";
import type { GraphIndex, GraphNode } from "./graph-notes";
import { dimColor, graphNodeColor, type GraphPalette } from "./graph-palette";

export const LABEL_MAX_CHARS = 24;
export const LABEL_OFFSET_SCALE = 1.2;
export const LABEL_CONTROL_SCALE = 3.3;
export const NODE_CONTROL_SCALE = 2.7;
export const DEFAULT_LINK_WIDTH = 0.5;
export const HIGHLIGHT_LINK_WIDTH = 2.5;
export const HIGHLIGHT_LINK_PARTICLES = 3;
export const HIGHLIGHT_LINK_PARTICLE_WIDTH = 2.2;
export const DIM_MIX_RATIO = 0.88;
export const NODE_OPACITY = 0.9;
export const LINK_OPACITY = 0.55;
export const REVEAL_MS = 1600;
export const IDLE_PAUSE_MS = 700;
export const CAMERA_FIT_MS = 600;
export const CAMERA_FIT_PADDING = 45;
export const ENGINE_STOP_FALLBACK_MS = 2000;

export type EngineNode = GraphNode & { x?: number; y?: number; z?: number };
export type EngineLink = LinkObject<EngineNode>;
export type Adjacency = Map<string, Set<string>>;

// `SpriteText` is imported type-only (the canvas mount only ever holds the
// class from a dynamic `import()`), so we can't `typeof` it for a constructor
// type — spell the constructor signature out instead.
export type SpriteTextConstructor = new (text?: string, textHeight?: number, color?: string) => SpriteText;

function resolveId(ref: string | number | EngineNode | undefined): string {
  if (ref === undefined) return "";
  if (typeof ref === "object") return ref.id;
  return String(ref);
}

export function buildAdjacency(index: GraphIndex): Adjacency {
  const adjacency: Adjacency = new Map();
  for (const node of index.nodes) adjacency.set(node.id, new Set());
  for (const link of index.links) {
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  }
  return adjacency;
}

function isActiveOrNeighbor(id: string, activeId: string | null, adjacency: Adjacency): boolean {
  if (!activeId) return true;
  if (id === activeId) return true;
  return adjacency.get(activeId)?.has(id) ?? false;
}

export function colorForNode(
  node: EngineNode,
  activeId: string | null,
  adjacency: Adjacency,
  palette: GraphPalette,
  maxDegree: number,
): string {
  const base = node.ghost ? palette.ghost : graphNodeColor(node, palette, maxDegree);
  if (!activeId) return base;
  return isActiveOrNeighbor(node.id, activeId, adjacency) ? palette.accent : dimColor(base, palette.background, DIM_MIX_RATIO);
}

function linkIsActive(link: EngineLink, activeId: string | null): boolean {
  if (!activeId) return false;
  const source = resolveId(link.source);
  const target = resolveId(link.target);
  return source === activeId || target === activeId;
}

export function colorForLink(link: EngineLink, activeId: string | null, palette: GraphPalette): string {
  if (linkIsActive(link, activeId)) return palette.accent;
  if (!activeId) return palette.link;
  return dimColor(palette.link, palette.background, DIM_MIX_RATIO);
}

export function widthForLink(link: EngineLink, activeId: string | null): number {
  return linkIsActive(link, activeId) ? HIGHLIGHT_LINK_WIDTH : DEFAULT_LINK_WIDTH;
}

export function particlesForLink(link: EngineLink, activeId: string | null): number {
  return linkIsActive(link, activeId) ? HIGHLIGHT_LINK_PARTICLES : 0;
}

function truncateLabel(title: string): string {
  return title.length > LABEL_MAX_CHARS ? `${title.slice(0, LABEL_MAX_CHARS - 1)}…` : title;
}

// This `three` install ships no type declarations, so classes that extend
// three's Object3D (like SpriteText) lose their inherited members — visible,
// position — to an untyped base from TS's perspective. Patch the two we need.
type Object3DLike = { visible: boolean; position: { set: (x: number, y: number, z: number) => void } };

/** Always-on node-name sprite (three-spritetext) — every node carries one,
 * not just on hover. Sized/offset per the live controls. */
export function makeLabelSprite(
  node: EngineNode,
  SpriteTextCtor: SpriteTextConstructor,
  palette: GraphPalette,
  controls: GraphControlsState,
): SpriteText {
  const sprite = new SpriteTextCtor(truncateLabel(node.title), controls.labelSize * LABEL_CONTROL_SCALE, palette.label);
  const object3d = sprite as unknown as Object3DLike;
  object3d.visible = controls.showNames;
  const radius = controls.nodeSize * NODE_CONTROL_SCALE;
  object3d.position.set(0, radius * LABEL_OFFSET_SCALE, 0);
  return sprite;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
