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
  /** Edge spring rest-length multiplier. 1 (default, omitted) reproduces the
   * original tuned rest length exactly; lower values pull linked notes closer
   * together, higher values stretch connections out. Fed by the phone Graph
   * screen's Link distance slider. */
  linkDistance?: number;
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
  /** Live edge spring rest-length multiplier — same mutate-in-place contract
   * as gravity/repulsion above. */
  linkDistance: number;
  /** Re-energize an already-cooling (or settled) sim in place: rewinds the
   * cooling clock by a fixed burst so a new gravity/repulsion value is
   * visibly felt, without reseeding positions (no jump back to the spiral —
   * same idea as d3-force's alpha reheat). Bounded by a lifetime step
   * ceiling, so a finger stuck dragging a slider can never keep the
   * simulation running forever. */
  reheat(): void;
  /** Fix node `index` at (x, y) — same coordinate space snapshot() renders
   * (canvas pixels), not the pre-normalization sim space. step()'s force
   * integration skips a pinned index (it never fights the finger), but the
   * node still exerts its usual repulsion/spring pull on every other node,
   * so unpinned neighbors keep reacting to it while the sim is ticking.
   * snapshot() echoes a pinned node's stored (x, y) straight through —
   * clamped into the canvas like any other node — instead of passing it
   * through the auto-fit scale, and excludes it from the extent that scale
   * is computed over, so dragging one node never makes the rest of the
   * graph "breathe". No-op for an out-of-range index. Pinning has no
   * opposite — once dragged, a node stays fixed until the sim is
   * recreated, same as Obsidian/d3-force's drag-to-pin feel. */
  pin(index: number, x: number, y: number): void;
  /** Marks node `index` as actively being dragged right now — call once
   * per gesture, alongside the first pin(), when a finger touches down on
   * a node. Distinct from pin()'s permanent hold: while a drag is active,
   * step() never cools toward settled (reheat()'s bounded kick is tuned
   * for a one-off slider nudge, not a multi-second drag — a real drag
   * needs the sim to stay fully energized for as long as the finger is
   * down, the same idea as d3-force's alphaTarget-while-dragging pattern),
   * and edges touching the dragged node get a temporarily stiffer pull so
   * its direct neighbors visibly follow instead of drifting almost
   * imperceptibly behind a fast-moving finger. Governed by its own
   * per-gesture step budget — separate from reheat()'s lifetime
   * hardStepCeiling — so heavy dragging in one session can never exhaust
   * the budget sliders rely on, and a single held gesture still can't spin
   * forever. No-op for an out-of-range index. */
  startDrag(index: number): void;
  /** Ends the drag started by startDrag(): stops the heat/spring boost and
   * arms the same bounded, fixed-strength settle tail reheat() gives
   * sliders, so the sim always eases back to rest afterward — still
   * governed by reheat()'s lifetime hardStepCeiling. The node itself stays
   * pinned (see pin()) exactly as before; only the drag-specific boost
   * ends. Safe to call even if no drag is active (e.g. a tap that never
   * crossed the pan gesture's minDistance) — a harmless no-op-ish reheat. */
  endDrag(): void;
}

const GOLDEN_ANGLE = 2.399963229728653;

/** Normalize simulated positions into the canvas: scale the extent to fit
 * (never upscale), then clamp. Shared by createLayoutSim's snapshot() and
 * layoutNoteGraph's return so both paths produce byte-identical output.
 *
 * Pinned indices (see LayoutSim.pin) are excluded from the extent the fit
 * scale is computed over, and skip the scale/offset transform entirely —
 * their stored (x, y) is clamped into the canvas and used as-is. With an
 * empty `pinned` map this is exactly the original unpinned behavior (every
 * node goes through the transform, extent covers every node). */
