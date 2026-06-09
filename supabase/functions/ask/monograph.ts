// Drug-monograph generator. Assembles a Lexidrug-style monograph from sources the app already
// has, LAYERED and clearly attributed:
//   1. BACKBONE — the FDA label (openFDA/DailyMed), section by section, with its revision date.
//   2. RECENT EVIDENCE — live PubMed / Europe PMC / ClinicalTrials results (what's emerged SINCE
//      the label), cited and dated.
//   3. COMPUTED — pointers to the applicable dose-adjustment calculators + the label's interactions.
//
// This module does the deterministic ASSEMBLY (no LLM): every line traces to a real source. The
// optional plain-language rewrite is an /ask-layer step (owner-gated deploy). Keeping the layers
// separate is the safety rule: never blur "the label says X" with "a recent study found Y".

import { gatherLiveCandidates } from "./live-sources.ts";

// Canonical monograph order (a subset/superset of the FDA SPL section order).
const SECTION_ORDER = [
  "BOXED WARNING",
  "INDICATIONS AND USAGE",
  "DOSAGE AND ADMINISTRATION",
  "CONTRAINDICATIONS",
  "WARNINGS AND PRECAUTIONS",
  "ADVERSE REACTIONS",
  "DRUG INTERACTIONS",
  "USE IN SPECIFIC POPULATIONS",
  "PREGNANCY",
  "PEDIATRIC USE",
  "GERIATRIC USE",
  "CLINICAL PHARMACOLOGY",
  "MECHANISM OF ACTION",
  "PHARMACOKINETICS",
  "DESCRIPTION",
];

export interface MonographOpts {
  drug: string;
  sbUrl: string;
  serviceKey: string;
  evidenceLimit?: number;
}

export interface LabelRef {
  provider: string;
  provider_id: string;
  title: string;
  revised: string | null; // FDA label revision date (effective_at)
  url: string | null;
  source_id: string;
}

export interface MonographSection {
  heading: string;
  text: string;
}

export interface RecentEvidenceItem {
  origin: string; // pubmed | europepmc | clinicaltrials
  provider_id: string; // PMID | NCT
  title: string;
  url: string;
}

export interface Monograph {
  drug: string;
  label: LabelRef | null;
  sections: MonographSection[];
  interactions: string | null; // the DRUG INTERACTIONS section text, surfaced explicitly
  doseAdjustment: { renalText: boolean; hepaticText: boolean; suggestedCalculators: string[] };
  recentEvidence: RecentEvidenceItem[]; // live — "since the label"
  disclaimer: string;
}

const DISCLAIMER =
  "The labeled sections are the FDA-approved text as of the label's revision date and may lag current literature. " +
  "Recent-evidence items are from the live literature (cited, dated) and may include off-label or emerging findings — " +
  "they are NOT FDA-approved labeling. Computed dose-adjustment pointers require clinician-entered values. Not a substitute for professional judgment.";

export async function buildMonograph(opts: MonographOpts): Promise<Monograph> {
  const label = await findLabel(opts.sbUrl, opts.serviceKey, opts.drug);
  const sections = label ? await getSections(opts.sbUrl, opts.serviceKey, label.source_id) : [];

  const interactions = sections.find((s) => s.heading === "DRUG INTERACTIONS")?.text ?? null;
  const allText = sections.map((s) => s.text).join("\n").toLowerCase();
  const renalText = /renal impairment|creatinine clearance|crcl|egfr|dialysis/.test(allText);
  const hepaticText = /hepatic impairment|child-pugh|cirrhosis|liver impairment/.test(allText);
  const suggestedCalculators: string[] = [];
  if (renalText) suggestedCalculators.push("crcl-cockcroft-gault", "egfr-ckd-epi-2021");
  if (hepaticText) suggestedCalculators.push("child-pugh");

  const live = await gatherLiveCandidates({ query: opts.drug });
  const recentEvidence: RecentEvidenceItem[] = live
    .filter((c) => c.origin === "pubmed" || c.origin === "europepmc" || c.origin === "clinicaltrials")
    .slice(0, opts.evidenceLimit ?? 8)
    .map((c) => ({ origin: c.origin, provider_id: c.provider_id, title: c.title, url: c.url }));

  return { drug: opts.drug, label, sections, interactions, doseAdjustment: { renalText, hepaticText, suggestedCalculators }, recentEvidence, disclaimer: DISCLAIMER };
}

async function findLabel(sbUrl: string, serviceKey: string, drug: string): Promise<LabelRef | null> {
  const url = new URL(`${sbUrl}/rest/v1/core_sources`);
  url.searchParams.set("provider", "in.(openfda,dailymed)");
  url.searchParams.set("title", `ilike.*${drug}*`);
  url.searchParams.set("superseded_at", "is.null");
  url.searchParams.set("select", "id,provider,provider_id,title,effective_at,source_url");
  url.searchParams.set("limit", "10");
  const rows = await get<Array<{ id: string; provider: string; provider_id: string; title: string; effective_at: string | null; source_url: string | null }>>(url, serviceKey);
  if (!rows.length) return null;
  // Prefer openFDA (pre-parsed sections), then the shortest title (usually the cleanest single-drug label).
  const pick = rows.sort((a, b) =>
    (a.provider === "openfda" ? 0 : 1) - (b.provider === "openfda" ? 0 : 1) || a.title.length - b.title.length
  )[0];
  return {
    provider: pick.provider,
    provider_id: pick.provider_id,
    title: pick.title,
    revised: pick.effective_at ? pick.effective_at.slice(0, 10) : null,
    url: pick.source_url,
    source_id: pick.id,
  };
}

async function getSections(sbUrl: string, serviceKey: string, sourceId: string): Promise<MonographSection[]> {
  const url = new URL(`${sbUrl}/rest/v1/core_source_chunks`);
  url.searchParams.set("source_id", `eq.${sourceId}`);
  url.searchParams.set("select", "section,content");
  url.searchParams.set("limit", "1000");
  const rows = await get<Array<{ section: string | null; content: string }>>(url, serviceKey);

  const bySection = new Map<string, string[]>();
  for (const r of rows) {
    const key = (r.section ?? "OTHER").toUpperCase();
    (bySection.get(key) ?? bySection.set(key, []).get(key)!).push(r.content);
  }
  const order = (h: string) => {
    const i = SECTION_ORDER.indexOf(h);
    return i === -1 ? SECTION_ORDER.length : i;
  };
  return [...bySection.entries()]
    .map(([heading, parts]) => ({ heading, text: parts.join("\n").trim() }))
    .filter((s) => s.text.length > 0)
    .sort((a, b) => order(a.heading) - order(b.heading));
}

async function get<T>(url: URL, serviceKey: string): Promise<T> {
  const res = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!res.ok) throw new Error(`monograph query ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return await res.json() as T;
}
