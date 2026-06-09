// Deterministic evidence-grade ceiling.
//
// /ask ships `gen.raw.evidence_grade` — a grade the LLM assigns to its own answer.
// A generative model self-grading its own confidence is exactly the wrong thing to
// trust on a clinical product: it has every incentive to sound authoritative. The
// §9 evidence-scoring engine (packages/shared/src/evidence-scoring.ts) instead
// computes an auditable tier from COUNTABLE signals (number of RCTs, meta-analyses,
// systematic reviews, trial phase) and stores it per drug in `evidence_scores`.
//
// This module lets that deterministic tier act as a CEILING on the LLM's self-grade:
// it can only ever LOWER the grade, never raise it (mirrors the engine's own
// applyOverrides, which is also one-directional). If the model says "strong" but the
// countable evidence is "weak", the answer is graded "weak". If the model is already
// at or below the deterministic tier, nothing changes. If we have no stored tier for
// the entity, we leave the LLM grade untouched (graceful — never worse than today).
//
// Why a ceiling and not a replacement: the stored tier is drug-LEVEL (claim_text IS
// NULL). A specific question may be about a narrow claim with thinner evidence than
// the drug overall, so the drug-level tier is a safe UPPER bound but not a precise
// grade for every question. Lowering is always defensible; raising is not.

import type { EvidenceGrade } from "../../../packages/shared/src/answer.ts";

// Strength ladder, weakest -> strongest. Only these five tiers participate in the
// ceiling comparison.
//
// "not_applicable" is genuinely off-ladder (it's the emergency/sourcing-refusal grade
// and never reaches this path). "unknown" is the subtler case: the §9 engine emits it
// ONLY when it finds zero gradeable evidence (evidence-scoring.ts tier(), final branch),
// and the engine's own RANK treats it as the FLOOR (weaker than very_weak). So being
// fully faithful to §9 would have a stored "unknown" lower the grade to the floor.
//
// We deliberately hold it OFF the ladder for now (never lowers). A stored "unknown"
// depends on the pubmed_articles projection that feeds extractSignals; until that
// projection is confirmed mature in prod, an "unknown" could be a FALSE negative (real
// evidence the projection hasn't captured yet), and lowering a correct answer to the
// floor on a false "unknown" would degrade it. Keeping "unknown" off-ladder makes this
// first ship strictly non-degrading. TIGHTEN to floor-lowering once the projection's
// coverage is verified — tracked as the credibility-wave follow-up.
const STRENGTH_RANK: Partial<Record<EvidenceGrade, number>> = {
  very_weak: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
  very_strong: 4,
};

/**
 * Apply the deterministic tier as a ceiling on the LLM's self-assigned grade.
 *
 * Override happens ONLY when both grades sit on the strength ladder AND the
 * deterministic tier is strictly weaker than the LLM grade. In every other case
 * (no stored tier, an off-ladder "unknown"/"not_applicable" on either side, or a
 * deterministic tier that is equal-or-stronger) the LLM grade is returned unchanged.
 * This guarantees the function can only ever lower a grade, never inflate one, and
 * that a missing or non-strength stored value degrades gracefully to current behavior.
 */
export function applyGradeCeiling(
  llmGrade: EvidenceGrade,
  deterministicTier: EvidenceGrade | null,
): EvidenceGrade {
  if (deterministicTier === null) return llmGrade;

  const llmRank = STRENGTH_RANK[llmGrade];
  const detRank = STRENGTH_RANK[deterministicTier];

  // Either side off the ladder (unknown / not_applicable) -> no comparison, keep LLM.
  if (llmRank === undefined || detRank === undefined) return llmGrade;

  // Ceiling: take the weaker of the two. Only ever lowers.
  return detRank < llmRank ? deterministicTier : llmGrade;
}

interface EvidenceScoreRow {
  score: EvidenceGrade;
}

/** Injectable for tests; defaults to the global fetch. */
type FetchFn = typeof fetch;

/**
 * Read the offline-computed drug-level deterministic tier for a resolved entity.
 *
 * Reads `evidence_scores` (drug-level row: entity_type='drug', claim_text IS NULL)
 * via PostgREST. Returns the stored tier, or null when there is no row, the request
 * fails, or anything is malformed — every failure mode is a graceful null so the
 * caller falls back to the LLM grade rather than degrading the answer. The score
 * column is CHECK-constrained to the six EvidenceTier values in migration 0109, all
 * of which are valid EvidenceGrade values, so the cast is sound.
 */
export async function fetchStoredEvidenceGrade(
  entityId: string,
  sbUrl: string,
  serviceKey: string,
  fetchFn: FetchFn = fetch,
): Promise<EvidenceGrade | null> {
  try {
    const url = new URL(`${sbUrl}/rest/v1/evidence_scores`);
    url.searchParams.set("entity_id", `eq.${entityId}`);
    url.searchParams.set("entity_type", "eq.drug");
    url.searchParams.set("claim_text", "is.null");
    url.searchParams.set("select", "score");
    url.searchParams.set("limit", "1");
    const res = await fetchFn(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) return null;
    const rows = await res.json() as EvidenceScoreRow[];
    const score = rows[0]?.score;
    return score ?? null;
  } catch {
    // Best-effort: a read failure must never degrade the answer.
    return null;
  }
}
