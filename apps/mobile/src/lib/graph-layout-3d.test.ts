// Deno unit tests (repo convention) for the Graph screen's 3D mode helpers.
// Run: deno test --no-check apps/mobile/src/lib/graph-layout-3d.test.ts
import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildNoteGraph, hashString, type NoteRef } from "./note-graph.ts";
import {
  clampElevation,
  createLayoutSim3D,
  DEFAULT_CAMERA,
  depthVisuals,
  FOCAL,
  hitTestProjected,
  MAX_ELEVATION,
  MAX_RENDER_SCALE,
  MAX_ZOOM,
  MIN_ELEVATION,
  MIN_RENDER_SCALE,
  MIN_ZOOM,
  paintOrder,
  projectNodes,
  rotateCamera,
  WORLD_SPAN,
  zoomCamera,
} from "./graph-layout-3d.ts";

function doc(path: string, title: string, content: string): NoteRef {
  return { content, path, pathHash: hashString(path).toString(16).padStart(8, "0"), title };
}

function chainGraph(count: number) {
  const docs: NoteRef[] = [];
  for (let i = 0; i < count; i++) {
    const links = i > 0 ? `[[Note ${i - 1}]] [[Note 0]]` : "";
    docs.push(doc(`Course/Note ${i}.md`, `Note ${i}`, links));
  }
  return buildNoteGraph(docs);
}

// --- createLayoutSim3D --------------------------------------------------

Deno.test("createLayoutSim3D seeds every node with a distinct z from the very first frame", () => {
  const graph = chainGraph(12);
  const sim = createLayoutSim3D(graph);
  const seeded = sim.snapshot();
  const distinctZ = new Set(seeded.nodes.map((n) => Math.round(n.z * 1000)));
  assert(distinctZ.size > 1, "seed must not put every node on the same z plane (would never develop 3D spread)");
  const distinctX = new Set(seeded.nodes.map((n) => Math.round(n.x * 1000)));
  const distinctY = new Set(seeded.nodes.map((n) => Math.round(n.y * 1000)));
  assert(distinctX.size > 1 && distinctY.size > 1);
});

Deno.test("createLayoutSim3D is deterministic and never mutates its input graph", () => {
  const graph = chainGraph(10);
  const before = JSON.stringify(graph);
  const a = createLayoutSim3D(graph);
  const b = createLayoutSim3D(graph);
  while (!a.settled) a.step();
  while (!b.settled) b.step();
  assertEquals(a.snapshot(), b.snapshot());
  assertEquals(JSON.stringify(graph), before);
});

Deno.test("createLayoutSim3D settles to finite, separated positions and stays settled", () => {
  const graph = chainGraph(16);
  const sim = createLayoutSim3D(graph);
  let guard = 0;
  while (!sim.settled && guard++ < 10_000) sim.step();
  assertEquals(sim.settled, true);
  const snap = sim.snapshot();
  for (const node of snap.nodes) {
    assert(Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z), "positions must stay finite");
  }
  const [p, q] = snap.nodes;
  const dist = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  assert(dist > 5, `linked nodes should separate, not collapse: ${dist}`);
  // Further step()s after settled are no-ops.
  const again = sim.snapshot();
  sim.step();
  assertEquals(sim.snapshot(), again);
});

Deno.test("createLayoutSim3D: repulsion and gravity multipliers are actually threaded into the 3D force loop", () => {
  const graph = chainGraph(8);
  function settledSnapshot(opts: Parameters<typeof createLayoutSim3D>[1]) {
    const sim = createLayoutSim3D(graph, opts);
    while (!sim.settled) sim.step();
    return sim.snapshot();
  }
  const base = settledSnapshot({});
  assertNotEquals(settledSnapshot({ repulsion: 4 }), base);
  assertNotEquals(settledSnapshot({ gravity: 4 }), base);
  assertNotEquals(settledSnapshot({ linkDistance: 3 }), base);
});

Deno.test("createLayoutSim3D.reheat re-arms a settled sim but is bounded against runaway", () => {
  const graph = chainGraph(4);
  const sim = createLayoutSim3D(graph, { iterations: 5 });
  while (!sim.settled) sim.step();
  assertEquals(sim.settled, true);

  sim.reheat();
  assertEquals(sim.settled, false, "reheat should re-arm an already-settled sim");

  for (let k = 0; k < 200; k++) {
    let guard = 0;
    while (!sim.settled && guard++ < 10_000) sim.step();
    sim.reheat();
  }
  assertEquals(sim.settled, true, "hard step ceiling should stop further reheats from re-arming");
});

