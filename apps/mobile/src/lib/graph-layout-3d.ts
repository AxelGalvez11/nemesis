// Pure logic for the phone Graph screen's 3D mode. The web Graph's 3D mode
// (apps/web/components/workspace/graph/graph-canvas.tsx) is a real WebGL
// scene — 3d-force-graph + three.js + d3-force-3d — none of which exist in
// this app: no expo-gl, no WebGL, no `three` in apps/mobile's own
// package.json (it's only present in the repo root's hoisted node_modules as
// the WEB app's transitive dependency). So the phone's "3D" is a from-scratch
// simulation instead of a smaller version of the web engine:
//
//   1. A force simulation identical in SHAPE to note-graph.ts's 2D
//      createLayoutSim (same repulsion/spring/gravity/cooling-schedule
//      constants, same golden-angle-seeded, content-hash-jittered start, same
//      settle-and-stop contract) but run in three dimensions.
//   2. A simple perspective camera (orbit by azimuth/elevation around the
//      graph's center, then a perspective divide) that turns each node's 3D
//      (x, y, z) into a 2D screen point plus a depth-derived scale.
//   3. A painter's-algorithm draw order — sort farthest-first so nearer
//      nodes/links paint over farther ones, the way a z-buffer would.
//
// Rendered with react-native-svg (GraphScene3D.tsx) exactly like the 2D
// mode's <Svg>, just re-projected every frame instead of drawn once and
// panned/scaled as a flat transform. No node dragging in this mode (see
// GraphScene3D.tsx) — a screen-space drag has no well-defined depth to move a
// node to, and the web 3D engine's own drag support is a mouse-hover
// affordance this app has no equivalent of either; the whole-canvas gesture
// instead rotates the camera (see rotateCamera/zoomCamera below).
//
// Dependency-free beyond note-graph.ts (itself dependency-free), so this
// Deno-tests like every other lib/*.ts file in this app.

import { type GraphEdge, GOLDEN_ANGLE, type GraphNode, hashString, type NoteGraph } from "./note-graph.ts";

export type GraphNode3D = GraphNode & { z: number };

export interface NoteGraph3D {
  nodes: GraphNode3D[];
  edges: GraphEdge[];
}

export interface LayoutOptions3D {
  iterations?: number;
  /** Node-vs-node repulsion multiplier — same contract as note-graph.ts's
   * LayoutOptions.repulsion (1 = tuned default, 0 lets nodes overlap). */
  repulsion?: number;
  /** Pull-to-center (world origin) multiplier — same contract as
   * note-graph.ts's LayoutOptions.gravity. */
  gravity?: number;
  /** Edge spring rest-length multiplier — same contract as note-graph.ts's
   * LayoutOptions.linkDistance. */
  linkDistance?: number;
}

/** A running 3D force simulation, stepped by hand — the 3D twin of
 * note-graph.ts's LayoutSim, minus pin/startDrag/endDrag (3D mode has no
 * node dragging — see the top-of-file comment). */
export interface LayoutSim3D {
  step(): void;
  /** Current positions in WORLD space (NOT screen space — there is no
   * canvas-fit/clamp step here, unlike the 2D sim's snapshot(): fitting to
   * the phone's actual screen happens in projectNodes() below, driven by the
   * camera, so the same sim never needs to know the viewport size). A fresh
   * NoteGraph3D every call, safe to hand straight to React state. */
  snapshot(): NoteGraph3D;
  readonly settled: boolean;
  gravity: number;
  repulsion: number;
  linkDistance: number;
  reheat(): void;
}

// World-space (not pixel) constant — the seed radius, sized so FOCAL's
// default perspective (see projectNodes) frames a freshly-seeded graph
// without a per-graph auto-fit computation: because the seed radius
// formula below already scales down with node count (Math.cbrt(n), the 3D
// analog of the 2D sim's Math.sqrt(n)), a settled graph's overall extent
// stays roughly within WORLD_SPAN regardless of how many notes it has, so
// one fixed default camera distance reads reasonably for a handful of notes
// or a couple hundred alike.
export const WORLD_SPAN = 190;

