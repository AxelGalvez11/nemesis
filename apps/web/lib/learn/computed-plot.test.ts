// What this file proves, and the one thing it cannot.
//
// 🔴 IT DOES NOT PROVE THAT `sin(x)` EVALUATES CORRECTLY. That is `computed-series.test.ts`'s job
// and it already does it. What is new in §45's wiring is everything AROUND the arithmetic — finding
// the formulas in a model's answer, addressing the results back onto the right series, and deciding
// what a plot looks like when one of its curves could not be computed. Every defect this layer can
// have is a defect of correspondence, so every test below is about correspondence.
//
// 🔴 THE POSITIONAL CONTRACT IS THE DANGEROUS PART. `collectComputedSeries` and `applyComputedSeries`
// walk the same tree and agree by ORDER alone — no ids, no pointers. That is the right design (two
// walks of one immutable value cannot disagree) and it is exactly the design where an off-by-one
// draws the wrong curve under the right name rather than failing. Several tests here exist only to
// pin that.

import assert from "node:assert/strict";
import test from "node:test";

import { applyComputedSeries, collectComputedSeries, mightComputePlot, type ComputedSeriesResult } from "./computed-plot";

const ok = (...ys: number[]): ComputedSeriesResult => ({
  ok: true,
  segments: [{ points: ys.map((y, x) => ({ x, y })) }],
});

const failed: ComputedSeriesResult = { detail: "no", ok: false, reason: "nothing-to-plot" };

const plot = (series: unknown[]) => ({ kind: "quantitative", series, xLabel: "x", yLabel: "y" });

test("the cheap test comes first, so a turn with no maths in it pays nothing", () => {
  assert.equal(mightComputePlot('{"say":"hello"}'), false);
  assert.equal(mightComputePlot('{"visuals":[{"kind":"table"}]}'), false);
  assert.equal(mightComputePlot('{"series":[{"expression":"x^2"}]}'), true);
  assert.equal(mightComputePlot('{"series":[{"distribution":{"kind":"normal"}}]}'), true);
});

test("a formula is collected, a listed series is left alone", () => {
  const found = collectComputedSeries(plot([
    { expression: "x^2", from: -3, label: "x²", to: 3 },
    { label: "data", points: [{ x: 0, y: 1 }] },
  ]));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.expression, "x^2");
  assert.equal(found[0]?.label, "x²");
});

// 🔴 `points` WINS OVER A FORMULA, and this is the conservative reading rather than an arbitrary
// precedence. A model that listed its points and also named a formula has already answered; asking
// the server to recompute would silently replace what it said with what we derived, and any
// disagreement between the two would be settled in favour of the half nobody checked.
test("a series that gives both points and a formula keeps its points", () => {
  const found = collectComputedSeries(plot([{ expression: "x^2", from: 0, label: "both", points: [{ x: 0, y: 0 }], to: 1 }]));
  assert.deepEqual(found, []);
});

test("a series that gives neither, or an unusable domain, is not a request", () => {
  assert.deepEqual(collectComputedSeries(plot([{ from: 0, label: "nothing", to: 1 }])), []);
  assert.deepEqual(collectComputedSeries(plot([{ expression: "x", label: "no domain" }])), []);
  assert.deepEqual(collectComputedSeries(plot([{ expression: "x", from: "0", label: "text domain", to: 1 }])), []);
  // Both at once is a model that has not decided what it is drawing.
  assert.deepEqual(
    collectComputedSeries(plot([{ distribution: { kind: "normal" }, expression: "x", from: 0, label: "both", to: 1 }])),
    [],
  );
});

// 🔴 THE WALK LOOKS FOR THE VISUAL, NEVER FOR ITS CONTAINER, because the same shape arrives inside
// three different envelopes today and will arrive in a fourth. A lesson nests it under
// `blocks[].visual`; a turn decision puts it in `visuals[]`; a canvas operation carries one `visual`.
test("formulas are found wherever the envelope puts them", () => {
  const lesson = { blocks: [{ content: "…", visual: plot([{ expression: "x", from: 0, label: "a", to: 1 }]) }] };
  const reply = { say: "here", visuals: [plot([{ expression: "2x", from: 0, label: "b", to: 1 }])] };
  assert.equal(collectComputedSeries(lesson).length, 1);
  assert.equal(collectComputedSeries(reply).length, 1);
  assert.equal(collectComputedSeries({ deeply: { nested: [reply, lesson] } }).length, 2);
});

