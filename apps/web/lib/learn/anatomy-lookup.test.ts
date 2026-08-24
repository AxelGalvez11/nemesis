// The anatomy seam: one injected fetch, positional integrity, text in and text out.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is the length-mismatch one. Results are applied by POSITION,
// so a short response must apply NOTHING — the femur's view stamped onto the sentence about the
// sacrum is a wrong picture, which is worse than a missing one.

import assert from "node:assert/strict";
import test from "node:test";

import { ANATOMY_ROUTE, resolveAnatomy, type AnatomyLookupDeps } from "./anatomy-lookup";

const STAMP = {
  assetPath: "/anatomy/overview-skeleton.glb",
  region: "overview-skeleton",
  regionTitle: "Skeleton",
  source: "open3dmodel",
  structures: ["Sacrum"],
};

const ANSWER = JSON.stringify({
  blocks: [
    { content: "The keystone.", visual: { kind: "anatomy", learningGoal: "Place it", structure: "sacrum" } },
  ],
});

function respondingWith(body: unknown, ok = true): AnatomyLookupDeps & { calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  return {
    calls,
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body)), url: String(url) });
      return { json: async () => body, ok } as Response;
    }) as typeof globalThis.fetch,
  };
}

test("a named structure becomes a stamp through our own route", async () => {
  const deps = respondingWith({ results: [{ ok: true, resolved: STAMP }] });
  const out = await resolveAnatomy(ANSWER, deps);
  const parsed = JSON.parse(out) as { blocks: Array<{ visual: { resolved: unknown } }> };
  assert.deepEqual(parsed.blocks[0]?.visual.resolved, STAMP);
  assert.equal(deps.calls[0]?.url, ANATOMY_ROUTE);
  assert.deepEqual(deps.calls[0]?.body, { structures: ["sacrum"] });
});

test("an answer with no anatomy in it never touches the network", async () => {
  const deps = respondingWith({ results: [] });
  const text = '{"blocks":[{"content":"hello"}]}';
  assert.equal(await resolveAnatomy(text, deps), text);
  assert.equal(deps.calls.length, 0);
});

test("🔴 a result array of the wrong length applies NOTHING", async () => {
  const deps = respondingWith({ results: [] });
  assert.equal(await resolveAnatomy(ANSWER, deps), ANSWER);
});

test("a route failure returns the original text, never an error", async () => {
  assert.equal(await resolveAnatomy(ANSWER, respondingWith({}, false)), ANSWER);
  const throwing: AnatomyLookupDeps = {
    fetch: (async () => {
      throw new Error("offline");
    }) as typeof globalThis.fetch,
  };
  assert.equal(await resolveAnatomy(ANSWER, throwing), ANSWER);
});

test("🔴 an arriving stamp is re-read: a steered asset path fails that view, and it drops", async () => {
  const deps = respondingWith({
    results: [{ ok: true, resolved: { ...STAMP, assetPath: "https://evil.test/x.glb" } }],
  });
  const out = await resolveAnatomy(ANSWER, deps);
  const parsed = JSON.parse(out) as { blocks: Array<{ content: string; visual?: unknown }> };
  assert.equal(parsed.blocks[0]?.visual, undefined);
  assert.equal(parsed.blocks[0]?.content, "The keystone.");
});
