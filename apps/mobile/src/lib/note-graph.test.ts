// Deno unit tests (repo convention) for the note-graph pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/note-graph.test.ts
//
// Imports ONLY note-graph.ts, which is dependency-free by design (like
// library-sync.ts) so this file loads clean under Deno.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNoteGraph,
  createLayoutSim,
  extractWikilinks,
  hashString,
  layoutNoteGraph,
  type NoteRef,
} from "./note-graph.ts";

function doc(path: string, title: string, content: string): NoteRef {
  return { content, path, pathHash: hashString(path).toString(16).padStart(8, "0"), title };
}

Deno.test("extractWikilinks finds plain, aliased, and heading links in order", () => {
  const md = "See [[Beta Blockers]] and [[ACE Inhibitors|ACEis]] plus [[Diuretics#Loop]].";
  assertEquals(extractWikilinks(md), ["Beta Blockers", "ACE Inhibitors", "Diuretics"]);
});

Deno.test("extractWikilinks ignores empties and returns nothing without links", () => {
  assertEquals(extractWikilinks("no links here"), []);
  assertEquals(extractWikilinks("[[ ]] [[|alias only]] [[#just-heading]]"), []);
});

Deno.test("buildNoteGraph links by title and basename, skipping unresolved and self-links", () => {
  const graph = buildNoteGraph([
    doc("Pharm/Beta Blockers.md", "Beta Blockers", "Pairs with [[Diuretics]] and [[Nope Missing]] and [[Beta Blockers]]."),
    doc("Pharm/Diuretics.md", "Diuretics — Loop & Thiazide", "See [[Beta Blockers]]."),
    doc("Cardio/Heart Failure.md", "Heart Failure", "Treat with [[Diuretics.md]]."),
  ]);
  assertEquals(graph.nodes.length, 3);
  // Sorted by path: 0 = Cardio/Heart Failure, 1 = Pharm/Beta Blockers, 2 = Pharm/Diuretics.
  assertEquals(graph.nodes.map((n) => n.title), ["Heart Failure", "Beta Blockers", "Diuretics — Loop & Thiazide"]);
  // Reciprocal Beta↔Diuretics dedupes to one edge; Heart Failure→Diuretics resolves via basename with .md.
  assertEquals(graph.edges, [
    { a: 0, b: 2 },
    { a: 1, b: 2 },
  ]);
  assertEquals(graph.nodes.map((n) => n.degree), [1, 1, 2]);
});

Deno.test("buildNoteGraph is order-independent (path-sorted internally)", () => {
  const docs = [
    doc("b.md", "B", "[[A]]"),
    doc("a.md", "A", ""),
  ];
  const forward = buildNoteGraph(docs);
  const reversed = buildNoteGraph([...docs].reverse());
  assertEquals(forward, reversed);
  assertEquals(forward.edges, [{ a: 0, b: 1 }]);
});

Deno.test("buildNoteGraph records the top-level folder per node", () => {
  const graph = buildNoteGraph([doc("Pharm/Cardio/Note.md", "Note", ""), doc("Root.md", "Root", "")]);
  assertEquals(graph.nodes.map((n) => n.folder), ["Pharm", ""]);
});

Deno.test("layoutNoteGraph is deterministic and keeps every node inside the canvas", () => {
  const docs: NoteRef[] = [];
  for (let i = 0; i < 24; i++) {
    const links = i > 0 ? `[[Note ${i - 1}]] [[Note 0]]` : "";
    docs.push(doc(`Course/Note ${i}.md`, `Note ${i}`, links));
  }
  const graph = buildNoteGraph(docs);
  const opts = { height: 500, padding: 24, width: 360 };
  const first = layoutNoteGraph(graph, opts);
  const second = layoutNoteGraph(graph, opts);
  assertEquals(first, second);
  for (const node of first.nodes) {
    assert(node.x >= 24 && node.x <= 336, `x in bounds: ${node.x}`);
    assert(node.y >= 24 && node.y <= 476, `y in bounds: ${node.y}`);
  }
  // The hub (Note 0) should out-degree everyone else.
  const hub = first.nodes.find((n) => n.title === "Note 0");
  assert(hub && hub.degree >= 20, `hub degree ${hub?.degree}`);
});

Deno.test("layoutNoteGraph separates nodes and never mutates its input", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const before = JSON.stringify(graph);
  const laid = layoutNoteGraph(graph, { height: 300, width: 300 });
  assertEquals(JSON.stringify(graph), before);
  const [p, q] = laid.nodes;
  const dist = Math.hypot(p.x - q.x, p.y - q.y);
  assert(dist > 10, `nodes separated: ${dist}`);
});

Deno.test("layoutNoteGraph handles empty and single-note libraries", () => {
  assertEquals(layoutNoteGraph({ edges: [], nodes: [] }, { height: 100, width: 100 }).nodes, []);
  const one = layoutNoteGraph(buildNoteGraph([doc("solo.md", "Solo", "")]), { height: 100, width: 100 });
  assertEquals(one.nodes.length, 1);
  assert(one.nodes[0].x >= 0 && one.nodes[0].x <= 100);
});

// --- gravity/repulsion opts + createLayoutSim (phone Graph sliders) --------

Deno.test("layoutNoteGraph: omitting gravity/repulsion matches passing 1 explicitly", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  const opts = { height: 400, padding: 24, width: 400 };
  // Bit-exact: the multiplier defaults must reproduce the original hardcoded
  // constants (rest*rest and 0.02) exactly, not just approximately.
  assertEquals(layoutNoteGraph(graph, opts), layoutNoteGraph(graph, { ...opts, gravity: 1, repulsion: 1 }));
});

