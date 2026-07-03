import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchEnrichmentBase,
  openAlexSourceId,
  parseOpenAlexSource,
  parseOpenAlexVenue,
  parseOpenAlexWork,
  parseSciteTallies,
} from "./providers.ts";

// WS-1 fields on the flag-OFF result: the step-2 /sources call is skipped, so the tier degrades
// to "unranked" and the venue fields are null/false. These 6 outcome tests run with WS1_PER_PAPER
// unset, so every fetchEnrichmentBase result carries exactly this off-state trio.
const WS1_OFF = { journal_tier: "unranked" as const, mean_citedness_2yr: null, is_in_doaj: false };

// Guard: the WS-1 outcome tests below must NEVER leave the flag set (would flip the off-state
// tests, which are order-independent in Deno). Every flag-on test restores in a finally.
function withWs1<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = Deno.env.get("WS1_PER_PAPER");
  if (on) Deno.env.set("WS1_PER_PAPER", "on");
  else Deno.env.delete("WS1_PER_PAPER");
  return fn().finally(() => {
    if (prev === undefined) Deno.env.delete("WS1_PER_PAPER");
    else Deno.env.set("WS1_PER_PAPER", prev);
  });
}

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
    () => withWs1(false, () => fetchEnrichmentBase("123")),
  );
  assertEquals(r, { doi: "10.1001/jama.2023.1", retracted: true, cited_by: 12, tallies: null, fetched: true, ...WS1_OFF });
});

Deno.test("fetchEnrichmentBase: OpenAlex 404 is a definitive answer → fetched:true, nulls", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => jsonResponse({ error: "not found" }, 404)) as typeof fetch,
    () => withWs1(false, () => fetchEnrichmentBase("999999999")),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: true, ...WS1_OFF });
});

Deno.test("fetchEnrichmentBase: OpenAlex 429 rate limit is an outage, not an answer → fetched:false", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => jsonResponse({ error: "too many requests" }, 429)) as typeof fetch,
    () => withWs1(false, () => fetchEnrichmentBase("123")),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: false, ...WS1_OFF });
});

Deno.test("fetchEnrichmentBase: OpenAlex 408 request timeout is an outage → fetched:false", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => jsonResponse({ error: "request timeout" }, 408)) as typeof fetch,
    () => withWs1(false, () => fetchEnrichmentBase("123")),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: false, ...WS1_OFF });
});

Deno.test("fetchEnrichmentBase: OpenAlex 5xx is an outage → fetched:false", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => jsonResponse({ error: "upstream" }, 503)) as typeof fetch,
    () => withWs1(false, () => fetchEnrichmentBase("123")),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: false, ...WS1_OFF });
});

Deno.test("fetchEnrichmentBase: network throw is an outage → fetched:false", async () => {
  const r = await withFetchStub(
    (() => Promise.reject(new TypeError("connection refused"))) as typeof fetch,
    () => withWs1(false, () => fetchEnrichmentBase("123")),
  );
  assertEquals(r, { doi: null, retracted: false, cited_by: null, tallies: null, fetched: false, ...WS1_OFF });
});

// ── WS-1: pure venue/source parsers (parseOpenAlexWork stays untouched above). ──

Deno.test("parseOpenAlexVenue: reads source id + is_in_doaj/is_oa off primary_location.source", () => {
  const v = parseOpenAlexVenue({
    primary_location: { source: { id: "https://openalex.org/S12345", is_in_doaj: true, is_oa: true } },
  });
  assertEquals(v, { source_id: "https://openalex.org/S12345", is_in_doaj: true, is_oa: true });
});

Deno.test("parseOpenAlexVenue: tolerates missing primary_location/source", () => {
  assertEquals(parseOpenAlexVenue({}), { source_id: null, is_in_doaj: false, is_oa: false });
  assertEquals(parseOpenAlexVenue(null), { source_id: null, is_in_doaj: false, is_oa: false });
  assertEquals(parseOpenAlexVenue({ primary_location: {} }), { source_id: null, is_in_doaj: false, is_oa: false });
});

Deno.test("parseOpenAlexSource: reads 2yr_mean_citedness + h_index + is_in_doaj", () => {
  const s = parseOpenAlexSource({
    summary_stats: { "2yr_mean_citedness": 9.4, h_index: 512, i10_index: 9000 },
    is_in_doaj: false,
    is_oa: true,
  });
  assertEquals(s, { mean_citedness_2yr: 9.4, h_index: 512, is_in_doaj: false });
});

