// The learner's knowledge as a map: nodes, the links between them, and where each one sits.
//
// 🔴🔴 WHAT PUTS A NODE ON THIS MAP, AND WHAT NEVER DOES (owner ruling, 2026-09-03).
//
//   *"i dont think just dropping documents grows the graph, deepseek should update it gradually
//    and continually as user knowledge grows."*
//
// So: **uploading a document adds NOTHING here.** `knowledge_objects` and `learning_objectives`
// extracted from a learner's files are MATERIAL, not map. A map grown from uploads would be a
// picture of somebody's filesystem, claiming territory on the strength of a file existing. Two
// things may add a node, and only two: starting a course (an explicit act) and demonstrating
// something (evidence).
//
// 🔴 THERE IS NO "COULD NOT READ THE SOURCE" STATE, AND ITS ABSENCE FOLLOWS FROM THE RULING ABOVE
// (owner, 2026-09-04). An earlier draft carried a fourth mark for a document Nemesis failed to
// parse, taken from `docs/minimap-knowledge-territory.md`, which reasons about a map built from a
// learner's sources. Once uploads stopped creating nodes, a parse failure had nothing to attach to:
// there is no node for an unread document, so there is nothing to mark. Three states, and each one
// is a fact about the learner rather than about our pipeline.
//
// 🔴 CONTENT MAY CHANGE, POSITIONS MAY NOT. The model revises this map continually. A map that
// rearranges itself cannot be learned, and an unlearnable map is decoration. `layout` therefore runs
// a FIXED number of force iterations from a SEEDED start with no randomness anywhere, so the same
// set of nodes always lands in the same arrangement — on any machine, after any reload.
//
// PURE. No React, no I/O, no clock.

export type NodeState = "solid" | "developing" | "unshown";

export interface KnowledgeNode {
  readonly id: string;
  readonly label: string;
  readonly region: string;
  /** How much sits under this node — drives its radius, never its position. */
  readonly weight: number;
  readonly state: NodeState;
  readonly can: readonly string[];
  readonly needs: readonly string[];
}

export interface KnowledgeEdge {
  readonly a: string;
  readonly b: string;
}

export interface PlacedNode extends KnowledgeNode {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** How many links it has. Obsidian sizes by this; so do we. */
  readonly degree: number;
}

export interface Layout {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly KnowledgeEdge[];
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

/**
 * What connects to what.
 *
 * 🔴 A CHAIN, NOT A STAR. Linking every node in a region to a hub draws a dandelion: it says only
 * "these belong together", which the labels already say. Consecutive sections genuinely follow one
 * another — 1.1 leads to 1.2 — so chaining them is a real relationship, and it is what makes the
 * graph look like a graph rather than a scatter of asterisks. Regions are then joined end to end,
 * so the whole map is one connected body a learner can trace through.
 */
export function edgesFor(nodes: readonly KnowledgeNode[]): KnowledgeEdge[] {
  const byRegion = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    const list = byRegion.get(node.region);
    if (list) list.push(node);
    else byRegion.set(node.region, [node]);
  }
  const edges: KnowledgeEdge[] = [];
  const regionNames = [...byRegion.keys()].sort();
  let previousTail: string | null = null;
  for (const name of regionNames) {
    const group = byRegion.get(name)!;
    for (let i = 1; i < group.length; i += 1) {
      edges.push({ a: group[i - 1]!.id, b: group[i]!.id });
    }
    // Fan the first three back to the region's opening node, so a long chain still reads as a body.
    for (let i = 2; i < Math.min(group.length, 5); i += 1) {
      edges.push({ a: group[0]!.id, b: group[i]!.id });
    }
    if (previousTail && group[0]) edges.push({ a: previousTail, b: group[0].id });
    previousTail = group[group.length - 1]?.id ?? previousTail;
  }
  return edges;
}

/** Node radius from weight and how connected it is. Obsidian's rule, near enough. */
export function radiusFor(weight: number, degree: number): number {
  return Math.max(6, Math.min(22, 5 + Math.sqrt(Math.max(weight, 1)) * 1.9 + degree * 0.9));
}

/** A deterministic [0,1) sequence. No Math.random anywhere in this file. */
function seededRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

const ITERATIONS = 260;

/**
 * A force-directed layout that always produces the same picture.
 *
 * Every source of variation is removed: the starting positions come from a seeded generator, the
 * iteration count is fixed, and there is no time step tied to a clock or a frame rate. Run it twice
 * and the coordinates are identical to the last decimal.
 */
