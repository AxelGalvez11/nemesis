// Inlined mock data + lookup for the Analysis Console demo — ported faithfully from the
// design prototype's <script>. The console renders this through escaped React JSX (not
// innerHTML), so the freeform-fallback path that interpolates the raw query string is safe.

export type Grade =
  | "very_strong"
  | "strong"
  | "moderate"
  | "weak"
  | "very_weak"
  | "unknown";

export interface Citation {
  source: string;
  cat: string;
}

export interface Claim {
  text: string;
  cites: Citation[];
}

export interface DrugResult {
  name: string;
  category: string;
  grade: Grade;
  summary: string;
  claims: Claim[];
  precaution?: string;
}

export type FeaturedIcon =
  | "triangle-alert"
  | "star"
  | "shield"
  | "link";

export interface FeaturedQuery {
  label: string;
  sublabel: string;
  query: string;
  icon: FeaturedIcon;
}

export const FEATURED_QUERIES: FeaturedQuery[] = [
  {
    label: "Ibuprofen + Lisinopril",
    sublabel: "Drug interaction",
    query: "ibuprofen + lisinopril",
    icon: "triangle-alert",
  },
  {
    label: "Vitamin D3 + Magnesium",
    sublabel: "Supplement synergy",
    query: "vitamin d3 + magnesium",
    icon: "star",
  },
  {
    label: "Ashwagandha",
    sublabel: "Adaptogen study",
    query: "ashwagandha",
    icon: "shield",
  },
  {
    label: "Metformin + Berberine",
    sublabel: "Metabolic dual use",
    query: "metformin + berberine",
    icon: "link",
  },
];

