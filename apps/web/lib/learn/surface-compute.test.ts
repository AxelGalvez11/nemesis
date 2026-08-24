// The surface wiring: one injected fetch, positional integrity, and text-in text-out.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is the length-mismatch one. Results are applied by POSITION,
// so a short response must apply NOTHING — a wrong picture is worse than a missing one.

import assert from "node:assert/strict";
import test from "node:test";

import { PLOT_ROUTE } from "./plot-compute";
import { computeSurfaces, type SurfaceComputeDeps } from "./surface-compute";

const GRID = [
  [1, 2],
  [3, 4],
];

const ANSWER = JSON.stringify({
  blocks: [
    {
      content: "The saddle.",
      type: "paragraph",
      visual: { expression: "x^2 - y^2", kind: "surface", learningGoal: "See it", xFrom: -2, xTo: 2, yFrom: -2, yTo: 2 },
    },
  ],
});

function respondingWith(body: unknown, ok = true): SurfaceComputeDeps & { calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  return {
    calls,
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body)), url: String(url) });
      return { json: async () => body, ok } as Response;
    }) as typeof globalThis.fetch,
  };
}

test("a surface formula becomes a grid through our own route", async () => {
  const deps = respondingWith({ surfaces: [{ grid: GRID, ok: true }] });
  const out = await computeSurfaces(ANSWER, deps);
  const parsed = JSON.parse(out) as { blocks: Array<{ visual: { grid: unknown } }> };
  assert.deepEqual(parsed.blocks[0]?.visual.grid, GRID);
  assert.equal(deps.calls[0]?.url, PLOT_ROUTE);
  assert.deepEqual(Object.keys(deps.calls[0]?.body as Record<string, unknown>), ["surfaces"]);
});

test("an answer with no surface in it never touches the network", async () => {
  const deps = respondingWith({ surfaces: [] });
  const text = '{"blocks":[{"content":"hello"}]}';
  assert.equal(await computeSurfaces(text, deps), text);
  assert.equal(deps.calls.length, 0);
});

test("prose that is not JSON passes through untouched", async () => {
  const deps = respondingWith({ surfaces: [] });
  const text = 'The word "surface" appearing in prose is not a request.';
  assert.equal(await computeSurfaces(text, deps), text);
  assert.equal(deps.calls.length, 0);
});

test("🔴 a result array of the wrong length applies NOTHING", async () => {
  const deps = respondingWith({ surfaces: [] });
  assert.equal(await computeSurfaces(ANSWER, deps), ANSWER);
});

test("a route failure returns the original text, never an error", async () => {
  const deps = respondingWith({}, false);
  assert.equal(await computeSurfaces(ANSWER, deps), ANSWER);
  const throwing: SurfaceComputeDeps = {
    fetch: (async () => {
      throw new Error("offline");
    }) as typeof globalThis.fetch,
  };
  assert.equal(await computeSurfaces(ANSWER, throwing), ANSWER);
});

test("🔴 every arriving cell is re-read: a poisoned grid fails that surface, and the visual drops", async () => {
  const deps = respondingWith({ surfaces: [{ grid: [[1, "2"], [3, 4]], ok: true }] });
  const out = await computeSurfaces(ANSWER, deps);
  const parsed = JSON.parse(out) as { blocks: Array<{ content: string; visual?: unknown }> };
  assert.equal(parsed.blocks[0]?.visual, undefined);
  assert.equal(parsed.blocks[0]?.content, "The saddle.");
});

test("ragged rows fail the grid rather than being padded", async () => {
  const deps = respondingWith({ surfaces: [{ grid: [[1, 2], [3]], ok: true }] });
  const out = await computeSurfaces(ANSWER, deps);
  const parsed = JSON.parse(out) as { blocks: Array<{ visual?: unknown }> };
  assert.equal(parsed.blocks[0]?.visual, undefined);
});
