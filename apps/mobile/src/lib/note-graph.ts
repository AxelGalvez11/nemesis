import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
// Pure logic for the phone's Graph page: build a knowledge graph from the synced
// library notes ([[wikilink]] mentions become edges) and lay it out with a small
// deterministic force simulation. No platform dependencies by design — no
// react-native, no supabase — so note-graph.test.ts loads clean under Deno (repo
// convention, same split as library-sync.ts / missions-helpers.ts).
//
// The one exception is d3-force (owner ask 2026-07-23, see createLayoutSim),
// which is pure JS with no DOM and resolves fine under both Deno and Hermes. It
// is a layout engine, not a platform dependency, so the Deno-testable split
// still holds.
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
  /** Number of distinct connections; drives the connectivity-heatmap color
   * (graph-palette.ts) and label visibility. NOT node size — every node
   * renders at one uniform radius (see GraphNodeView). */
  degree: number;
  x: number;
  y: number;
  /** True for a wikilink/markdown-link target that doesn't resolve to any
   * real note in the library — mirrors the web Graph's ghost nodes
   * (apps/web/components/workspace/graph/graph-notes.ts): a preview of a
   * link you've mentioned but haven't written yet. `pathHash` for a ghost is
   * a synthetic `ghost:<normalized target>` id, deduplicated across every
   * note that mentions the same missing title — never a real cloud note id.
   * Opening a ghost is a no-op on the phone (see graph.tsx's openNote): web
   * creates the note on click, but the mobile cloudLibrary API this screen
   * uses (fetchLibrary/loadCachedLibrary) has no create-note call to wire up
   * here, so ghosts are shown but not yet actionable. */
  ghost: boolean;
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
// Standard markdown links that point at another vault file — `[Beta](Beta
// blockers.md)` — the second link shape the web Graph also indexes
// (graph-notes.ts's MD_LINK_RE). Wikilinks stay the primary shape; this
// just widens resolution to notes that got linked the plain-markdown way.
const MD_LINK_RE = /\[[^\]]*\]\(([^)]+\.md)\)/gi;
// Extensions link targets/paths get stripped of before comparison — widened
// from .md-only to match web's normalizeRef (graph-notes.ts).
const EXT_RE = /\.(md|markdown|txt)$/i;

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

/** Every `[label](Target.md)`-style markdown link target, in order of
 * appearance — the link TEXT (not the label) is returned, .md-stripped and
 * with any directory prefix removed, e.g. `[Beta](Cardio/Beta blockers.md)`
 * → "Beta blockers". Mirrors web's graph-notes.ts MD_LINK_RE handling. */
