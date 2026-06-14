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

Deno.test("citationYear returns an em dash when no year is known", () => {
  assertEquals(citationYear(base), "—");
  assertEquals(citationYear({ ...base, published_date: "not-a-date" }), "—");
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

Deno.test("evidenceRows renders a missing title as an em dash", () => {
  assertEquals(
    evidenceRows([{ ...base, chunk_tag: "5", source_type: "faers", title: null }]),
    [{ tag: "5", type: "Adverse-event report", title: "—", year: "—" }],
  );
});
