// The learner's knowledge as a map: regions, nodes, and where each one sits.
//
// 🔴🔴 WHAT PUTS A NODE ON THIS MAP, AND WHAT NEVER DOES (owner ruling, 2026-09-03).
//
//   *"i dont think just dropping documents grows the graph, deepseek should update it gradually
//    and continually as user knowledge grows."*
//
// So: **uploading a document adds NOTHING here.** `knowledge_objects` and `learning_objectives`
// extracted from a learner's files are MATERIAL, not map. A map grown from uploads would be a
// picture of somebody's filesystem, claiming territory on the strength of a file existing — the
// same error as counting figures nobody read. Two things may add a node, and only two:
//
//   1. STARTING A COURSE. An explicit, deliberate act: the learner chose this outline, so its
//      sections become territory immediately, every one of them unshown.
//   2. DEMONSTRATING SOMETHING. Evidence lands, and the model names what was shown.
//
// 🔴 CONTENT MAY CHANGE, POSITIONS MAY NOT. The model is expected to revise the map continually —
// naming regions, adding nodes, linking what connects. That is in direct tension with a map being
// memorable, and `placeNodes` resolves it: a node's coordinates are a pure function of its own id
// and its INDEX WITHIN ITS REGION, so appending never moves what is already placed. A map that
// rearranges itself cannot be learned, and an unlearnable map is decoration.
//
// PURE. No React, no I/O, no clock. Every position is reproducible on any machine.

export type NodeState = "solid" | "developing" | "unshown" | "unreadable";

export interface KnowledgeNode {
  readonly id: string;
  readonly label: string;
  readonly region: string;
  /** How much sits under this node — drives its radius, never its position. */
  readonly weight: number;
  readonly state: NodeState;
  /** What the learner can and cannot yet do here, for the detail card. */
  readonly can: readonly string[];
  readonly needs: readonly string[];
}

