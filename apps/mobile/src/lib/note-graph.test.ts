// Deno unit tests (repo convention) for the note-graph pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/note-graph.test.ts
//
// Imports ONLY note-graph.ts, which carries no platform dependency (like
// library-sync.ts) so this file loads clean under Deno.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNoteGraph,
  createLayoutSim,
  extractMarkdownLinks,
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

Deno.test("buildNoteGraph links by title and basename, skipping self-links", () => {
  const graph = buildNoteGraph([
    doc("Pharm/Beta Blockers.md", "Beta Blockers", "Pairs with [[Diuretics]] and [[Beta Blockers]]."),
    doc("Pharm/Diuretics.md", "Diuretics — Loop & Thiazide", "See [[Beta Blockers]]."),
    doc("Cardio/Heart Failure.md", "Heart Failure", "Treat with [[Diuretics.md]]."),
  ]);
  assertEquals(graph.nodes.length, 3);
  // Sorted by path: 0 = Cardio/Heart Failure, 1 = Pharm/Beta Blockers, 2 = Pharm/Diuretics.
  assertEquals(graph.nodes.map((n) => n.title), ["Heart Failure", "Beta Blockers", "Diuretics — Loop & Thiazide"]);
  assertEquals(graph.nodes.map((n) => n.ghost), [false, false, false]);
  // Reciprocal Beta↔Diuretics dedupes to one edge; Heart Failure→Diuretics resolves via basename with .md.
  assertEquals(graph.edges, [
    { a: 0, b: 2 },
    { a: 1, b: 2 },
  ]);
  assertEquals(graph.nodes.map((n) => n.degree), [1, 1, 2]);
});

Deno.test("buildNoteGraph turns an unresolved link target into a ghost node instead of dropping it", () => {
  const graph = buildNoteGraph([
    doc("Pharm/Beta Blockers.md", "Beta Blockers", "Pairs with [[Diuretics]] and [[Nope Missing]] and [[Beta Blockers]]."),
    doc("Pharm/Diuretics.md", "Diuretics — Loop & Thiazide", "See [[Beta Blockers]]."),
    doc("Cardio/Heart Failure.md", "Heart Failure", "Treat with [[Diuretics.md]]."),
  ]);
  // 3 real notes (sorted: Heart Failure, Beta Blockers, Diuretics) + 1 ghost,
  // ALWAYS appended after every real note regardless of where the link
  // appeared, so real-note indices stay stable.
  assertEquals(graph.nodes.length, 4);
  assertEquals(graph.nodes.map((n) => n.title), [
    "Heart Failure",
    "Beta Blockers",
    "Diuretics — Loop & Thiazide",
    "Nope Missing",
  ]);
  assertEquals(graph.nodes.map((n) => n.ghost), [false, false, false, true]);
  assertEquals(graph.nodes[3].pathHash, "ghost:nope missing");
  // Same edges as the self-links-only test, plus Beta Blockers -> the ghost.
  assertEquals(graph.edges, [
    { a: 0, b: 2 },
    { a: 1, b: 2 },
    { a: 1, b: 3 },
  ]);
  assertEquals(graph.nodes.map((n) => n.degree), [1, 2, 2, 1]);
});

Deno.test("buildNoteGraph dedupes ghost nodes across notes and across case/whitespace variants", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[Missing Drug]]"),
    doc("b.md", "B", "[[ missing drug ]]"),
    doc("c.md", "C", "[[Missing Drug.md]]"),
  ]);
  const ghosts = graph.nodes.filter((n) => n.ghost);
  assertEquals(ghosts.length, 1, "one ghost shared by every variant spelling");
  assertEquals(ghosts[0].degree, 3, "all three notes count toward the shared ghost's degree");
  assertEquals(graph.edges.length, 3);
});

Deno.test("extractMarkdownLinks resolves [label](Target.md) links, directory-prefixed and bare", () => {
  assertEquals(
    extractMarkdownLinks("See [ARBs](Cardio/ARBs.md) and [this one](Beta blockers.MD)."),
    ["ARBs", "Beta blockers"],
  );
  assertEquals(extractMarkdownLinks("No markdown links, just [[a wikilink]]."), []);
});

Deno.test("buildNoteGraph resolves plain-markdown links the same as wikilinks", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "See [ARBs](ARBs.md) for detail."),
    doc("b.md", "ARBs", ""),
  ]);
  assertEquals(graph.edges, [{ a: 0, b: 1 }]);
  assertEquals(graph.nodes.map((n) => n.degree), [1, 1]);
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

Deno.test("layoutNoteGraph: omitting linkDistance matches passing 1 explicitly", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  const opts = { height: 400, padding: 24, width: 400 };
  // Bit-exact, same guarantee as the gravity/repulsion default above: the
  // rest-length multiplier default must reproduce the original hardcoded
  // `rest` constant exactly (rest * 1 === rest), not just approximately.
  assertEquals(layoutNoteGraph(graph, opts), layoutNoteGraph(graph, { ...opts, linkDistance: 1 }));
});