Deno.test("createLayoutSim3D handles empty and single-node graphs without throwing", () => {
  const empty = createLayoutSim3D({ edges: [], nodes: [] });
  assertEquals(empty.settled, true);
  assertEquals(empty.snapshot().nodes, []);

  const solo = createLayoutSim3D(buildNoteGraph([doc("solo.md", "Solo", "")]));
  let guard = 0;
  while (!solo.settled && guard++ < 10_000) solo.step();
  assertEquals(solo.snapshot().nodes.length, 1);
});

Deno.test("createLayoutSim3D: seed radius stays within WORLD_SPAN regardless of node count (density-adaptive)", () => {
  for (const count of [3, 30, 200]) {
    const graph = chainGraph(count);
    const seeded = createLayoutSim3D(graph).snapshot();
    for (const node of seeded.nodes) {
      const r = Math.hypot(node.x, node.y, node.z);
      assert(r <= WORLD_SPAN + 1, `seed radius ${r} should stay within WORLD_SPAN for n=${count}`);
    }
  }
});

// --- camera -------------------------------------------------------------

Deno.test("clampElevation bounds to +/-MAX_ELEVATION", () => {
  assertEquals(clampElevation(0), 0);
  assertEquals(clampElevation(100), MAX_ELEVATION);
  assertEquals(clampElevation(-100), MIN_ELEVATION);
});

Deno.test("rotateCamera adds deltas, clamps elevation, and never mutates its input", () => {
  const before = { ...DEFAULT_CAMERA };
  const after = rotateCamera(DEFAULT_CAMERA, 0.2, 0.1);
  assertEquals(DEFAULT_CAMERA, before, "must not mutate the camera passed in");
  assertAlmostEquals(after.azimuth, DEFAULT_CAMERA.azimuth + 0.2);
  assertAlmostEquals(after.elevation, DEFAULT_CAMERA.elevation + 0.1);
  assertEquals(after.zoom, DEFAULT_CAMERA.zoom);

  const pinnedUp = rotateCamera(DEFAULT_CAMERA, 0, 50);
  assertEquals(pinnedUp.elevation, MAX_ELEVATION);
});

Deno.test("zoomCamera multiplies and clamps within [MIN_ZOOM, MAX_ZOOM], never mutates its input", () => {
  const camera = { ...DEFAULT_CAMERA, zoom: 1 };
  const before = { ...camera };
  const zoomedIn = zoomCamera(camera, 2);
  assertEquals(camera, before);
  assertEquals(zoomedIn.zoom, 2);
  assertEquals(zoomCamera(camera, 100).zoom, MAX_ZOOM);
  assertEquals(zoomCamera(camera, 0.001).zoom, MIN_ZOOM);
});

// --- projection -----------------------------------------------------------

Deno.test("projectNodes: identity camera puts the world origin at screen center, scale 1, depth FOCAL", () => {
  const [p] = projectNodes([{ x: 0, y: 0, z: 0 }], { azimuth: 0, elevation: 0, zoom: 1 }, { height: 300, width: 400 });
  assertAlmostEquals(p.sx, 200);
  assertAlmostEquals(p.sy, 150);
  assertAlmostEquals(p.scale, 1);
  assertAlmostEquals(p.depth, FOCAL);
});

Deno.test("projectNodes: a 90deg yaw sends a point on +X entirely into depth (screen x stays centered)", () => {
  const camera = { azimuth: Math.PI / 2, elevation: 0, zoom: 1 };
  const [p] = projectNodes([{ x: 100, y: 0, z: 0 }], camera, { height: 300, width: 400 });
  assertAlmostEquals(p.sx, 200, 1e-6);
  assertAlmostEquals(p.depth, FOCAL + 100, 1e-6);
});

Deno.test("projectNodes: nearer nodes (smaller depth) get a larger scale than farther nodes", () => {
  const camera = { azimuth: 0, elevation: 0, zoom: 1 };
  const [near, far] = projectNodes([{ x: 0, y: 0, z: -60 }, { x: 0, y: 0, z: 60 }], camera, { height: 300, width: 400 });
  assert(near.depth < far.depth);
  assert(near.scale > far.scale, `nearer node should render larger: near=${near.scale} far=${far.scale}`);
});

