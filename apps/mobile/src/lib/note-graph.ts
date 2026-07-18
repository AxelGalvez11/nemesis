// Pure logic for the phone's Graph page: build a knowledge graph from the synced
// library notes ([[wikilink]] mentions become edges) and lay it out with a small
// deterministic force simulation. Dependency-free by design — no react-native, no
// supabase — so note-graph.test.ts loads clean under Deno (repo convention, same
// split as library-sync.ts / missions-helpers.ts).
//
// Everything here is deterministic on its inputs (seeded by content hashes, never
// Math.random), so the same library always draws the same map and tests can assert
// exact outputs.

/** The slice of a decrypted library doc the graph needs. */
export interface NoteRef {
  pathHash: string;
  path: string;
  title: string;
  content: string;
}

export interface GraphNode {
  pathHash: string;
  title: string;
  /** Top-level folder ("" for vault root) — the course grouping, roughly. */
  folder: string;
  /** Number of distinct connections; drives node size and hub highlighting. */
  degree: number;
  x: number;
  y: number;
}

/** Edge as a pair of node indices, a < b, deduplicated. */
export interface GraphEdge {
  a: number;
  b: number;
}

export interface NoteGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const WIKILINK_RE = /\[\[([^\[\]]+)\]\]/g;

/** Every wikilink target in a markdown body, in order of appearance.
 * `[[Target|label]]` → "Target"; `[[Target#heading]]` → "Target". */
