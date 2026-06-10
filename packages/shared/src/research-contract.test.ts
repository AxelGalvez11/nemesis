// Type-shape guard: the publishable-reports additions are OPTIONAL and assignable.
// A green run proves the new fields exist with the intended shapes without changing
// any existing required field (the frozen contract stays backward-compatible).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Citation } from "./answer.ts";
import type {
  CitationStyle,
  GapStatement,
  ReportMode,
  ResearchReport,
  RetrievalCounts,
  SearchMethod,
} from "./research.ts";

Deno.test("Citation accepts optional bibliographic metadata", () => {
  const c: Citation = {
    chunk_tag: "1",
    source_id: "live:pubmed_oa:123",
    source_type: "pubmed_oa",
    title: "A study",
    section: null,
    url: null,
    license: "cc_by",
    published_date: "2024-01-01",
    retrieved_at: "2026-06-10T00:00:00Z",
    authors: ["Smith J", "Doe A"],
    journal: "N Engl J Med",
    year: "2024",
    volume: "390",
    issue: "2",
    pages: "101-110",
  };
  assertEquals(c.authors?.length, 2);
});

Deno.test("ResearchReport accepts the optional publishable-report fields", () => {
  const mode: ReportMode = "structured_review";
  const style: CitationStyle = "ama";
  const counts: RetrievalCounts = {
    per_provider: { pubmed_oa: 6, clinicaltrials: 4 },
    total_retrieved: 10,
    cap_per_source: 6,
    retrieved_at: "2026-06-10T00:00:00Z",
  };
  const gap: GapStatement = {
    dimension: "study_design",
    type: "no_rct",
    scope: "this_run",
    text: "No randomized controlled trial was among the sources we searched.",
    denominator: { providers_searched: ["pubmed_oa", "clinicaltrials"], n_sources: 10, retrieved_at: "2026-06-10T00:00:00Z" },
    corroborating_trials: [],
  };
  const method: SearchMethod = {
    databases: ["PubMed/Europe PMC", "ClinicalTrials.gov", "openFDA"],
    queries: ["tesamorelin efficacy", "tesamorelin safety"],
    search_date: "2026-06-10",
    inclusion_notes: "Sources retrieved by relevance, capped per source.",
    exclusion_notes: "No exhaustive census; non-open-access full text not read.",
  };
  const partial: Pick<ResearchReport, "mode" | "gaps" | "counts" | "search_method" | "citation_style"> = {
    mode,
    gaps: [gap],
    counts,
    search_method: method,
    citation_style: style,
  };
  assertEquals(partial.mode, "structured_review");
  assertEquals(partial.gaps?.[0].type, "no_rct");
});
