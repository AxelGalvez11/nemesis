// Field-router — PURE, deterministic. The prerequisite for taking the engine beyond medicine.
//
// Given a research query, it decides (1) the FIELD (which drives the source-set + how executable the
// research is) and (2) which SAFETY systems to engage. The safety decision is SIGNAL-DRIVEN and
// independent of the field, on purpose: a health/drug signal must engage the medical safety floor even
// inside a computer-science question, and a self-harm signal must engage crisis support regardless of
// field. The honest failure mode for a health product is *under*-applying safety, so safety is additive
// and errs toward engaging.
//
// This is the deterministic SPINE: a keyword/signal classifier with a transparent `matched` list and a
// safety-first default (ambiguous → no false non-medical routing, and any health signal keeps safety on).
// A higher-accuracy LLM classifier is the OWNER-GATED refinement on top — it would output a field, and
// `fieldProfile()` + the safety model below stay the durable contract. Nothing here calls an LLM or the
// network. Physical (wet-lab) experiments are ALWAYS human-gated, in every field — `executability` only
// describes the in-silico ceiling.

export type ResearchField = "medical" | "mental_health" | "life_science" | "cs_ml" | "other";

/** Safety systems the engine may engage. Additive (a query can need several); [] means none. */
export type SafetyMode = "medical_floor" | "crisis_support";

/** The in-silico execution ceiling for a field (physical experiments are always human-gated). */
export type Executability = "code" | "data_analysis";

export interface FieldProfile {
  field: ResearchField;
  label: string;
  /** Provider keys to search for this field (existing keys + the ones a field still needs). */
  sources: string[];
  executability: Executability;
}

export interface FieldClassification {
  field: ResearchField;
  profile: FieldProfile;
  /** Which safety systems to engage — signal-driven, additive, [] when none apply. */
  safety: SafetyMode[];
  confidence: "high" | "low";
  /** The signals that fired, for transparency/audit. */
  matched: { field: string[]; safety: string[] };
}

const PROFILES: Readonly<Record<ResearchField, FieldProfile>> = {
  medical: { field: "medical", label: "Medicine / clinical", sources: ["pubmed", "clinicaltrials", "openfda", "faers", "openalex"], executability: "data_analysis" },
  mental_health: { field: "mental_health", label: "Mental health / psychology", sources: ["pubmed", "psycinfo", "psyarxiv", "openalex"], executability: "data_analysis" },
  life_science: { field: "life_science", label: "Life science (non-clinical)", sources: ["pubmed", "europepmc", "openalex"], executability: "data_analysis" },
  cs_ml: { field: "cs_ml", label: "Computer science / ML", sources: ["arxiv", "semantic_scholar", "openalex"], executability: "code" },
  other: { field: "other", label: "Other / general", sources: ["openalex"], executability: "data_analysis" },
};

/** Look up the source-set + executability for a field (the durable contract an LLM classifier feeds). */
export function fieldProfile(field: ResearchField): FieldProfile {
  return PROFILES[field];
}

// Signals are matched at a WORD BOUNDARY as prefixes (stems), so "drug" catches "drugs" but "gene"
// never matches inside "imagenet". Stems are curated to avoid short, ambiguous fragments.
const CRISIS = ["suicid", "self-harm", "self harm", "kill myself", "end my life"];
const MENTAL_HEALTH = ["depress", "anxiet", "ptsd", "bipolar", "schizophreni", "ocd", "psychosis", "psychiatr", "psycholog", "mental health", "cognitive behavioral therapy", "cbt", "antidepress", "panic disorder", "eating disorder"];
const MEDICAL = ["drug", "dose", "dosage", "clinical trial", "randomi", "placebo", "patient", "adverse event", "side effect", "toxicit", "fda", "prescription", "contraindicat", "pharmacokinetic", "mg/kg"];
const LIFE_SCI = ["genom", "genetic", "protein", "enzyme", "crispr", "molecular", "in vitro", "cell line", "rna sequenc", "dna sequenc", "organism"];
const CS_ML = ["machine learning", "neural network", "transformer", "benchmark", "dataset", "gpu", "large language model", "llm", "reinforcement learning", "computer vision", "natural language processing", "compiler", "training loss", "embedding model"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word (prefix) matches of `signals` in `text`, e.g. "drug" matches "drugs", not "imagenet". */
function hits(text: string, signals: readonly string[]): string[] {
  return signals.filter((s) => new RegExp(`\\b${escapeRe(s)}`).test(text));
}

/**
 * Classify a research query's field + the safety systems to engage. PURE + deterministic.
 * Field precedence is HEALTH-FIRST (mental_health → medical → life_science → cs_ml → other) so a
 * biomedical-ML question routes to medical sources, not CS. Safety is signal-driven on top.
 */
export function classifyField(query: string): FieldClassification {
  const t = query.toLowerCase();
  const crisis = hits(t, CRISIS);
  const mh = hits(t, MENTAL_HEALTH);
  const med = hits(t, MEDICAL);
  const ls = hits(t, LIFE_SCI);
  const cs = hits(t, CS_ML);

  let field: ResearchField;
  let fieldMatched: string[];
  if (mh.length || crisis.length) { field = "mental_health"; fieldMatched = [...mh, ...crisis]; }
  else if (med.length) { field = "medical"; fieldMatched = med; }
  else if (ls.length) { field = "life_science"; fieldMatched = ls; }
  else if (cs.length) { field = "cs_ml"; fieldMatched = cs; }
  else { field = "other"; fieldMatched = []; }

  // Safety is signal-driven and additive (independent of the field), erring toward engaging.
  const safety: SafetyMode[] = [];
  if (crisis.length || mh.length) safety.push("crisis_support");
  if (med.length) safety.push("medical_floor");

  const safetyMatched = [...new Set([...crisis, ...(crisis.length || mh.length ? mh : []), ...med])];
  const confidence: "high" | "low" = field !== "other" && fieldMatched.length > 0 ? "high" : "low";

  return {
    field,
    profile: PROFILES[field],
    safety,
    confidence,
    matched: { field: fieldMatched, safety: safetyMatched },
  };
}