Deno.test("projectNodes: zoom scales the projection uniformly", () => {
  const camera1x = { azimuth: 0.3, elevation: 0.2, zoom: 1 };
  const camera2x = { ...camera1x, zoom: 2 };
  const node = { x: 40, y: 20, z: 10 };
  const [p1] = projectNodes([node], camera1x, { height: 300, width: 400 });
  const [p2] = projectNodes([node], camera2x, { height: 300, width: 400 });
  assertAlmostEquals(p2.scale, p1.scale * 2, 1e-9);
  assertAlmostEquals(p2.sx - 200, (p1.sx - 200) * 2, 1e-6);
});

Deno.test("projectNodes: preserves input order and index field regardless of position", () => {
  const nodes = [{ x: 5, y: 0, z: 0 }, { x: -5, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }];
  const projected = projectNodes(nodes, DEFAULT_CAMERA, { height: 300, width: 400 });
  assertEquals(projected.map((p) => p.index), [0, 1, 2]);
});

Deno.test("paintOrder sorts farthest-first (descending depth) and is stable for ties", () => {
  const items = [
    { depth: 5, tag: "a" },
    { depth: 1, tag: "b" },
    { depth: 3, tag: "c" },
    { depth: 1, tag: "d" },
  ];
  const sorted = paintOrder(items);
  assertEquals(sorted.map((i) => i.depth), [5, 3, 1, 1]);
  // Stability: the two depth=1 entries ("b" then "d") keep their relative order.
  assertEquals(sorted.map((i) => i.tag), ["a", "c", "b", "d"]);
  // paintOrder must not mutate the array it was given.
  assertEquals(items.map((i) => i.tag), ["a", "b", "c", "d"]);
});

Deno.test("depthVisuals clamps to [MIN_RENDER_SCALE, MAX_RENDER_SCALE] and opacity to [0.35, 1]", () => {
  const veryFar = depthVisuals(0);
  assertEquals(veryFar.radiusScale, MIN_RENDER_SCALE);
  assertAlmostEquals(veryFar.opacity, 0.35);

  const veryNear = depthVisuals(100);
  assertEquals(veryNear.radiusScale, MAX_RENDER_SCALE);
  assertAlmostEquals(veryNear.opacity, 1);

  const mid = depthVisuals((MIN_RENDER_SCALE + MAX_RENDER_SCALE) / 2);
  assert(mid.opacity > veryFar.opacity && mid.opacity < veryNear.opacity, "opacity should be monotonic with scale");
});

// --- hit-testing ------------------------------------------------------

Deno.test("hitTestProjected finds the node under the tap point", () => {
  const projected = projectNodes(
    [{ x: -60, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }],
    { azimuth: 0, elevation: 0, zoom: 1 },
    { height: 300, width: 400 },
  );
  const nearFirst = projected[0];
  const hit = hitTestProjected(nearFirst.sx, nearFirst.sy, projected, 3);
  assertEquals(hit, 0);
});

Deno.test("hitTestProjected returns null when the tap misses every node", () => {
  const projected = projectNodes([{ x: 0, y: 0, z: 0 }], DEFAULT_CAMERA, { height: 300, width: 400 });
  const hit = hitTestProjected(projected[0].sx + 500, projected[0].sy + 500, projected, 3);
  assertEquals(hit, null);
});

Deno.test("hitTestProjected picks the CLOSEST node when two overlap the tap radius", () => {
  const projected = projectNodes(
    [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    { azimuth: 0, elevation: 0, zoom: 1 },
    { height: 300, width: 400 },
  );
  // Tap exactly on node 0 — both are within the generous hit radius (>=16px
  // floor), but node 0 is the closer one.
  const hit = hitTestProjected(projected[0].sx, projected[0].sy, projected, 3);
  assertEquals(hit, 0);
});

Deno.test("hitTestProjected has a generous minimum hit radius even for a tiny/far node", () => {
  // A node projected with a very small scale (far away) still gets the
  // Math.max(16, ...) floor, so it stays tappable rather than shrinking to
  // an unhittable point.
  const projected = [{ depth: 999, index: 0, scale: 0.01, sx: 200, sy: 150 }];
  const hit = hitTestProjected(210, 150, projected, 3); // 10px off dead-center
  assertEquals(hit, 0);
});

console.log("graph-layout-3d.test.ts assertions defined via Deno.test");
