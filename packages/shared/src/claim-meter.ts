// Per-claim "Evidence meter" for the Verify-a-claim view. For ONE answer claim, grade the evidence
// backing it from the STUDY DESIGN + evidence-role of the sources that claim cited — the rigor axis,
// NOT the lexical support_score (which only measures how well a source's wording matched the sentence).
//
// HONESTY DISCIPLINE (mirrors science-state.ts / evidence-grade.ts):
//   • POSITIVE-ONLY. A strength label is only ever raised by metadata that is PRESENT (a synthesis, an
//     RCT, a trial). When a claim's sources carry no rigor metadata we return "unrated" (show the source
//     count, no strength badge) rather than inventing "weak" — study-type tags are sparse, so absence is
//     as likely a metadata gap as genuinely-thin evidence, and a false "weak" on a solid claim destroys
//     the trust the meter exists to build.
//   • Conservative ladder aligned with §9 evidence-scoring: a SYNTHESIS (meta-analysis / systematic
//     review) is required for "strong"; a single RCT / trial / official label is "moderate"; only
//     observational / case-report / consumer-guidance backing is "limited".
//   • NO LLM judgement — counts of deterministic metadata only.

import type { Citation, SourceEvidenceRole } from "./answer.ts";

export type ClaimStrength = "strong" | "moderate" | "limited" | "unrated";

export interface ClaimMeter {
  strength: ClaimStrength;
  /** How many of the claim's cited sources were resolvable (the denominator of the basis line). */
  sources: number;
  /** Counts of the rigor tiers found among this claim's sources (for an auditable basis line). */
  syntheses: number;
  trials: number;
  labels: number;
  observational: number;
  /** Honest one-line basis, e.g. "Backed by 1 systematic review and 2 clinical trials". */
  rationale: string;
}

// Only rigor-bearing metadata is consulted — accept any citation-shaped object.
type CitationRigor = Pick<
  Citation,
  "evidence_role" | "publication_types" | "study_type" | "trial_phase"
>;

// Small local study-type predicates (kept self-contained; science-state.ts uses the same shapes).
const hasType = (pt: string[] | undefined, re: RegExp): boolean => !!pt?.some((t) => re.test(t));
const isSynthesisPT = (pt?: string[]): boolean => hasType(pt, /\b(meta-?analysis|systematic review)\b/i);
const isRctPT = (pt?: string[]): boolean => hasType(pt, /\brandomized controlled trial\b/i);
const isTrialPhase = (phase?: string): boolean => !!phase && /phase[\s_]?(1|2|3|4|i{1,3}|iv)\b/i.test(phase);

const roleIs = (c: CitationRigor, role: SourceEvidenceRole): boolean => c.evidence_role === role;

/** A synthesis (meta-analysis / systematic review) backs this source. */
function isSynthesis(c: CitationRigor): boolean {
  return roleIs(c, "systematic_review") || isSynthesisPT(c.publication_types);
}
/** A trial or official label backs this source (moderate-tier rigor). */
function isTrialOrLabel(c: CitationRigor): boolean {
  return (
    roleIs(c, "randomized_trial") ||
    roleIs(c, "clinical_trial") ||
    roleIs(c, "official_label") ||
    isRctPT(c.publication_types) ||
    c.study_type === "INTERVENTIONAL" ||
    isTrialPhase(c.trial_phase)
  );
}
/** Observational / case-report / consumer-guidance / adverse-event signal (limited-tier rigor). */
function isLimitedTier(c: CitationRigor): boolean {
  return (
    roleIs(c, "observational_study") ||
    roleIs(c, "case_report") ||
    roleIs(c, "consumer_health") ||
    roleIs(c, "adverse_event_signal") ||
    c.study_type === "OBSERVATIONAL"
  );
}

function isLabel(c: CitationRigor): boolean {
  return roleIs(c, "official_label");
}

function joinCounts(parts: Array<{ n: number; one: string; many: string }>): string {
  const shown = parts.filter((p) => p.n > 0).map((p) => `${p.n} ${p.n === 1 ? p.one : p.many}`);
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1) ?? ""}`;
}

/**
 * Grade one claim from the sources it cited. Returns null when the claim cited nothing resolvable
 * (nothing to grade); otherwise a meter whose `strength` is positive-only ("unrated" when no rigor
 * metadata is present, never a fabricated weak grade).
 */
export function claimMeter(cites: ReadonlyArray<CitationRigor>): ClaimMeter | null {
  const sources = cites.length;
  if (sources === 0) return null;

  let syntheses = 0;
  let trials = 0;
  let labels = 0;
  let observational = 0;
  for (const c of cites) {
    if (isSynthesis(c)) syntheses++;
    else if (isTrialOrLabel(c)) {
      trials++;
      if (isLabel(c)) labels++;
    } else if (isLimitedTier(c)) observational++;
  }

  const strength: ClaimStrength =
    syntheses > 0 ? "strong" : trials > 0 ? "moderate" : observational > 0 ? "limited" : "unrated";

  const counts = joinCounts([
    { n: syntheses, one: "systematic review", many: "systematic reviews" },
    { n: trials - labels, one: "clinical trial", many: "clinical trials" },
    { n: labels, one: "official label", many: "official labels" },
    { n: observational, one: "observational/consumer source", many: "observational/consumer sources" },
  ]);

  const rationale =
    strength === "unrated"
      ? `Cited by ${sources} source${sources === 1 ? "" : "s"} (study design not tagged)`
      : `Backed by ${counts}`;

  return { strength, sources, syntheses, trials, labels, observational, rationale };
}

/** Short display label for a strength (for the meter chip). */
export function claimStrengthLabel(s: ClaimStrength): string {
  switch (s) {
    case "strong":
      return "Strong evidence";
    case "moderate":
      return "Moderate evidence";
    case "limited":
      return "Limited evidence";
    case "unrated":
      return "Cited";
  }
}
