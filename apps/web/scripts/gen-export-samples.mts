// Dev-only: generate real .pdf / .docx / .pptx samples from a rich fixture report so the export
// design system can be rendered and eyeballed (grep/typecheck can't judge "beautiful"). NOT shipped.
// Run: OUT_DIR=/some/dir pnpm --filter @pharmaorb/web exec tsx scripts/gen-export-samples.mts
import { mkdirSync, writeFileSync } from "node:fs";
import type { ResearchReport } from "@pharmabro/shared";
import { reportToDocx } from "../lib/export/docx.ts";
import { reportToPdf } from "../lib/export/pdf.ts";
import { reportToPptx } from "../lib/export/pptx.ts";

const OUT = process.env.OUT_DIR ||
  "/private/tmp/claude-501/-Users-axelgalvez-Desktop-AIcodingProjects-PharmaBro/785f2118-10a1-48c4-a33d-97a7f9d924b8/scratchpad/export-preview";

// A believable, fully-populated structured review so every styled surface is exercised: cover +
// honesty banner, methods, "what we searched" counts, an evidence-base table with varied source
// types, multiple finding sections with cited claims, safety notes, an evidence gap, uncertainties,
// a numbered reference list, and the closing attribution.
const fixture: ResearchReport = {
  question: "Does creatine monohydrate supplementation improve cognitive performance in healthy adults?",
  summary:
    "Across the trials we found, creatine's cognitive benefit in healthy, well-rested adults is small and inconsistent; the clearest signal is in states of stress such as sleep deprivation. It is broadly well tolerated at 3-5 g/day.",
  sub_questions: [
    "What randomized trials measure creatine's effect on memory and reasoning?",
    "Does the effect depend on age or baseline stress (e.g. sleep loss)?",
    "What are the documented safety considerations at common doses?",
  ],
  mode: "structured_review",
  sections: [
    {
      heading: "What the evidence shows",
      points: [
        { text: "A single high dose improved processing speed and short-term memory during sleep deprivation, the largest single effect observed.", citation_ids: ["1"] },
        { text: "In rested young adults, most randomized trials found no reliable improvement in memory or reasoning versus placebo.", citation_ids: ["2", "4"] },
        { text: "A meta-analysis reported a small overall benefit for short-term memory that was larger in older adults.", citation_ids: ["3"] },
      ],
    },
    {
      heading: "How strong the evidence is",
      points: [
        { text: "Sample sizes are mostly small (20-40 participants) and dosing protocols differ widely, which limits pooled confidence.", citation_ids: ["2", "5"] },
        { text: "Only one trial pre-registered its cognitive endpoints, so selective-reporting risk is real.", citation_ids: ["6"] },
      ],
    },
  ],
  uncertainties: [
    { text: "Whether a daily maintenance dose matches the one-off high dose used in the sleep-deprivation study is untested.", citation_ids: ["1"] },
    { text: "Long-term (>6 month) cognitive effects have not been measured in healthy adults.", citation_ids: [] },
  ],
  safety_notes: [
    { text: "Doses of 3-5 g/day are well tolerated; higher loading doses can cause transient water retention and GI upset.", citation_ids: ["7"] },
    { text: "People with kidney disease should consult a clinician before supplementing.", citation_ids: ["8"] },
  ],
  gaps: [
    {
      dimension: "population",
      type: "no_rct",
      scope: "this_run",
      text: "No randomized trial in our set enrolled adults over 65 specifically for a cognitive endpoint.",
      denominator: { providers_searched: ["pubmed_oa", "clinicaltrials"], n_sources: 8, retrieved_at: "2026-07-05T00:00:00Z" },
      corroborating_trials: ["NCT05551234"],
    },
  ],
  counts: {
    per_provider: { pubmed_oa: 5, clinicaltrials: 2, openfda: 1 },
    total_retrieved: 34,
    per_search_cap: 12,
    n_searches: 3,
    retrieved_at: "2026-07-05T00:00:00Z",
  },
  search_method: {
    databases: ["PubMed / Europe PMC", "ClinicalTrials.gov", "openFDA"],
    queries: ["creatine cognition randomized trial", "creatine memory sleep deprivation", "creatine safety renal"],
    search_date: "2026-07-05",
    inclusion_notes: "Randomized or controlled human trials with a cognitive endpoint; retrieved by relevance and capped per source.",
    exclusion_notes: "Animal studies, uncontrolled case reports, and non-cognitive endpoints were not included.",
  },
  citations: [
    { chunk_tag: "1", source_id: "live:pubmed_oa:1", source_type: "pubmed_oa", title: "Single-dose creatine improves cognition during sleep deprivation: a randomized crossover trial", section: null, url: "https://pubmed.ncbi.nlm.nih.gov/38112233/", license: "cc_by", published_date: "2024-02-01", retrieved_at: "2026-07-05T00:00:00Z", authors: ["Gordji-Nejad A", "Matusch A", "Bellak S"], journal: "Scientific Reports", year: "2024", volume: "14", issue: "1", pages: "4012" },
    { chunk_tag: "2", source_id: "live:pubmed_oa:2", source_type: "pubmed_oa", title: "Creatine supplementation and cognition in young adults: a double-blind RCT", section: null, url: "https://pubmed.ncbi.nlm.nih.gov/37554466/", license: "cc_by", published_date: "2023-09-10", retrieved_at: "2026-07-05T00:00:00Z", authors: ["Van Cutsem J", "Roelands B"], journal: "Nutrients", year: "2023", volume: "15", issue: "18", pages: "3970" },
    { chunk_tag: "3", source_id: "live:pubmed_oa:3", source_type: "pubmed_oa", title: "Effects of creatine on memory: a systematic review and meta-analysis", section: null, url: "https://pubmed.ncbi.nlm.nih.gov/36001122/", license: "cc_by", published_date: "2022-08-05", retrieved_at: "2026-07-05T00:00:00Z", authors: ["Avgerinos KI", "Spyrou N", "Sanz A"], journal: "Experimental Gerontology", year: "2022", volume: "108", issue: "", pages: "166-173" },
    { chunk_tag: "4", source_id: "live:pubmed_oa:4", source_type: "pubmed_oa", title: "No effect of short-term creatine loading on working memory in rested adults", section: null, url: "https://pubmed.ncbi.nlm.nih.gov/35887744/", license: "cc_by", published_date: "2022-05-20", retrieved_at: "2026-07-05T00:00:00Z", authors: ["Merege-Filho CAA"], journal: "Applied Physiology, Nutrition, and Metabolism", year: "2022", volume: "47", issue: "6", pages: "621-629" },
    { chunk_tag: "5", source_id: "live:clinicaltrials:5", source_type: "clinicaltrials", title: "Creatine and Cognitive Function in Adults (CRECOG)", section: null, url: "https://clinicaltrials.gov/study/NCT05123456", license: "gov", published_date: "2023-01-15", retrieved_at: "2026-07-05T00:00:00Z", journal: "ClinicalTrials.gov", year: "2023", trial_phase: "N/A" },
    { chunk_tag: "6", source_id: "live:clinicaltrials:6", source_type: "clinicaltrials", title: "Pre-registered Trial of Creatine for Memory in Older Adults", section: null, url: "https://clinicaltrials.gov/study/NCT05551234", license: "gov", published_date: "2023-06-01", retrieved_at: "2026-07-05T00:00:00Z", journal: "ClinicalTrials.gov", year: "2023", trial_phase: "Phase 2" },
    { chunk_tag: "7", source_id: "live:pubmed_oa:7", source_type: "pubmed_oa", title: "Safety and tolerability of creatine supplementation: a narrative review", section: null, url: "https://pubmed.ncbi.nlm.nih.gov/34778899/", license: "cc_by", published_date: "2021-11-02", retrieved_at: "2026-07-05T00:00:00Z", authors: ["Kreider RB", "Jäger R", "Purpura M"], journal: "Journal of the ISSN", year: "2021", volume: "18", issue: "1", pages: "13" },
    { chunk_tag: "8", source_id: "live:openfda:8", source_type: "openfda", title: "Creatine — labeled precautions and renal considerations", section: "Warnings", url: "https://www.accessdata.fda.gov/", license: "public", published_date: "2020-01-01", retrieved_at: "2026-07-05T00:00:00Z", journal: "openFDA", year: "2020" },
  ],
  evidence_grade: "moderate",
  safety_flags: [],
  claims_verified: true,
  citation_style: "vancouver",
};

mkdirSync(OUT, { recursive: true });
const pdf = await reportToPdf(fixture, "vancouver");
writeFileSync(`${OUT}/sample.pdf`, pdf);
const docx = await reportToDocx(fixture, "vancouver");
writeFileSync(`${OUT}/sample.docx`, docx);
const pptx = await reportToPptx(fixture, "vancouver");
writeFileSync(`${OUT}/sample.pptx`, pptx);
console.log(`wrote sample.pdf (${pdf.length}), sample.docx (${docx.length}), sample.pptx (${pptx.length}) to ${OUT}`);
