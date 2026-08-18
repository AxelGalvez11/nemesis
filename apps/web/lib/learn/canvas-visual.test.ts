import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseCanvasVisual, validateCanvasVisual, type VisualRefusal } from "./canvas-visual";

/** The reason for a request that should be refused, or `null` when it was accepted. */
function reasonFor(value: unknown): VisualRefusal | null {
  const result = validateCanvasVisual(value);
  return result.ok ? null : result.reason;
}

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

// ─────────────────────────────────────────────────────────────── named reasons

test("🔴 every refusal carries a NAMED reason, not one word for all of them", () => {
  // The bare `null` this replaced reported a security probe and a typo identically.
  const cases: ReadonlyArray<readonly [VisualRefusal, unknown]> = [
    ["not-a-request", "just a string"],
    ["unknown-kind", { kind: "threejs", learningGoal: "Spin it" }],
    ["text-out-of-bounds", { kind: "equation", latex: "x^2" }],
    ["unsafe-latex", { kind: "equation", latex: "\\href{https://x.test}{y}", learningGoal: "Read" }],
    ["node-count", { edges: [{ from: "a", to: "b" }], kind: "relationship", learningGoal: "x", nodes: [{ id: "a", label: "A" }] }],
    ["malformed-node", {
      edges: [{ from: "a", to: "a" }],
      kind: "relationship",
      learningGoal: "x",
      nodes: [{ id: "a", label: "A" }, { id: "a", label: "B" }],
    }],
    ["dangling-edge", {
      edges: [{ from: "a", to: "ghost" }],
      kind: "relationship",
      learningGoal: "x",
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    }],
    ["series-count", { kind: "quantitative", learningGoal: "x", series: [] }],
    ["point-count", { kind: "quantitative", learningGoal: "x", series: [{ label: "S", points: [{ x: 1, y: 1 }] }] }],
    ["non-finite-number", {
      kind: "quantitative",
      learningGoal: "x",
      series: [{ label: "S", points: [{ x: 1, y: 1 }, { x: 2, y: Number.NaN }] }],
    }],
  ];
  const seen = new Set<VisualRefusal>();
  for (const [expected, value] of cases) {
    assert.equal(reasonFor(value), expected, JSON.stringify(value).slice(0, 90));
    seen.add(expected);
  }
  // 🔴 THE REASONS MUST BE DISTINCT, WHICH IS THE WHOLE CLAIM. Ten inputs producing ten names is
  // the difference between a named reason and a renamed null.
  assert.equal(seen.size, cases.length);
});

test("🔴 a refusal's detail names the specific thing that was wrong", () => {
  const result = validateCanvasVisual({
    edges: [{ from: "a", to: "ghost" }],
    kind: "relationship",
    learningGoal: "x",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.detail, /ghost/);
});

test("🔴 the LaTeX escapes out of mathematics are refused by name", () => {
  for (const latex of [
    "\\href{https://evil.test}{x}",
    "\\url{https://evil.test}",
    "\\includegraphics{/etc/passwd}",
    "\\htmlClass{a}{b}",
    "\\def\\x{\\x\\x}\\x",
    "\\newcommand{\\q}{\\q\\q}\\q",
  ]) {
    assert.equal(reasonFor({ kind: "equation", latex, learningGoal: "Read it" }), "unsafe-latex", latex);
  }
});

test("🔴 ordinary notation from any field is untouched by the safety rule", () => {
  // Field-agnostic: the deny list names LaTeX commands, never subjects.
  for (const latex of ["\\sigma = \\frac{F}{A}", "P(A \\mid B)", "\\int_0^1 x^2\\,dx", "\\text{mens rea}"]) {
    assert.equal(reasonFor({ kind: "equation", latex, learningGoal: "Read it" }), null, latex);
  }
});

test("parseCanvasVisual stays the answer for callers that only need yes or no", () => {
  assert.equal(parseCanvasVisual({ kind: "equation", latex: "x^2", learningGoal: "Squares" })?.kind, "equation");
  assert.equal(parseCanvasVisual({ kind: "equation", latex: "\\href{a}{b}", learningGoal: "x" }), null);
});

test("🔴 the equation renderer is bounded against expansion and size blowup", () => {
  // `trust: false` stops the escape commands; neither of these is an escape. `\def\x{\x\x}` is
  // well-formed LaTeX that expands exponentially, and an enormous `\rule` is well-formed too.
  const source = readFileSync(new URL("../../components/workspace/learn/semantic-visual.tsx", import.meta.url), "utf8");
  assert.match(source, /maxExpand:\s*\d+/);
  assert.match(source, /maxSize:\s*\d+/);
});

test("🔴 the one animation on the occlusion screen yields to reduced motion", () => {
  const source = readFileSync(new URL("../../components/workspace/learn/figure-occlusion.tsx", import.meta.url), "utf8");
  // 🔴 THE CLASS STRING, NOT THE FILE — AND THE FIRST VERSION OF THIS ASSERTION WAS DECORATION.
  // It was `assert.match(source, /motion-reduce:transition-none/)`, and calibration proved it dead:
  // deleting the class from the `<img>` turned NOTHING red, because the comment three lines above
  // the class names the same token and the regex found that instead. A guard that passes on prose
  // describing the code has no causal link to the code. Requiring both classes inside ONE
  // double-quoted literal cannot be satisfied by a comment, which uses backticks inside a JSX block.
  assert.match(
    source,
    /"[^"]*\btransition-opacity\b[^"]*\bmotion-reduce:transition-none\b[^"]*"/,
    "the fade must carry its reduced-motion escape in the same class string",
  );
});