/** Create a steppable 3D force simulation for `graph` — see LayoutSim3D.
 * Same tuned constants as note-graph.ts's 2D sim (0.06 spring stiffness,
 * 0.02 gravity, the 0.085/0.01 step-cooling shape, the 24*cool+1.5 movement
 * cap) — a 3D graph has one more axis to relax into but no reason to feel
 * differently damped than the 2D one it's a sibling of. */
export function createLayoutSim3D(graph: NoteGraph, opts: LayoutOptions3D = {}): LayoutSim3D {
  const n = graph.nodes.length;
  const totalIterations = opts.iterations ?? (n > 150 ? 90 : 180);
  const hardStepCeiling = Math.max(totalIterations, totalIterations * 8);

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const zs = new Float64Array(n);

  // Fibonacci-sphere seed (the 3D analog of note-graph.ts's golden-angle
  // spiral): direction from a deterministic point-on-sphere formula, radius
  // growing with index (cube-root, so points fill a BALL by volume the same
  // way the 2D spiral fills a DISK by area — Math.sqrt there, Math.cbrt
  // here). Content-hash jitter perturbs the angle, not the radius — same
  // split note-graph.ts uses — so every node starts with a distinct (x,y,z)
  // from step 1: without that, symmetric repulsion along a shared z=0 plane
  // would never develop any z spread on its own (the force between two
  // points with dz=0 always has dz=0 too), and the graph would stay
  // pancake-flat forever.
  graph.nodes.forEach((node, i) => {
    const jitter = (hashString(node.pathHash) % 997) / 997 - 0.5;
    const yUnit = n <= 1 ? 0 : 1 - (i / (n - 1)) * 2; // -1..1
    const ringRadius = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
    const theta = i * GOLDEN_ANGLE + jitter * 0.9;
    const r = WORLD_SPAN * Math.cbrt((i + 0.6) / Math.max(1, n));
    xs[i] = Math.cos(theta) * ringRadius * r;
    ys[i] = yUnit * r;
    zs[i] = Math.sin(theta) * ringRadius * r;
  });

  // Rest length scales with density, same density-adaptive spirit as
  // note-graph.ts (Math.cbrt instead of Math.sqrt — see WORLD_SPAN above).
  const rest = Math.max(30, (WORLD_SPAN / Math.cbrt(n + 1)) * 0.9);
  const baseRepulsion = rest * rest;

  let it = 0;
  let iterationsBudget = totalIterations;
  let totalStepsRun = 0;
  const kick = Math.max(1, Math.round(totalIterations * 0.35));

  const sim: LayoutSim3D = {
    gravity: opts.gravity ?? 1,
    repulsion: opts.repulsion ?? 1,
    linkDistance: opts.linkDistance ?? 1,

    get settled(): boolean {
      return n === 0 || it >= iterationsBudget;
    },

    step() {
      if (n === 0 || it >= iterationsBudget) return;
      const cool = 1 - it / iterationsBudget;
      const step = 0.085 * cool + 0.01;

      const fx = new Float64Array(n);
      const fy = new Float64Array(n);
      const fz = new Float64Array(n);
      const repulsion = baseRepulsion * Math.max(0, sim.repulsion);

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = xs[i] - xs[j];
          let dy = ys[i] - ys[j];
          let dz = zs[i] - zs[j];
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) {
            // Coincident points get a deterministic nudge so forces can separate them.
            dx = ((i * 7919 + j) % 13) - 6;
            dy = ((j * 104729 + i) % 11) - 5;
            dz = ((i * 15485863 + j * 3) % 9) - 4;
            d2 = dx * dx + dy * dy + dz * dz || 1;
          }
          const f = repulsion / d2;
          const d = Math.sqrt(d2);
          const ux = dx / d;
          const uy = dy / d;
          const uz = dz / d;
          fx[i] += ux * f;
          fy[i] += uy * f;
          fz[i] += uz * f;
          fx[j] -= ux * f;
          fy[j] -= uy * f;
          fz[j] -= uz * f;
        }
      }

      const restLen = rest * Math.max(0, sim.linkDistance);
      for (const { a, b } of graph.edges) {
        const dx = xs[b] - xs[a];
        const dy = ys[b] - ys[a];
        const dz = zs[b] - zs[a];
        const d = Math.max(0.1, Math.sqrt(dx * dx + dy * dy + dz * dz));
        const f = (d - restLen) * 0.06;
        const ux = dx / d;
        const uy = dy / d;
        const uz = dz / d;
        fx[a] += ux * f;
        fy[a] += uy * f;
        fz[a] += uz * f;
        fx[b] -= ux * f;
        fy[b] -= uy * f;
        fz[b] -= uz * f;
      }

      const gravity = Math.max(0, sim.gravity) * 0.02;
      for (let i = 0; i < n; i++) {
        // Gentle gravity toward the world origin — the 3D sim's "center" is
        // always (0,0,0); there's no canvas to center within here.
        fx[i] += -xs[i] * gravity;
        fy[i] += -ys[i] * gravity;
        fz[i] += -zs[i] * gravity;
        let mx = fx[i] * step;
        let my = fy[i] * step;
        let mz = fz[i] * step;
        const mag = Math.sqrt(mx * mx + my * my + mz * mz);
        const cap = 24 * cool + 1.5;
        if (mag > cap) {
          mx = (mx / mag) * cap;
          my = (my / mag) * cap;
          mz = (mz / mag) * cap;
        }
        xs[i] += mx;
        ys[i] += my;
        zs[i] += mz;
      }

      it++;
      totalStepsRun++;
    },

    snapshot(): NoteGraph3D {
      return {
        edges: [...graph.edges],
        nodes: graph.nodes.map((node, i) => ({ ...node, x: xs[i], y: ys[i], z: zs[i] })),
      };
    },

    reheat() {
      if (totalStepsRun >= hardStepCeiling) return;
      it = Math.max(0, it - kick);
      iterationsBudget = it + kick;
    },
  };
  return sim;
}

