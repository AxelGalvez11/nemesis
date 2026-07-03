// Deterministic per-PAPER journal-quality tier (WS-1). PURE functions, no I/O,
// no LLM — the same discipline as evidence-scoring.ts. This module computes a
// Q1–Q4-style tier for ONE paper's venue from free OpenAlex metrics, so the UI
// can show a Consensus-style journal-quality badge without a paid SJR license.
//
// HARD RULE (WS-1 blueprint §8): this module must NEVER be imported by anything
// under supabase/functions/ask/. The tier is a DISPLAY-ONLY signal surfaced in
// the enrich-source side channel + the web layer. If it ever reached
// retrieve.ts / rerank.ts / balanceCitedSlice / enforceCitations / the
// evidence_grade ceiling, the cited set would shift and the /ask answer text
// would move — breaking the frozen-answer byte-identity guarantee.
//
// ============================================================================
// TIER LADDER — this constant block IS the spec (documented, not magic — same
// convention as ADEQUATE_ENROLLMENT = 100 in evidence-scoring.ts).
//
// The ladder buckets OpenAlex `summary_stats["2yr_mean_citedness"]` (a venue's
// mean citations-per-work over the last 2 years) into quartile-style bands. It
// is a TRANSPARENT PROXY for SJR quartiles, NOT SJR itself. Thresholds are a
// defensible first cut; recalibration is a small diff in this block.
// ============================================================================

/** Top-impact venues (NEJM/Lancet-class): mean_citedness_2yr at/above this → q1. */
export const Q1_CITEDNESS = 8.0;
/** Strong venues: mean_citedness_2yr at/above this (and below Q1) → q2. */
export const Q2_CITEDNESS = 3.0;
/** Solid venues: mean_citedness_2yr at/above this (and below Q2) → q3. */
export const Q3_CITEDNESS = 1.0;

/** Deterministic journal-quality tier for one PAPER's venue.
 *  q1 = top quartile by OpenAlex 2-year mean citedness, q4 = bottom; `unranked`
 *  = no venue metric available (NEVER guessed — the conservative default). */
export type JournalTier = "q1" | "q2" | "q3" | "q4" | "unranked";

/** Raw venue signals read straight off OpenAlex `/sources` + `/works` (no derivation).
 *  Every field optional/nullable — the API is sparse and the tier degrades to
 *  "unranked" when the impact metric is absent (conservative default). */
export interface PaperQualityInputs {
  /** OpenAlex source summary_stats["2yr_mean_citedness"] — the impact metric we bucket on. */
  mean_citedness_2yr: number | null;
  /** OpenAlex source summary_stats.h_index — carried for future tie-break / sanity floor only. */
  h_index: number | null;
  /** OpenAlex source.is_in_doaj — vetted, anti-predatory OA journal (positive-only, display only). */
  is_in_doaj: boolean;
  /** OpenAlex source.is_oa / work.open_access.is_oa — open access (informational only). */
  is_oa: boolean;
}

/** The per-paper signal object the wire carries (all additive, all optional on Citation). */
export interface PaperQuality {
  tier: JournalTier;
  /** The venue's 2yr mean citedness the tier was bucketed from, for transparency. */
  mean_citedness_2yr: number | null;
  is_in_doaj: boolean;
  is_oa: boolean;
}

/** Pure tier ladder. Branches SOLELY on `mean_citedness_2yr`.
 *
 *  `is_in_doaj` / `is_oa` are DELIBERATELY not read here: that is how the
 *  "positive-only, never downgrade" doctrine is encoded — a modifier that never
 *  touches the ladder cannot lower (or raise) the citedness tier. They flow
 *  through PaperQuality for display only.
 *
 *  `mean_citedness_2yr` of null OR 0 → "unranked": no false tier when the metric
 *  is absent or the venue has no measurable 2yr impact (the same never-fabricate
 *  discipline as studyTypeLabel returning undefined). */
export function journalTier(i: PaperQualityInputs): JournalTier {
  const m = i.mean_citedness_2yr;
  if (m === null || !(m > 0)) return "unranked"; // null / 0 / negative / NaN → conservative default
  if (m >= Q1_CITEDNESS) return "q1";
  if (m >= Q2_CITEDNESS) return "q2";
  if (m >= Q3_CITEDNESS) return "q3";
  return "q4";
}

/** End-to-end wrapper: inputs → the per-paper PaperQuality signal. The tier is
 *  bucketed by journalTier(); mean_citedness_2yr / is_in_doaj / is_oa pass
 *  through verbatim (no derivation). Pure — same input always yields the same output. */
export function computePaperQuality(i: PaperQualityInputs): PaperQuality {
  return {
    tier: journalTier(i),
    mean_citedness_2yr: i.mean_citedness_2yr,
    is_in_doaj: i.is_in_doaj,
    is_oa: i.is_oa,
  };
}