export function extractWikilinks(markdown: string): string[] {
  const out: string[] = [];
  for (const match of markdown.matchAll(WIKILINK_RE)) {
    const target = match[1].split("|")[0].split("#")[0].trim();
    if (target) out.push(target);
  }
  return out;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Last path segment without its .md extension — how Obsidian-style links resolve. */
function basenameNoExt(path: string): string {
  const segments = path.split("/");
  const last = segments[segments.length - 1] ?? "";
  return last.replace(/\.md$/i, "");
}

function topFolder(path: string): string {
  const idx = path.indexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Build nodes + deduplicated edges from decrypted notes. Link targets resolve by
 * full path (minus .md), then file basename, then note title — first match wins;
 * unresolved links and self-links are dropped. Input order does not matter: docs
 * are sorted by path first so the graph (and the layout seeded from it) is stable. */
export function buildNoteGraph(docs: NoteRef[]): NoteGraph {
  const sorted = [...docs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const nodes: GraphNode[] = sorted.map((doc) => ({
    pathHash: doc.pathHash,
    title: doc.title || basenameNoExt(doc.path) || doc.path,
    folder: topFolder(doc.path),
    degree: 0,
    x: 0,
    y: 0,
  }));

  // Resolution maps; earlier (path-sorted) docs win ties so duplicates are stable.
  const byPath = new Map<string, number>();
  const byBasename = new Map<string, number>();
  const byTitle = new Map<string, number>();
  sorted.forEach((doc, i) => {
    const pathKey = norm(doc.path.replace(/\.md$/i, ""));
    if (!byPath.has(pathKey)) byPath.set(pathKey, i);
    const baseKey = norm(basenameNoExt(doc.path));
    if (baseKey && !byBasename.has(baseKey)) byBasename.set(baseKey, i);
    const titleKey = norm(doc.title);
    if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, i);
  });

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  sorted.forEach((doc, i) => {
    for (const target of extractWikilinks(doc.content)) {
      const key = norm(target.replace(/\.md$/i, ""));
      const j = byPath.get(key) ?? byBasename.get(key) ?? byTitle.get(key);
      if (j === undefined || j === i) continue;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const edgeKey = `${a}:${b}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      edges.push({ a, b });
    }
  });

  for (const edge of edges) {
    nodes[edge.a] = { ...nodes[edge.a], degree: nodes[edge.a].degree + 1 };
    nodes[edge.b] = { ...nodes[edge.b], degree: nodes[edge.b].degree + 1 };
  }

  return { edges, nodes };
}

/** Small deterministic string hash (djb2) for layout seeding. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Keep-out margin so nodes (and their labels) stay on screen. */
  padding?: number;
  iterations?: number;
  /** Node-vs-node repulsion multiplier. 1 (default, omitted) reproduces the
   * original tuned spacing exactly; 0 lets nodes overlap freely, higher values
   * push the constellation apart. Fed by the phone Graph screen's Repulsion
   * slider. */
  repulsion?: number;
  /** Pull-to-center multiplier. 1 (default, omitted) reproduces the original
   * gentle centering exactly; 0 lets clusters drift wherever the other forces
   * settle, higher values clump everything tighter to the canvas center. Fed
   * by the Gravity slider. */
  gravity?: number;
}

/** A running force simulation the caller steps by hand — the animated twin of
 * layoutNoteGraph's one-shot call. Seeds positions once (same golden-angle
 * spiral, same content-hash jitter, so it starts identically to the static
 * layout), then each step() applies one iteration of repulsion + edge springs
 * + gravity and advances a cooling schedule. Call snapshot() after step(s) to
 * read positions for rendering — e.g. the phone Graph screen's settle
 * animation. */
export interface LayoutSim {
  /** Run one force-update iteration. No-op once settled. */
  step(): void;
  /** Current positions, normalized and clamped into the canvas — a fresh
   * NoteGraph every call (never mutates previous snapshots), safe to hand
   * straight to React state. */
  snapshot(): NoteGraph;
  /** True once the cooling schedule has run its course and step() is a no-op. */
  readonly settled: boolean;
  /** Live force multipliers step() reads on its next call — mutate directly
   * (e.g. from a slider) to steer the sim without losing its current
   * positions or restarting from the spiral. */
  gravity: number;
  repulsion: number;
  /** Re-energize an already-cooling (or settled) sim in place: rewinds the
   * cooling clock by a fixed burst so a new gravity/repulsion value is
   * visibly felt, without reseeding positions (no jump back to the spiral —
   * same idea as d3-force's alpha reheat). Bounded by a lifetime step
   * ceiling, so a finger stuck dragging a slider can never keep the
   * simulation running forever. */
  reheat(): void;
}

const GOLDEN_ANGLE = 2.399963229728653;

/** Normalize simulated positions into the canvas: scale the extent to fit
 * (never upscale), then clamp. Shared by createLayoutSim's snapshot() and
 * layoutNoteGraph's return so both paths produce byte-identical output. */
function snapshotPositions(
  graph: NoteGraph,
  xs: Float64Array,
  ys: Float64Array,
  width: number,
  height: number,
  padding: number,
): NoteGraph {
  const n = xs.length;
  if (n === 0) return { edges: [...graph.edges], nodes: [] };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 1);
  const cx = width / 2;
  const cy = height / 2;
  const offX = cx - ((minX + maxX) / 2) * scale;
  const offY = cy - ((minY + maxY) / 2) * scale;

  const nodes = graph.nodes.map((node, i) => ({
    ...node,
    x: Math.min(width - padding, Math.max(padding, xs[i] * scale + offX)),
    y: Math.min(height - padding, Math.max(padding, ys[i] * scale + offY)),
  }));
  return { edges: [...graph.edges], nodes };
}

/** Create a steppable force simulation for graph — see LayoutSim. Used
 * directly by the animated phone Graph screen; layoutNoteGraph (below) is a
 * thin run-to-completion wrapper over the same engine for callers (and
 * tests) that just want the final, settled positions. */
export function createLayoutSim(graph: NoteGraph, opts: LayoutOptions): LayoutSim {
  const { width, height } = opts;
  const padding = opts.padding ?? 28;
  const n = graph.nodes.length;
  const totalIterations = opts.iterations ?? (n > 150 ? 90 : 180);
  // Lifetime cap on how many step()s a sim can ever run, across every reheat.
  // Keeps a slider drag from being able to run the simulation indefinitely.
  const hardStepCeiling = Math.max(totalIterations, totalIterations * 8);

  const cx = width / 2;
  const cy = height / 2;
  const span = Math.max(40, Math.min(width, height) / 2 - padding);

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  graph.nodes.forEach((node, i) => {
    const jitter = (hashString(node.pathHash) % 997) / 997 - 0.5;
    const r = span * Math.sqrt((i + 0.6) / n);
    const theta = i * GOLDEN_ANGLE + jitter * 0.9;
    xs[i] = cx + r * Math.cos(theta);
    ys[i] = cy + r * Math.sin(theta);
  });

  // Rest length scales with density so sparse graphs spread and dense ones pack.
  const rest = Math.max(34, (Math.min(width, height) / Math.sqrt(n + 1)) * 0.9);
  const baseRepulsion = rest * rest;

  // Cooling-schedule position/ceiling — reheat() can rewind/extend these.
  let it = 0;
  let iterationsBudget = totalIterations;
  // Monotonic lifetime step counter — the true runaway guard; reheat() never
  // moves this backwards, only step() advances it.
  let totalStepsRun = 0;

  const sim: LayoutSim = {
    gravity: opts.gravity ?? 1,
    repulsion: opts.repulsion ?? 1,

    get settled(): boolean {
      return n === 0 || it >= iterationsBudget;
    },

    step() {
      if (n === 0 || it >= iterationsBudget) return;
      const cool = 1 - it / iterationsBudget;
      const step = 0.085 * cool + 0.01;

      const fx = new Float64Array(n);
      const fy = new Float64Array(n);
      const repulsion = baseRepulsion * Math.max(0, sim.repulsion);

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = xs[i] - xs[j];
          let dy = ys[i] - ys[j];
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            // Coincident points get a deterministic nudge so forces can separate them.
            dx = ((i * 7919 + j) % 13) - 6;
            dy = ((j * 104729 + i) % 11) - 5;
            d2 = dx * dx + dy * dy;
          }
          const f = repulsion / d2;
          const d = Math.sqrt(d2);
          const ux = dx / d;
          const uy = dy / d;
          fx[i] += ux * f;
          fy[i] += uy * f;
          fx[j] -= ux * f;
          fy[j] -= uy * f;
        }
      }

      for (const { a, b } of graph.edges) {
        const dx = xs[b] - xs[a];
        const dy = ys[b] - ys[a];
        const d = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
        const f = (d - rest) * 0.06;
        const ux = dx / d;
        const uy = dy / d;
        fx[a] += ux * f;
        fy[a] += uy * f;
        fx[b] -= ux * f;
        fy[b] -= uy * f;
      }

      const gravity = Math.max(0, sim.gravity) * 0.02;
      for (let i = 0; i < n; i++) {
        // Gentle gravity keeps disconnected clusters from drifting off-canvas.
        fx[i] += (cx - xs[i]) * gravity;
        fy[i] += (cy - ys[i]) * gravity;
        // Cap each step's movement: forces stay bounded, positions can never
        // overflow to Infinity/NaN however dense the graph gets.
        let mx = fx[i] * step;
        let my = fy[i] * step;
        const mag = Math.sqrt(mx * mx + my * my);
        const cap = 24 * cool + 1.5;
        if (mag > cap) {
          mx = (mx / mag) * cap;
          my = (my / mag) * cap;
        }
        xs[i] += mx;
        ys[i] += my;
      }

      it++;
      totalStepsRun++;
    },

    snapshot(): NoteGraph {
      return snapshotPositions(graph, xs, ys, width, height, padding);
    },

    reheat() {
      if (totalStepsRun >= hardStepCeiling) return; // guard against runaway
      const kick = Math.max(1, Math.round(totalIterations * 0.35));
      it = Math.max(0, it - kick);
      iterationsBudget = it + kick;
    },
  };
  return sim;
}

/** Deterministic force-directed layout. Returns a NEW graph with positioned node
 * copies — inputs are never mutated. Seeds on a golden-angle spiral (jittered by
 * each note's content hash), then relaxes with repulsion + edge springs + a pull
 * to center. O(n²) per iteration, sized for phone libraries (≤ a few hundred
 * notes). Runs createLayoutSim to completion in one call; for an animated,
 * live-steppable version (the phone Graph screen's settle animation + the
 * Gravity/Repulsion sliders), use createLayoutSim directly. */
export function layoutNoteGraph(graph: NoteGraph, opts: LayoutOptions): NoteGraph {
  const sim = createLayoutSim(graph, opts);
  while (!sim.settled) sim.step();
  return sim.snapshot();
}