// --- Camera + perspective projection ---------------------------------

export interface Camera3D {
  /** Radians — rotation around the world Y (up) axis. Unbounded (wraps). */
  azimuth: number;
  /** Radians — pitch, clamped (see clampElevation) so the camera can never
   * flip past looking straight down/up, which would invert drag direction. */
  elevation: number;
  /** Multiplier on top of the perspective projection — the 3D mode's
   * pinch-to-zoom, same idea as the 2D canvas's `scale` shared value. */
  zoom: number;
}

export const DEFAULT_CAMERA: Camera3D = { azimuth: 0.5, elevation: 0.32, zoom: 1 };
// A touch under +/-90 degrees — never quite vertical, so azimuth (yaw)
// dragging never goes numerically unstable at the poles.
export const MAX_ELEVATION = 1.35;
export const MIN_ELEVATION = -1.35;
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 3;
// World-units the camera sits back from the origin at zoom=1 — see
// WORLD_SPAN's comment for why one fixed value frames most graph sizes.
// Exported (like WORLD_SPAN) purely so graph-layout-3d.test.ts can assert
// exact projected values instead of duplicating the literal.
export const FOCAL = 240;

export function clampElevation(elevation: number): number {
  return Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation));
}

/** Orbit the camera by a screen-drag delta — immutable, like every other
 * update in this app (see coding-style rule). */
export function rotateCamera(camera: Camera3D, deltaAzimuth: number, deltaElevation: number): Camera3D {
  return { ...camera, azimuth: camera.azimuth + deltaAzimuth, elevation: clampElevation(camera.elevation + deltaElevation) };
}

/** Multiply the camera's zoom by `factor` (>1 zooms in), clamped. Immutable. */
export function zoomCamera(camera: Camera3D, factor: number): Camera3D {
  return { ...camera, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor)) };
}

export interface Projected {
  index: number;
  sx: number;
  sy: number;
  /** Perspective-derived scale multiplier — 1 at the camera's focal plane,
   * >1 nearer, <1 farther. Feed to depthVisuals() for the render-time
   * radius/opacity depth cue; NOT pre-clamped here so the math stays a plain
   * perspective divide (clamping is a rendering concern — see
   * depthVisuals). */
  scale: number;
  /** Camera-space depth (bigger = farther from the camera). Sort by this —
   * see paintOrder() — for a painter's-algorithm draw order. */
  depth: number;
}