export interface PlacedNode extends KnowledgeNode {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface PlacedRegion {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly nodes: readonly PlacedNode[];
}

export interface Layout {
  readonly regions: readonly PlacedRegion[];
  readonly width: number;
  readonly height: number;
}

/** Stable small integer from a string — the same on every machine and every reload. */
export function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const GOLDEN = 2.399963229728653; // radians; the angle that spaces points most evenly on a spiral

/** Node radius from weight, clamped so one huge region cannot swallow its neighbours. */
export function radiusFor(weight: number): number {
  return Math.max(8, Math.min(20, 8 + Math.sqrt(Math.max(weight, 1)) * 2.4));
}

/**
 * Place one region's nodes on a phyllotactic spiral around its centre.
 *
 * 🔴 THE INDEX IS THE POSITION, WHICH IS THE WHOLE STABILITY GUARANTEE. Node `i` always lands at
 * the same angle and radius, so adding node `n+1` cannot disturb nodes `0..n`. The seed only
 * rotates the whole spiral, so two regions do not look like copies of each other.
 */
export function placeNodes(nodes: readonly KnowledgeNode[], cx: number, cy: number, region: string): PlacedNode[] {
  const rotation = (seedOf(region) % 360) * (Math.PI / 180);
  return nodes.map((node, i) => {
    const angle = rotation + i * GOLDEN;
    const spread = 26 + Math.sqrt(i) * 34;
    return {
      ...node,
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread * 0.78,
      r: radiusFor(node.weight),
    };
  });
}

/**
 * Lay every region out on a wide spiral of its own, biggest first.
 *
 * Regions are ordered by size rather than alphabetically so the map has a centre of gravity: what
 * the learner has most of sits in the middle, and thin new regions appear at the edge instead of
 * shoving the middle sideways.
 */
/** How far a region's own nodes reach from its centre, so neighbours can be kept clear of it. */
function reachOf(count: number): number {
  return 26 + Math.sqrt(Math.max(count - 1, 0)) * 34 + 22;
}

/**
 * Lay every region out, biggest first, on rings that widen as they fill.
 *
 * 🔴 A SPIRAL WAS THE FIRST ATTEMPT AND IT PACKED THE REGIONS INTO EACH OTHER. Measured on screen
 * with five regions: three of them overlapped on the right of the canvas and two labels landed on
 * top of a neighbour's nodes, while the bottom third of the map sat empty. The fix is not a bigger
 * constant — it is placing regions on RINGS whose radius is computed from what actually has to fit
 * on them, so adding a sixth region widens its ring instead of wedging it between two others.
 *
 * 🔴 STILL DETERMINISTIC, AND STILL APPEND-STABLE WITHIN A RING. Ring membership is by index, and
 * a region's angle is its position within its ring, so the map only reshuffles when a region is
 * added — never on a reload, and never because a node was demonstrated.
 */
export function layout(nodes: readonly KnowledgeNode[], width = 1180, height = 900): Layout {
  const byRegion = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    const list = byRegion.get(node.region);
    if (list) list.push(node);
    else byRegion.set(node.region, [node]);
  }
  const ordered = [...byRegion.entries()].sort((a, b) =>
    b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  if (ordered.length === 0) return { regions: [], width, height };

  const cx = width / 2;
  const cy = height / 2;

  // Ring 0 holds the largest region alone; each further ring takes as many as fit around it.
  const rings: Array<Array<[string, KnowledgeNode[]]>> = [[ordered[0]!]];
  let ring: Array<[string, KnowledgeNode[]]> = [];
  const perRing = (index: number) => (index === 1 ? 5 : 7);
  for (const entry of ordered.slice(1)) {
    ring.push(entry);
    if (ring.length >= perRing(rings.length)) {
      rings.push(ring);
      ring = [];
    }
  }
  if (ring.length) rings.push(ring);

  const centreReach = reachOf(ordered[0]![1].length);
  const regions: PlacedRegion[] = [];

  rings.forEach((members, ringIndex) => {
    // Widest thing on this ring, plus the widest thing on the ring inside it, decides the radius.
    const widest = Math.max(...members.map(([, g]) => reachOf(g.length)));
    const inner = ringIndex === 0 ? 0 : centreReach + widest + 78 + (ringIndex - 1) * 250;
    members.forEach(([name, group], i) => {
      const angle = ringIndex === 0 ? 0 : (i / members.length) * Math.PI * 2 - Math.PI / 2;
      const reach = reachOf(group.length);
      // 0.66 keeps the ring an ellipse, because the canvas is wider than it is tall.
      const gx = Math.max(reach + 30, Math.min(width - reach - 30, cx + Math.cos(angle) * inner));
      const gy = Math.max(reach + 74, Math.min(height - reach - 66, cy + Math.sin(angle) * inner * 0.66));
      regions.push({
        name,
        x: gx,
        y: gy,
        rx: reach,
        ry: reach * 0.8,
        nodes: placeNodes(group, gx, gy, name),
      });
    });
  });

  return { regions, width, height };
}

/**
 * Where a region's name goes: clear of its own lowest node, never at a fixed offset.
 *
 * A fixed offset is what put three labels on top of other regions' nodes.
 */
export function labelYFor(region: PlacedRegion): number {
  const lowest = region.nodes.reduce((max, n) => Math.max(max, n.y + n.r), region.y);
  return lowest + 26;
}

/**
 * How a region reads at a glance: the states of its nodes, most-held first.
 *
 * 🔴 NO PERCENTAGE, NO SCORE, NO COUNT OF WHAT IS MISSING — owner's own rules for this surface
 * (`docs/minimap-knowledge-territory.md`: "No XP, no streaks, no hearts, no large percentages").
 * A row of marks says how a region is going without ever printing a number at somebody.
 */
export function regionMarks(region: PlacedRegion): NodeState[] {
  const order: NodeState[] = ["solid", "developing", "unshown", "unreadable"];
  const counts = new Map<NodeState, number>();
  for (const node of region.nodes) counts.set(node.state, (counts.get(node.state) ?? 0) + 1);
  const marks: NodeState[] = [];
  for (const state of order) {
    for (let i = 0; i < Math.min(counts.get(state) ?? 0, 4); i += 1) marks.push(state);
  }
  return marks.slice(0, 6);
}

/** Does this map have anything on it yet? */
export function isEmpty(nodes: readonly KnowledgeNode[]): boolean {
  return nodes.length === 0;
}

/** Has the learner actually shown anything, or is it all territory they have not touched? */
export function hasDemonstrations(nodes: readonly KnowledgeNode[]): boolean {
  return nodes.some((n) => n.state === "solid" || n.state === "developing");
}