function snapshotPositions(
  graph: NoteGraph,
  xs: Float64Array,
  ys: Float64Array,
  width: number,
  height: number,
  padding: number,
  pinned: Map<number, { x: number; y: number }>,
): NoteGraph {
  const n = xs.length;
  if (n === 0) return { edges: [...graph.edges], nodes: [] };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let unpinnedCount = 0;
  for (let i = 0; i < n; i++) {
    if (pinned.has(i)) continue;
    unpinnedCount++;
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }

  // Fit scale/offset is only meaningful relative to the unpinned extent; if
  // every node is pinned there's nothing left to fit (pinned nodes below
  // bypass this entirely), so the identity transform is a safe default.
  let scale = 1;
  let offX = 0;
  let offY = 0;
  if (unpinnedCount > 0) {
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 1);
    const cx = width / 2;
    const cy = height / 2;
    offX = cx - ((minX + maxX) / 2) * scale;
    offY = cy - ((minY + maxY) / 2) * scale;
  }

  const nodes = graph.nodes.map((node, i) => {
    const p = pinned.get(i);
    if (p) {
      return {
        ...node,
        x: Math.min(width - padding, Math.max(padding, p.x)),
        y: Math.min(height - padding, Math.max(padding, p.y)),
      };
    }
    return {
      ...node,
      x: Math.min(width - padding, Math.max(padding, xs[i] * scale + offX)),
      y: Math.min(height - padding, Math.max(padding, ys[i] * scale + offY)),
    };
  });
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

  // Dragged nodes — see LayoutSim.pin. Keyed by node index, in the same
  // canvas-pixel coordinate space snapshot() renders.
  const pinned = new Map<number, { x: number; y: number }>();

  // Active-drag state — see LayoutSim.startDrag/endDrag. `dragging` is
  // distinct from `pinned` above: a node stays in `pinned` forever once
  // dragged (no opposite), but `dragging` is only true for the ONE node
  // currently under a live finger, for the duration of that one gesture.
  let dragging = false;
  let dragIndex = -1;
  // Per-GESTURE step budget, deliberately separate from totalStepsRun/
  // hardStepCeiling below (which guards reheat()'s lifetime, across every
  // slider nudge plus the initial settle). A drag ticks continuously — at
  // the phone Graph screen's TICK_MS/STEPS_PER_TICK that's roughly 100
  // step()s per second — for as long as a finger is down. If dragging spent
  // from the same lifetime budget, a few long drags in one session would
  // exhaust hardStepCeiling and silently revert to the exact "only the
  // dragged node moves" bug this exists to fix, for the rest of the sim's
  // lifetime. dragStepsRun resets every startDrag(), so it only ever bounds
  // a single gesture (tens of seconds at that tick rate) — never the sim's
  // cumulative lifetime.
  let dragStepsRun = 0;
  const dragStepCeiling = Math.max(2000, totalIterations * 30);
  // Shared kick magnitude for both reheat() (sliders) and endDrag()'s settle
  // tail below — same fixed burst either way.
  const kick = Math.max(1, Math.round(totalIterations * 0.35));
  // Edges touching the actively-dragged node get this multiplier on their
  // spring pull (see the edge-force loop below). The base 0.06 spring
  // constant is tuned for gently relaxing the initial jittered spiral, where
  // nodes already start close to their rest length — far too soft to notice
  // against the hundred-plus-pixel gaps a real finger drag opens up.
  // Empirically, ~5x is close to the ceiling of what helps: repulsion from
  // every other node in the graph pushes back on the same neighbor, so
  // returns diminish well before the multiplier gets large enough to risk
  // overshoot/oscillation against the step-size cap below.
  const DRAG_SPRING_BOOST = 5;

  const sim: LayoutSim = {
    gravity: opts.gravity ?? 1,
    repulsion: opts.repulsion ?? 1,
    linkDistance: opts.linkDistance ?? 1,

    get settled(): boolean {
      return n === 0 || (!dragging && it >= iterationsBudget);
    },

    startDrag(index: number) {
      if (index < 0 || index >= n) return;
      dragging = true;
      dragIndex = index;
      dragStepsRun = 0;
    },

    endDrag() {
      dragging = false;
      dragIndex = -1;
      // Fixed, duration-independent settle tail (cool starts at the same
      // ~0.35 a slider's reheat() gives, decaying to 0 over `kick` steps)
      // regardless of how long the drag itself ran. `it` is left untouched
      // by step() while dragging (see below), so — unlike reusing reheat()'s
      // relative rewind, which would only make sense right after a slider
      // nudge from an already-settled state — resetting to a fixed point
      // here is what keeps the release feel consistent instead of drifting
      // colder the longer a drag lasted. Still bounded by the same lifetime
      // hardStepCeiling as reheat(), since this tail runs through the normal
      // (non-dragging) step() path below.
      if (totalStepsRun < hardStepCeiling) {
        it = Math.max(0, totalIterations - kick);
        iterationsBudget = totalIterations;
      }
    },

    step() {
      if (n === 0) return;
      if (dragging) {
        if (dragStepsRun >= dragStepCeiling) return;
      } else if (it >= iterationsBudget) {
        return;
      }
      const cool = dragging ? 1 : 1 - it / iterationsBudget;
      const step = 0.085 * cool + 0.01;

      // Force pinned nodes to their dragged spot before this iteration's
      // force pass. They still push/pull neighbors below (the repulsion and
      // spring loops don't know or care which indices are pinned) — only the
      // position-update loop skips them, so they never fight the finger.
      for (const [i, p] of pinned) {
        xs[i] = p.x;
        ys[i] = p.y;
      }

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

      // Recomputed fresh every step() (not cached across calls), same as the
      // repulsion/gravity locals above — so a live linkDistance change (e.g.
      // mid-drag on the slider) is felt on the very next step(), matching
      // gravity/repulsion's live-mutable contract.
      const restLen = rest * Math.max(0, sim.linkDistance);
      for (const { a, b } of graph.edges) {
        const dx = xs[b] - xs[a];
        const dy = ys[b] - ys[a];
        const d = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
        // See DRAG_SPRING_BOOST above: only the actively-dragged node's own
        // edges get the stiffer pull, so its direct neighbors visibly follow
        // while the rest of the graph keeps relaxing at the normal gentle
        // rate — not a global stiffening just because some node, somewhere,
        // is being dragged.
        const boost = dragging && (a === dragIndex || b === dragIndex) ? DRAG_SPRING_BOOST : 1;
        const f = (d - restLen) * 0.06 * boost;
        const ux = dx / d;
        const uy = dy / d;
        fx[a] += ux * f;
        fy[a] += uy * f;
        fx[b] -= ux * f;
        fy[b] -= uy * f;
      }

      const gravity = Math.max(0, sim.gravity) * 0.02;
      for (let i = 0; i < n; i++) {
        // Pinned: forced above, and skipped here — no gravity, no integrated
        // motion. It was still a full participant in the repulsion/spring
        // loops above, so unpinned neighbors already feel it.
        if (pinned.has(i)) continue;
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

      // Dragging advances its own per-gesture counter only — `it`/
      // totalStepsRun stay exactly where they were when startDrag() fired,
      // so reheat()'s lifetime budget (sliders) is never spent by dragging,
      // and endDrag()'s fixed tail reset above has a well-defined "before"
      // state to reset from.
      if (dragging) {
        dragStepsRun++;
      } else {
        it++;
        totalStepsRun++;
      }
    },

    snapshot(): NoteGraph {
      return snapshotPositions(graph, xs, ys, width, height, padding, pinned);
    },

    reheat() {
      if (totalStepsRun >= hardStepCeiling) return; // guard against runaway
      it = Math.max(0, it - kick);
      iterationsBudget = it + kick;
    },

    pin(index: number, x: number, y: number) {
      if (index < 0 || index >= n) return;
      pinned.set(index, { x, y });
      xs[index] = x;
      ys[index] = y;
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
