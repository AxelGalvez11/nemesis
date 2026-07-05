// DEV-ONLY PREVIEW — remove before merge.
// Renders <ResearchPoster> with a realistic health/biomedical fixture so the poster can be
// screenshotted in isolation (no app chrome — this route is a sibling of app/app, whose layout owns
// the rail). The fixture is a plausible finished Deep Research ResearchReport; it is NOT fetched.
import type { Citation, ResearchReport } from "@pharmabro/shared";
import { ResearchPoster } from "@/components/ResearchPoster";

// 12 realistic citations spanning study types + years. Every findings point below references a
// chunk_tag that exists here, so the [n] markers always resolve to a real reference line.
const CITATIONS: Citation[] = [
  {
    chunk_tag: "S1", source_id: "PMID:15855502", source_type: "pubmed", section: null,
    title: "Metformin and reduced risk of cancer in diabetic patients",
    url: "https://pubmed.ncbi.nlm.nih.gov/15855502/", license: null,
    published_date: "2005-06-04", retrieved_at: "2026-07-04",
    authors: ["Evans JMM", "Donnelly LA", "Emslie-Smith AM", "Alessi DR", "Morris AD"],
    journal: "BMJ", year: "2005", volume: "330", issue: "7503", pages: "1304-1305",
    publication_types: ["Observational Study"],
  },
  {
    chunk_tag: "S2", source_id: "PMID:19934440", source_type: "pubmed", section: null,
    title: "New users of metformin are at low risk of incident cancer: a cohort study",
    url: "https://pubmed.ncbi.nlm.nih.gov/19934440/", license: null,
    published_date: "2009-09-01", retrieved_at: "2026-07-04",
    authors: ["Libby G", "Donnelly LA", "Donnan PT", "Alessi DR", "Morris AD", "Evans JMM"],
    journal: "Diabetes Care", year: "2009", volume: "32", issue: "9", pages: "1620-1625",
    publication_types: ["Observational Study"],
  },
  {
    chunk_tag: "S3", source_id: "PMID:22570464", source_type: "pubmed", section: null,
    title: "Metformin and cancer risk in diabetic patients: a systematic review and meta-analysis",
    url: "https://pubmed.ncbi.nlm.nih.gov/22570464/", license: null,
    published_date: "2012-05-01", retrieved_at: "2026-07-04",
    authors: ["Noto H", "Goto A", "Tsujimoto T", "Noda M"],
    journal: "Cancer Prev Res", year: "2012", volume: "5", issue: "9", pages: "1097-1106",
    publication_types: ["Meta-Analysis", "Systematic Review"], doaj_vetted: true,
  },
  {
    chunk_tag: "S4", source_id: "PMID:24009194", source_type: "pubmed", section: null,
    title: "Metformin and cancer: an ambiguous relationship due to methodological limitations",
    url: "https://pubmed.ncbi.nlm.nih.gov/24009194/", license: null,
    published_date: "2013-09-01", retrieved_at: "2026-07-04",
    authors: ["Suissa S", "Azoulay L"],
    journal: "Diabetes Care", year: "2013", volume: "36", issue: "9", pages: "2665-2673",
    publication_types: ["Review"],
  },
  {
    chunk_tag: "S5", source_id: "PMID:22374499", source_type: "pubmed", section: null,
    title: "Time-related biases in pharmacoepidemiology: immortal time bias and metformin",
    url: "https://pubmed.ncbi.nlm.nih.gov/22374499/", license: null,
    published_date: "2012-02-28", retrieved_at: "2026-07-04",
    authors: ["Suissa S", "Azoulay L"],
    journal: "Diabetes Care", year: "2012", volume: "35", issue: "12", pages: "2665-2673",
    publication_types: ["Journal Article"],
  },
  {
    chunk_tag: "S6", source_id: "PMID:28776081", source_type: "pubmed", section: null,
    title: "Metformin and cancer incidence: an updated meta-analysis of randomized controlled trials",
    url: "https://pubmed.ncbi.nlm.nih.gov/28776081/", license: null,
    published_date: "2017-08-01", retrieved_at: "2026-07-04",
    authors: ["Stevens RJ", "Ali R", "Bankhead CR", "Bethel MA", "Cairns BJ", "Camisasca RP", "Crowe FL", "Farmer AJ", "Harrison S", "Hirst JA"],
    journal: "Diabetologia", year: "2017", volume: "60", issue: "9", pages: "1639-1651",
    publication_types: ["Meta-Analysis"], doaj_vetted: true,
  },
  {
    chunk_tag: "S7", source_id: "NCT01101438", source_type: "clinicaltrials", section: null,
    title: "Metformin in Reducing Cancer Risk in Adults With Type 2 Diabetes",
    url: "https://clinicaltrials.gov/study/NCT01101438", license: null,
    published_date: "2010-04-12", retrieved_at: "2026-07-04",
    year: "2010", study_type: "INTERVENTIONAL", trial_phase: "PHASE3",
  },
  {
    chunk_tag: "S8", source_id: "PMID:33549290", source_type: "pubmed_oa", section: null,
    title: "Metformin use and colorectal cancer risk in type 2 diabetes: a nationwide cohort study",
    url: "https://pubmed.ncbi.nlm.nih.gov/33549290/", license: "cc-by",
    published_date: "2021-02-05", retrieved_at: "2026-07-04",
    authors: ["Kim YJ", "Lee J", "Park S", "Choi KH"],
    journal: "BMC Cancer", year: "2021", volume: "21", issue: "1", pages: "144",
    publication_types: ["Observational Study"], doaj_vetted: true, oa_url: "https://bmccancer.biomedcentral.com/articles/10.1186/s12885-021-07863-z",
  },
  {
    chunk_tag: "S9", source_id: "PMID:29459239", source_type: "pubmed", section: null,
    title: "Confounding by indication and metformin's apparent anticancer effect",
    url: "https://pubmed.ncbi.nlm.nih.gov/29459239/", license: null,
    published_date: "2018-02-01", retrieved_at: "2026-07-04",
    authors: ["Farmer RE", "Ford D", "Forbes HJ", "Chaturvedi N", "Kaplan R", "Smeeth L", "Bhaskaran K"],
    journal: "Int J Epidemiol", year: "2018", volume: "46", issue: "2", pages: "728-744",
    publication_types: ["Observational Study"],
  },
  {
    chunk_tag: "S10", source_id: "PMID:32188585", source_type: "europepmc", section: null,
    title: "Metformin and pancreatic cancer risk: a meta-analysis of observational studies",
    url: "https://europepmc.org/article/MED/32188585", license: null,
    published_date: "2020-03-18", retrieved_at: "2026-07-04",
    authors: ["Zhang H", "Wang Q", "Liu M", "Chen Y"],
    journal: "Pancreas", year: "2020", volume: "49", issue: "4", pages: "504-512",
    publication_types: ["Meta-Analysis"],
  },
  {
    chunk_tag: "S11", source_id: "NCT02614339", source_type: "clinicaltrials", section: null,
    title: "Metformin for Cancer Prevention in Lynch Syndrome (MILY)",
    url: "https://clinicaltrials.gov/study/NCT02614339", license: null,
    published_date: "2015-11-25", retrieved_at: "2026-07-04",
    year: "2015", study_type: "INTERVENTIONAL", trial_phase: "PHASE2",
  },
  {
    chunk_tag: "S12", source_id: "PMID:35435916", source_type: "pubmed", section: null,
    title: "Metformin and overall cancer incidence: umbrella review of meta-analyses",
    url: "https://pubmed.ncbi.nlm.nih.gov/35435916/", license: null,
    published_date: "2022-04-18", retrieved_at: "2026-07-04",
    authors: ["Yao L", "Liu M", "Huang Y", "Wu K", "Zhang X", "Meng H", "Liu R", "Li X", "Yang H"],
    journal: "Diabetes Metab Res Rev", year: "2022", volume: "38", issue: "5", pages: "e3532",
    publication_types: ["Systematic Review"], doaj_vetted: true,
  },
];