Deno.test("parseOpenAlexSource: junk/missing → all-null (→ unranked), never a guessed number", () => {
  assertEquals(parseOpenAlexSource({}), { mean_citedness_2yr: null, h_index: null, is_in_doaj: false });
  assertEquals(parseOpenAlexSource(null), { mean_citedness_2yr: null, h_index: null, is_in_doaj: false });
  assertEquals(
    parseOpenAlexSource({ summary_stats: {} }),
    { mean_citedness_2yr: null, h_index: null, is_in_doaj: false },
  );
});

Deno.test("openAlexSourceId: extracts the S-id from an OpenAlex source URL or bare id", () => {
  assertEquals(openAlexSourceId("https://openalex.org/S12345"), "S12345");
  assertEquals(openAlexSourceId("S678"), "S678");
  assertEquals(openAlexSourceId(null), null);
  assertEquals(openAlexSourceId("https://openalex.org/W999"), null); // a work id, not a source id
});

// ── WS-1: fetchEnrichmentBase flag gating + tier computation + best-effort step 2. ──

Deno.test("fetchEnrichmentBase: WS1 OFF → no /sources call, journal_tier unranked", async () => {
  let sourcesCalled = false;
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/sources/")) sourcesCalled = true;
      if (url.includes("openalex.org")) {
        return jsonResponse({
          ids: { doi: "https://doi.org/10.1/x" },
          is_retracted: false,
          cited_by_count: 5,
          primary_location: { source: { id: "https://openalex.org/S1", is_in_doaj: true, is_oa: true } },
        });
      }
      return jsonResponse({ error: "no tallies" }, 404);
    }) as typeof fetch,
    () => withWs1(false, () => fetchEnrichmentBase("123")),
  );
  assertEquals(sourcesCalled, false); // step-2 skipped entirely when off
  assertEquals(r.journal_tier, "unranked");
  assertEquals(r.mean_citedness_2yr, null);
  assertEquals(r.is_in_doaj, false);
  assertEquals(r.cited_by, 5); // the pre-existing base signal is unchanged
});

Deno.test("fetchEnrichmentBase: WS1 ON → step-2 /sources fetched, tier computed from citedness", async () => {
  let sourcesCalled = false;
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/works/")) {
        return jsonResponse({
          ids: { doi: "https://doi.org/10.1/x" },
          is_retracted: false,
          cited_by_count: 42,
          primary_location: { source: { id: "https://openalex.org/S99", is_in_doaj: false, is_oa: true } },
        });
      }
      if (url.includes("/sources/S99")) {
        sourcesCalled = true;
        return jsonResponse({ summary_stats: { "2yr_mean_citedness": 9.1, h_index: 300 }, is_in_doaj: true, is_oa: true });
      }
      return jsonResponse({ error: "no tallies" }, 404); // scite
    }) as typeof fetch,
    () => withWs1(true, () => fetchEnrichmentBase("123")),
  );
  assertEquals(sourcesCalled, true);
  assertEquals(r.journal_tier, "q1"); // 9.1 ≥ 8.0
  assertEquals(r.mean_citedness_2yr, 9.1);
  assertEquals(r.is_in_doaj, true); // fallback from /sources merged with venue
  assertEquals(r.fetched, true); // step-1 succeeded
});

Deno.test("fetchEnrichmentBase: WS1 ON, no venue source id → unranked, no /sources call", async () => {
  let sourcesCalled = false;
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/sources/")) sourcesCalled = true;
      if (url.includes("openalex.org")) {
        return jsonResponse({ ids: {}, is_retracted: false, cited_by_count: 3, primary_location: {} });
      }
      return jsonResponse({ error: "no tallies" }, 404);
    }) as typeof fetch,
    () => withWs1(true, () => fetchEnrichmentBase("123")),
  );
  assertEquals(sourcesCalled, false); // no source id → nothing to look up
  assertEquals(r.journal_tier, "unranked");
});

Deno.test("fetchEnrichmentBase: WS1 ON, step-2 5xx → unranked, fetched NOT poisoned (step-1 ok)", async () => {
  const r = await withFetchStub(
    // deno-lint-ignore require-await
    (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/works/")) {
        return jsonResponse({
          ids: { doi: "https://doi.org/10.1/x" },
          is_retracted: false,
          cited_by_count: 7,
          primary_location: { source: { id: "https://openalex.org/S5", is_in_doaj: false, is_oa: false } },
        });
      }
      if (url.includes("/sources/")) return jsonResponse({ error: "upstream" }, 503); // step-2 outage
      return jsonResponse({ error: "no tallies" }, 404); // scite
    }) as typeof fetch,
    () => withWs1(true, () => fetchEnrichmentBase("123")),
  );
  assertEquals(r.journal_tier, "unranked"); // step-2 failed → degrade
  assertEquals(r.mean_citedness_2yr, null);
  assertEquals(r.fetched, true); // step-1 /works answered → NOT poisoned by step-2
  assertEquals(r.cited_by, 7); // base signal intact
});
