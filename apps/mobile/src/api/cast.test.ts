// Deno unit tests (repo convention) for the jsonb -> DTO narrowing at the §8
// client boundary. Run: deno test --no-check apps/mobile/src/api/cast.test.ts
// (--no-check: the `import type` from @pharmabro/shared + ./types.ts is erased at
// runtime). These lock the SHAPES probed against the real cloud payloads (the 6b-1
// review lesson: validate the field the renderer dereferences, don't bare-cast).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  castLabelDocs,
  castPubmed,
  castSearchResults,
  castTrials,
  castWatchlistItems,
  castWatchlistUpdates,
  toAskResponse,
  toComparison,
  toDigest,
  toDrugOverview,
  toHealthContext,
  toSourceDetail,
} from "./cast.ts";

Deno.test("toDrugOverview: null/undefined body -> null", () => {
  assertEquals(toDrugOverview(null), null);
  assertEquals(toDrugOverview(undefined), null);
});

Deno.test("toDrugOverview: array -> null (a jsonb object is expected)", () => {
  assertEquals(toDrugOverview([1, 2]), null);
});

Deno.test("toDrugOverview: object passes through to the DTO", () => {
  const raw = { id: "abc", canonical_name: "semaglutide", approved_status: "approved" };
  assertEquals(toDrugOverview(raw)?.canonical_name, "semaglutide");
});

Deno.test("toDrugOverview: object missing a mandatory field -> null", () => {
  assertEquals(toDrugOverview({ id: "abc" }), null); // no canonical_name
  assertEquals(toDrugOverview({ canonical_name: "x" }), null); // no id
});

// --- toSourceDetail (get_source single jsonb object) ---

Deno.test("toSourceDetail: null/array -> null", () => {
  assertEquals(toSourceDetail(null), null);
  assertEquals(toSourceDetail([{ source_id: "x" }]), null);
});

Deno.test("toSourceDetail: missing source_id or provider -> null", () => {
  assertEquals(toSourceDetail({ provider: "openfda" }), null); // no source_id
  assertEquals(toSourceDetail({ source_id: "s1" }), null); // no provider
});

Deno.test("toSourceDetail: real-shaped object passes + is_current coerced to boolean", () => {
  const raw = {
    source_id: "0c7a82b9",
    provider: "openfda",
    title: "OZEMPIC (ORAL SEMAGLUTIDE)",
    url: "https://dailymed.nlm.nih.gov/x",
    is_current: true,
    sections: ["warnings", "indications"],
    metadata: {},
  };
  const out = toSourceDetail(raw);
  assertEquals(out?.provider, "openfda");
  assertEquals(out?.is_current, true);
});

// --- castSearchResults (search_entities row array) ---

Deno.test("castSearchResults: null/non-array -> []", () => {
  assertEquals(castSearchResults(null), []);
  assertEquals(castSearchResults({ id: "x" }), []);
});

Deno.test("castSearchResults: drops rows missing id or name, keeps good rows", () => {
  const raw = [
    { type: "drug", id: "c674", name: "Semaglutide", subtitle: "OZEMPIC", status: "approved", score: 1 },
    { type: "drug", name: "no-id" }, // dropped: no id
    { id: "x" }, // dropped: no name
  ];
  const out = castSearchResults(raw);
  assertEquals(out.length, 1);
  assertEquals(out[0].name, "Semaglutide");
});

Deno.test("castSearchResults: drops a row missing status (rendered via .replace)", () => {
  const raw = [{ type: "drug", id: "c674", name: "Semaglutide", subtitle: null, score: 1 }]; // no status
  assertEquals(castSearchResults(raw).length, 0);
});

// --- castLabelDocs (get_drug_label row array) ---

Deno.test("castLabelDocs: null/non-array -> []", () => {
  assertEquals(castLabelDocs(null), []);
  assertEquals(castLabelDocs("nope"), []);
});

Deno.test("castLabelDocs: keeps a real label row; coerces missing sections to {}", () => {
  const raw = [
    {
      label_id: "l1",
      extracted_sections: { warnings: "5 WARNINGS...", indications: "1 INDICATIONS..." },
      source_id: "0c7a82b9",
      provider: "openfda",
      citation_url: "https://x",
    },
    { label_id: "l2" }, // valid identity, no sections -> sections defaults to {}
    { source_id: "no-label-id" }, // dropped: no label_id
  ];
  const out = castLabelDocs(raw);
  assertEquals(out.length, 2);
  assertEquals(Object.keys(out[0].extracted_sections).length, 2);
  assertEquals(out[1].extracted_sections, {});
});

// --- castTrials / castPubmed (identity-keyed row arrays) ---