Deno.test("layoutNoteGraph: gravity and repulsion opts are actually threaded into the sim", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  const opts = { height: 400, padding: 24, width: 400 };
  const base = layoutNoteGraph(graph, opts);
  // Proving the params reach the force loop at all — not betting on a
  // specific emergent direction, since the post-layout canvas-fit
  // normalization can mask magnitude-only differences.
  assertNotEquals(layoutNoteGraph(graph, { ...opts, repulsion: 3 }), base);
  assertNotEquals(layoutNoteGraph(graph, { ...opts, gravity: 3 }), base);
});

Deno.test("createLayoutSim stepped to completion matches layoutNoteGraph's one-shot output", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const opts = { height: 300, width: 300 };
  const sim = createLayoutSim(graph, opts);
  assertEquals(sim.settled, false);
  let guard = 0;
  while (!sim.settled && guard++ < 10_000) sim.step();
  assertEquals(sim.settled, true);
  assertEquals(sim.snapshot(), layoutNoteGraph(graph, opts));
});

Deno.test("createLayoutSim never mutates its input graph", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const before = JSON.stringify(graph);
  const sim = createLayoutSim(graph, { height: 300, width: 300 });
  sim.step();
  sim.step();
  void sim.snapshot();
  assertEquals(JSON.stringify(graph), before);
});

Deno.test("createLayoutSim.reheat re-arms a settled sim but is bounded against runaway", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 300, iterations: 5, width: 300 });
  while (!sim.settled) sim.step();
  assertEquals(sim.settled, true);

  sim.reheat();
  assertEquals(sim.settled, false, "reheat should re-arm an already-settled sim");

  // Simulate a slider being dragged for a long time: settle, reheat, repeat.
  // The hard step ceiling must win eventually so this terminates in a settled
  // state no matter how many times reheat() is called.
  for (let k = 0; k < 200; k++) {
    let guard = 0;
    while (!sim.settled && guard++ < 10_000) sim.step();
    sim.reheat();
  }
  assertEquals(sim.settled, true, "hard step ceiling should stop further reheats from re-arming");
});

Deno.test("createLayoutSim.gravity/.repulsion are live-mutable without losing current positions", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 300, width: 300 });
  sim.step();
  sim.step();
  const midway = sim.snapshot();
  // Changing the multipliers mid-flight must not reseed back to the spiral —
  // the next step continues from wherever the sim currently is.
  sim.gravity = 2.5;
  sim.repulsion = 0.4;
  sim.step();
  const after = sim.snapshot();
  const moved = midway.nodes.some((n, i) => n.x !== after.nodes[i].x || n.y !== after.nodes[i].y);
  assert(moved, "step() after a live multiplier change should move at least one node");
});

// --- pin (phone Graph node dragging) ----------------------------------

Deno.test("createLayoutSim.pin fixes a node's position through snapshot() and step()", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  const sim = createLayoutSim(graph, { height: 300, width: 300 });
  sim.pin(0, 40, 60);
  const snap1 = sim.snapshot();
  assertEquals(snap1.nodes[0].x, 40);
  assertEquals(snap1.nodes[0].y, 60);

  // A pinned node must never move under step(), no matter how many
  // iterations run — the force integration skips it entirely.
  for (let k = 0; k < 50; k++) sim.step();

  const snap2 = sim.snapshot();
  assertEquals(snap2.nodes[0].x, 40);
  assertEquals(snap2.nodes[0].y, 60);
});

Deno.test("createLayoutSim.pin clamps the pinned position into the canvas, like unpinned nodes", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 200, padding: 20, width: 200 });
  sim.pin(0, -500, 9999);
  const snap = sim.snapshot();
  assertEquals(snap.nodes[0].x, 20);
  assertEquals(snap.nodes[0].y, 180);
});

Deno.test("createLayoutSim.pin: unpinned nodes keep relaxing around a node held in place", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", "[[A]]"),
  ]);
  const sim = createLayoutSim(graph, { height: 300, width: 300 });
  sim.pin(0, 150, 150);
  const before = sim.snapshot();
  for (let k = 0; k < 20; k++) sim.step();
  const after = sim.snapshot();

  // The pinned node held exactly still...
  assertEquals(after.nodes[0].x, 150);
  assertEquals(after.nodes[0].y, 150);
  // ...while its unpinned neighbors kept responding to forces (including
  // the pinned node's own repulsion/spring pull on them).
  const moved = before.nodes
    .slice(1)
    .some((n, idx) => n.x !== after.nodes[idx + 1].x || n.y !== after.nodes[idx + 1].y);
  assert(moved, "unpinned nodes should keep moving while another node is pinned");
});

Deno.test("createLayoutSim.pin ignores out-of-range indices", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 200, width: 200 });
  const before = sim.snapshot();
  sim.pin(-1, 10, 10);
  sim.pin(99, 10, 10);
  const after = sim.snapshot();
  assertEquals(before, after);
});

Deno.test("createLayoutSim.pin: an empty pin map (the default) leaves snapshot()/layoutNoteGraph parity untouched", () => {
  // Regression guard for the pin plumbing threaded through snapshotPositions:
  // never calling pin() must be byte-identical to the pre-pin behavior.
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  const opts = { height: 300, width: 300 };
  const sim = createLayoutSim(graph, opts);
  while (!sim.settled) sim.step();
  assertEquals(sim.snapshot(), layoutNoteGraph(graph, opts));
});
