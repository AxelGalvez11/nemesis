// Phase 4 — curated claim-level evidence rows (§9 / doc-12 worked examples).
//
// AC9 requires "off-label < approved", which a drug-level score CANNOT express
// (a drug's own score is its approved use). The discriminator is a claim-level
// row. We lack per-claim retrieval, so — per the advisor — the worked-example
// claims are CURATED: the curator asserts the claim-scoped evidence posture, and
// the TIER is still computed deterministically by scoreSignals() from it (the
// tier is never hand-set). claim_text + source_ids keep it auditable.
//
// The canonical pair: semaglutide for weight management (approved → very_strong)
// vs semaglutide for gym/physique performance (off-label, no evidence → unknown)
// — same entity, strictly lower tier, exactly AC9's "off-label < approved".

import type { RawAggregates } from "../packages/shared/src/evidence-scoring.ts";

export interface CuratedClaim {
  /** normalized entity name to attach the claim to */
  entity: string;
  /** the specific indication/claim being scored */
  claim: string;
  off_label: boolean;
  /** curated claim-scoped signals. entity_type/approved_status/is_off_label are
   * NOT curatable — they are entity-authoritative (from drug_entities) + the
   * off_label flag above, so a claim cannot escape the peptide/research-use cap. */
  evidence: Omit<Partial<RawAggregates>, "entity_type" | "approved_status" | "is_off_label">;
  note?: string;
}

export const CURATED_CLAIMS: CuratedClaim[] = [
  {
    entity: "semaglutide",
    claim: "chronic weight management",
    off_label: false,
    evidence: {
      fda_approved_for_indication: true,
      dailymed_label_present: true,
      n_meta_analysis: 2,
      n_systematic_review: 1,
      n_rct: 4,
      n_human_trials: 6,
      max_trial_phase: 3,
      max_enrollment: 1900,
      results_posted: true,
    },
    note: "STEP program RCTs + meta-analyses; FDA-approved (Wegovy). → very_strong.",
  },
  {
    entity: "semaglutide",
    claim: "gym / physique performance enhancement",
    off_label: true,
    evidence: {
      // Not approved for this use; no trials evaluate physique performance.
      fda_approved_for_indication: false,
      dailymed_label_present: false,
      n_rct: 0,
      n_human_trials: 0,
      n_observational: 0,
      n_preclinical_only: 0,
    },
    note: "No clinical evidence for a performance/physique indication. → unknown.",
  },
  {
    entity: "bpc-157",
    claim: "tendon/ligament healing in humans",
    off_label: true,
    evidence: {
      fda_approved_for_indication: false,
      dailymed_label_present: false,
      n_human_trials: 0,
      n_rct: 0,
      n_preclinical_only: 5,
    },
    note: "Animal/preclinical only; no robust human trials. Peptide. → very_weak.",
  },
];
