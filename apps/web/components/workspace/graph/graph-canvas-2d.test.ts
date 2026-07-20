import assert from "node:assert/strict";

import { measureSettled2DLayout } from "./graph-canvas-2d";
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

console.log("graph-canvas-2d.test.ts OK");