export function layout(
  nodes: readonly KnowledgeNode[],
  width = 1600,
  height = 1100,
): Layout {
  if (nodes.length === 0) return { nodes: [], edges: [], width, height };

  const edges = edgesFor(nodes);
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }

  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const random = seededRandom(seedOf(nodes.map((n) => n.id).join("|")));
  const cx = width / 2;
  const cy = height / 2;

  // Seeded start: regions begin apart from each other so the simulation has a sensible basin.
  const regionAngle = new Map<string, number>();
  const regions = [...new Set(nodes.map((n) => n.region))].sort();
  regions.forEach((name, i) => regionAngle.set(name, (i / regions.length) * Math.PI * 2));

  const xs = new Float64Array(nodes.length);
  const ys = new Float64Array(nodes.length);
  nodes.forEach((node, i) => {
    const angle = (regionAngle.get(node.region) ?? 0) + (random() - 0.5) * 0.9;
    const distance = 120 + random() * 240;
    xs[i] = cx + Math.cos(angle) * distance;
    ys[i] = cy + Math.sin(angle) * distance;
  });

  const spring = 0.012;
  const rest = 74;
  const repel = 5200;

  for (let step = 0; step < ITERATIONS; step += 1) {
    const cooling = 1 - step / ITERATIONS;
    // repulsion, every pair
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        let dx = xs[i]! - xs[j]!;
        let dy = ys[i]! - ys[j]!;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (i - j) * 0.1 + 0.1;
          dy = 0.1;
          d2 = dx * dx + dy * dy;
        }
        const force = repel / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        xs[i]! += fx * cooling;
        ys[i]! += fy * cooling;
        xs[j]! -= fx * cooling;
        ys[j]! -= fy * cooling;
      }
    }
    // springs along the links
    for (const edge of edges) {
      const i = index.get(edge.a);
      const j = index.get(edge.b);
      if (i === undefined || j === undefined) continue;
      const dx = xs[j]! - xs[i]!;
      const dy = ys[j]! - ys[i]!;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = (d - rest) * spring;
      const fx = (dx / d) * pull;
      const fy = (dy / d) * pull;
      xs[i]! += fx;
      ys[i]! += fy;
      xs[j]! -= fx;
      ys[j]! -= fy;
    }
    // a gentle pull to the middle, so nothing drifts off on its own
    for (let i = 0; i < nodes.length; i += 1) {
      xs[i]! += (cx - xs[i]!) * 0.0016;
      ys[i]! += (cy - ys[i]!) * 0.0016;
    }
  }

  // 🔴 ROUNDED, AND NOT FOR TIDINESS. React hydration compares the server's rendered attributes to
  // the client's, and 260 iterations of floating-point accumulation land one unit-in-the-last-place
  // apart between the two runs — `967.3902155295898` against `967.3902155295897`. That is enough
  // for React to declare a mismatch and refuse to patch the tree. Two decimals is far below one
  // screen pixel at any zoom this map allows, and it makes "the same arrangement every time" true
  // across engines rather than only within one.
  const round = (v: number) => Math.round(v * 100) / 100;
  const placed = nodes.map((node, i) => {
    const deg = degree.get(node.id) ?? 0;
    return { ...node, x: round(xs[i]!), y: round(ys[i]!), r: radiusFor(node.weight, deg), degree: deg };
  });

  return { nodes: placed, edges, width, height };
}

/** The box the graph actually occupies, so the view can be fitted to it on open. */
export function boundsOf(nodes: readonly PlacedNode[]): { x: number; y: number; w: number; h: number } {
  if (nodes.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.r);
    minY = Math.min(minY, node.y - node.r);
    maxX = Math.max(maxX, node.x + node.r);
    maxY = Math.max(maxY, node.y + node.r);
  }
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

/** Everything one hop from `id`, for the hover highlight. */
export function neighboursOf(edges: readonly KnowledgeEdge[], id: string | null): Set<string> {
  const found = new Set<string>();
  if (!id) return found;
  found.add(id);
  for (const edge of edges) {
    if (edge.a === id) found.add(edge.b);
    else if (edge.b === id) found.add(edge.a);
  }
  return found;
}

/** Does this map have anything on it yet? */
export function isEmpty(nodes: readonly KnowledgeNode[]): boolean {
  return nodes.length === 0;
}

/** Has the learner actually shown anything, or is it all territory they have not touched? */
export function hasDemonstrations(nodes: readonly KnowledgeNode[]): boolean {
  return nodes.some((n) => n.state === "solid" || n.state === "developing");
}
