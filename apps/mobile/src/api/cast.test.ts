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
  toDrugOverview,
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
