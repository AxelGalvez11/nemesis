// The PRISMA-overclaim guard. PharmaOrb does bounded, relevance-capped retrieval — it is
// NOT a systematic/scoping review and has no PRISMA flow. These phrases must never appear
// in the method copy of a "structured / PRISMA-informed" report (honesty cornerstone, plan §2).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectForbiddenPhrases, FORBIDDEN_PHRASE_LABELS } from "./forbidden-phrases.ts";

Deno.test("flags every banned self-claim phrase", () => {
  for (const phrase of [
    "This systematic review of tesamorelin...",
    "We performed a scoping review of the literature.",
    "Our PRISMA-compliant search identified...",
    "See the PRISMA flow diagram below.",
    "A total of 412 records identified through database searching.",
  ]) {
    assert(detectForbiddenPhrases(phrase).length > 0, `should flag: ${phrase}`);
  }
});

Deno.test("passes honest method copy", () => {
  const ok =
    "We searched PubMed/Europe PMC, ClinicalTrials.gov, and openFDA on 2026-06-10. " +
    "Sources were retrieved by relevance and capped per source — not an exhaustive census. " +
    "Each claim was checked against its cited source.";
  assertEquals(detectForbiddenPhrases(ok), []);
});

Deno.test("is case-insensitive and reports a human label", () => {
  const hits = detectForbiddenPhrases("a SYSTEMATIC REVIEW");
  assertEquals(hits, [FORBIDDEN_PHRASE_LABELS.systematic_review]);
});