/** Rotate every node by `camera`'s azimuth/elevation and perspective-project
 * onto `viewport` — the phone Graph 3D mode's whole rendering math in one
 * pure function. One entry in `nodes`, one entry out, SAME order (index
 * fields let callers re-associate after paintOrder() reorders them). */
export function projectNodes(
  nodes: readonly { x: number; y: number; z: number }[],
  camera: Camera3D,
  viewport: { width: number; height: number },
): Projected[] {
  const cosAz = Math.cos(camera.azimuth);
  const sinAz = Math.sin(camera.azimuth);
  const cosEl = Math.cos(camera.elevation);
  const sinEl = Math.sin(camera.elevation);
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const zoom = Math.max(0.001, camera.zoom);

  return nodes.map((node, index) => {
    // Yaw around Y.
    const x1 = node.x * cosAz - node.z * sinAz;
    const z1 = node.x * sinAz + node.z * cosAz;
    // Pitch around X (camera-local right axis, applied after yaw); x is
    // unaffected by a rotation around X.
    const y2 = node.y * cosEl - z1 * sinEl;
    const z2 = node.y * sinEl + z1 * cosEl;

    // The camera sits FOCAL world-units back, looking at the origin — so a
    // node exactly at the rotation center (z2=0) sits at viewZ=FOCAL, i.e.
    // scale=1 (neutral). WORLD_SPAN < FOCAL keeps viewZ comfortably
    // positive for any node still near its seed extent; the max() floor
    // below is belt-and-suspenders for a node repulsion pushes further out
    // than that (e.g. the Repulsion slider maxed out).
    const viewZ = z2 + FOCAL;
    const perspective = FOCAL / Math.max(FOCAL * 0.12, viewZ);
    const scale = perspective * zoom;

    return {
      depth: viewZ,
      index,
      scale,
      sx: cx + x1 * scale,
      sy: cy - y2 * scale,
    };
  });
}

/** Farthest-first draw order (painter's algorithm) — render nodes/links in
 * this order so nearer ones paint over farther ones, the way a z-buffer
 * would without one. Stable sort: ties keep their original relative order. */
export function paintOrder<T extends { depth: number }>(projected: readonly T[]): T[] {
  return [...projected].sort((a, b) => b.depth - a.depth);
}

export const MIN_RENDER_SCALE = 0.45;
export const MAX_RENDER_SCALE = 1.8;

/** Turns a Projected.scale into the render-time radius multiplier + opacity
 * for the phone's depth cue ("scale/dim by depth"): clamped so a very near
 * node doesn't balloon and a very far one never fully disappears (still
 * tappable), and opacity fades a bit more aggressively than radius so depth
 * reads before the size difference is consciously noticed. */
export function depthVisuals(scale: number): { radiusScale: number; opacity: number } {
  const clamped = Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale));
  const t = (clamped - MIN_RENDER_SCALE) / (MAX_RENDER_SCALE - MIN_RENDER_SCALE); // 0 (far) .. 1 (near)
  return { opacity: 0.35 + 0.65 * t, radiusScale: clamped };
}

/** Closest projected node within its own tap-hit radius, or null — 3D
 * mode's single whole-canvas Tap gesture uses this (graph.tsx) instead of
 * per-node gesture detectors (see GraphScene3D.tsx's top-of-file comment).
 * `(x, y)` must be in the SAME screen-space coordinates projectNodes()
 * produced. `baseRadius` is the un-scaled node radius (BASE_NODE_R *
 * nodeSizeMultiplier at the call site) before the depth-cue scale is
 * applied; the `Math.max(16, r + 8)` generous-tap-target floor mirrors
 * GraphNodeView.tsx's 2D hit circle. Returns the node's `index` (into the
 * SAME array `projected` was built from) so the caller isn't coupled to any
 * particular node type here. */
export function hitTestProjected(x: number, y: number, projected: readonly Projected[], baseRadius: number): number | null {
  let bestIndex: number | null = null;
  let bestDistance = Infinity;
  for (const p of projected) {
    const r = baseRadius * depthVisuals(p.scale).radiusScale;
    const hitRadius = Math.max(16, r + 8);
    const distance = Math.hypot(p.sx - x, p.sy - y);
    if (distance <= hitRadius && distance < bestDistance) {
      bestIndex = p.index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}
