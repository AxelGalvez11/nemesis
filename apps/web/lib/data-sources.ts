// The registry of sources that power Nemesis answers — shown to users in the Data sources panel so
// they can see exactly what the engine draws on. Honest and non-secret: it names the sources and how
// they're used (live per-question vs embedded corpus), never any ranking/weighting internals. News is
// deliberately absent from cited evidence (walled off; see the panel footer).

export type SourceCategory = "live" | "library";
export type SourceBadge = "safety" | "conditional";

export interface DataSource {
  id: string;
  name: string;
  desc: string;
  category: SourceCategory;
  badge?: SourceBadge;
}

export const DATA_SOURCES: DataSource[] = [
  // ── Live: fetched fresh on every question (LIVE_SOURCES=on in production) ──
  { id: "pubmed_oa", name: "PubMed + Europe PMC", desc: "Peer-reviewed biomedical literature, fetched live on every question.", category: "live" },
  { id: "clinicaltrials", name: "ClinicalTrials.gov", desc: "Registered clinical trials — design, status, and outcomes.", category: "live" },
  { id: "openfda_labels", name: "openFDA drug labels", desc: "Official FDA-approved prescribing information.", category: "live" },
  { id: "faers", name: "FAERS", desc: "FDA adverse-event reports, pulled for safety questions.", category: "live", badge: "safety" },
  { id: "fda_safety", name: "FDA enforcement & recalls", desc: "Drug recalls and enforcement actions, on safety-critical queries.", category: "live", badge: "safety" },
  { id: "openalex", name: "OpenAlex", desc: "Open scholarly index for broader literature coverage.", category: "live" },
  { id: "medlineplus", name: "MedlinePlus", desc: "Plain-language consumer health information from the NIH.", category: "live" },
  { id: "tox_ref", name: "Toxicology reference", desc: "NIH toxicology data, consulted when a question warrants it.", category: "live", badge: "conditional" },

  // ── Embedded library: ingested corpus, searched alongside the live pull ──
  { id: "dailymed", name: "DailyMed", desc: "NIH’s full drug-label library.", category: "library" },
  { id: "rxnorm", name: "RxNorm", desc: "Standardized drug names and identifiers.", category: "library" },
  { id: "cdc", name: "CDC", desc: "Public-health guidance and MMWR reports.", category: "library" },
  { id: "drugbank", name: "DrugBank Open", desc: "Open drug and drug-target reference data.", category: "library" },
  { id: "livertox", name: "LiverTox", desc: "NIH reference on drug-induced liver injury.", category: "library" },
  { id: "lactmed", name: "LactMed", desc: "Drugs and lactation safety reference.", category: "library" },
  { id: "pubchem", name: "PubChem", desc: "Chemical structures and properties.", category: "library" },
  { id: "orange_book", name: "FDA Orange Book", desc: "Approved drugs with therapeutic-equivalence ratings.", category: "library" },
  { id: "purple_book", name: "FDA Purple Book", desc: "Licensed biological products and biosimilars.", category: "library" },
  { id: "nadac", name: "CMS NADAC pricing", desc: "National average drug-acquisition cost data.", category: "library" },
  { id: "drugsatfda", name: "Drugs@FDA", desc: "FDA approval history and review documents.", category: "library" },
  { id: "guidelines", name: "Curated guidelines", desc: "AHRQ, USPSTF, NHLBI, VA/DoD, CDC MMWR, PharmGKB, NCBI Bookshelf, DHHS HIV, NCI PDQ, and Orphanet.", category: "library" },
];
