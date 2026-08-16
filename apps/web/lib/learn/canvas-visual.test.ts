import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseCanvasVisual } from "./canvas-visual";

test("the semantic router accepts equation, relationship, and quantitative requests", () => {
  assert.equal(parseCanvasVisual({ kind: "equation", latex: "x^2", learningGoal: "Recognise a square" })?.kind, "equation");
  assert.equal(parseCanvasVisual({
    kind: "relationship",
    learningGoal: "Follow the mechanism",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b" }],
  })?.kind, "relationship");
  assert.equal(parseCanvasVisual({
    kind: "quantitative",
    learningGoal: "Compare slopes",
    series: [{ label: "Dose response", points: [{ x: 0, y: 0 }, { x: 1, y: 2 }] }],
  })?.kind, "quantitative");
});

test("unknown kinds, dangling edges, and unbounded payloads are refused", () => {
  assert.equal(parseCanvasVisual({ kind: "threejs", code: "while(true){}", learningGoal: "x" }), null);
  assert.equal(parseCanvasVisual({
    kind: "relationship",
    learningGoal: "x",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "missing" }],
  }), null);
  assert.equal(parseCanvasVisual({
    kind: "relationship",
    learningGoal: "x",
    nodes: Array.from({ length: 9 }, (_, index) => ({ id: `n${index}`, label: "N" })),
    edges: [{ from: "n0", to: "n1" }],
  }), null);
});

test("trusted renderers own the output and KaTeX runs with trust disabled", () => {
  const source = readFileSync(new URL("../../components/workspace/learn/semantic-visual.tsx", import.meta.url), "utf8");
  assert.match(source, /trust: false/);
  assert.match(source, /<svg/);
  for (const forbidden of ["eval(", "new Function", "innerHTML = visual", "visual.code"]) {
    assert.equal(source.includes(forbidden), false, `renderer executes model output through ${forbidden}`);
  }
});