const FIXTURE: ResearchReport = {
  question: "Does metformin reduce cancer incidence in adults with type 2 diabetes?",
  summary:
    "Early observational studies suggested people with type 2 diabetes taking metformin had lower cancer rates, but this signal shrinks sharply once time-related biases are corrected, and randomized-trial evidence does not confirm a protective effect. The honest bottom line: metformin is not established as a cancer-preventing drug, and the apparent benefit in older cohort studies is largely explained by how those studies were designed.",
  sub_questions: [
    "Do observational cohort studies show lower cancer incidence with metformin?",
    "Does the association survive correction for immortal time and confounding by indication?",
    "What do randomized controlled trials and meta-analyses of RCTs show?",
    "Does the effect differ by cancer site (colorectal, pancreatic)?",
  ],
  sections: [
    {
      heading: "Observational studies show an association",
      points: [
        { text: "Early cohort studies reported that diabetic patients on metformin had a lower overall cancer incidence than those on other glucose-lowering therapies.", citation_ids: ["S1", "S2"] },
        { text: "A widely cited meta-analysis of observational data estimated roughly a 30% lower cancer risk associated with metformin use.", citation_ids: ["S3"] },
        { text: "Site-specific analyses suggested reduced colorectal and pancreatic cancer incidence, though effect sizes varied widely between studies.", citation_ids: ["S8", "S10"] },
      ],
    },
    {
      heading: "The association weakens after correcting for bias",
      points: [
        { text: "Much of the apparent benefit reflects immortal time bias and other time-related biases in how metformin exposure was counted.", citation_ids: ["S4", "S5"] },
        { text: "When new-user designs and time-varying exposure are applied, the protective association attenuates substantially or disappears.", citation_ids: ["S9"] },
      ],
    },
    {
      heading: "Randomized evidence does not confirm a protective effect",
      points: [
        { text: "A meta-analysis restricted to randomized controlled trials found no statistically significant reduction in cancer incidence with metformin.", citation_ids: ["S6"] },
        { text: "An umbrella review of meta-analyses concluded the overall evidence for a cancer-preventive effect is low-certainty and inconsistent.", citation_ids: ["S12"] },
        { text: "Dedicated prevention trials are testing the question prospectively but have not yet delivered definitive incidence results.", citation_ids: ["S7", "S11"] },
      ],
    },
  ],
  uncertainties: [
    { text: "Whether any real anticancer effect exists at a specific site (e.g. colorectal) once high-quality prospective data mature.", citation_ids: ["S8"] },
  ],
  safety_notes: [
    { text: "Metformin should not be started or stopped for cancer prevention outside a clinical trial; its established use is glycemic control in type 2 diabetes.", citation_ids: ["S4"] },
  ],
  citations: CITATIONS,
  evidence_grade: "moderate",
  safety_flags: [],
  claims_verified: true,
  mode: "structured_review",
  gaps: [
    {
      dimension: "study_design", type: "no_rct", scope: "this_run",
      text: "No completed randomized trial in this run reports cancer incidence as a primary endpoint in an unselected type 2 diabetes population; the RCT evidence is secondary-outcome or pooled.",
      denominator: { providers_searched: ["pubmed", "clinicaltrials", "europepmc"], n_sources: 12, retrieved_at: "2026-07-04" },
      corroborating_trials: ["NCT01101438", "NCT02614339"],
    },
    {
      dimension: "long_term", type: "sparse", scope: "this_run",
      text: "Long-term (>10 year) incidence data are sparse; most cohorts followed patients for a median under 6 years.",
      denominator: { providers_searched: ["pubmed", "europepmc"], n_sources: 12, retrieved_at: "2026-07-04" },
      corroborating_trials: [],
    },
  ],
  search_method: {
    databases: ["PubMed", "ClinicalTrials.gov", "Europe PMC"],
    queries: [
      "metformin cancer incidence type 2 diabetes",
      "metformin cancer risk immortal time bias",
      "metformin cancer randomized controlled trial meta-analysis",
    ],
    search_date: "2026-07-04",
    inclusion_notes: "Human studies in type 2 diabetes reporting cancer incidence; observational cohorts, RCTs, and syntheses.",
    exclusion_notes: "Excluded in-vitro/animal work, case reports, and studies without a diabetes-population denominator.",
  },
  counts: {
    per_provider: { pubmed: 8, clinicaltrials: 2, europepmc: 1, pubmed_oa: 1 },
    total_retrieved: 41,
    n_searches: 4,
    per_search_cap: 12,
    retrieved_at: "2026-07-04",
  },
  citation_style: "vancouver",
};

export default function PosterPreviewPage() {
  return (
    <div className="poster-preview-stage">
      <ResearchPoster report={FIXTURE} style="vancouver" />
    </div>
  );
}
