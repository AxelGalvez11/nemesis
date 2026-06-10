// Export smoke: generate a .docx and .pptx from a fixture ResearchReport and assert each is a
// non-empty OOXML zip (PK\x03\x04). Runtime proof the formatters produce openable files — typecheck
// can't catch a malformed docx/pptx. Run: pnpm --filter @pharmaorb/web smoke:export
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

console.log("export smoke: PASS");
