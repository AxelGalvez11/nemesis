// Adversarial tests for the typo "assume & answer" escape (typo-correct.ts). The SAFETY property under
// test: real typos of real drugs get corrected, but the class-plausible FAKES the fabrication guard exists
// to refuse (florizagliflozin / maglutide / gliflozin / zenelutide) get NO correction → the caller keeps
// refusing. Mirrors the fakes in fabrication.test.ts.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assumptionNote, findTypoCorrections, osaWithin } from "./typo-correct.ts";
import type { RetrievedChunk } from "./citation.ts";
import type { DetectedEntity } from "../../../packages/shared/src/answer.ts";

function chunk(o: { title?: string; chunk_text?: string }): RetrievedChunk {
  return { title: o.title ?? null, chunk_text: o.chunk_text ?? "" } as RetrievedChunk;
}
function ent(mention: string, canonical_name: string | null): DetectedEntity {
  return { mention, entity_id: canonical_name ? "id" : null, canonical_name };
}

// ── osaWithin (the distance gate) ──────────────────────────────────────────────────────────────────
Deno.test("osaWithin: single insertion is distance 1 (tesamorlin→tesamorelin)", () => {
  assertEquals(osaWithin("tesamorlin", "tesamorelin", 1), true);
});
Deno.test("osaWithin: adjacent transposition is distance 1 (metfromin→metformin)", () => {
  assertEquals(osaWithin("metfromin", "metformin", 1), true);
});
Deno.test("osaWithin: two edits exceeds the bound (maglutide→semaglutide = 2)", () => {
  assertEquals(osaWithin("maglutide", "semaglutide", 1), false);
});
Deno.test("osaWithin: a 1-char fake near-miss is distance 1 (bpc-158→bpc-157)", () => {
  assertEquals(osaWithin("bpc-158", "bpc-157", 1), true);
});

// ── REAL TYPOS → corrected ─────────────────────────────────────────────────────────────────────────
Deno.test("typo of a real drug, canonical present in evidence → assume & answer", () => {
  const pool = [chunk({ title: "EGRIFTA SV (TESAMORELIN)", chunk_text: "tesamorelin reduces visceral fat" })];
  const out = findTypoCorrections(["tesamorlin"], [ent("tesamorlin", "Tesamorelin")], pool);
  assertEquals(out, [{ mention: "tesamorlin", corrected: "Tesamorelin" }]);
});
Deno.test("transposition typo (metfromin→Metformin) corrects", () => {
  const pool = [chunk({ title: "Metformin", chunk_text: "metformin lowers blood glucose" })];
  const out = findTypoCorrections(["metfromin"], [ent("metfromin", "Metformin")], pool);
  assertEquals(out, [{ mention: "metfromin", corrected: "Metformin" }]);
});

// ── FAKES → NO correction (the guard keeps refusing) ───────────────────────────────────────────────
Deno.test("class-plausible fake (florizagliflozin) resolves to a >1-edit real neighbor → REFUSE (null)", () => {
  // search_entities returns the nearest trigram match (a real SGLT2 drug), but it is many edits away.
  const pool = [chunk({ title: "Dapagliflozin trial", chunk_text: "dapagliflozin reduced HbA1c" })];
  assertEquals(findTypoCorrections(["florizagliflozin"], [ent("florizagliflozin", "Dapagliflozin")], pool), null);
});
Deno.test("fake 'maglutide' (2 edits from semaglutide) → REFUSE (null)", () => {
  const pool = [chunk({ title: "Semaglutide", chunk_text: "semaglutide produced weight loss" })];
  assertEquals(findTypoCorrections(["maglutide"], [ent("maglutide", "Semaglutide")], pool), null);
});
Deno.test("fake class stem 'gliflozin' → REFUSE (null)", () => {
  const pool = [chunk({ title: "Dapagliflozin", chunk_text: "dapagliflozin is an SGLT2 inhibitor" })];
  assertEquals(findTypoCorrections(["gliflozin"], [ent("gliflozin", "Dapagliflozin")], pool), null);
});
Deno.test("absent + unresolved mention (no canonical) → REFUSE (null)", () => {
  const pool = [chunk({ title: "Tirzepatide", chunk_text: "tirzepatide trial" })];
  assertEquals(findTypoCorrections(["zenelutide"], [ent("zenelutide", null)], pool), null);
});
Deno.test("corrected drug NOT named in evidence → REFUSE (null) — never ungrounded", () => {
  const pool = [chunk({ title: "Aspirin", chunk_text: "aspirin and platelets" })];
  assertEquals(findTypoCorrections(["tesamorlin"], [ent("tesamorlin", "Tesamorelin")], pool), null);
});
Deno.test("fake co-mentioned with a real drug → REFUSE the whole query (null)", () => {
  // metformin present, florizagliflozin uncorrectable → the entire query refuses (guard parity).
  const pool = [chunk({ title: "Metformin + SGLT2", chunk_text: "metformin and dapagliflozin combo" })];
  assertEquals(
    findTypoCorrections(["metformin", "florizagliflozin"], [ent("florizagliflozin", "Dapagliflozin")], pool),
    null,
  );
});

// ── owner-accepted residual: a 1-edit fake whose real neighbor is in evidence → assume + STATE it ──
Deno.test("1-edit fake near-miss (BPC-158→BPC-157) is assumed + stated (owner-accepted, transparent)", () => {
  const pool = [chunk({ title: "BPC-157 peptide", chunk_text: "bpc-157 investigational peptide" })];
  const out = findTypoCorrections(["bpc-158"], [ent("bpc-158", "BPC-157")], pool);
  assertEquals(out, [{ mention: "bpc-158", corrected: "BPC-157" }]);
});

// ── assumption note copy ───────────────────────────────────────────────────────────────────────────
Deno.test("assumptionNote: single + multi", () => {
  assertEquals(assumptionNote([{ mention: "x", corrected: "Tesamorelin" }]), "Assuming you mean Tesamorelin");
  assertEquals(
    assumptionNote([{ mention: "a", corrected: "Tesamorelin" }, { mention: "b", corrected: "Metformin" }]),
    "Assuming you mean Tesamorelin and Metformin",
  );
});