export function extractMarkdownLinks(markdown: string): string[] {
  const out: string[] = [];
  for (const match of markdown.matchAll(MD_LINK_RE)) {
    const raw = match[1];
    if (!raw) continue;
    const base = raw.split("/").pop() ?? raw;
    const title = base.replace(EXT_RE, "").trim();
    if (title) out.push(title);
  }
  return out;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Last path segment without its .md/.markdown/.txt extension — how
 * Obsidian-style links resolve. */
function basenameNoExt(path: string): string {
  const segments = path.split("/");
  const last = segments[segments.length - 1] ?? "";
  return last.replace(EXT_RE, "");
}

function topFolder(path: string): string {
  const idx = path.indexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Build nodes + deduplicated edges from decrypted notes. Link targets resolve by
 * full path (minus .md/.markdown/.txt), then file basename, then note title —
 * first match wins; self-links are dropped. An unresolved target becomes a
 * "ghost" node (mirrors the web Graph's graph-notes.ts) instead of being
 * dropped — one per distinct normalized target, however many notes mention
 * it. Input order does not matter: docs are sorted by path first so the
 * graph (and the layout seeded from it) is stable, and ghosts are always
 * appended after every real note, so real-note indices never shift based on
 * which links happen to be unresolved.
 *
 * Reciprocal links (A mentions B AND B mentions A) still collapse to ONE
 * edge, same as before — deliberately NOT matching web's graph-notes.ts,
 * which keeps both directions as separate links and so double-counts degree
 * for any note pair that links each other. An undirected note graph
 * shouldn't weigh a mutual mention twice; see note-graph.test.ts. */
export function buildNoteGraph(docs: NoteRef[]): NoteGraph {
  const sorted = [...docs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const nodes: GraphNode[] = sorted.map((doc) => ({
    pathHash: doc.pathHash,
    title: doc.title || basenameNoExt(doc.path) || doc.path,
    folder: topFolder(doc.path),
    degree: 0,
    ghost: false,
    x: 0,
    y: 0,
  }));

  // Resolution maps; earlier (path-sorted) docs win ties so duplicates are stable.
  const byPath = new Map<string, number>();
  const byBasename = new Map<string, number>();
  const byTitle = new Map<string, number>();
  sorted.forEach((doc, i) => {
    const pathKey = norm(doc.path.replace(EXT_RE, ""));
    if (!byPath.has(pathKey)) byPath.set(pathKey, i);
    const baseKey = norm(basenameNoExt(doc.path));
    if (baseKey && !byBasename.has(baseKey)) byBasename.set(baseKey, i);
    const titleKey = norm(doc.title);
    if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, i);
  });

  // Ghost nodes are appended to `nodes` lazily, on first mention, and reused
  // by every later note that mentions the same (normalized) missing target —
  // keyed the same way real-note resolution is, so "Foo", "foo.md", and
  // "FOO" all collapse onto one ghost, exactly like they'd collapse onto one
  // real note if "Foo" existed.
  const ghostIndexByKey = new Map<string, number>();

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  sorted.forEach((doc, i) => {
    const targets = [...extractWikilinks(doc.content), ...extractMarkdownLinks(doc.content)];
    for (const target of targets) {
      const key = norm(target.replace(EXT_RE, ""));
      if (!key) continue;
      let j = byPath.get(key) ?? byBasename.get(key) ?? byTitle.get(key);
      if (j === undefined) {
        let ghostIndex = ghostIndexByKey.get(key);
        if (ghostIndex === undefined) {
          ghostIndex = nodes.length;
          nodes.push({ degree: 0, folder: "", ghost: true, pathHash: `ghost:${key}`, title: target.trim(), x: 0, y: 0 });
          ghostIndexByKey.set(key, ghostIndex);
        }
        j = ghostIndex;
      }
      // Ghost indices are always >= sorted.length > every real-note i, so
      // this only ever guards a real self-link (a note linking its own
      // title/path) — a ghost can never equal the linking note itself.
      if (j === i) continue;
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

/** Read simulated positions out into a fresh NoteGraph, clamped into the canvas.
 *
 * NOTE: this deliberately does NOT rescale. It used to fit the whole extent to
 * the canvas on EVERY call — and graph.tsx calls snapshot() once per frame — so
 * every tick re-normalized the layout and the constellation visibly breathed and
 * slid the entire time it settled. That is one of the loudest tells that a graph
 * isn't Obsidian: there, nodes settle where the physics puts them and the VIEW is
 * what moves. graph.tsx already owns pan/zoom as a reanimated transform and
 * already fits ONCE on settle (pendingFitRef), so the per-frame fit here was a
 * second transform fighting the camera. Positions are now seeded and simulated
 * directly in canvas coordinates, so this just reads them out.
 *
 * A clamp survives, but to the LAYOUT bounds (see layoutBounds), not to the
 * viewport. It is a runaway guard, nothing more: clamping a real layout to the
 * viewport is what the rescale used to hide, and measured on a 390x700 phone
 * canvas it would strand 48% of a 120-note graph and 58% of a 200-note one flat
 * against the border.
 *
 * Pinned nodes need no special case any more: d3 writes a fixed node's fx/fy
 * through to its x/y, so they read out here like every other node. The old
 * version had to exclude them from the extent by hand precisely BECAUSE of the
 * rescale it was doing. */
function snapshotPositions(
  graph: NoteGraph,
  nodes: readonly SimNode[],
  bounds: LayoutBounds,
): NoteGraph {
  return {
    edges: [...graph.edges],
    nodes: graph.nodes.map((node, i) => ({
      ...node,
      x: clampToBounds(nodes[i]?.x ?? bounds.cx, bounds.cx, bounds.halfWidth),
      y: clampToBounds(nodes[i]?.y ?? bounds.cy, bounds.cy, bounds.halfHeight),
    })),
  };
}

/** The box positions are allowed to occupy, centred on the canvas. */
interface LayoutBounds {
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
}

const clampToBounds = (v: number, centre: number, half: number) =>
  Math.min(centre + half, Math.max(centre - half, v));

/** How much room the LAYOUT gets, which is not the same thing as the viewport.
 *
 * Obsidian's graph is free to be larger than the window; the camera is what
 * shows it. That is the model here too — graph.tsx fits the view once on settle
 * and owns pan/zoom — so this is only a runaway guard and should be generous
 * enough never to bite a real layout.
 *
 * It grows with sqrt(node count) because that is how a force layout's own extent
 * grows. It has to: `rest` is floored at 34px, so past roughly 40 notes the
 * spacing stops shrinking with density and the constellation genuinely needs
 * more room than the phone screen. At 1x (up to ~12 notes) this is exactly the
 * old canvas-sized box. */
function layoutBounds(width: number, height: number, padding: number, n: number): LayoutBounds {
  const spread = Math.max(1, Math.sqrt(n / 12));
  return {
    cx: width / 2,
    cy: height / 2,
    halfHeight: Math.max(1, (height / 2 - padding) * spread),
    halfWidth: Math.max(1, (width / 2 - padding) * spread),
  };
}

/** One simulated node. `index` is its position in graph.nodes, and doubles as
 * the id forceLink resolves numeric edge endpoints against. */
interface SimNode extends SimulationNodeDatum {
  index: number;
}

/** d3 stops ticking here (alphaMin). Kept explicit — `settled` compares to it. */
const ALPHA_MIN = 0.001;
/** Alpha a reheat (slider nudge, drag release) restarts from. Enough to be
 * visibly felt, well short of the 1.0 of a fresh sim, which would look like the
 * graph had been reseeded. Mirrors d3's own alpha-reheat convention. */
const REHEAT_ALPHA = 0.35;
/** Alpha the sim is held at while a finger is down — d3's alphaTarget-while-
 * dragging pattern. Deliberately modest: it keeps the sim warm enough that
 * neighbours follow the finger, without reheating the whole graph into a
 * re-layout every time you touch a node. */
const DRAG_ALPHA_TARGET = 0.3;

/** Create a steppable force simulation for graph — see LayoutSim.
 *
 * Runs on d3-force (owner ask 2026-07-23: "the one in the app is still not like
 * obsidian"). The hand-rolled sim this replaces — git history has it — differed
 * from Obsidian in four ways that all lived in the physics rather than the
 * drawing:
 *
 *  1. It applied force straight to POSITION (damped gradient descent) with no
 *     velocity carried between ticks. d3 integrates velocity with friction
 *     (velocityDecay), which is where the momentum and the settling feel come
 *     from — the single biggest difference.
 *  2. Repulsion compared every node to every other node, O(n²). forceManyBody
 *     approximates distant clusters through a quadtree, O(n log n).
 *  3. There was no collision force at all. forceCollide is what produces
 *     Obsidian's evenly spaced, non-overlapping constellation.
 *  4. Positions were refit to the canvas every frame — see snapshotPositions.
 *
 * d3-force is pure JS (its only deps are d3-dispatch/d3-quadtree/d3-timer, and
 * d3-timer typeof-guards `window`/`performance` with a setTimeout fallback), so
 * this runs in Hermes and ships over the air — no native module, no new build.
 *
 * The sim is created stopped and ticked by hand from graph.tsx's rAF loop;
 * d3's internal timer is never started.
 *
 * DETERMINISTIC: positions are seeded here from the same golden-angle spiral and
 * content-hash jitter as before (never d3's own phyllotaxis init, which we
 * bypass by supplying x/y), and d3's internal jiggle PRNG is a fixed-seed LCG.
 * Same input, same output, every run. */
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
  const bounds = layoutBounds(width, height, padding, n);

  // Seeded in CANVAS coordinates — the same space snapshot() reads and pin()
  // writes. The old sim ran in its own space and normalized on the way out,
  // which is what made pin() have to translate between the two.
  const nodes: SimNode[] = graph.nodes.map((node, i) => {
    const jitter = (hashString(node.pathHash) % 997) / 997 - 0.5;
    const r = span * Math.sqrt((i + 0.6) / Math.max(1, n));
    const theta = i * GOLDEN_ANGLE + jitter * 0.9;
    return { index: i, vx: 0, vy: 0, x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
  });
  const links: SimulationLinkDatum<SimNode>[] = graph.edges.map((edge) => ({ source: edge.a, target: edge.b }));

  // Rest length scales with density so sparse graphs spread and dense ones pack.
  const rest = Math.max(34, (Math.min(width, height) / Math.sqrt(n + 1)) * 0.9);

  const charge = forceManyBody<SimNode>().strength(-rest * 2.2 * Math.max(0, opts.repulsion ?? 1));
  const link = forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
    .id((d) => d.index)
    .distance(rest * Math.max(0, opts.linkDistance ?? 1));
  // Link strength is left at d3's default, 1/min(deg(a), deg(b)). That is a
  // real part of the Obsidian look: it stops a hub with thirty edges from being
  // yanked around by every one of them. The old sim used a flat spring constant.
  const collide = forceCollide<SimNode>(Math.max(8, rest * 0.3));
  const gravityStrength = (g: number) => 0.045 * Math.max(0, g);
  const pullX = forceX<SimNode>(cx).strength(gravityStrength(opts.gravity ?? 1));
  const pullY = forceY<SimNode>(cy).strength(gravityStrength(opts.gravity ?? 1));

  const simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> = forceSimulation(nodes)
    .force("charge", charge)
    .force("link", link)
    .force("collide", collide)
    .force("x", pullX)
    .force("y", pullY)
    .alphaMin(ALPHA_MIN)
    // `iterations` keeps its old meaning — how many steps a full cool takes —
    // expressed as the decay that reaches alphaMin in that many ticks.
    .alphaDecay(1 - Math.pow(ALPHA_MIN, 1 / Math.max(1, totalIterations)))
    .stop();

  // Monotonic lifetime step counter — the true runaway guard; reheat() never
  // moves this backwards, only step() advances it.
  let totalStepsRun = 0;
  // Active-drag state. A node stays FIXED forever once dragged (pin() has no
  // opposite), but `dragging` is only true for the one node under a live finger.
  let dragging = false;
  let dragStepsRun = 0;
  // Per-GESTURE budget, deliberately separate from hardStepCeiling: a drag ticks
  // continuously for as long as a finger is down, and if it spent from the
  // lifetime budget a few long drags would exhaust what sliders rely on.
  const dragStepCeiling = Math.max(2000, totalIterations * 30);

  let gravityValue = opts.gravity ?? 1;
  let repulsionValue = opts.repulsion ?? 1;
  let linkDistanceValue = opts.linkDistance ?? 1;

  const sim: LayoutSim = {
    // Accessors rather than plain fields so the documented "mutate directly to
    // steer the sim" contract keeps working: the setters push the new value into
    // the force objects, which d3 reads on the next tick.
    get gravity() {
      return gravityValue;
    },
    set gravity(v: number) {
      gravityValue = v;
      pullX.strength(gravityStrength(v));
      pullY.strength(gravityStrength(v));
    },
    get repulsion() {
      return repulsionValue;
    },
    set repulsion(v: number) {
      repulsionValue = v;
      charge.strength(-rest * 2.2 * Math.max(0, v));
    },
    get linkDistance() {
      return linkDistanceValue;
    },
    set linkDistance(v: number) {
      linkDistanceValue = v;
      link.distance(rest * Math.max(0, v));
      // forceLink caches per-link bias/strength at initialize() time; distance is
      // read per tick, so no re-init is needed here.
    },

    get settled(): boolean {
      return n === 0 || (!dragging && simulation.alpha() < ALPHA_MIN);
    },

    step() {
      if (n === 0) return;
      if (dragging) {
        // Budget spent — END the drag rather than idling inside it.
        //
        // This is load-bearing for PERFORMANCE, not just tidiness (owner
        // 2026-07-23: "the graph is super slow"). `settled` is false for as long
        // as `dragging` is true, and graph.tsx's rAF loop reschedules itself
        // until the sim settles, calling snapshot() + setGraph() every frame.
        // So a drag that never ends leaves the screen re-rendering every node at
        // 60fps FOREVER, with nothing moving. Returning early here used to leave
        // exactly that state: budget exhausted, dragging still true, alphaTarget
        // still warm, nothing to show for it.
        //
        // endDrag() may simply never arrive — a cancelled gesture, a finger lost
        // off the edge, a component unmounted mid-drag — so the sim has to be
        // able to reach rest on its own. Measured: the physics is ~1ms/frame at
        // 200 nodes, so the cost was never the simulation; it was React
        // re-rendering every node forever because nothing ever said "done".
        if (dragStepsRun >= dragStepCeiling) {
          sim.endDrag();
          return;
        }
        dragStepsRun++;
      } else if (simulation.alpha() < ALPHA_MIN) {
        return;
      }
      totalStepsRun++;
      simulation.tick();
    },

    snapshot() {
      return snapshotPositions(graph, nodes, bounds);
    },

    reheat() {
      if (n === 0 || totalStepsRun >= hardStepCeiling) return;
      if (simulation.alpha() < REHEAT_ALPHA) simulation.alpha(REHEAT_ALPHA);
    },

    pin(index: number, x: number, y: number) {
      if (index < 0 || index >= n) return;
      const node = nodes[index];
      // Clamped on the way in to the same layout bounds snapshot() clamps on the
      // way out, so a drag can't park a node somewhere nothing will ever show it.
      const px = clampToBounds(x, bounds.cx, bounds.halfWidth);
      const py = clampToBounds(y, bounds.cy, bounds.halfHeight);
      node.fx = px;
      node.fy = py;
      node.x = px;
      node.y = py;
    },

    startDrag(index: number) {
      if (index < 0 || index >= n) return;
      dragging = true;
      dragStepsRun = 0;
      simulation.alphaTarget(DRAG_ALPHA_TARGET);
      if (simulation.alpha() < DRAG_ALPHA_TARGET) simulation.alpha(DRAG_ALPHA_TARGET);
    },

    endDrag() {
      dragging = false;
      simulation.alphaTarget(0);
      // The same bounded settle tail a slider's reheat() gives, so the graph
      // always eases back to rest instead of stopping dead. The node itself stays
      // fixed (see pin()) — only the drag-specific heat ends.
      //
      // No spring boost to unwind: the old sim needed one because its flat
      // springs were far too soft to drag a neighbour along. forceLink's
      // degree-weighted strength plus the modest alphaTarget above do that job,
      // which is also why a drag no longer re-lays-out the whole graph.
      if (totalStepsRun < hardStepCeiling && simulation.alpha() < REHEAT_ALPHA) {
        simulation.alpha(REHEAT_ALPHA);
      }
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
