// Study-type label (publishable-reports / evidence-card UX). PURE, deterministic.
//
// Derives a short, human-readable study-type badge ("Meta-analysis",
// "Randomized controlled trial", "Interventional trial · Phase 3", ...) from
// metadata the providers ALREADY capture: PubMed <PublicationType> and
// ClinicalTrials.gov study_type / phase. We never ask the LLM what kind of study
// a citation is — the label is computed verbatim from these fields or omitted.
//
// Priority is strongest-evidence-first: a work tagged both "Meta-Analysis" and
// "Journal Article" reads as a meta-analysis. When nothing identifiable is
// present we return undefined so the card shows NO badge (never a false one).

/** The minimal shape the label needs. `Citation` (answer.ts) carries these as
 *  optional fields, so a Citation is structurally assignable here. */
export interface StudyTypeFields {
  /** PubMed PublicationType list, e.g. ["Meta-Analysis", "Journal Article"]. */
  publication_types?: string[];
  /** ClinicalTrials.gov study type, e.g. "INTERVENTIONAL" | "OBSERVATIONAL". */
  study_type?: string;
  /** Trial phase, Roman from PubMed ("Phase III") or CT.gov form ("PHASE3"). */
  trial_phase?: string;
}

const ROMAN_PHASE: Readonly<Record<string, string>> = {
  IV: "4",
  III: "3",
  II: "2",
  I: "1",
};

/** Extract an Arabic phase number from either an Arabic form ("PHASE3", "Phase 2")
 *  or a Roman form ("Phase III"). Returns undefined when no phase is present. */
function parsePhase(raw: string): string | undefined {
  const arabic = raw.match(/(\d)/);
  if (arabic?.[1]) return arabic[1];
  const roman = raw.toUpperCase().match(/PHASE\s*(IV|III|II|I)\b/);
  const numeral = roman?.[1];
  if (numeral) return ROMAN_PHASE[numeral];
  return undefined;
}

/**
 * The single most informative study-type label, or undefined when nothing is
 * identifiable (no false badge). PubMed publication types take precedence (they
 * are the strongest signal); ClinicalTrials.gov study_type is the fallback.
 */
export function studyTypeLabel(c: StudyTypeFields): string | undefined {
  const pubTypes = c.publication_types ?? [];
  const lower = pubTypes.map((t) => t.toLowerCase());
  const has = (needle: string) => lower.some((t) => t.includes(needle));

  // Strongest-evidence-first over PubMed publication types.
  if (has("meta-analysis")) return "Meta-analysis";
  if (has("systematic review")) return "Systematic review";
  if (has("randomized controlled trial")) return "Randomized controlled trial";

  // "Clinical Trial" (optionally "..., Phase III") — surface the phase if present.
  const clinicalTrial = pubTypes.find((t) => /clinical trial/i.test(t));
  if (clinicalTrial) {
    const phase = parsePhase(clinicalTrial);
    return phase ? `Clinical trial · Phase ${phase}` : "Clinical trial";
  }

  if (has("review")) return "Review";

  // Fallback: ClinicalTrials.gov study_type (+ phase from a separate field).
  const studyType = c.study_type?.toUpperCase();
  if (studyType === "INTERVENTIONAL") {
    const phase = c.trial_phase ? parsePhase(c.trial_phase) : undefined;
    return phase ? `Interventional trial · Phase ${phase}` : "Interventional trial";
  }
  if (studyType === "OBSERVATIONAL") return "Observational study";

  return undefined;
}
