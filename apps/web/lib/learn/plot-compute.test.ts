// The seam between a model answer and the arithmetic, driven with no network and no server.
//
// 🔴 EVERY TEST HERE IS ABOUT A FAILURE, and that is the point of the file. The happy path is two
// lines and is covered by `computed-plot.test.ts`; what matters is that this layer sits between the
// model and the learner, so every way it can go wrong is a way a turn can be lost. §45's own rule
// applies: a plot that cannot be computed costs the picture, never the explanation around it.

import assert from "node:assert/strict";
import test from "node:test";

import { computePlots, type PlotComputeDeps } from "./plot-compute";

/** A route that answers with whatever it is handed, and counts how often it was asked. */
function routeReturning(results: unknown, status = 200): PlotComputeDeps & { calls: number } {
  const deps = {
    calls: 0,
    fetch: (async () => {
      deps.calls += 1;
      return {
        json: async () => ({ results }),
        ok: status < 400,
        status,
      } as unknown as Response;
    }) as unknown as typeof globalThis.fetch,
  };
  return deps;
}

const NEVER: PlotComputeDeps & { calls: number } = {
  calls: 0,
  fetch: (async () => {
    NEVER.calls += 1;
    throw new Error("the route must not have been called");
  }) as unknown as typeof globalThis.fetch,
};

const ONE_CURVE = JSON.stringify({
  say: "here",
  visuals: [{ kind: "quantitative", series: [{ expression: "x", from: 0, label: "line", to: 2 }], xLabel: "x", yLabel: "y" }],
});

const segment = { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };

test("a turn with no formula in it never reaches the route", async () => {
  const before = NEVER.calls;
  const text = '{"say":"hello"}';
  assert.equal(await computePlots(text, NEVER), text);
  assert.equal(NEVER.calls, before, "the substring test is what keeps the ordinary turn free");
});

test("text that is not JSON is returned untouched", async () => {
  // A rescued turn can arrive as prose; `decisionOrReply` handles that and this must not interfere.
  const text = 'I cannot draw that, but the "expression" you want is x^2.';
  assert.equal(await computePlots(text, NEVER), text);
});

test("a computed curve replaces its formula", async () => {
  const deps = routeReturning([{ ok: true, segments: [segment] }]);
  const out = JSON.parse(await computePlots(ONE_CURVE, deps));
  assert.equal(deps.calls, 1);
  assert.deepEqual(out.visuals[0].series[0].points, segment.points);
  assert.equal(out.visuals[0].series[0].expression, undefined, "the formula must not survive beside its points");
  assert.equal(out.say, "here");
});

// 🔴🔴 THE ONE THAT MATTERS MOST. Results are addressed by POSITION, so a route that returns the
// wrong number of them cannot be partially applied — the second curve would take the first one's
// points and draw a confident wrong picture under a right name. Everything or nothing.
test("a result array of the wrong length applies nothing at all", async () => {
  const two = JSON.stringify({
    visuals: [{
      kind: "quantitative",
      series: [{ expression: "x", from: 0, label: "a", to: 1 }, { expression: "2x", from: 0, label: "b", to: 1 }],
      xLabel: "x",
      yLabel: "y",
    }],
  });
  const out = await computePlots(two, routeReturning([{ ok: true, segments: [segment] }]));
  assert.equal(out, two, "a short result array must be refused, never zipped onto the front");
});

test("a route that errors, or answers with rubbish, costs the picture and not the answer", async () => {
  for (const deps of [
    routeReturning([], 500),
    routeReturning("not an array"),
    { calls: 0, fetch: (async () => { throw new Error("offline"); }) as unknown as typeof globalThis.fetch },
  ]) {
    assert.equal(await computePlots(ONE_CURVE, deps), ONE_CURVE);
  }
});

test("a refused series is passed through as a refusal, and the visual goes", async () => {
  const deps = routeReturning([{ detail: "no value in that range", ok: false, reason: "nothing-to-plot" }]);
  const out = JSON.parse(await computePlots(ONE_CURVE, deps));
  assert.deepEqual(out.visuals, [], "an axis with no line on it reads as a broken app");
  assert.equal(out.say, "here");
});

// 🔴 THE ROUTE IS NOT TRUSTED EITHER, and that is not paranoia about our own code — it is the same
// rule the rest of this pipeline follows. Anything crossing a boundary is checked on arrival, so a
// deploy skew or a half-written response degrades to "no picture" rather than to `NaN` reaching an
// SVG path attribute, where it silently draws nothing and reports nothing.
test("points that are not numbers are dropped before they reach a renderer", async () => {
  const deps = routeReturning([{ ok: true, segments: [{ points: [{ x: 0, y: 0 }, { x: "1", y: 1 }, { x: 2, y: 2 }] }] }]);
  const out = JSON.parse(await computePlots(ONE_CURVE, deps));
  assert.deepEqual(out.visuals[0].series[0].points, [{ x: 0, y: 0 }, { x: 2, y: 2 }]);
});

test("a run left with fewer than two points is not a curve", async () => {
  const deps = routeReturning([{ ok: true, segments: [{ points: [{ x: 0, y: 0 }] }] }]);
  const out = JSON.parse(await computePlots(ONE_CURVE, deps));
  assert.deepEqual(out.visuals, []);
});

test("a slow route is abandoned rather than held against the learner", async () => {
  const deps: PlotComputeDeps = {
    fetch: ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof globalThis.fetch,
    timeoutMs: 20,
  };
  assert.equal(await computePlots(ONE_CURVE, deps), ONE_CURVE);
});
