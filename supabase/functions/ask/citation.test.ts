// Tests for citation enforcement (§7 step 6). Pure function: given the model's
// raw answer (with possibly-hallucinated [n] tags) and the retrieved chunk set,
// drop tags that don't map to a real chunk, refuse when the bottom line has no
// valid support (AC3), and build the citations[] from survivors.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReviewedSet, citationMeta, collectSourceTexts, enforceCitations, type RetrievedChunk } from "./citation.ts";

function metaChunk(extra: Partial<RetrievedChunk>): RetrievedChunk {
  return { tag: "1", chunk_id: "c", source_id: "s", provider: "pubmed_oa", title: "t", section: null, url: null, license: null, published_date: null, retrieved_at: null, similarity: 0, ...extra };
}

Deno.test("citationMeta stamps doaj_vetted from a DOAJ-listed journal ISSN (positive-only)", () => {
  assertEquals(citationMeta(metaChunk({ issn: ["1932-6203"] })).doaj_vetted, true); // PLoS ONE — DOAJ-listed
  assertEquals(citationMeta(metaChunk({ issn: ["0028-4793"] })).doaj_vetted, undefined); // NEJM — not in DOAJ
  assertEquals(citationMeta(metaChunk({})).doaj_vetted, undefined); // no ISSN -> no claim
});

Deno.test("citationMeta carries the free full-text link (oa_url) through to the citation", () => {
  assertEquals(citationMeta(metaChunk({ oa_url: "https://europepmc.org/articles/PMC9226592" })).oa_url, "https://europepmc.org/articles/PMC9226592");
  assertEquals(citationMeta(metaChunk({})).oa_url, undefined); // absent -> no link claimed
});

function chunks(): RetrievedChunk[] {
  return [
    { tag: "1", chunk_id: "c1", source_id: "s1", provider: "openfda", title: "Sertraline label",
      section: "WARNINGS", url: "https://openfda/1", license: "fda_public",
      published_date: "2024-01-01", retrieved_at: "2026-06-01T00:00:00Z", similarity: 0.74 },
    { tag: "2", chunk_id: "c2", source_id: "s2", provider: "pubmed_oa", title: "SSRI review",
      section: null, url: "https://pubmed/2", license: "ncbi", published_date: "2023-05-01",
      retrieved_at: "2026-05-01T00:00:00Z", similarity: 0.62 },
  ];
}

function base() {
  return {
    bottom_line: { text: "Sertraline is an SSRI with documented warnings.", citations: ["1"] },
    what_we_know: [
      { text: "The label warns about serotonin syndrome.", citations: ["1"] },
      { text: "A review summarizes SSRI tolerability.", citations: ["2"] },
    ],
    what_we_do_not_know: [{ text: "Long-term individualized risk is uncertain.", citations: [] }],
    safety_notes: [{ text: "Boxed warning notes suicidality risk in young adults.", citations: ["1"] }],
    questions_to_ask: ["Is this appropriate for me?"],
    chunks: chunks(),
  };
}

Deno.test("enforce: fully-cited answer is kept and not refused", () => {
  const r = enforceCitations(base());
  assertEquals(r.refusedUnsupported, false);
  assertEquals(r.answer_sections.what_we_know.length, 2);
  assertEquals(r.answer_sections.safety_notes.length, 1);
  // two distinct sources cited -> two citations
  assertEquals(r.citations.length, 2);
});

Deno.test("enforce: bracketed tags from the model resolve (e.g. '[1]' -> '1')", () => {
  // DeepSeek emits citations as ["[1]","[2]"]; the valid set is bare "1","2".
  const inp = base();
  inp.bottom_line.citations = ["[1]"];
  inp.what_we_know[0].citations = ["[1]", "[2]"];
  inp.what_we_know[1].citations = ["[2]"];
  inp.safety_notes[0].citations = ["[1]"];
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, false); // bottom line "[1]" matched chunk "1"
  assertEquals(r.citations.length, 2);
  assertEquals(r.citations.map((c) => c.chunk_tag).sort(), ["1", "2"]);
});

Deno.test("enforce: hallucinated tag is dropped from a kept point", () => {
  const inp = base();
  inp.what_we_know[0].citations = ["1", "9"]; // 9 does not exist
  const r = enforceCitations(inp);
  const point = r.answer_sections.what_we_know.find((p) => p.text.includes("serotonin"))!;
  assertEquals(point.citation_ids, ["1"]); // 9 stripped
  assert(!r.citations.some((c) => c.chunk_tag === "9"));
});

Deno.test("enforce: refuses only when NOTHING is cited (AC3)", () => {
  // Whole answer unsupported: bottom line + every body point cite nothing real.
  const inp = base();
  inp.bottom_line.citations = ["9"]; // hallucinated
  inp.what_we_know = [
    { text: "Unsupported claim A.", citations: [] },
    { text: "Unsupported claim B.", citations: ["9"] },
  ];
  inp.safety_notes = [{ text: "Unsupported safety note.", citations: [] }];
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, true);
});

