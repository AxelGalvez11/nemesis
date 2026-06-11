import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attachSupport, bestSupportingSpan } from "./support-span.ts";
import type { AnswerSections } from "../../../packages/shared/src/answer.ts";
import type { RetrievedChunk } from "./citation.ts";

function chunkOf(tag: string, text: string): Pick<RetrievedChunk, "tag" | "chunk_text"> {
  return { tag, chunk_text: text };
}

const SECTIONS: AnswerSections = {
  what_we_know: [
    { text: "Dexamethasone lowers 28-day mortality in COVID-19 patients.", citation_ids: ["1"] },
    { text: "It is given orally or intravenously.", citation_ids: ["2"] },
  ],
  what_we_do_not_know: [],
  safety_notes: [{ text: "Talk to your prescriber.", citation_ids: [] }],
  questions_to_ask: ["What dose?"],
};
const CHUNKS = [
  chunkOf("1", "In hospitalized patients, dexamethasone reduced 28-day mortality. The trial was open-label."),
  chunkOf("2", "Unrelated text about cardiology guidelines and exercise habits."),
];

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

Deno.test("attachSupport adds a verbatim supporting quote for a claim its cited source supports", () => {
  const out = attachSupport(SECTIONS, CHUNKS);
  const p0 = out.what_we_know[0];
  assert(p0.support && p0.support.length === 1, "expected one supporting passage");
  assertEquals(p0.support[0].citation_tag, "1");
  assert(p0.support[0].quote.includes("dexamethasone reduced 28-day mortality"));
});

Deno.test("attachSupport leaves a claim unmarked when its cited source does not support it", () => {
  const out = attachSupport(SECTIONS, CHUNKS);
  assertEquals(out.what_we_know[1].support, undefined); // tag 2 chunk is unrelated
});

Deno.test("attachSupport passes through non-point fields and does not mutate the input", () => {
  const out = attachSupport(SECTIONS, CHUNKS);
  assertEquals(out.questions_to_ask, ["What dose?"]);
  assertEquals(SECTIONS.what_we_know[0].support, undefined); // original object untouched
});
