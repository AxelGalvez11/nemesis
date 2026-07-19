import assert from "node:assert/strict";

import { buildGraphIndex, extractWikilinks } from "./graph-notes";

assert.deepEqual(extractWikilinks("[[ACE inhibitors|ACEIs]] [[ARBs#Overview]] [Beta](Beta blockers.md)"), [
  "ACE inhibitors",
  "ARBs",
  "Beta blockers",
]);

const graph = buildGraphIndex([
  { path: "Cardio/ACE inhibitors.md", title: "ACE inhibitors", folder: "Cardio", content: "[[ARBs]] and [[Missing note]]" },
  { path: "Cardio/ARBs.md", title: "ARBs", folder: "Cardio", content: "[[ACE inhibitors]]" },
]);
assert.equal(graph.nodes.length, 3);
assert.equal(graph.links.length, 3);
assert.equal(graph.ghostCount, 1);
assert.equal(graph.nodes.find((node) => node.ghost)?.target, "Missing note");
assert.equal(graph.nodes.find((node) => node.path === "Cardio/ARBs.md")?.degree, 2);

console.log("graph-notes.test.ts OK");
