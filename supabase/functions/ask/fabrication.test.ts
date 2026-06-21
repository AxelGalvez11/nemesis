// Tests for the fabrication guard — the answer-layer name-presence check that refuses
// class-plausible fabricated drugs the dense/rerank floors let through.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isFabricatedDrugQuery } from "./fabrication.ts";
import type { RetrievedChunk } from "./citation.ts";

function chunk(partial: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    tag: "1",
    chunk_id: "c1",
    chunk_text: "",
    source_id: "00000000-0000-0000-0000-000000000001",
    provider: "openfda",
    title: null,
    section: null,
    url: null,
    license: "fda_public",
    published_date: null,
    retrieved_at: null,
    similarity: 0.6,
    ...partial,
  };
}

Deno.test("real drug named in evidence text → not fabricated (answers)", () => {
  const chunks = [chunk({ title: "FARXIGA label", chunk_text: "Dapagliflozin 10 mg once daily for heart failure." })];
  assertEquals(isFabricatedDrugQuery(["dapagliflozin"], chunks), false);
});

Deno.test("fabricated drug — evidence is real class-siblings, fake token absent → REFUSE", () => {
  // The florizagliflozin probe: every retrieved record names a REAL SGLT2 drug, never the fake.
  const chunks = [
    chunk({ title: "SGLT2 inhibitor role in cardio-renal disease", chunk_text: "empagliflozin and dapagliflozin reduce HF hospitalization" }),
    chunk({ title: "FARXIGA INDICATIONS", chunk_text: "dapagliflozin is indicated for heart failure" }),
  ];
  assertEquals(isFabricatedDrugQuery(["florizagliflozin"], chunks), true);
});

Deno.test("no specific drug mentioned (general question) → guard does not apply (not refused)", () => {
  const chunks = [chunk({ title: "SGLT2 class review", chunk_text: "the class lowers HbA1c" })];
  assertEquals(isFabricatedDrugQuery([], chunks), false);
});

Deno.test("asked about a drug but retrieved nothing → refuse", () => {
  assertEquals(isFabricatedDrugQuery(["zenelutide"], []), true);
});

Deno.test("mention present in TITLE only → not refused", () => {
  const chunks = [chunk({ title: "Retatrutide phase 2 trial", chunk_text: "primary endpoint was weight change" })];
  assertEquals(isFabricatedDrugQuery(["retatrutide"], chunks), false);
});

Deno.test("real-but-new drug (retatrutide) — live records literally name it → clears", () => {
  const chunks = [chunk({ provider: "pubmed_oa", title: "Triple agonist", chunk_text: "Retatrutide produced ~24% weight loss in adults with obesity." })];
  assertEquals(isFabricatedDrugQuery(["retatrutide"], chunks), false);
});

Deno.test("fake co-mentioned with a real drug → REFUSE (every named drug must be supported)", () => {
  // CRITICAL guard property: a fabricated drug must not clear just because a co-mentioned real drug
  // has evidence — the generator would otherwise make unsupported claims about the fake.
  const chunks = [chunk({ title: "Metformin review", chunk_text: "metformin lowers hepatic glucose output" })];
  assertEquals(isFabricatedDrugQuery(["metformin", "florizagliflozin"], chunks), true);
});

Deno.test("multiple real drugs, both present → not refused", () => {
  const chunks = [
    chunk({ chunk_text: "metformin lowers hepatic glucose output" }),
    chunk({ chunk_text: "lisinopril is an ACE inhibitor" }),
  ];
  assertEquals(isFabricatedDrugQuery(["metformin", "lisinopril"], chunks), false);
});

Deno.test("case-insensitive matching", () => {
  const chunks = [chunk({ chunk_text: "DAPAGLIFLOZIN reduces HF events" })];
  assertEquals(isFabricatedDrugQuery(["Dapagliflozin"], chunks), false);
});

Deno.test("word boundary: fake 'maglutide' must NOT clear via real 'semaglutide' substring", () => {
  const chunks = [chunk({ title: "Semaglutide trial", chunk_text: "semaglutide produced weight loss" })];
  assertEquals(isFabricatedDrugQuery(["maglutide"], chunks), true);
});

Deno.test("word boundary: fake class stem 'gliflozin' must NOT clear via 'dapagliflozin'", () => {
  const chunks = [chunk({ chunk_text: "dapagliflozin and empagliflozin reduce HF events" })];
  assertEquals(isFabricatedDrugQuery(["gliflozin"], chunks), true);
});

Deno.test("BPC-158 fake is NOT matched by BPC-157 real (no spurious substring)", () => {
  const chunks = [chunk({ title: "BPC-157 peptide trial", chunk_text: "BPC-157 investigational peptide for tendon healing" })];
  assertEquals(isFabricatedDrugQuery(["BPC-158"], chunks), true);
});

Deno.test("ultra-short mentions are ignored (treated as no specific drug)", () => {
  const chunks = [chunk({ chunk_text: "vitamin D supplementation" })];
  assertEquals(isFabricatedDrugQuery(["d3"], chunks), false); // "d3" filtered (<3 chars after norm? len 2) → no-op
});

// DELIBERATE: the guard stays STRICT on typos and colloquial abbreviations. It is tempting to add
// edit-distance "typo tolerance" so a 1-char slip like "tesamorein"→"tesamorelin" clears — but that is
// UNSAFE and must not be done here: a real typo (edit-distance 1) is indistinguishable from a fabricated
// near-miss (e.g. "BPC-158"→"BPC-157", also edit-distance 1, asserted above). Loosening the guard would
// re-admit the very fakes it exists to stop. The user-facing fix for typos/abbreviations lives DOWNSTREAM
// (index.ts §3c): when the guard fires but a non-empty pool was retrieved, show those sources via the
// conservative fallback instead of a flat "no source" — without ever running the generator. These two
// tests lock that decision in.
Deno.test("typo of a real drug is STILL treated as unverified (no edit-distance tolerance)", () => {
  const chunks = [chunk({ title: "EGRIFTA SV label", chunk_text: "tesamorelin for injection reduces visceral adipose tissue" })];
  assertEquals(isFabricatedDrugQuery(["tesamorein"], chunks), true); // "tesamorein" ≠ "tesamorelin" (the 'l') → unverified
});

Deno.test("colloquial class abbreviation absent from the literature → guard stays strict", () => {
  const chunks = [chunk({ chunk_text: "tesamorelin stimulates endogenous growth hormone (GH) secretion" })];
  assertEquals(isFabricatedDrugQuery(["HGH"], chunks), true); // literature says "growth hormone"/"GH", not "HGH"
});

// Note: liveToChunk now lives in live-sources.ts (next to LiveCandidate). It is intentionally NOT
// unit-tested here — importing live-sources.ts drags the supabase-js dependency into the ask-units
// type-check graph (CI lacks node_modules). It is covered by typecheck + eval/live-pipeline-safety.ts.
