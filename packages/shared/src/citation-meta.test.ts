import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { citationYear, evidenceRows, sourceTypeLabel } from "./citation-meta.ts";
import type { Citation } from "./answer.ts";

const base: Citation = {
  chunk_tag: "1", source_id: "x", source_type: "pubmed_oa", title: "A study",
  section: null, url: null, license: null, published_date: null, retrieved_at: null,
};

Deno.test("sourceTypeLabel maps known providers to readable labels", () => {
  assertEquals(sourceTypeLabel("openfda"), "Drug label");
  assertEquals(sourceTypeLabel("dailymed"), "Drug label");
  assertEquals(sourceTypeLabel("clinicaltrials"), "Clinical trial");
  assertEquals(sourceTypeLabel("pubmed_oa"), "Study");
  assertEquals(sourceTypeLabel("europepmc"), "Study");
  assertEquals(sourceTypeLabel("faers"), "Adverse-event report");
});

Deno.test("sourceTypeLabel falls back to a de-underscored label for unknown types", () => {
  assertEquals(sourceTypeLabel("some_new_source"), "some new source");
});

Deno.test("citationYear prefers the explicit year field", () => {
  assertEquals(citationYear({ ...base, year: "2021", published_date: "2019-05-01" }), "2021");
});

Deno.test("citationYear falls back to the published_date year", () => {
  assertEquals(citationYear({ ...base, published_date: "2019-05-01" }), "2019");
});

Deno.test("citationYear says n.d. when no year is known, and never a dash", () => {
  // 🔴 OWNER RULE, 2026-08-25: Nemesis does not print an em dash anywhere, including in a table
  // cell standing in for a missing value. "n.d." is what a citation says for an undated source.
  assertEquals(citationYear(base), "n.d.");
  assertEquals(citationYear({ ...base, published_date: "not-a-date" }), "n.d.");
});

Deno.test("evidenceRows is sorted by numeric tag and carries label/title/year", () => {
  const cites: Citation[] = [
    { ...base, chunk_tag: "2", source_type: "clinicaltrials", title: "NCT trial", year: "2023" },
    { ...base, chunk_tag: "1", source_type: "openfda", title: "Label", published_date: "2020-01-01" },
  ];
  assertEquals(evidenceRows(cites), [
    { tag: "1", type: "Drug label", title: "Label", year: "2020" },
    { tag: "2", type: "Clinical trial", title: "NCT trial", year: "2023" },
  ]);
});

Deno.test("evidenceRows names a missing title rather than printing a dash", () => {
  assertEquals(
    evidenceRows([{ ...base, chunk_tag: "5", source_type: "faers", title: null }]),
    [{ tag: "5", type: "Adverse-event report", title: "Untitled", year: "n.d." }],
  );
});
