// Export smoke: generate a .docx and .pptx from a fixture ResearchReport and assert each is a
// non-empty OOXML zip (PK\x03\x04). Runtime proof the formatters produce openable files — typecheck
// can't catch a malformed docx/pptx. Run: pnpm --filter @pharmaorb/web smoke:export
import { strFromU8, unzipSync } from "fflate";
import type { ResearchReport } from "@pharmabro/shared";
import { reportToDocx } from "../lib/export/docx.ts";
import { reportToPptx } from "../lib/export/pptx.ts";

const fixtureReport: ResearchReport = {
  question: "Smoke: tesamorelin evidence",
  summary: "Bottom line for the smoke fixture.",
  sub_questions: ["What is tesamorelin?"],
  sections: [{ heading: "What it is", points: [{ text: "A GHRH analog.", citation_ids: ["1"] }] }],
  uncertainties: [{ text: "Long-term safety is unclear.", citation_ids: [] }],
  safety_notes: [{ text: "Discuss with a clinician.", citation_ids: ["1"] }],
  citations: [{
    chunk_tag: "1",
    source_id: "live:pubmed_oa:1",
    source_type: "pubmed_oa",
    title: "A study",
    section: null,
    url: "https://pubmed.ncbi.nlm.nih.gov/1/",
    license: "cc_by",
    published_date: "2024-01-01",
    retrieved_at: "2026-06-10T00:00:00Z",
    authors: ["Smith J"],
    journal: "N Engl J Med",
    year: "2024",
    volume: "390",
    issue: "2",
    pages: "101-110",
  }],
  evidence_grade: "moderate",
  safety_flags: [],
  claims_verified: false,
};

function assertPkZip(buf: Buffer | Uint8Array, label: string): void {
  if (!buf || buf.length < 100) throw new Error(`${label}: empty/too small (${buf?.length} bytes)`);
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
    throw new Error(`${label}: not a PK zip (OOXML) file`);
  }
  console.log(`✓ ${label}: ${buf.length} bytes, PK zip OK`);
}

const docxBuf = await reportToDocx(fixtureReport, "vancouver");
assertPkZip(docxBuf, "reportToDocx");

const pptxBuf = await reportToPptx(fixtureReport, "ama");
assertPkZip(pptxBuf, "reportToPptx");

// Fixture 2: structured_review — verifies honesty signals appear in the generated XML.
const structuredReport: ResearchReport = {
  question: "Smoke: tesamorelin structured review",
  summary: "Structured-review fixture for honesty-signal assertion.",
  sub_questions: ["What is the evidence for tesamorelin?"],
  sections: [{ heading: "Evidence summary", points: [{ text: "A GHRH analog studied in HIV-associated lipodystrophy.", citation_ids: ["s1"] }] }],
  uncertainties: [{ text: "Long-term cardiovascular outcomes remain uncertain.", citation_ids: [] }],
  safety_notes: [{ text: "Discuss dosing adjustments with a clinician.", citation_ids: ["s1"] }],
  citations: [{
    chunk_tag: "s1",
    source_id: "live:pubmed_oa:38001234",
    source_type: "pubmed_oa",
    title: "Tesamorelin for HIV-associated lipodystrophy: a randomized trial",
    section: null,
    url: "https://pubmed.ncbi.nlm.nih.gov/38001234/",
    license: "cc_by",
    published_date: "2024-03-15",
    retrieved_at: "2026-06-10T00:00:00Z",
    authors: ["Falutz J", "Mamputu JC", "Potvin D"],
    journal: "J Acquir Immune Defic Syndr",
    year: "2024",
    volume: "95",
    issue: "3",
    pages: "210-220",
  }],
  evidence_grade: "moderate",
  safety_flags: [],
  claims_verified: false,
  mode: "structured_review",
  counts: {
    per_provider: { pubmed_oa: 6, clinicaltrials: 4 },
    total_retrieved: 10,
    per_search_cap: 6,
    n_searches: 2,
    retrieved_at: "2026-06-10T00:00:00Z",
  },
  search_method: {
    databases: ["PubMed / Europe PMC"],
    queries: ["tesamorelin"],
    search_date: "2026-06-10",
    inclusion_notes: "Retrieved by relevance, capped per source.",
    exclusion_notes: "No exhaustive search; no dual screening.",
  },
  gaps: [{
    dimension: "study_design",
    type: "no_rct",
    scope: "this_run",
    text: "No randomized controlled trial was among the sources we searched.",
    denominator: {
      providers_searched: ["pubmed_oa"],
      n_sources: 10,
      retrieved_at: "2026-06-10T00:00:00Z",
    },
    corroborating_trials: ["NCT9"],
  }],
};

const docxBuf2 = await reportToDocx(structuredReport, "vancouver");
assertPkZip(docxBuf2, "structured docx");
const xml = strFromU8(unzipSync(new Uint8Array(docxBuf2))["word/document.xml"]);
for (const needle of ["NOT FULLY FACT-CHECKED", "not an exhaustive census", "Methods"]) {
  if (!xml.includes(needle)) throw new Error(`honesty signal missing from docx: ${needle}`);
}
console.log("✓ structured docx carries honesty signals");

const pptxBuf2 = await reportToPptx(structuredReport, "ama");
assertPkZip(pptxBuf2, "structured pptx");

console.log("export smoke: PASS");