test("computed points land on the series that asked for them", () => {
  const answer = plot([{ expression: "x", from: 0, label: "line", to: 2 }]);
  const applied = applyComputedSeries(answer, [ok(0, 1, 2)]) as { series: Array<{ label: string; points: unknown[] }> };
  assert.equal(applied.series.length, 1);
  assert.equal(applied.series[0]?.label, "line");
  assert.deepEqual(applied.series[0]?.points, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
});

// 🔴🔴 THE OFF-BY-ONE THIS WHOLE FILE EXISTS TO CATCH. Results are addressed by position across a
// mixture of computed and listed series; a walk that counted the listed ones would shift every
// later curve onto the wrong formula — a WRONG picture under a right name, which is worse than a
// missing one and is invisible from the outside.
test("a mixture of listed and computed series stays in register", () => {
  const answer = plot([
    { label: "measured", points: [{ x: 0, y: 9 }] },
    { expression: "x", from: 0, label: "first formula", to: 1 },
    { label: "also measured", points: [{ x: 1, y: 8 }] },
    { expression: "2x", from: 0, label: "second formula", to: 1 },
  ]);
  const applied = applyComputedSeries(answer, [ok(1, 1), ok(2, 2)]) as { series: Array<{ label: string; points: Array<{ y: number }> }> };
  const byLabel = new Map(applied.series.map((series) => [series.label, series.points]));
  assert.deepEqual(byLabel.get("measured"), [{ x: 0, y: 9 }]);
  assert.deepEqual(byLabel.get("also measured"), [{ x: 1, y: 8 }]);
  assert.equal(byLabel.get("first formula")?.[0]?.y, 1);
  assert.equal(byLabel.get("second formula")?.[0]?.y, 2);
});

// 🔴 A CURVE BROKEN BY A POLE IS SEVERAL SERIES UNDER ONE NAME, which is what the renderer expects
// (§45): it colours and lists a curve by its label rather than by its index precisely so that the
// two runs of `1/x` read as one function. Joining them would draw a line straight through the
// asymptote the lesson is about.
test("a split curve becomes one series per run, all under the one name", () => {
  const answer = plot([{ expression: "1/x", from: -2, label: "1/x", to: 2 }]);
  const split: ComputedSeriesResult = {
    ok: true,
    segments: [{ points: [{ x: -2, y: -0.5 }, { x: -1, y: -1 }] }, { points: [{ x: 1, y: 1 }, { x: 2, y: 0.5 }] }],
  };
  const applied = applyComputedSeries(answer, [split]) as { series: Array<{ label: string }> };
  assert.equal(applied.series.length, 2);
  assert.deepEqual(applied.series.map((series) => series.label), ["1/x", "1/x"]);
});

// 🔴🔴 AN EMPTY AXIS READS AS A BROKEN APP, NOT AS A REFUSAL. `sqrt(x)` from −10 to −1 is a real
// formula asked over the wrong range; drawing the axes with no line between them tells the learner
// that Nemesis failed rather than that the function has no value there. The prose survives.
test("a plot whose every curve failed loses the visual, not the answer", () => {
  const reply = { say: "here it is", visuals: [plot([{ expression: "sqrt(x)", from: -10, label: "√x", to: -1 }])] };
  const applied = applyComputedSeries(reply, [failed]) as { say: string; visuals: unknown[] };
  assert.equal(applied.say, "here it is");
  assert.deepEqual(applied.visuals, [], "a null must not survive into the visuals array");
});

test("a plot that lost one curve of two keeps the other", () => {
  const answer = plot([
    { expression: "x", from: 0, label: "kept", to: 1 },
    { expression: "sqrt(x)", from: -9, label: "lost", to: -1 },
  ]);
  const applied = applyComputedSeries(answer, [ok(0, 1), failed]) as { series: Array<{ label: string }> };
  assert.deepEqual(applied.series.map((series) => series.label), ["kept"]);
});

test("a block's visual is removed rather than nulled when it computes to nothing", () => {
  const lesson = { blocks: [{ content: "…", visual: plot([{ expression: "sqrt(x)", from: -9, label: "x", to: -1 }]) }] };
  const applied = applyComputedSeries(lesson, [failed]) as { blocks: Array<Record<string, unknown>> };
  assert.equal("visual" in (applied.blocks[0] ?? {}), false);
  assert.equal(applied.blocks[0]?.content, "…");
});

test("an answer with nothing to compute comes back byte-identical", () => {
  const answer = { blocks: [{ content: "hello", visual: plot([{ label: "d", points: [{ x: 0, y: 0 }] }]) }] };
  assert.deepEqual(applyComputedSeries(answer, []), answer);
});