// ───────────────────────────────────────────── §42: structures and edge polarity

const ASPIRIN = "CC(=O)OC1=CC=CC=C1C(=O)O";

function structure(over: Record<string, unknown> = {}) {
  return { kind: "structure", learningGoal: "Recognise the ester group", notation: "smiles", value: ASPIRIN, ...over };
}

test("🔴 a structure arrives as notation, and the notation is what survives validation", () => {
  const result = validateCanvasVisual(structure());
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.visual.kind === "structure" && result.visual.value, ASPIRIN);
});

test("🔴 a structure carrying raw SVG is refused on the alphabet, not drawn", () => {
  const result = validateCanvasVisual(structure({ value: "<svg><path d='M0 0'/></svg>" }));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "malformed-structure");
  assert.match(result.ok === false ? result.detail : "", /structure-not-notation/);
});

test("a notation no depiction owns is refused as a structure problem, with the reason kept", () => {
  const result = validateCanvasVisual(structure({ notation: "inchi", value: "InChI=1S/H2O/h1H2" }));
  assert.equal(result.ok === false && result.reason, "malformed-structure");
  assert.match(result.ok === false ? result.detail : "", /structure-unsupported-notation/);
});

test("🔴 a resolved structure keeps where it came from, and a half-filled stamp is refused", () => {
  // "A model wrote this SMILES" and "a resolver returned it for this name" are both legitimate and
  // are not equally trustworthy. A surface that cannot tell them apart presents them identically.
  const ok = validateCanvasVisual(structure({ resolvedFrom: { id: "2244", name: "aspirin", provider: "pubchem" } }));
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.visual.kind === "structure" && ok.visual.resolvedFrom?.id, "2244");

  const bad = validateCanvasVisual(structure({ resolvedFrom: { name: "aspirin" } }));
  assert.equal(bad.ok, false);
  assert.equal(bad.ok === false && bad.reason, "malformed-structure");
});

test("🔴 an edge may state whether it means more or less", () => {
  const result = validateCanvasVisual({
    edges: [{ from: "a", polarity: "increases", to: "b" }, { from: "b", polarity: "decreases", to: "c" }],
    kind: "relationship",
    learningGoal: "Follow the cascade",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.visual.kind === "relationship" && result.visual.edges[1].polarity, "decreases");
});

test("an edge with no polarity is unchanged from before polarity existed", () => {
  const result = validateCanvasVisual({
    edges: [{ from: "a", to: "b" }],
    kind: "relationship",
    learningGoal: "Follow the chain",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.visual.kind === "relationship" && "polarity" in result.visual.edges[0], false);
});

test("a polarity no renderer draws is refused by name", () => {
  const result = validateCanvasVisual({
    edges: [{ from: "a", polarity: "phosphorylates", to: "b" }],
    kind: "relationship",
    learningGoal: "Follow the chain",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  });
  assert.equal(result.ok === false && result.reason, "malformed-polarity");
});
