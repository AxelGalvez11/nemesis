// Export smoke: generate a .docx and .pptx from a fixture ResearchReport and assert each is a
// non-empty OOXML zip (PK\x03\x04). Runtime proof the formatters produce openable files — typecheck
// can't catch a malformed docx/pptx. Run: pnpm --filter @pharmaorb/web smoke:export
import { inflateSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";
import type { ResearchReport } from "@pharmabro/shared";
import { reportToDocx } from "../lib/export/docx.ts";
import { reportToPdf } from "../lib/export/pdf.ts";
import { reportToPptx } from "../lib/export/pptx.ts";

// Visible text of a PDF: inflate each content stream (pdf-lib Flate-compresses them, so a raw grep
// would false-fail) and join every string literal drawn by a text operator, whitespace-normalized.
// Wrapping splits phrases across lines, so assertions match against the space-joined whole.
function pdfVisibleText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const texts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    let content = m[1];
    try {
      content = inflateSync(Buffer.from(content.replace(/\r?\n$/, ""), "latin1")).toString("latin1");
    } catch {
      // uncompressed stream — use as-is
    }
    // Paren-literal strings…
    const litRe = /\(((?:[^()\\]|\\.)*)\)/g;
    let t: RegExpExecArray | null;
    while ((t = litRe.exec(content)) !== null) {
      texts.push(
        t[1]
          .replace(/\\([()\\])/g, "$1")
          .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8))),
      );
    }
    // …and hex strings (pdf-lib encodes drawText output this way: "<4d6574…> Tj").
    const hexRe = /<([0-9A-Fa-f][0-9A-Fa-f\s]*)>/g;
    let h: RegExpExecArray | null;
    while ((h = hexRe.exec(content)) !== null) {
      const hex = h[1].replace(/\s+/g, "");
      let s = "";
      for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      texts.push(s);
    }
  }
  return texts.join(" ").replace(/\s+/g, " ");
}

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
// Fixture 1 has no `mode`: the exporter fallback must read "standard", matching the
// on-screen ReportAttribution — a legacy report must not show two different Methods.
const xmlLegacy = strFromU8(unzipSync(new Uint8Array(docxBuf))["word/document.xml"]);
if (!xmlLegacy.includes("Method: standard")) {
  throw new Error("mode-less report should fall back to 'Method: standard' (screen parity)");
}
console.log("✓ mode-less docx falls back to 'Method: standard'");

const pptxBuf = await reportToPptx(fixtureReport, "ama");
assertPkZip(pptxBuf, "reportToPptx");

const pdfBuf = await reportToPdf(fixtureReport, "vancouver");
if (!(pdfBuf[0] === 0x25 && pdfBuf[1] === 0x50 && pdfBuf[2] === 0x44 && pdfBuf[3] === 0x46)) {
  throw new Error("reportToPdf: not a PDF file");
}
console.log(`✓ reportToPdf: ${pdfBuf.length} bytes, PDF header OK`);

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

// Evidence-base table parity: the docx must carry the same body-of-evidence table the screen shows.
for (const needle of ["Evidence base (1 sources)", "Study"]) {
  if (!xml.includes(needle)) throw new Error(`evidence-base table missing from docx: ${needle}`);
}
console.log("✓ structured docx carries the evidence-base table");

// Closing attribution slide/section: what the file was actually built from. Mode is humanized
// (underscores → spaces) to match the on-screen ReportAttribution.
for (const needle of ["Built from 1 source", "Method: structured review"]) {
  if (!xml.includes(needle)) throw new Error(`attribution block missing from docx: ${needle}`);
}
console.log("✓ structured docx carries the attribution block");

