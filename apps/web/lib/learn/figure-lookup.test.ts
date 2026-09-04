// The seam between a model answer and the reference-image route, driven with no network.
//
// 🔴 THE ARRIVAL CHECK IS THE POINT. The route is our own and is still distrusted on arrival: a
// deploy skew that answers with a host off the allow list, or with a licence object that lost its
// fields, must degrade to "no picture" — never to an <img> the validator would have refused.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveFigures, resolveSubjects, type FigureLookupDeps } from "./figure-lookup";

function routeReturning(results: unknown, status = 200): FigureLookupDeps & { calls: number } {
  const deps = {
    calls: 0,
    fetch: (async () => {
      deps.calls += 1;
      return { json: async () => ({ results }), ok: status < 400, status } as unknown as Response;
    }) as unknown as typeof globalThis.fetch,
  };
  return deps;
}

const NEVER: FigureLookupDeps & { calls: number } = {
  calls: 0,
  fetch: (async () => {
    NEVER.calls += 1;
    throw new Error("the route must not have been called");
  }) as unknown as typeof globalThis.fetch,
};

const LESSON = JSON.stringify({
  blocks: [{ visual: { kind: "figure", learningGoal: "g", subject: "mitosis stages" } }],
});

const GOOD_ASSET = {
  assetPath: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Mitosis.png",
  caption: "The stages of mitosis.",
  licence: { attribution: "Ali Zifan", licence: "CC-BY-SA-4.0", source: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/File:Mitosis.png" },
  provenance: "reference_image",
};

test("an answer with no figure in it never reaches the route", async () => {
  const before = NEVER.calls;
  assert.equal(await resolveFigures('{"say":"hello"}', NEVER), '{"say":"hello"}');
  assert.equal(NEVER.calls, before);
});

test("a resolved subject arrives as a stamped asset on the visual", async () => {
  const deps = routeReturning([{ asset: GOOD_ASSET, ok: true }]);
  const out = JSON.parse(await resolveFigures(LESSON, deps)) as { blocks: Array<{ visual: Record<string, unknown> }> };
  assert.equal(deps.calls, 1);
  assert.deepEqual(out.blocks[0]!.visual.asset, GOOD_ASSET);
});

test("🔴 an asset from a host the allow list has never heard of degrades to no picture", async () => {
  const skewed = { ...GOOD_ASSET, assetPath: "https://evil.example/x.png" };
  const out = JSON.parse(await resolveFigures(LESSON, routeReturning([{ asset: skewed, ok: true }]))) as {
    blocks: Array<{ visual: Record<string, unknown> }>;
  };
  assert.equal("asset" in out.blocks[0]!.visual, false);
  assert.equal(out.blocks[0]!.visual.subject, "mitosis stages");
});

test("🔴 an asset whose licence object lost its fields degrades to no picture", async () => {
  for (const licence of [undefined, {}, { licence: "CC-BY-4.0" }, { source: "Wikimedia Commons" }, { licence: " ", source: "x" }]) {
    const out = JSON.parse(
      await resolveFigures(LESSON, routeReturning([{ asset: { ...GOOD_ASSET, licence }, ok: true }])),
    ) as { blocks: Array<{ visual: Record<string, unknown> }> };
    assert.equal("asset" in out.blocks[0]!.visual, false);
  }
});

test("a result array of the wrong length applies nothing at all", async () => {
  const two = JSON.stringify({
    blocks: [
      { visual: { kind: "figure", learningGoal: "g", subject: "one" } },
      { visual: { kind: "figure", learningGoal: "g", subject: "two" } },
    ],
  });
  assert.equal(await resolveFigures(two, routeReturning([{ asset: GOOD_ASSET, ok: true }])), two);
});

test("a route that errors, or answers with rubbish, costs the picture and not the answer", async () => {
  for (const deps of [routeReturning([], 500), routeReturning("rubbish"), routeReturning(null)]) {
    assert.equal(await resolveFigures(LESSON, deps), LESSON);
  }
});

test("a refused subject strips any model-written asset even though nothing replaced it", async () => {
  const smuggled = JSON.stringify({
    blocks: [{ visual: { asset: { assetPath: "https://evil.example/x.png" }, kind: "figure", learningGoal: "g", subject: "mitosis" } }],
  });
  const out = JSON.parse(
    await resolveFigures(smuggled, routeReturning([{ detail: "nothing", ok: false, reason: "no-candidates" }])),
  ) as { blocks: Array<{ visual: Record<string, unknown> }> };
  assert.equal("asset" in out.blocks[0]!.visual, false);
});

// ── the token, since the route stopped being an open door ───────────────────────────────────────

function capturingRoute(token: (() => Promise<string | null>) | undefined) {
  const seen: { authorization?: string } = {};
  const deps: FigureLookupDeps = {
    fetch: (async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.authorization = headers.Authorization;
      return { json: async () => ({ results: [{ detail: "", ok: false, reason: "no-candidates" }] }), ok: true, status: 200 } as unknown as Response;
    }) as unknown as typeof globalThis.fetch,
    ...(token ? { token } : {}),
  };
  return { deps, seen };
}

