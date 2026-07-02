import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAttribution } from "./report-attribution.ts";
import type { Citation } from "./answer.ts";

const c = (t: string): Citation => ({ chunk_tag: "1", source_id: "s", source_type: t, title: null, section: null, url: null, license: null, published_date: null, retrieved_at: null });

Deno.test("buildAttribution counts families and stamps method", () => {
  const a = buildAttribution({
    citations: [c("pubmed_oa"), c("pubmed_oa"), c("clinicaltrials"), c("openfda")],
    generatedAt: "2026-07-02", engineVersion: "ask-v16", mode: "structured review",
  });
  assertEquals(a.headline, "Built from 4 sources");
  assertEquals(a.lines[0], "2 PubMed · 1 trials · 1 FDA");
  assertEquals(a.lines[1], "Method: structured review · engine ask-v16 · generated 2026-07-02");
});

Deno.test("buildAttribution handles a single source (singular headline)", () => {
  const a = buildAttribution({
    citations: [c("medlineplus")],
    generatedAt: "2026-07-02", mode: "standard",
  });
  assertEquals(a.headline, "Built from 1 source");
  assertEquals(a.lines[0], "1 guidance");
  assertEquals(a.lines[1], "Method: standard · generated 2026-07-02");
});

Deno.test("buildAttribution omits the engine segment when engineVersion is absent", () => {
  const a = buildAttribution({
    citations: [c("openalex")],
    generatedAt: "2026-07-02", mode: "standard",
  });
  assertEquals(a.lines[1], "Method: standard · generated 2026-07-02");
});

Deno.test("buildAttribution omits the generated segment when generatedAt is empty (graceful degrade for older reports)", () => {
  const a = buildAttribution({
    citations: [c("pubmed_oa")],
    generatedAt: "", mode: "standard",
  });
  assertEquals(a.lines[1], "Method: standard");
});

Deno.test("buildAttribution handles zero citations without a dangling separator", () => {
  const a = buildAttribution({
    citations: [],
    generatedAt: "2026-07-02", mode: "standard",
  });
  assertEquals(a.headline, "Built from 0 sources");
  assertEquals(a.lines[0], "");
});

Deno.test("buildAttribution buckets unknown source types under other", () => {
  const a = buildAttribution({
    citations: [c("some_new_provider")],
    generatedAt: "2026-07-02", mode: "standard",
  });
  assertEquals(a.lines[0], "1 other");
});