export const DRUG_DB: Record<string, DrugResult> = {
  "ibuprofen + lisinopril": {
    name: "Ibuprofen + Lisinopril",
    category: "NSAID + ACE Inhibitor Interaction",
    grade: "strong",
    summary:
      "Concurrent use of ibuprofen with lisinopril can significantly blunt the blood-pressure-lowering effect of the ACE inhibitor and elevates the risk of acute kidney injury (AKI), particularly in dehydration, elderly patients, or those with pre-existing renal compromise.",
    claims: [
      {
        text: "Ibuprofen inhibits renal prostaglandins needed to dilate the afferent arteriole. Lisinopril dilates the efferent arteriole. Blocking both regulatory pathways drops glomerular filtration pressure severely.",
        cites: [
          { source: "FDA Label / DailyMed", cat: "Boxed Warnings" },
          { source: "PubMed", cat: "Systematic Review · PMID 31289410" },
        ],
      },
      {
        text: "The combination induces synergistic nephrotoxicity. When used continuously over 14 days, the statistical hazard ratio for acute kidney dysfunction climbs by 1.82× compared to lisinopril alone.",
        cites: [
          { source: "PubMed", cat: "RCT · PMID 34910382" },
          { source: "ClinicalTrials.gov", cat: "Registry · NCT04812039" },
        ],
      },
      {
        text: "Isolated low-dose ibuprofen (200 mg) shows negligible risk in hydrated, healthy-kidney adults — but regular daily use requires clinical supervision and alternatives such as paracetamol.",
        cites: [
          { source: "MEDLINE / MedlinePlus", cat: "Patient Counseling · NLM-02941" },
        ],
      },
    ],
    precaution:
      "Check blood pressure weekly. Ensure generous hydration. Limit NSAID use to 2–3 consecutive days max, or ask your cardiologist about paracetamol alternatives.",
  },
  "vitamin d3 + magnesium": {
    name: "Vitamin D3 + Magnesium Synergy",
    category: "Micronutrient Co-factor Study",
    grade: "very_strong",
    summary:
      "Magnesium is a prerequisite cofactor for the enzymes that synthesize and convert Vitamin D3 into its active hormonal form (1,25-dihydroxyvitamin D). Unsupplemented hypomagnesemia can cause resistance to high-dose Vitamin D therapy.",
    claims: [
      {
        text: "Magnesium regulates hepatic and renal hydroxylase enzymes (25-hydroxylase and 1α-hydroxylase) and is a vital component for the transport vehicle, vitamin D-binding protein (DBP).",
        cites: [{ source: "PubMed", cat: "Nutrient Review · PMID 29480918" }],
      },
      {
        text: "Large bolus doses of Vitamin D (e.g. 50,000 IU) without magnesium can deplete active intracellular magnesium stores, causing muscular cramps, restless legs, or cardiac palpitations.",
        cites: [
          { source: "ClinicalTrials.gov", cat: "Interventional · NCT04201827" },
        ],
      },
      {
        text: "Adequate magnesium co-supplementation directs calcium absorption into bone osteoblasts rather than arterial walls, improving both skeletal and cardiovascular safety profiles.",
        cites: [{ source: "PubMed", cat: "RCT · PMID 32890124" }],
      },
    ],
    precaution:
      "Balance Vitamin D3 (2,000–5,000 IU/day) with elemental Magnesium (200–400 mg/day as glycinate or malate) alongside adequate hydration for optimal endocrine support.",
  },
  ashwagandha: {
    name: "Ashwagandha (Withania somnifera)",
    category: "Botanical Adaptogen",
    grade: "moderate",
    summary:
      "Ashwagandha's bio-active withanolides modulate the hypothalamic-pituitary-adrenal (HPA) axis, resulting in substantial reductions in serum cortisol and self-reported improvements in anxiety and sleep hygiene.",
    claims: [
      {
        text: "Daily supplementation with 300–600 mg of standardized high-concentration root extract decreases serum morning cortisol by 22–30% after an 8-week period.",
        cites: [{ source: "PubMed", cat: "RCT · PMID 23439791" }],
      },
      {
        text: "Ashwagandha stimulates thyroid hormone production (T3 and free T4), representing an active hazard for patients with hyperthyroidism, Graves disease, or those on prescribed levothyroxine.",
        cites: [
          { source: "DailyMed / FDA Advisory", cat: "Safety Alert · FDA-P-2023" },
        ],
      },
      {
        text: "Facilitates neurotransmitter signaling at GABAA receptor pathways, explaining its mild hypnotic and sleep-inducing clinical outcomes. Sleep onset latency decreased by ~14 minutes in clinical studies.",
        cites: [{ source: "PubMed", cat: "Clinical Trial · PMID 31728102" }],
      },
    ],
    precaution:
      "Avoid combining with heavy sedatives or alcohol (compounding GABAergic action). Monitor thyroid panel (TSH, T3, T4) if managing thyroid conditions. Consider a 5-days-on / 2-days-off cycle.",
  },
  "metformin + berberine": {
    name: "Metformin + Berberine Co-administration",
    category: "Biguanide + Plant-derived Alkaloid",
    grade: "moderate",
    summary:
      "Both are powerful AMPK activators that optimize insulin sensitivity. Administered simultaneously they act via additive pathways to lower blood sugar — but significantly multiply adverse gastrointestinal events including cramping, flatulence, and loose stools.",
    claims: [
      {
        text: "Both compounds stimulate AMPK phosphorylation via mitochondrial complex I, upregulating cellular GLUT4 expression and blocking hepatic gluconeogenesis by overlapping but distinct mechanisms.",
        cites: [{ source: "PubMed", cat: "Metabolic Trial · PMID 18397984" }],
      },
      {
        text: "Berberine inhibits gut flora and intestinal disaccharidases. Combined with Metformin's local serotonin-release mechanism, co-administration triggers acute diarrhea in 3.1× more patients than Metformin monotherapy.",
        cites: [
          { source: "ClinicalTrials.gov", cat: "Adverse Events · NCT04910384" },
        ],
      },
      {
        text: "The combination creates risk of therapeutic blood sugar drops. While not acutely hypoglycemic like excess insulin, careful glucose monitoring during initial titration is required.",
        cites: [{ source: "FDA Label", cat: "Advisory · ANDA-040212" }],
      },
    ],
    precaution:
      "Do not take on empty stomachs. Stagger doses (e.g. Berberine with lunch, Metformin with dinner) to ease intestinal interference. Monitor HbA1c closely and consult your endocrinologist.",
  },
};