Deno.test("layoutNoteGraph: linkDistance is actually threaded into the sim", () => {
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  const opts = { height: 400, padding: 24, width: 400 };
  const base = layoutNoteGraph(graph, opts);
  // Same proof shape as the gravity/repulsion test above — not betting on a
  // specific emergent direction, just that the multiplier reaches the spring
  // force loop at all.
  assertNotEquals(layoutNoteGraph(graph, { ...opts, linkDistance: 3 }), base);
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

Deno.test("createLayoutSim.linkDistance is live-mutable without losing current positions", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 300, width: 300 });
  sim.step();
  sim.step();
  const midway = sim.snapshot();
  // Changing the multiplier mid-flight must not reseed back to the spiral —
  // the next step continues from wherever the sim currently is.
  sim.linkDistance = 2.5;
  sim.step();
  const after = sim.snapshot();
  const moved = midway.nodes.some((n, i) => n.x !== after.nodes[i].x || n.y !== after.nodes[i].y);
  assert(moved, "step() after a live linkDistance change should move at least one node");
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

// --- startDrag/endDrag (phone Graph screen: drag pulls linked neighbors) --

Deno.test("createLayoutSim.startDrag keeps a settled sim hot until endDrag", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 300, width: 300 });
  while (!sim.settled) sim.step();
  assertEquals(sim.settled, true);

  sim.startDrag(0);
  assertEquals(sim.settled, false, "an active drag should never report settled");
  for (let i = 0; i < 50; i++) sim.step();
  assertEquals(sim.settled, false, "should stay hot for the whole gesture, not cool down mid-drag");

  sim.endDrag();
  let guard = 0;
  while (!sim.settled && guard++ < 10_000) sim.step();
  assertEquals(sim.settled, true, "should ease back to settled after the drag ends");
});

Deno.test("createLayoutSim.startDrag ignores out-of-range indices", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 200, width: 200 });
  while (!sim.settled) sim.step();
  sim.startDrag(-1);
  assertEquals(sim.settled, true, "an out-of-range startDrag must not force settled=false forever");
  sim.startDrag(99);
  assertEquals(sim.settled, true);
});

Deno.test("createLayoutSim.endDrag without a prior startDrag is a harmless no-op (mirrors a tap's defensive cleanup call)", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 200, width: 200 });
  while (!sim.settled) sim.step();
  sim.endDrag();
  let guard = 0;
  while (!sim.settled && guard++ < 10_000) sim.step();
  assertEquals(sim.settled, true, "should settle right back down, never throw or hang");
});

Deno.test("createLayoutSim.startDrag: a dragged node pulls its neighbor along instead of moving alone", () => {
  // This guards the original owner bug, "dragging only moves that node". It used
  // to compare startDrag against a pin()+reheat() baseline, because the old
  // hand-rolled sim's springs were far too soft for reheat alone to drag a
  // neighbor and startDrag added a 5x spring boost on top. On d3-force
  // forceLink does that work in BOTH paths, so the two are now within ~2px of
  // each other and the old comparison no longer says anything.
  //
  // The honest baseline is pinning with NO heat at all: a settled sim is below
  // alphaMin, step() is a no-op, and the neighbor genuinely cannot move. That is
  // the bug. What matters is that startDrag makes it move.
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  const opts = { height: 400, width: 400 };
  const target = { x: 350, y: 350 };
  const gapToTarget = (node: { x: number; y: number }) => Math.hypot(target.x - node.x, target.y - node.y);

  const settled = () => {
    const s = createLayoutSim(graph, opts);
    while (!s.settled) s.step();
    return s;
  };

  const startGap = gapToTarget(settled().snapshot().nodes[1]);

  // No heat: the neighbor is stranded exactly where it was.
  const cold = settled();
  cold.pin(0, target.x, target.y);
  for (let i = 0; i < 60; i++) cold.step();
  assertEquals(gapToTarget(cold.snapshot().nodes[1]), startGap);

  // Dragging: the neighbor closes a real part of the distance.
  const dragged = settled();
  dragged.startDrag(0);
  dragged.pin(0, target.x, target.y);
  for (let i = 0; i < 60; i++) dragged.step();
  const draggedGap = gapToTarget(dragged.snapshot().nodes[1]);
  assert(
    draggedGap < startGap - 40,
    `startDrag should pull the neighbor meaningfully closer: was ${startGap}, now ${draggedGap}`,
  );
});

Deno.test("createLayoutSim: a dragged node's neighbor follows to the link rest length, not all the way", () => {
  // The neighbor should NOT end up on top of the dragged node — forceLink pulls
  // it to its rest distance and forceCollide keeps it off. Getting this wrong in
  // the obvious direction (a stiff enough spring) collapses linked nodes into
  // each other, which is the opposite of the Obsidian look.
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const sim = createLayoutSim(graph, { height: 400, width: 400 });
  while (!sim.settled) sim.step();
  sim.startDrag(0);
  sim.pin(0, 340, 340);
  for (let i = 0; i < 200; i++) sim.step();
  const [a, b] = sim.snapshot().nodes;
  const separation = Math.hypot(a.x - b.x, a.y - b.y);
  assert(separation > 20, `linked nodes should not collapse onto each other, got ${separation}`);
});

