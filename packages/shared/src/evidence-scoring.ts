// Deterministic evidence-scoring core (§9 — "the IP"). PURE functions, no I/O,
// no LLM. The orchestrator (scripts/evidence-score.ts) calls scoreSignals() to
// get the TIER, then asks the LLM to write ONLY the rationale/limitations prose
// grounded in the same source_ids. The tier is NEVER model-derived — that is the
// "deterministic + auditable" guarantee, the same discipline as the safety layer.
//
// ============================================================================
// SIGNAL DEFINITIONS — this table IS the spec. Each signal: exact computation
// from a real projection column + the CONSERVATIVE default when it can't be
// computed. The tier pivots on the squishy booleans, so they are pinned here and
// covered by evidence-scoring.test.ts.
// ============================================================================
//
//   fda_approved_for_indication  drug_entities.approved_status='approved'.        default false
//   dailymed_label_present       ≥1 label_documents for the entity.               default false
//   n_meta_analysis              # linked PubMed w/ publication_types ∋ Meta-Analysis. default 0
//   n_systematic_review          # linked PubMed w/ publication_types ∋ Systematic Review. default 0
//   n_rct                        # linked PubMed w/ publication_types ∋ Randomized Controlled Trial. default 0
//   n_human_trials               # linked CT.gov studies, study_type=INTERVENTIONAL (human by definition). default 0
//   n_observational              # linked CT.gov studies, study_type=OBSERVATIONAL. default 0
//   n_preclinical_only           # linked PubMed tagged animal/preclinical w/o human (mesh Animals ¬Humans). default 0
//   max_trial_phase              max parsePhase() over linked trials (0=NA). default 0
//   results_posted               any linked trial w/ results_first_posted not null. default false
//
//   findings_consistent  DERIVED. true iff a synthesis, replication, or regulator has
//                        adjudicated consistency: n_meta≥1 ∨ n_sr≥1 ∨ n_rct≥2 ∨ fda_approved.
//                        CONSERVATIVE default false — a single study is not "consistent".
//   sample_size_adequate DERIVED. max linked interventional enrollment ≥ ADEQUATE_ENROLLMENT.
//                        CONSERVATIVE default false (incl. enrollment unknown / 0).
//   robust_human         DERIVED. (n_rct≥1 ∧ sample_size_adequate) ∨ n_human_trials≥2.
//   only_evidence_is_abstract  RESERVED, default false. No reliable conference-abstract
//                        detector yet; defaulting true would wrongly cap real meta-analyses.
//   indirect_evidence_only     RESERVED, default false. We do not infer class-effect indirectness.
//
//   is_off_label   CONTEXT. Only set on curated claim-level rows (a drug-level score is
//                  the drug's own approved use → false). Drives the off-label override.
//   entity_type / approved_status   from drug_entities; drive the peptide/research_use override.

import type { EvidenceCounts, EvidenceTier } from "./evidence.ts";
// ApprovedStatus is defined once in search.ts (§8 shapes) and reused here. It is
// imported (not re-exported) so the packages/shared barrel exports it exactly
// once — `export *` from both modules would otherwise clash.
import type { ApprovedStatus } from "./search.ts";

export type EvidenceEntityType =
  | "drug"
  | "supplement"
  | "peptide"
  | "biologic"
  | "class"
  | "company";

/** Enrollment at/above which an interventional trial counts as adequately sized.
 * Heuristic constant (§9 "sample_size_adequate"); documented, not magic. */
export const ADEQUATE_ENROLLMENT = 100;

/** Raw per-entity aggregates pulled from the typed projections by extractSignals
 * (Phase-4 scoring script). deriveSignals() turns these into EvidenceSignals. */
export interface RawAggregates {
  n_meta_analysis: number;
  n_systematic_review: number;
  n_rct: number;
  n_human_trials: number;
  n_observational: number;
  n_preclinical_only: number;
  max_trial_phase: number;
  results_posted: boolean;
  /** Largest enrollment among linked interventional trials; 0 if unknown. */
  max_enrollment: number;
  fda_approved_for_indication: boolean;
  dailymed_label_present: boolean;
  entity_type: EvidenceEntityType;
  approved_status: ApprovedStatus;
  is_off_label: boolean;
}

/** Fully-materialized signal set the tier ladder reads. Derived booleans are
 * computed by deriveSignals(); see the spec table above. */
export interface EvidenceSignals {
  n_meta_analysis: number;
  n_systematic_review: number;
  n_rct: number;
  n_human_trials: number;
  n_observational: number;
  n_preclinical_only: number;
  max_trial_phase: number;
  results_posted: boolean;
  fda_approved_for_indication: boolean;
  dailymed_label_present: boolean;
  entity_type: EvidenceEntityType;
  approved_status: ApprovedStatus;
  is_off_label: boolean;
  findings_consistent: boolean;
  sample_size_adequate: boolean;
  robust_human: boolean;
  indirect_evidence_only: boolean;
  only_evidence_is_abstract: boolean;
}