Deno.test("enforce: bottom line uncited but body cited is NOT refused (backfill)", () => {
  // The model often cites the detail points and leaves the summary bare; the
  // answer is still source-grounded, so attribute the bottom line to the body.
  const inp = base();
  inp.bottom_line.citations = []; // model left the summary uncited
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, false);
  assert(r.citations.length >= 1); // body sources carry through
});

Deno.test("enforce: an unsupported load-bearing point is dropped", () => {
  const inp = base();
  inp.what_we_know.push({ text: "It also reverses aging.", citations: [] }); // claim, no source
  const r = enforceCitations(inp);
  assert(!r.answer_sections.what_we_know.some((p) => p.text.includes("aging")));
});

Deno.test("enforce: limitations + questions are kept without citations", () => {
  const r = enforceCitations(base());
  assertEquals(r.answer_sections.what_we_do_not_know.length, 1);
  assertEquals(r.answer_sections.questions_to_ask.length, 1);
});

Deno.test("enforce: duplicate tags across points dedupe in citations[]", () => {
  const inp = base();
  inp.safety_notes[0].citations = ["1"]; // same source as bottom_line + what_we_know[0]
  const r = enforceCitations(inp);
  assertEquals(r.citations.filter((c) => c.chunk_tag === "1").length, 1);
});

Deno.test("enforce: oldest_source_date is the min across cited sources", () => {
  const r = enforceCitations(base());
  // s2 retrieved 2026-05-01 is older than s1 2026-06-01
  assertEquals(r.oldest_source_date, "2026-05-01");
});

Deno.test("enforce: plain_english_summary echoes the (supported) bottom line", () => {
  const r = enforceCitations(base());
  assert(r.plain_english_summary.includes("SSRI"));
});

Deno.test("enforce: a point with a missing citations array does not throw", () => {
  // DeepSeek can omit the (schema-required) citations field; must not crash.
  const inp = base();
  // deno-lint-ignore no-explicit-any
  (inp.what_we_know as any).push({ text: "Unsourced extra claim." });
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, false);
  assert(!r.answer_sections.what_we_know.some((p) => p.text.includes("Unsourced extra")));
});

// ---------------------------------------------------------------------------
// collectSourceTexts — the include_source_text verification payload
// ---------------------------------------------------------------------------

Deno.test("collectSourceTexts: one verbatim entry per tagged chunk that has text", () => {
  const out = collectSourceTexts([
    { tag: "1", chunk_text: "Alpha label text." },
    { tag: "2", chunk_text: "Beta trial text." },
  ]);
  assertEquals(out, [
    { tag: "1", text: "Alpha label text." },
    { tag: "2", text: "Beta trial text." },
  ]);
});

Deno.test("collectSourceTexts: skips chunks with no/empty/whitespace text (nothing to verify)", () => {
  const out = collectSourceTexts([
    { tag: "1", chunk_text: "real" },
    { tag: "2", chunk_text: undefined },
    { tag: "3", chunk_text: "" },
    { tag: "4", chunk_text: "   " },
  ]);
  assertEquals(out.map((s) => s.tag), ["1"]);
});

Deno.test("collectSourceTexts: at most one entry per tag (first non-empty wins)", () => {
  const out = collectSourceTexts([
    { tag: "1", chunk_text: "first" },
    { tag: "1", chunk_text: "dup" },
  ]);
  assertEquals(out, [{ tag: "1", text: "first" }]);
});

// ---------------------------------------------------------------------------
// buildReviewedSet — Task 3: surface the full reranked pool as "also reviewed"
// breadth, excluding cited chunks by chunk_id, floored + capped, re-tagged so
// reviewed tags never collide with the cited 1..N namespace. PURE.
// ---------------------------------------------------------------------------

/** A guardPool chunk. Tags are pre-retag "pool-local" tags (may collide with cited 1..N —
 *  that is exactly why chunk_id, not tag, is used to exclude cited chunks in the real pool). */
function poolChunk(chunk_id: string, extra: Partial<RetrievedChunk> & { rerank_score?: number } = {}): RetrievedChunk & { rerank_score?: number } {
  return {
    tag: "x", chunk_id, source_id: `s-${chunk_id}`, provider: "pubmed_oa", title: `title-${chunk_id}`,
    section: null, url: null, license: null, published_date: null, retrieved_at: null, similarity: 0,
    ...extra,
  };
}

Deno.test("buildReviewedSet: excludes cited chunks by chunk_id, not by tag", () => {
  // c1 is cited; give it the SAME pool-local tag ("1") as an uncited pool chunk to prove
  // exclusion is chunk_id-based, not tag-based (guardPool tags collide with cited 1..N).
  const pool = [
    poolChunk("c1", { tag: "1", rerank_score: 0.9 }),
    poolChunk("c2", { tag: "1", rerank_score: 0.8 }),
    poolChunk("c3", { tag: "2", rerank_score: 0.7 }),
  ];
  const out = buildReviewedSet(pool, new Set(["c1"]), new Set(["1"]), 0.35, 34);
  assertEquals(out.map((c) => c.source_id), ["s-c2", "s-c3"]);
});