test("🔴 the session's token rides the request, because the route now requires one", async () => {
  const { deps, seen } = capturingRoute(async () => "session-token-1");
  await resolveFigures(LESSON, deps);
  assert.equal(seen.authorization, "Bearer session-token-1");
});

test("no token degrades to a plain request, never a throw — the route answers 401 and the prose survives", async () => {
  const { deps, seen } = capturingRoute(async () => null);
  const out = await resolveFigures(LESSON, deps);
  assert.equal(seen.authorization, undefined);
  assert.equal(typeof out, "string");
});

// ── the relevance judge (2026-09-04) ─────────────────────────────────────────────────────────────

const LICENSED = (path: string, caption: string) => ({
  assetPath: path,
  caption,
  licence: { attribution: "Someone", licence: "CC-BY-4.0", source: "Wikimedia Commons" },
  provenance: "reference_image" as const,
});

const routeAnswering = (asset: unknown, alternatives: unknown[] = []) =>
  (async () =>
    new Response(JSON.stringify({ results: [{ alternatives, asset, ok: true }] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    })) as unknown as typeof globalThis.fetch;

test("🔴🔴 a picture the judge says is not of the thing is dropped", async () => {
  // The measured failure: "the doctrine of precedent" returns a scan of Kant's Doctrine du droit.
  // Its licence is genuinely fine, so only a relevance check can stop it.
  const out = await resolveSubjects(["the doctrine of precedent"], {
    fetch: routeAnswering(LICENSED("https://upload.wikimedia.org/a/Kant.jpg", "Kant - Doctrine du droit")),
    judge: async () => ({ verdict: "none" }),
  });
  assert.equal(out?.[0]?.ok, false);
});

test("🔴🔴 the judge may choose a runner-up the licence gate ranked second", async () => {
  // 🔴 WHY `alternatives` TRAVELS AT ALL. `chooseAsset` ranks TRUST and keeps arrival order on
  // ties, so among equally-licensed candidates the winner is the provider's own full-text ranking —
  // which is what puts the wrong picture first. A judge given one option can only say yes or no.
  const out = await resolveSubjects(["mitosis stages"], {
    fetch: routeAnswering(
      LICENSED("https://upload.wikimedia.org/a/wrong.jpg", "a portrait of Walther Flemming"),
      [LICENSED("https://upload.wikimedia.org/a/right.jpg", "A diagram of mitosis stages")],
    ),
    judge: async () => ({ index: 1, verdict: "shows" }),
  });
  assert.equal(out?.[0]?.ok, true);
  assert.equal(out?.[0]?.ok === true ? out[0].asset.assetPath : "", "https://upload.wikimedia.org/a/right.jpg");
});

test("🔴🔴 a judge that cannot answer keeps the picture, and one that throws does too", async () => {
  // A filter on a working lane must never be able to close the lane. Both failure paths are the
  // same outcome: whatever the licence gate chose still shows.
  for (const judge of [
    async () => ({ verdict: "unknown" as const }),
    async () => {
      throw new Error("the model lane is down");
    },
  ]) {
    const out = await resolveSubjects(["mitosis stages"], {
      fetch: routeAnswering(LICENSED("https://upload.wikimedia.org/a/right.jpg", "A diagram of mitosis stages")),
      judge,
    });
    assert.equal(out?.[0]?.ok, true, "a judge failure removed a picture");
  }
});

test("🔴 with no judge at all, nothing changes", async () => {
  // Every caller and every test that predates the judge takes this path.
  const out = await resolveSubjects(["mitosis stages"], {
    fetch: routeAnswering(LICENSED("https://upload.wikimedia.org/a/right.jpg", "A diagram of mitosis stages")),
  });
  assert.equal(out?.[0]?.ok, true);
});

test("🔴🔴 the learner's own figure is never sent to the judge", async () => {
  // It was chosen by matching their own material, not by a repository's full-text search. A model
  // second-guessing their lecture slide is the one place this check could take away a picture that
  // was right by construction.
  let asked = 0;
  const mine = LICENSED("https://upload.wikimedia.org/a/theirs.jpg", "their own slide");
  const out = await resolveSubjects(["mitosis stages"], {
    fetch: (async () => new Response("{}", { status: 500 })) as unknown as typeof globalThis.fetch,
    judge: async () => {
      asked += 1;
      return { verdict: "none" };
    },
    own: async () => [mine],
  });
  assert.equal(asked, 0, "the judge was asked about the learner's own figure");
  assert.equal(out?.[0]?.ok, true);
});