/** CT.gov v2 phase string → ordinal (0 = NA / none). Tolerant of arrays joined
 * with '|' and the EARLY_PHASE1 value. */
export function parsePhase(phase: string | null | undefined): number {
  if (!phase) return 0;
  const u = phase.toUpperCase();
  if (u.includes("PHASE4")) return 4;
  if (u.includes("PHASE3")) return 3;
  if (u.includes("PHASE2")) return 2;
  if (u.includes("EARLY_PHASE1") || u.includes("PHASE1")) return 1;
  return 0; // NA, NOT_APPLICABLE, unrecognized
}

/** Compute the derived/squishy signals from raw aggregates (the conservative
 * rules in the spec table). Pure — same input always yields the same signals. */
export function deriveSignals(raw: RawAggregates): EvidenceSignals {
  const findings_consistent =
    raw.n_meta_analysis >= 1 ||
    raw.n_systematic_review >= 1 ||
    raw.n_rct >= 2 ||
    raw.fda_approved_for_indication;
  const sample_size_adequate = raw.max_enrollment >= ADEQUATE_ENROLLMENT;
  const robust_human =
    (raw.n_rct >= 1 && sample_size_adequate) || raw.n_human_trials >= 2;
  return {
    n_meta_analysis: raw.n_meta_analysis,
    n_systematic_review: raw.n_systematic_review,
    n_rct: raw.n_rct,
    n_human_trials: raw.n_human_trials,
    n_observational: raw.n_observational,
    n_preclinical_only: raw.n_preclinical_only,
    max_trial_phase: raw.max_trial_phase,
    results_posted: raw.results_posted,
    fda_approved_for_indication: raw.fda_approved_for_indication,
    dailymed_label_present: raw.dailymed_label_present,
    entity_type: raw.entity_type,
    approved_status: raw.approved_status,
    is_off_label: raw.is_off_label,
    findings_consistent,
    sample_size_adequate,
    robust_human,
    indirect_evidence_only: false, // reserved (see spec)
    only_evidence_is_abstract: false, // reserved (see spec)
  };
}

/** §9 step (2): ordered tiering rules, return the LOWEST justified tier. */
export function tier(s: EvidenceSignals): EvidenceTier {
  // Intentionally NARROWER than findings_consistent: very_strong demands an
  // actual synthesis or replicated RCTs (with adequate size), so FDA approval
  // alone — which sets findings_consistent — cannot by itself reach very_strong.
  // (If deriveSignals' findings_consistent definition changes, revisit this.)
  const hasSynthesisOrReplication =
    s.n_meta_analysis >= 1 ||
    s.n_systematic_review >= 1 ||
    (s.n_rct >= 2 && s.sample_size_adequate);

  if (
    hasSynthesisOrReplication &&
    s.findings_consistent &&
    (s.fda_approved_for_indication || s.dailymed_label_present)
  ) {
    return "very_strong";
  }

  const goodHumanTrials =
    (s.n_rct >= 1 && s.sample_size_adequate) || s.n_human_trials >= 2;
  if (goodHumanTrials && s.findings_consistent) return "strong";

  // §9 strengthening: ANY human-grade evidence floors at moderate (a lone
  // meta-analysis / SR / RCT must not fall through to unknown).
  if (
    s.n_human_trials >= 1 ||
    s.n_rct >= 1 ||
    s.n_meta_analysis >= 1 ||
    s.n_systematic_review >= 1
  ) {
    return "moderate";
  }

  if (s.n_observational >= 1 || s.indirect_evidence_only) return "weak";
  if (s.n_preclinical_only >= 1) return "very_weak";
  return "unknown";
}

const RANK: Record<EvidenceTier, number> = {
  unknown: -1,
  very_weak: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
  very_strong: 4,
};

/** Return the weaker of two tiers ('unknown' is weakest — absence of evidence).
 * Used by the overrides so they can only ever LOWER a tier, never raise it. */
function weaker(a: EvidenceTier, b: EvidenceTier): EvidenceTier {
  return RANK[a] <= RANK[b] ? a : b;
}

/** §9 step (3): guardrail overrides applied AFTER tiering. Each may ONLY lower.
 * NOTE: the only_evidence_is_abstract and indirect_evidence_only branches are
 * reserved — deriveSignals() always sets them false today (no reliable detector),
 * so via the deriveSignals→scoreSignals pipeline they never fire. They are kept
 * for §9 faithfulness + future use, and exercised directly in the unit tests. */