Deno.test("buildReviewedSet: drops chunks below the relevance floor", () => {
  const pool = [
    poolChunk("c1", { rerank_score: 0.5 }),
    poolChunk("c2", { rerank_score: 0.34 }), // just under a 0.35 floor
    poolChunk("c3", { rerank_score: 0.35 }), // exactly at the floor -> kept
  ];
  const out = buildReviewedSet(pool, new Set(), new Set(), 0.35, 34);
  assertEquals(out.map((c) => c.source_id), ["s-c1", "s-c3"]);
});

Deno.test("buildReviewedSet: caps at REVIEWED_CAP", () => {
  const pool = Array.from({ length: 40 }, (_, i) => poolChunk(`c${i}`, { rerank_score: 0.9 - i * 0.001 }));
  const out = buildReviewedSet(pool, new Set(), new Set(), 0.35, 5);
  assertEquals(out.length, 5);
  assertEquals(out.map((c) => c.source_id), ["s-c0", "s-c1", "s-c2", "s-c3", "s-c4"]);
});

Deno.test("buildReviewedSet: reviewed tags start above max(citedTags), not the count — SPARSE cited set", () => {
  const pool = [
    poolChunk("c1", { rerank_score: 0.9 }),
    poolChunk("c2", { rerank_score: 0.8 }),
    poolChunk("c3", { rerank_score: 0.7 }),
  ];
  // The generator cited a SPARSE subset {1,2,5,9,18} — count is 5 but the HIGHEST tag is 18. Reviewed
  // tags must start at 19, never re-emit a live cited tag (9 or 18) which would mis-paint a support
  // highlight on a non-cited source. Offsetting by the count (5) would produce "6","7","8" then collide.
  const citedTags = new Set(["1", "2", "5", "9", "18"]);
  const out = buildReviewedSet(pool, new Set(), citedTags, 0.35, 34);
  assertEquals(out.map((c) => c.chunk_tag), ["19", "20", "21"]);
  // Hard invariant: no reviewed tag equals any cited tag.
  for (const c of out) assertEquals(citedTags.has(c.chunk_tag), false);
});

Deno.test("buildReviewedSet: empty cited set -> reviewed tags start at 1", () => {
  const out = buildReviewedSet([poolChunk("c1", { rerank_score: 0.9 })], new Set(), new Set(), 0.35, 34);
  assertEquals(out.map((c) => c.chunk_tag), ["1"]);
});

Deno.test("buildReviewedSet: uses similarity when rerank_score is absent (dense/LIVE-off pool)", () => {
  const pool = [
    poolChunk("c1", { similarity: 0.6 }), // no rerank_score -> falls back to similarity
    poolChunk("c2", { similarity: 0.1 }), // below floor via similarity fallback -> dropped
  ];
  const out = buildReviewedSet(pool, new Set(), new Set(), 0.35, 34);
  assertEquals(out.map((c) => c.source_id), ["s-c1"]);
});

Deno.test("buildReviewedSet: empty pool returns []", () => {
  assertEquals(buildReviewedSet([], new Set(), new Set(), 0.35, 34), []);
});

Deno.test("buildReviewedSet: order is preserved from the pool (pool is already rank-ordered)", () => {
  const pool = [
    poolChunk("c1", { rerank_score: 0.4 }),
    poolChunk("c2", { rerank_score: 0.9 }),
  ];
  const out = buildReviewedSet(pool, new Set(), new Set(), 0.35, 34);
  // No re-sort inside the helper — the caller passes an already-ranked pool.
  assertEquals(out.map((c) => c.source_id), ["s-c1", "s-c2"]);
});

Deno.test("buildReviewedSet: without a rater, reviewed sources carry NO tag-keyed support fields", () => {
  // Guards against a future accidental re-merge of the tag-keyed supportRatings (which collide with
  // the re-tagged reviewed namespace). Reviewed cards must not fabricate a flat "reviewed" support badge.
  const out = buildReviewedSet([poolChunk("c1", { rerank_score: 0.9 })], new Set(), new Set(), 0.35, 34);
  assertEquals(out[0].support_level, undefined);
  assertEquals(out[0].claim_relation, undefined);
  assertEquals(out[0].evidence_role, undefined); // no rater supplied -> no role either
});

Deno.test("buildReviewedSet: the pure rater restores the differentiated evidence_role (collision-safe)", () => {
  const pool = [
    poolChunk("c1", { provider: "openfda", rerank_score: 0.9 }),      // official_label
    poolChunk("c2", { provider: "pubmed_oa", rerank_score: 0.8 }),    // research_article
  ];
  const out = buildReviewedSet(pool, new Set(), new Set(), 0.35, 34, (c) => {
    // Stand-in for evidenceRole(): pure function of the chunk, no tag lookup.
    const role = c.provider.includes("openfda") ? "official_label" : "research_article";
    return { evidence_role: role, evidence_weight: role === "official_label" ? 92 : 52 };
  });
  assertEquals(out.map((c) => c.evidence_role), ["official_label", "research_article"]);
  assertEquals(out.map((c) => c.evidence_weight), [92, 52]);
  // Still no flat support_level / claim_relation — only the differentiated role is restored.
  assertEquals(out[0].support_level, undefined);
  assertEquals(out[0].claim_relation, undefined);
});