Deno.test("createLayoutSim: snapshot() does not rescale, so a settled graph stops moving entirely", () => {
  // The regression this locks down: snapshotPositions used to fit the extent to
  // the canvas on EVERY call, and graph.tsx calls snapshot() once per frame — so
  // the whole constellation breathed and slid while it settled. Repeated
  // snapshots of a settled sim must now be identical.
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", "[[A]]"),
    doc("d.md", "D", ""),
  ]);
  const sim = createLayoutSim(graph, { height: 400, width: 400 });
  while (!sim.settled) sim.step();
  const first = sim.snapshot();
  sim.step();
  sim.step();
  const second = sim.snapshot();
  assertEquals(
    second.nodes.map((n) => [n.x, n.y]),
    first.nodes.map((n) => [n.x, n.y]),
  );
});

Deno.test("createLayoutSim: forceCollide keeps unlinked nodes off each other", () => {
  // Nothing in the old sim prevented overlap; even spacing is a defining part of
  // the Obsidian look. Four unconnected notes should spread, not pile up.
  const graph = buildNoteGraph([
    doc("a.md", "A", ""),
    doc("b.md", "B", ""),
    doc("c.md", "C", ""),
    doc("d.md", "D", ""),
  ]);
  const sim = createLayoutSim(graph, { height: 400, width: 400 });
  while (!sim.settled) sim.step();
  const nodes = sim.snapshot().nodes;
  let closest = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      closest = Math.min(closest, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
    }
  }
  assert(closest > 16, `nodes should be visibly separated, closest pair was ${closest}`);
});

Deno.test("createLayoutSim.startDrag/.endDrag: many cumulative drags never exhaust reheat()'s lifetime step ceiling", () => {
  // Regression guard: dragging must run on its own per-gesture step budget,
  // never spending from totalStepsRun/hardStepCeiling (the lifetime counter
  // reheat() — i.e. sliders — is bounded by). If it shared that budget, a
  // few long drags in one session would exhaust it and dragging would
  // silently stop pulling neighbors for the rest of the sim's lifetime —
  // the original bug, resurrected after heavy use instead of on first try.
  const graph = buildNoteGraph([
    doc("a.md", "A", "[[B]]"),
    doc("b.md", "B", "[[C]]"),
    doc("c.md", "C", ""),
  ]);
  // iterations: 5 -> hardStepCeiling = max(5, 5*8) = 40, trivially exhausted
  // by ordinary reheat() cycles below (same shape as the reheat runaway test
  // above), so this graph proves dragging survives the ceiling rather than
  // relying on it being generous enough in practice.
  const sim = createLayoutSim(graph, { height: 300, iterations: 5, width: 300 });
  while (!sim.settled) sim.step();

  // Exhaust the lifetime ceiling via ordinary reheat()s first (e.g. a lot of
  // slider tweaking before the user ever touches a node).
  for (let k = 0; k < 20; k++) {
    let guard = 0;
    while (!sim.settled && guard++ < 10_000) sim.step();
    sim.reheat();
  }
  assertEquals(sim.settled, true, "lifetime ceiling should be exhausted by this point");

  // Now drag repeatedly — many separate gestures, each stepping well past
  // what the already-exhausted lifetime ceiling would allow if dragging
  // shared it.
  const before = sim.snapshot();
  for (let g = 0; g < 5; g++) {
    sim.startDrag(0);
    for (let s = 0; s < 100; s++) {
      sim.pin(0, 250 + g, 50 - g);
      sim.step();
    }
    sim.endDrag();
    let guard = 0;
    while (!sim.settled && guard++ < 10_000) sim.step();
  }
  const after = sim.snapshot();
  const neighborMoved = before.nodes[1].x !== after.nodes[1].x || before.nodes[1].y !== after.nodes[1].y;
  assert(neighborMoved, "neighbor should still respond to dragging after the slider lifetime ceiling was exhausted");
});

Deno.test("createLayoutSim: a drag that never ends still reaches settled, so the render loop can stop", () => {
  // PERFORMANCE regression guard (owner 2026-07-23: "the graph is super slow").
  // graph.tsx reschedules its rAF loop until the sim reports settled, and
  // re-renders every node on each pass. `settled` is false while dragging, so a
  // drag whose endDrag() never arrives — a cancelled gesture, a finger lost off
  // the screen edge, an unmount mid-drag — used to pin the whole screen at 60fps
  // forever with nothing actually moving. The drag's own step budget must expire
  // it rather than idle inside it.
  const graph = buildNoteGraph(
    Array.from({ length: 30 }, (_, i) => doc(`n${i}.md`, `N${i}`, `[[N${(i + 1) % 30}]]`)),
  );
  const sim = createLayoutSim(graph, { height: 700, width: 390 });
  while (!sim.settled) sim.step();

  sim.startDrag(0);
  sim.pin(0, 300, 300);
  // Deliberately NO endDrag().
  let steps = 0;
  while (!sim.settled && steps < 200_000) {
    sim.step();
    steps += 1;
  }
  assert(sim.settled, `a drag with no endDrag must still settle; gave up after ${steps} steps`);
});
