// Tests for the dense-vs-hybrid retrieval RPC selection (Phase 3). The DB hybrid function keeps the
// dense similarity floor, so hybrid only ADDS a keyword arm; these lock that the params are right.
// Run: deno test supabase/functions/ask/retrieve.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchCall, type RetrieveOpts } from "./retrieve.ts";

const opts: RetrieveOpts = {
  question: "does semaglutide cause nausea",
  providers: ["pubmed"],
  entityId: null,
  threshold: 0.6,
  matchCount: 8,
  sbUrl: "x",
  serviceKey: "x",
};
const emb = [0.1, 0.2, 0.3];

Deno.test("matchCall: dense path uses match_core_source_chunks and sends no query_text", () => {
  const { fn, params } = matchCall(opts, emb, false);
  assertEquals(fn, "match_core_source_chunks");
  assert(!("query_text" in params), "dense path must not send query_text");
  assertEquals(params.match_count, 8);
  assertEquals(params.filter_providers, ["pubmed"]);
});

Deno.test("matchCall: hybrid path uses hybrid_match_core_source_chunks WITH the query text", () => {
  const { fn, params } = matchCall(opts, emb, true);
  assertEquals(fn, "hybrid_match_core_source_chunks");
  assertEquals(params.query_text, "does semaglutide cause nausea");
  assertEquals(params.match_count, 8);
  assertEquals(params.match_threshold, 0.6);
  assertEquals(params.filter_drug_entity, null);
});

Deno.test("matchCall: hybrid keeps the SAME dense floor + count (it only ADDS the keyword arm)", () => {
  const dense = matchCall(opts, emb, false).params;
  const hybrid = matchCall(opts, emb, true).params;
  assertEquals(hybrid.match_threshold, dense.match_threshold, "same relevance floor");
  assertEquals(hybrid.match_count, dense.match_count, "same result count");
  assertEquals(hybrid.filter_providers, dense.filter_providers, "same provider filter");
});