const pptxBuf2 = await reportToPptx(structuredReport, "ama");
assertPkZip(pptxBuf2, "structured pptx");
const pptxFiles = unzipSync(new Uint8Array(pptxBuf2));
const slideXml = Object.entries(pptxFiles)
  .filter(([name]) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
  .map(([, data]) => strFromU8(data))
  .join("");
if (!slideXml.includes("Evidence base (1 sources)")) {
  throw new Error("evidence-base table missing from pptx slides");
}
console.log("✓ structured pptx carries the evidence-base table");
if (!slideXml.includes("Built from 1 source")) {
  throw new Error("attribution slide missing from pptx");
}
console.log("✓ structured pptx carries the attribution slide");

const pdfBuf2 = await reportToPdf(structuredReport, "ama");
if (!pdfBuf2.toString("latin1", 0, 5).includes("%PDF")) throw new Error("structured pdf: bad header");
const pdfText = pdfVisibleText(pdfBuf2);
for (const needle of ["Methods", "not an exhaustive census", "References"]) {
  if (!pdfText.includes(needle)) throw new Error(`honesty signal missing from pdf: ${needle}`);
}
console.log("✓ structured pdf carries honesty signals");
if (!pdfText.includes("Built from 1 source")) {
  throw new Error("attribution block missing from pdf");
}
console.log("✓ structured pdf carries the attribution block");

// Fixture 3: zero citations — the attribution block ("Built from N sources") must be ABSENT from
// all three exporters (matching the on-screen ReportAttribution, which returns null when
// !report.citations.length), while generation still succeeds.
const zeroCitationReport: ResearchReport = {
  question: "Smoke: zero-citation report",
  summary: "Bottom line for the zero-citation fixture.",
  sub_questions: ["What happens with no sources?"],
  sections: [{ heading: "What it is", points: [{ text: "A claim with no supporting source.", citation_ids: [] }] }],
  uncertainties: [],
  safety_notes: [],
  citations: [],
  evidence_grade: "unknown",
  safety_flags: [],
  claims_verified: false,
};

const docxBuf3 = await reportToDocx(zeroCitationReport, "vancouver");
assertPkZip(docxBuf3, "zero-citation docx");
const xml3 = strFromU8(unzipSync(new Uint8Array(docxBuf3))["word/document.xml"]);
if (xml3.includes("Built from")) throw new Error("attribution block present in zero-citation docx");
console.log("✓ zero-citation docx omits the attribution block");

const pptxBuf3 = await reportToPptx(zeroCitationReport, "ama");
assertPkZip(pptxBuf3, "zero-citation pptx");
const pptxFiles3 = unzipSync(new Uint8Array(pptxBuf3));
const slideXml3 = Object.entries(pptxFiles3)
  .filter(([name]) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
  .map(([, data]) => strFromU8(data))
  .join("");
if (slideXml3.includes("Built from")) throw new Error("attribution slide present in zero-citation pptx");
console.log("✓ zero-citation pptx omits the attribution slide");

const pdfBuf3 = await reportToPdf(zeroCitationReport, "vancouver");
if (!(pdfBuf3[0] === 0x25 && pdfBuf3[1] === 0x50 && pdfBuf3[2] === 0x44 && pdfBuf3[3] === 0x46)) {
  throw new Error("reportToPdf (zero-citation): not a PDF file");
}
const pdfText3 = pdfVisibleText(pdfBuf3);
if (pdfText3.includes("Built from")) throw new Error("attribution block present in zero-citation pdf");
console.log("✓ zero-citation pdf omits the attribution block");

// Brand-free rule (owner decision 2026-07-07): exported deliverables carry NO product branding —
// not in visible text, not in file metadata, not in internal part names (e.g. slide-master names).
// Scan every zip part of the OOXML files and the whole PDF byte stream.
function assertBrandFree(label: string, texts: string[]): void {
  if (texts.some((s) => /pharma\s*orb/i.test(s))) throw new Error(`${label}: contains product branding`);
  console.log(`✓ ${label} is brand-free`);
}
const allZipText = (buf: Buffer): string[] =>
  Object.values(unzipSync(new Uint8Array(buf))).map((d) => {
    try {
      return strFromU8(d);
    } catch {
      return "";
    }
  });
assertBrandFree("docx", allZipText(docxBuf2));
assertBrandFree("pptx", allZipText(pptxBuf2));
assertBrandFree("pdf", [pdfBuf2.toString("latin1")]);

console.log("export smoke: PASS");
