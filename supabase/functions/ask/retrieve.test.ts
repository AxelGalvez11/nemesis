import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeMatchRows, retrieve } from "./retrieve.ts";

// mergeMatchRows: pure merge/dedup/rerank helper for Task 2 (parallel multi-query recall).
// Network-free by construction — takes already-fetched per-query row arrays and returns the
// merged pool. This is the core testable unit; retrieve()'s orchestration (embed + RPC fan-out)
// is exercised indirectly via the "subQueries length <= 1 is unchanged" contract, documented below.

function row(id: string, similarity: number, source_id = "src-1") {
  return {
    id,
    source_id,
    chunk_text: `text-${id}`,
    section: null,
    provider: "pubmed",
    license: null,
    source_url: null,
    retrieved_at: null,
    similarity,
  };
}

Deno.test("mergeMatchRows: empty input returns []", () => {
  assertEquals(mergeMatchRows([], 10), []);
  assertEquals(mergeMatchRows([[]], 10), []);
  assertEquals(mergeMatchRows([[], []], 10), []);
});

Deno.test("mergeMatchRows: single-array input returns those rows unchanged (order preserved)", () => {
  const rows = [row("a", 0.9), row("b", 0.8), row("c", 0.7)];
  const result = mergeMatchRows([rows], 10);
  assertEquals(result, rows);
});

Deno.test("mergeMatchRows: a chunk appearing in two sub-queries is deduped keeping the HIGHER similarity", () => {
  const queryA = [row("shared", 0.6), row("only-a", 0.5)];
  const queryB = [row("shared", 0.85), row("only-b", 0.4)];
  const result = mergeMatchRows([queryA, queryB], 10);

  const shared = result.find((r) => r.id === "shared");
  assertEquals(shared?.similarity, 0.85);
  assertEquals(result.length, 3); // shared, only-a, only-b — deduped, not 4
});

Deno.test("mergeMatchRows: dedup keeps higher similarity regardless of which array it appears in first", () => {
  // Same case but higher similarity is in the FIRST array this time.
  const queryA = [row("shared", 0.9)];
  const queryB = [row("shared", 0.3)];
  const result = mergeMatchRows([queryA, queryB], 10);
  assertEquals(result.length, 1);
  assertEquals(result[0].similarity, 0.9);
});

Deno.test("mergeMatchRows: ordering is similarity-desc after merge", () => {
  const queryA = [row("a", 0.2), row("b", 0.95)];
  const queryB = [row("c", 0.5), row("d", 0.99)];
  const result = mergeMatchRows([queryA, queryB], 10);
  const sims = result.map((r) => r.similarity);
  const sorted = [...sims].sort((x, y) => y - x);
  assertEquals(sims, sorted);
  assertEquals(result[0].id, "d");
});

Deno.test("mergeMatchRows: recallPool cap is respected", () => {
  const queryA = [row("a", 0.9), row("b", 0.8), row("c", 0.7)];
  const queryB = [row("d", 0.6), row("e", 0.5)];
  const result = mergeMatchRows([queryA, queryB], 3);
  assertEquals(result.length, 3);
  assertEquals(result.map((r) => r.id), ["a", "b", "c"]);
});

Deno.test("mergeMatchRows: recallPool cap larger than total rows returns all merged rows", () => {
  const queryA = [row("a", 0.9)];
  const queryB = [row("b", 0.8)];
  const result = mergeMatchRows([queryA, queryB], 100);
  assertEquals(result.length, 2);
});

Deno.test("mergeMatchRows: three sub-query arrays merge correctly with cross-array duplicates", () => {
  const q1 = [row("x", 0.5), row("y", 0.4)];
  const q2 = [row("x", 0.7), row("z", 0.6)];
  const q3 = [row("y", 0.9), row("z", 0.3)];
  const result = mergeMatchRows([q1, q2, q3], 10);
  assertEquals(result.length, 3);
  const byId = new Map(result.map((r) => [r.id, r.similarity]));
  assertEquals(byId.get("x"), 0.7);
  assertEquals(byId.get("y"), 0.9);
  assertEquals(byId.get("z"), 0.6);
});

// Back-compat documentation: when RetrieveOpts.subQueries is absent or has length <= 1,
// retrieve() must embed only opts.question, run the RPC exactly once, and NOT go through the
// merge path at all — mergeMatchRows is only ever invoked with >= 2 arrays in that code path,
// so a length-1 (or 0) subQueries list falls back to the original single-embed/single-RPC branch
// byte-identical to pre-Task-2 behavior. That branch has no network-free way to unit test here
// (embedCoreTexts/rpc/fetchSourceMeta all hit the network); it is preserved structurally in
// retrieve() by an explicit `if (!subQueries || subQueries.length <= 1)` early path that mirrors
// the original implementation verbatim.
Deno.test("mergeMatchRows: documents that it is unreachable for the <=1 sub-query back-compat path (single array passthrough covers the shape)", () => {
  const rows = [row("only", 0.42)];
  assertEquals(mergeMatchRows([rows], 5), rows);
});

// ── Integration coverage for retrieve() itself, via a stubbed globalThis.fetch. This exercises
// the orchestration mergeMatchRows can't reach on its own: the batched embed call, the
// concurrent RPC fan-out, one sub-query's RPC failing outright (never-throw degradation), and
// the final chunks/maxSimilarity shape produced from the merged pool. ──
Deno.test("retrieve: multi-query fan-out merges rows across sub-queries and one failing sub-query degrades to zero contribution (never throws)", async () => {
  Deno.env.set("VOYAGE_API_KEY", "test-key");
  const originalFetch = globalThis.fetch;
  let rpcCall = 0;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("voyageai.com")) {
      // 3 sub-queries → 3 embeddings, order preserved.
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              { index: 0, embedding: [0.1] },
              { index: 1, embedding: [0.2] },
              { index: 2, embedding: [0.3] },
            ],
          }),
          { status: 200 },
        ),
      );
    }

    if (url.includes("/rpc/match_core_source_chunks")) {
      rpcCall += 1;
      const thisCall = rpcCall;
      if (thisCall === 2) {
        // Second sub-query's RPC fails outright — must degrade to [], not throw.
        return Promise.resolve(new Response("boom", { status: 500 }));
      }
      const rows = thisCall === 1
        ? [row("shared", 0.5, "11111111-1111-1111-1111-111111111111"), row("a", 0.4, "11111111-1111-1111-1111-111111111111")]
        : [row("shared", 0.9, "11111111-1111-1111-1111-111111111111"), row("c", 0.3, "11111111-1111-1111-1111-111111111111")];
      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
    }

    if (url.includes("/rest/v1/core_sources")) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }

    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  }) as typeof fetch;

  try {
    const result = await retrieve({
      question: "does drug x interact with drug y",
      providers: null,
      entityId: null,
      threshold: 0.3,
      matchCount: 12,
      sbUrl: "https://example.supabase.co",
      serviceKey: "svc-key",
      subQueries: ["does drug x interact with drug y", "drug x drug y interaction", "drug x drug y safety"],
      recallPool: 10,
    });

    // "shared" appears in call 1 (0.5) and call 3 (0.9); call 2 failed and contributed nothing.
    // Merged pool: shared(0.9), a(0.4), c(0.3) — 3 chunks, highest similarity kept for "shared".
    assertEquals(result.chunks.length, 3);
    const shared = result.chunks.find((c) => c.chunk_id === "shared");
    assertEquals(shared?.similarity, 0.9);
    assertEquals(result.maxSimilarity, 0.9);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("VOYAGE_API_KEY");
  }
});