Deno.test("castTrials: drops rows without trial_id", () => {
  const raw = [
    { trial_id: "t1", nct_id: "NCT07527195", phase: "PHASE1", status: "RECRUITING", source_id: "3bc0" },
    { nct_id: "NCT-orphan" }, // dropped
  ];
  const out = castTrials(raw);
  assertEquals(out.length, 1);
  assertEquals(out[0].nct_id, "NCT07527195");
});

Deno.test("castPubmed: drops rows without article_id", () => {
  const raw = [
    { article_id: "a1", pmid: "42211143", journal: "J Lipid Atheroscler", source_id: "2ba7" },
    { pmid: "orphan" }, // dropped
  ];
  const out = castPubmed(raw);
  assertEquals(out.length, 1);
  assertEquals(out[0].pmid, "42211143");
});

// --- toAskResponse (the `ask` edge fn body) ---

Deno.test("toAskResponse: null/missing mandatory fields -> null", () => {
  assertEquals(toAskResponse(null), null);
  assertEquals(toAskResponse({ answer_id: "a1", plain_english_summary: "x" }), null); // no answer_sections
  assertEquals(toAskResponse({ answer_id: "a1", answer_sections: {} }), null); // no summary
});

Deno.test("toAskResponse: a real answer (and a refusal) pass through", () => {
  const answer = {
    answer_id: "a1",
    intent: "side_effects",
    plain_english_summary: "Common side effects are nausea...",
    evidence_grade: "very_strong",
    answer_sections: { what_we_know: [{ text: "...[1]", citation_ids: ["1"] }], questions_to_ask: [] },
    citations: [{ chunk_tag: "1", source_id: "0c7a82b9" }],
    safety_flags: [],
    refused_unsupported: false,
  };
  assertEquals(toAskResponse(answer)?.intent, "side_effects");
  // A template/refusal is still a valid AskResponse (not null), and the array/grade
  // fields the renderer dereferences are coerced even when the body omits them.
  const refusal = { answer_id: "a2", plain_english_summary: "This could be urgent...", answer_sections: {}, template: "emergency_routing" };
  const out = toAskResponse(refusal);
  assertEquals(out?.answer_id, "a2");
  assertEquals(out?.safety_flags, []);
  assertEquals(out?.citations, []);
  assertEquals(out?.evidence_grade, "not_applicable");
});

// --- watchlist / digest / compare (6b-4) ---

Deno.test("castWatchlistItems: drops rows without id (needed to unfollow)", () => {
  const raw = [
    { id: "w1", item_type: "drug", item_ref: "c674", frequency: "weekly" },
    { item_type: "drug", item_ref: "no-id" }, // dropped
  ];
  assertEquals(castWatchlistItems(raw).length, 1);
  assertEquals(castWatchlistItems(null), []);
});

Deno.test("castWatchlistUpdates: keeps id'd rows; null -> []", () => {
  const raw = [{ id: "u1", item_type: "drug", item_ref: "c674", update_type: "pubmed_new", title: "x" }];
  assertEquals(castWatchlistUpdates(raw).length, 1);
  assertEquals(castWatchlistUpdates("nope"), []);
});

Deno.test("toDigest: null/no-id -> null; items coerced to []", () => {
  assertEquals(toDigest(null), null);
  assertEquals(toDigest({ update_count: 0 }), null); // no id
  assertEquals(toDigest({ id: "d1", update_count: 0 })?.items, []); // missing items -> []
  assertEquals(toDigest({ id: "d1", items: [{ id: "u1" }] })?.items.length, 1);
});

Deno.test("toComparison: requires left+right+sections objects", () => {
  assertEquals(toComparison(null), null);
  assertEquals(toComparison({ left: { id: "a" }, right: { id: "b" } }), null); // no sections
  const ok = { left: { id: "a", name: "A" }, right: { id: "b", name: "B" }, sections: {}, sources: [] };
  assertEquals(toComparison(ok)?.left.name, "A");
});

// --- health context (6b-5) ---

Deno.test("toHealthContext: null/non-object -> null", () => {
  assertEquals(toHealthContext(null), null);
  assertEquals(toHealthContext("nope"), null);
});

Deno.test("toHealthContext: jsonb lists coerce to string[]; scalars + bad organ flag -> null", () => {
  const out = toHealthContext({
    age_range: "30-39",
    sex: "female",
    allergies: ["penicillin", 42, null, "sulfa"], // non-strings dropped
    medications: "not-an-array", // -> []
    kidney_disease_flag: "no",
    liver_disease_flag: "maybe", // invalid -> null
    consent_version: "2026-06-04",
  });
  assertEquals(out?.allergies, ["penicillin", "sulfa"]);
  assertEquals(out?.medications, []);
  assertEquals(out?.kidney_disease_flag, "no");
  assertEquals(out?.liver_disease_flag, null);
  assertEquals(out?.pregnancy_status, null); // absent -> null
  assertEquals(out?.consent_version, "2026-06-04");
});
