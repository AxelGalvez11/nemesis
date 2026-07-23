import assert from "node:assert/strict";

import { labelAlphaFor, measureSettled2DLayout, nodeRadiusFor, visibleGraph } from "./graph-canvas-2d";
import { DEFAULT_CONTROLS } from "./graph-settings";

const index = {
  ghostCount: 0,
  links: [],
  nodes: Array.from({ length: 8 }, (_, index) => ({
    degree: 0,
    ghost: false,
    id: `note-${index}`,
    path: `note-${index}.md`,
    target: null,
    title: `Note ${index}`,
  })),
};

const noRepulsion = measureSettled2DLayout(index, { ...DEFAULT_CONTROLS, dimensions: 2, gravity: 0, repulsion: 0 });
const strongRepulsion = measureSettled2DLayout(index, { ...DEFAULT_CONTROLS, dimensions: 2, gravity: 0, repulsion: 140 });
assert.ok(strongRepulsion.width > noRepulsion.width * 1.2, "repulsion should visibly widen the 2D layout");

const noGravity = measureSettled2DLayout(index, { ...DEFAULT_CONTROLS, dimensions: 2, gravity: 0, repulsion: 70 });
const strongGravity = measureSettled2DLayout(index, { ...DEFAULT_CONTROLS, dimensions: 2, gravity: 0.5, repulsion: 70 });
assert.ok(strongGravity.width < noGravity.width, "gravity should pull the 2D layout toward its center");

// Link force has to actually reach the layout — it replaced a hardcoded
// constant, and a slider that moves nothing is worse than no slider at all.
const linked = {
  ghostCount: 0,
  links: [{ source: "a", target: "b" }, { source: "b", target: "c" }, { source: "c", target: "a" }],
  nodes: ["a", "b", "c"].map((id) => ({ degree: 2, ghost: false, id, path: `${id}.md`, target: null, title: id })),
};
const looseLinks = measureSettled2DLayout(linked, { ...DEFAULT_CONTROLS, dimensions: 2, gravity: 0, linkForce: 0, repulsion: 90 });
const tightLinks = measureSettled2DLayout(linked, { ...DEFAULT_CONTROLS, dimensions: 2, gravity: 0, linkForce: 1, repulsion: 90 });
assert.ok(tightLinks.width < looseLinks.width, "link force should pull linked notes closer together");

// Obsidian's defining rule: the more notes reference a node, the bigger it gets.
const leaf = nodeRadiusFor(1, 10, DEFAULT_CONTROLS.nodeSize);
const hub = nodeRadiusFor(10, 10, DEFAULT_CONTROLS.nodeSize);
assert.ok(hub > leaf, "a hub should draw larger than a leaf");
assert.ok(nodeRadiusFor(0, 10, DEFAULT_CONTROLS.nodeSize) > 0, "an orphan still needs a visible circle");
// sqrt scaling keeps a hub from swallowing the canvas at high degree.
assert.ok(hub < leaf * 3, "the size gap should stay bounded");
assert.ok(nodeRadiusFor(5, 0, DEFAULT_CONTROLS.nodeSize) > 0, "an empty graph must not divide by zero");

// Text fade threshold: names vanish as you zoom out, full strength zoomed in.
assert.equal(labelAlphaFor(0.3, 1.1), 0, "labels are gone when zoomed well out");
assert.equal(labelAlphaFor(3, 1.1), 1, "labels are solid when zoomed in");
assert.ok(labelAlphaFor(1.3, 1.1) > 0 && labelAlphaFor(1.3, 1.1) < 1, "labels fade rather than snapping");
assert.equal(labelAlphaFor(0.05, 0), 1, "threshold 0 means never fade");

// Orphan filter drops unlinked notes only.
const mixed = {
  ghostCount: 0,
  links: [{ source: "a", target: "b" }],
  nodes: ["a", "b", "lonely"].map((id) => ({ degree: id === "lonely" ? 0 : 1, ghost: false, id, path: `${id}.md`, target: null, title: id })),
};
assert.deepEqual(visibleGraph(mixed, false).nodes.map((node) => node.id), ["a", "b"]);
assert.equal(visibleGraph(mixed, true).nodes.length, 3, "showing orphans keeps every note");

console.log("graph-canvas-2d.test.ts OK");