export function applyOverrides(base: EvidenceTier, s: EvidenceSignals): EvidenceTier {
  let t = base;

  // Off-label use does not inherit the drug's approved-indication strength.
  if (s.is_off_label && t === "very_strong") t = "strong";

  // Conference-abstract-grade evidence cannot exceed moderate.
  if (s.only_evidence_is_abstract && RANK[t] > RANK.moderate) t = "moderate";

  // No human trials but preclinical signal present → animal/mechanistic only.
  if (s.n_human_trials === 0 && s.n_preclinical_only > 0) t = weaker(t, "very_weak");

  // Research-use peptides / chemicals stay conservative absent robust human data.
  if ((s.entity_type === "peptide" || s.approved_status === "research_use") && !s.robust_human) {
    t = weaker(t, "weak");
  }

  return t;
}

/** End-to-end: raw aggregates → final deterministic tier + the materialized
 * signals (so the caller can persist evidence_counts and feed the LLM rationale). */
export function scoreSignals(raw: RawAggregates): {
  tier: EvidenceTier;
  signals: EvidenceSignals;
} {
  const signals = deriveSignals(raw);
  const t = applyOverrides(tier(signals), signals);
  return { tier: t, signals };
}

// ---------------------------------------------------------------------------
// Signal extraction from the typed projections (pure; the scoring script maps
// cloud rows -> EntityEvidence, this turns them into RawAggregates).
// ---------------------------------------------------------------------------

/** A linked ClinicalTrials.gov study, post-backfill. */
export interface TrialRow {
  study_type: string | null; // INTERVENTIONAL | OBSERVATIONAL | EXPANDED_ACCESS
  phase: string | null;
  enrollment: number | null;
  results_first_posted: string | null;
}

/** A linked PubMed article, post-backfill. */
export interface PubMedRow {
  publication_types: string[];
  mesh_terms: string[];
}

/** Everything the engine needs about one entity's linked evidence. */
export interface EntityEvidence {
  entity_type: EvidenceEntityType;
  approved_status: ApprovedStatus;
  label_count: number;
  trials: TrialRow[];
  pubmed: PubMedRow[];
  /** Only set on curated claim-level rows; drug-level defaults false. */
  is_off_label?: boolean;
}

const hasType = (types: string[], re: RegExp) => types.some((t) => re.test(t));
const meshHas = (mesh: string[], term: string) =>
  mesh.some((m) => m.toLowerCase() === term.toLowerCase());

/** Aggregate one entity's linked projections into RawAggregates (§9 step 1).
 * Pure — unit-tested in evidence-scoring.test.ts. */
export function extractSignals(e: EntityEvidence): RawAggregates {
  const interventional = e.trials.filter((t) => t.study_type === "INTERVENTIONAL");
  const observational = e.trials.filter((t) => t.study_type === "OBSERVATIONAL");

  const n_rct = e.pubmed.filter((p) =>
    hasType(p.publication_types, /randomized controlled trial/i)
  ).length;
  const n_meta_analysis = e.pubmed.filter((p) =>
    hasType(p.publication_types, /meta-analysis/i)
  ).length;
  const n_systematic_review = e.pubmed.filter((p) =>
    hasType(p.publication_types, /systematic review/i)
  ).length;
  // Preclinical proxy: animal-tagged with no human tag (§9 n_preclinical_only).
  const n_preclinical_only = e.pubmed.filter((p) =>
    meshHas(p.mesh_terms, "Animals") && !meshHas(p.mesh_terms, "Humans")
  ).length;

  const max_trial_phase = e.trials.reduce((m, t) => Math.max(m, parsePhase(t.phase)), 0);
  const max_enrollment = interventional.reduce((m, t) => Math.max(m, t.enrollment ?? 0), 0);

  return {
    n_meta_analysis,
    n_systematic_review,
    n_rct,
    n_human_trials: interventional.length,
    n_observational: observational.length,
    n_preclinical_only,
    max_trial_phase,
    results_posted: e.trials.some((t) => !!t.results_first_posted),
    max_enrollment,
    fda_approved_for_indication: e.approved_status === "approved",
    dailymed_label_present: e.label_count > 0,
    entity_type: e.entity_type,
    approved_status: e.approved_status,
    is_off_label: e.is_off_label ?? false,
  };
}

/** Project the signals onto the frozen EvidenceCounts surface (§8/packages
 * contract) that the app and the get_drug RPC render. */
export function toEvidenceCounts(s: EvidenceSignals): EvidenceCounts {
  return {
    n_meta_analysis: s.n_meta_analysis,
    n_systematic_review: s.n_systematic_review,
    n_rct: s.n_rct,
    n_human_trials: s.n_human_trials,
    n_observational: s.n_observational,
    n_preclinical_only: s.n_preclinical_only,
    max_trial_phase: s.max_trial_phase > 0 ? `phase_${s.max_trial_phase}` : "none",
  };
}
