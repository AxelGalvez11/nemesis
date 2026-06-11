import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bestSupportingSpan } from "./support-span.ts";

const SOURCE =
  "Patients were enrolled at 12 centers. Dexamethasone reduced 28-day mortality in hospitalized COVID-19 patients. The trial was open-label.";

Deno.test("returns the supporting sentence as a VERBATIM substring with correct offsets", () => {
  const s = bestSupportingSpan("Dexamethasone lowered 28-day mortality in COVID-19 patients", SOURCE);
  assert(s, "expected a supporting span");
  // The never-fabricate property: the quote is exactly the source text at [start,end).
  assertEquals(SOURCE.slice(s.start, s.end), s.quote);
  assert(s.quote.includes("Dexamethasone reduced 28-day mortality"));
});

Deno.test("returns null when no passage clears the support threshold (no fabricated highlight)", () => {
  assertEquals(bestSupportingSpan("Aspirin prevents migraine headaches in adolescents", SOURCE), null);
});

Deno.test("picks the passage with the most claim-term overlap", () => {
  const s = bestSupportingSpan("open-label trial design", SOURCE);
  assert(s, "expected a supporting span");
  assert(s.quote.includes("open-label"));
});

Deno.test("requires more than one matched content word (no single-word spurious highlight)", () => {
  // Only "patients" overlaps — one common word must not be enough to claim support.
  assertEquals(bestSupportingSpan("patients", SOURCE), null);
});

Deno.test("returns null on empty inputs", () => {
  assertEquals(bestSupportingSpan("", SOURCE), null);
  assertEquals(bestSupportingSpan("anything meaningful here", ""), null);
});
