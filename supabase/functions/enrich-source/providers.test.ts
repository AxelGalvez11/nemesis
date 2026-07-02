import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchEnrichmentBase, parseOpenAlexWork, parseSciteTallies } from "./providers.ts";

Deno.test("parseOpenAlexWork extracts doi, retraction, cited_by", () => {
  const r = parseOpenAlexWork({
    ids: { doi: "https://doi.org/10.1001/JAMA.2023.1" },
    is_retracted: true,
    cited_by_count: 96,
  });
  assertEquals(r, { doi: "10.1001/jama.2023.1", retracted: true, cited_by: 96 });
});

Deno.test("parseOpenAlexWork tolerates missing fields", () => {
  assertEquals(parseOpenAlexWork({}), { doi: null, retracted: false, cited_by: null });
  assertEquals(parseOpenAlexWork(null), { doi: null, retracted: false, cited_by: null });
});

Deno.test("parseSciteTallies maps the tallies shape", () => {
  const t = parseSciteTallies({ total: 120, supporting: 41, contradicting: 3, mentioning: 76 });
  assertEquals(t, { supporting: 41, contrasting: 3, mentioning: 76 });
});

Deno.test("parseSciteTallies returns null on junk", () => {
  assertEquals(parseSciteTallies(null), null);
  assertEquals(parseSciteTallies({ error: "not found" }), null);
});

// ── fetchEnrichmentBase outcome classification (F1: failure vs no-data) ──
// A transient OpenAlex outage must be distinguishable from a definitive "no such
// record", so the caller can refuse to cache outage nulls as authoritative.

async function withFetchStub<T>(stub: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.test("fetchEnrichmentBase: OpenAlex data → fetched:true (scite outage stays cacheable)", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("openalex.org")) {
        return jsonResponse({ ids: { doi: "https://doi.org/10.1001/jama.2023.1" }, is_retracted: true, cited_by_count: 12 });
      }
      return jsonResponse({ error: "scite down" }, 503); // scite outage
    }) as typeof fetch,
    () => fetchEnrichmentBase("123"),
  );
  assertEquals(r, { doi: "10.1001/jama.2023.1", retracted: true, cited_by: 12, tallies: null, fetched: true });
});

Deno.test("fetchEnrichmentBase: OpenAlex 404 is a definitive answer → fetched:true, nulls", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => jsonResponse({ error: "not found" }, 404)) as typeof fetch,
    () => fetchEnrichmentBase("999999999"),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: true });
});

Deno.test("fetchEnrichmentBase: OpenAlex 5xx is an outage → fetched:false", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => jsonResponse({ error: "upstream" }, 503)) as typeof fetch,
    () => fetchEnrichmentBase("123"),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: false });
});

Deno.test("fetchEnrichmentBase: network throw is an outage → fetched:false", async () => {
  const r = await withFetchStub(
    (() => Promise.reject(new TypeError("connection refused"))) as typeof fetch,
    () => fetchEnrichmentBase("123"),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: false });
});