export interface GradeConfigEntry {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const GRADE_CONFIG: Record<Grade, GradeConfigEntry> = {
  very_strong: { label: "Very Strong Evidence", color: "#7ACC00", bg: "rgba(122,204,0,.1)", border: "rgba(122,204,0,.28)" },
  strong: { label: "Strong Evidence", color: "#3BC87A", bg: "rgba(59,200,122,.1)", border: "rgba(59,200,122,.28)" },
  moderate: { label: "Moderate Evidence", color: "#C97B06", bg: "rgba(201,123,6,.1)", border: "rgba(201,123,6,.28)" },
  weak: { label: "Weak Evidence", color: "#C24A00", bg: "rgba(194,74,0,.1)", border: "rgba(194,74,0,.28)" },
  very_weak: { label: "Very Weak Evidence", color: "#B51C1C", bg: "rgba(181,28,28,.1)", border: "rgba(181,28,28,.28)" },
  unknown: { label: "Unknown Evidence", color: "#888", bg: "rgba(128,128,128,.1)", border: "rgba(128,128,128,.2)" },
};

/**
 * Resolve a query string to a DrugResult — first by matching the inlined DRUG_DB, then by
 * generating a plausible fallback. Ported verbatim from the prototype's lookupDrug().
 */
export function lookupDrug(q: string): DrugResult {
  const lower = q.trim().toLowerCase();
  for (const [key, val] of Object.entries(DRUG_DB)) {
    if (
      lower.includes(key) ||
      key.includes(lower) ||
      lower.replace(/\s*\+\s*/g, " ").includes(key.replace(/\s*\+\s*/g, " "))
    ) {
      return val;
    }
  }
  // Fallback generation
  const parts = q
    .trim()
    .split(/\s*[+,]\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const A = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : q;
  const B = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : "";
  if (B) {
    return {
      name: A + " + " + B,
      category: "Combination Pharmacological Study",
      grade: "moderate",
      summary: `Co-administration of ${A} with ${B} may involve shared metabolic pathways. Evidence suggests moderate interactions on biochemical signaling lines — combining them may alter pharmacokinetic distributions or burden primary metabolic clearances, necessitating spaced intake intervals.`,
      claims: [
        {
          text: `Pharmacological pathways of ${A} and ${B} converge on shared metabolic routes. Co-intake may compete for similar enzymatic binding slots, potentially altering the serum bioavailability of both substances.`,
          cites: [{ source: "PubMed", cat: "Pharmacology Review · PMID 35824901" }],
        },
        {
          text: `Elevated digestive load has been noted in clinical cohorts. Gastrointestinal reports increase when combined on empty stomachs — staggering intake by 2–4 hours is generally recommended.`,
          cites: [
            { source: "ClinicalTrials.gov", cat: "Phase II Exploratory · NCT09284812" },
          ],
        },
      ],
      precaution: `Stagger ${A} and ${B} by at least 2–4 hours to minimize direct molecular competition in the GI tract. Consult a registered physician.`,
    };
  }
  return {
    name: A,
    category: "Pharmacological Agent",
    grade: "strong",
    summary: `Systemic data for ${A} demonstrates a well-characterized metabolic profile. It exhibits efficacy in biological target receptors when taken at standard therapeutic levels, backed by extensive peer-reviewed literature and public regulatory trial registers.`,
    claims: [
      {
        text: `Primary ingestion of ${A} engages target receptors to modulate bio-markers, improving metabolic baseline outcomes under double-blind, randomized conditions.`,
        cites: [{ source: "PubMed", cat: "RCT · PMID 32091802" }],
      },
      {
        text: `Active pharmacokinetic clearance occurs via established liver cytochrome systems or urinary pathways with a standard half-life of 4–8 hours under typical conditions.`,
        cites: [
          { source: "DailyMed / openFDA", cat: "Prescribing Monograph · FDA-M-341920" },
        ],
      },
    ],
    precaution: `Ensure your healthcare provider is aware of all supplements and medications. Stay within recommended daily clinical values for ${A} to prevent threshold saturation.`,
  };
}
