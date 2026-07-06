import type {
  AnswerPoint,
  Citation,
  EvidenceGrade,
} from "../../../../packages/shared/src/answer.ts";
import {
  citationToEvidenceLink,
  type DiscoveryGapDimension,
  type DiscoveryGapSeverity,
  type DiscoveryReport,
  discoveryTitle,
  normalizeDiscoveryClaim,
  type ResearchGap,
  type ResearchHypothesis,
  type StudyCharacteristic,
  type StudyDesignType,
  type SuggestedStudyDesign,
} from "../../../../packages/shared/src/discovery.ts";
import type {
  GapStatement,
  ResearchReport,
} from "../../../../packages/shared/src/research.ts";

interface CitedPoint {
  section: string;
  point: AnswerPoint;
}

const STOPWORDS = new Set([
  "a",
  "about",
  "and",
  "are",
  "does",
  "for",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "what",
  "with",
]);

export function describeStudyType(citation: Citation): string {
  const types = citation.publication_types ?? [];
  if (types.some((t) => /meta-analysis|systematic review/i.test(t))) {
    return "systematic review / meta-analysis";
  }
  if (types.some((t) => /randomized controlled trial/i.test(t))) {
    return "randomized controlled trial";
  }
  if (citation.source_type === "clinicaltrials") {
    const kind = (citation.study_type ?? "").toUpperCase();
    if (kind === "INTERVENTIONAL") {
      return citation.trial_phase
        ? `interventional clinical trial (${citation.trial_phase})`
        : "interventional clinical trial";
    }
    if (kind === "OBSERVATIONAL") return "observational clinical trial";
    return "clinical trial registry record";
  }
  if (/openfda|dailymed|fda/i.test(citation.source_type)) {
    return "official drug label";
  }
  if (types.some((t) => /review/i.test(t))) return "review article";
  if (types.some((t) => /case report/i.test(t))) return "case report";
  if (types.some((t) => /cohort|observational/i.test(t))) {
    return "observational study";
  }
  return citation.source_type.replace(/_/g, " ");
}

export function buildDiscoveryReport(
  report: ResearchReport,
  generatedAt = new Date().toISOString(),
): DiscoveryReport {
  const citationsByTag = new Map(report.citations.map((c) => [c.chunk_tag, c]));
  const citedPoints = collectCitedPoints(report);
  const claims = citedPoints.map(({ point }, i) => {
    const evidence = unique(point.citation_ids)
      .map((tag) => citationsByTag.get(stripTag(tag)))
      .filter((c): c is Citation => !!c)
      .map(citationToEvidenceLink);
    const hasConflict = evidence.some((e) => e.relation === "conflicts");
    const hasSupport = evidence.some((e) =>
      e.relation === "supports" || e.relation === "partial"
    );
    return {
      id: `claim-${i + 1}`,
      claim_text: point.text,
      normalized_claim: normalizeDiscoveryClaim(point.text),
      verdict: hasConflict
        ? "mixed" as const
        : hasSupport
        ? "likely" as const
        : "unknown" as const,
      confidence: confidenceForGrade(report.evidence_grade),
      evidence_grade: report.evidence_grade,
      evidence,
      rationale: rationaleForEvidence(evidence.length, hasConflict),
    };
  });

  const studyCharacteristics = buildStudyCharacteristics(report, citedPoints);
  const researchGaps = buildResearchGaps(report, claims.map((c) => c.id));
  const hypotheses = buildHypotheses(
    report,
    researchGaps,
    claims.map((c) => c.claim_text),
  );
  const studyDesigns = buildStudyDesigns(report, researchGaps, hypotheses);

  return {
    project_title: discoveryTitle(report.question),
    question: report.question,
    summary: report.summary,
    evidence_meter: report.evidence_grade,
    claims,
    study_characteristics: studyCharacteristics,
    research_gaps: researchGaps,
    hypotheses,
    study_designs: studyDesigns,
    monitor_terms: monitorTerms(report.question),
    generated_at: generatedAt,
  };
}

function collectCitedPoints(report: ResearchReport): CitedPoint[] {
  return report.sections.flatMap((section) =>
    section.points
      .filter((point) => point.citation_ids.length > 0)
      .map((point) => ({ section: section.heading, point }))
  );
}

function buildStudyCharacteristics(
  report: ResearchReport,
  citedPoints: CitedPoint[],
): StudyCharacteristic[] {
  return report.citations.map((citation) => {
    const outcomes = unique(
      citedPoints
        .filter(({ point }) =>
          point.citation_ids.map(stripTag).includes(citation.chunk_tag)
        )
        .map(({ section }) => section),
    );
    return {
      citation_tag: citation.chunk_tag,
      source_id: citation.source_id,
      title: citation.title ?? "Untitled source",
      study_type: describeStudyType(citation),
      population: undefined,
      sample_size: undefined,
      intervention: undefined,
      comparator: undefined,
      duration: undefined,
      outcomes,
      limitations: limitationsForCitation(citation),
    };
  });
}

function buildResearchGaps(
  report: ResearchReport,
  claimIds: string[],
): ResearchGap[] {
  const gaps = report.gaps ?? [];
  if (gaps.length > 0) {
    return gaps.map((gap, i) => ({
      id: `gap-${i + 1}`,
      dimension: mapGapDimension(gap.dimension),
      severity: severityForGap(gap),
      description: gap.text,
      rationale: denominatorRationale(gap),
      related_claim_ids: claimIds.slice(0, 3),
      source_tags: gap.denominator.providers_searched,
    }));
  }

  return report.uncertainties.map((u, i) => ({
    id: `gap-${i + 1}`,
    dimension: "publication",
    severity: "medium",
    description: u.text,
    rationale:
      "This uncertainty was surfaced by the cited report and should be reviewed before stronger claims are made.",
    related_claim_ids: claimIds.slice(0, 3),
    source_tags: [],
  }));
}

function buildHypotheses(
  report: ResearchReport,
  gaps: ResearchGap[],
  claimTexts: string[],
): ResearchHypothesis[] {
  const basis = claimTexts.slice(0, 2);
  return gaps.map((gap, i) => ({
    id: `hypothesis-${i + 1}`,
    gap_id: gap.id,
    hypothesis: hypothesisForGap(report.question, gap),
    why_plausible: basis.length > 0
      ? basis.map((text) => `Existing cited evidence says: ${text}`)
      : [
        "The question has enough retrieved context to justify a focused follow-up study.",
      ],
    evidence_basis: basis,
    uncertainty: gap.description,
    priority: gap.severity,
  }));
}

function buildStudyDesigns(
  report: ResearchReport,
  gaps: ResearchGap[],
  hypotheses: ResearchHypothesis[],
): SuggestedStudyDesign[] {
  return hypotheses.map((hypothesis, i) => {
    const gap = gaps.find((g) => g.id === hypothesis.gap_id) ?? gaps[0];
    const designType = designTypeForGap(gap);
    return {
      id: `design-${i + 1}`,
      design_type: designType,
      research_question: studyQuestionForGap(report.question, gap),
      hypothesis: hypothesis.hypothesis,
      population:
        "The human population named or implied by the research question.",
      intervention:
        "The intervention, exposure, or strategy named in the research question.",
      comparator: comparatorForDesign(designType),
      primary_endpoint: primaryEndpointForGap(gap),
      secondary_endpoints: [
        "Safety/tolerability",
        "Subgroup response",
        "Adherence or exposure fidelity",
      ],
      duration: durationForGap(gap),
      sample_size_notes:
        "Estimate power after selecting the primary endpoint and minimum important difference.",
      safety_monitoring: [
        "Adverse events",
        "Dropouts",
        "Clinically relevant lab or symptom signals",
      ],
      feasibility: "moderate",
      ethics:
        "Use independent review, informed consent where applicable, and avoid individual treatment instructions.",
    };
  });
}

function confidenceForGrade(
  grade: EvidenceGrade,
): "high" | "moderate" | "low" | "very_low" {
  if (grade === "very_strong" || grade === "strong") return "high";
  if (grade === "moderate") return "moderate";
  if (grade === "weak" || grade === "very_weak") return "low";
  return "very_low";
}

function severityForGap(gap: GapStatement): DiscoveryGapSeverity {
  if (
    gap.type === "no_rct" || gap.type === "no_human_trial" ||
    gap.type === "conflicting"
  ) return "high";
  if (gap.type === "no_synthesis" || gap.type === "sparse") return "medium";
  return "low";
}

function mapGapDimension(
  dimension: GapStatement["dimension"],
): DiscoveryGapDimension {
  if (dimension === "long_term") return "duration";
  if (dimension === "synthesis") return "publication";
  return dimension;
}

function designTypeForGap(gap: ResearchGap | undefined): StudyDesignType {
  if (!gap) return "prospective_cohort";
  if (gap.dimension === "safety") return "pharmacovigilance_study";
  if (gap.dimension === "mechanism") return "mechanistic_lab_study";
  if (gap.dimension === "duration") return "prospective_cohort";
  if (gap.dimension === "publication") {
    return "individual_participant_meta_analysis";
  }
  return "randomized_controlled_trial";
}

function studyQuestionForGap(
  question: string,
  gap: ResearchGap | undefined,
): string {
  const cleaned = question.replace(/\?+$/g, "");
  if (!gap) return `What study would best reduce uncertainty about ${cleaned}?`;
  return `What study would best address this ${
    gap.dimension.replace(/_/g, " ")
  } gap for ${cleaned}?`;
}

function hypothesisForGap(question: string, gap: ResearchGap): string {
  const cleaned = question.replace(/\?+$/g, "");
  if (gap.dimension === "study_design") {
    return `A properly controlled human study could clarify whether ${cleaned} has a reproducible effect.`;
  }
  if (gap.dimension === "safety") {
    return `Systematic safety monitoring could clarify the risk profile for ${cleaned}.`;
  }
  if (gap.dimension === "duration") {
    return `Longer follow-up could clarify whether the apparent effects of ${cleaned} persist over time.`;
  }
  return `A focused study could reduce the main uncertainty around ${cleaned}.`;
}

function primaryEndpointForGap(gap: ResearchGap | undefined): string {
  if (!gap) return "Primary outcome selected from the research question.";
  if (gap.dimension === "safety") {
    return "Pre-specified safety signal or adverse-event rate.";
  }
  if (gap.dimension === "mechanism") {
    return "Mechanistic biomarker or validated pathway readout.";
  }
  if (gap.dimension === "duration") {
    return "Durable effect at the longest planned follow-up.";
  }
  return "Validated outcome matching the claim being tested.";
}

function durationForGap(gap: ResearchGap | undefined): string {
  if (gap?.dimension === "duration") {
    return "Long enough to directly test durability of effect.";
  }
  if (gap?.dimension === "safety") {
    return "Long enough to capture plausible adverse-event timing.";
  }
  return "Long enough to measure the primary endpoint without overclaiming long-term effects.";
}

function comparatorForDesign(type: StudyDesignType): string {
  if (type === "pharmacovigilance_study") {
    return "Matched unexposed or alternative-exposure group.";
  }
  if (type === "mechanistic_lab_study") {
    return "Negative and positive controls where feasible.";
  }
  if (type === "individual_participant_meta_analysis") {
    return "Eligible prior studies with harmonized comparator definitions.";
  }
  return "Placebo, standard care, or active comparator matched to the question.";
}

function limitationsForCitation(citation: Citation): string[] {
  const type = describeStudyType(citation);
  const limitations: string[] = [];
  if (type === "review article") {
    limitations.push("Review source; not a primary intervention trial.");
  }
  if (type === "official drug label") {
    limitations.push(
      "Official label; not designed as a comparative efficacy trial.",
    );
  }
  if (!citation.published_date) {
    limitations.push(
      "Publication/effective date unavailable in retrieved metadata.",
    );
  }
  return limitations;
}

function denominatorRationale(gap: GapStatement): string {
  const providers = gap.denominator.providers_searched.length > 0
    ? gap.denominator.providers_searched.join(", ")
    : "the searched sources";
  return `Scoped to this run: ${gap.denominator.n_sources} source(s) from ${providers}.`;
}

function rationaleForEvidence(count: number, hasConflict: boolean): string {
  if (hasConflict) {
    return `This claim has ${count} linked source(s), including conflicting evidence.`;
  }
  return `This claim has ${count} linked source(s) from the retrieved evidence set.`;
}

function monitorTerms(question: string): string[] {
  const normalized = question.toLowerCase().replace(/-/g, " ").replace(
    /[^a-z0-9\s]/g,
    " ",
  );
  const tokens = normalized.split(/\s+/g).filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    if (!STOPWORDS.has(token) && token.length > 2 && !out.includes(token)) {
      out.push(token);
    }
  }
  const sleepIdx = tokens.findIndex((t, i) =>
    t === "sleep" && tokens[i + 1] === "deprived"
  );
  if (sleepIdx >= 0) {
    const phrase = tokens[sleepIdx + 2] === "adults"
      ? "sleep deprived adults"
      : "sleep deprived";
    for (const token of ["sleep", "deprived", "adults"]) {
      const i = out.indexOf(token);
      if (i >= 0) out.splice(i, 1);
    }
    out.push(phrase);
  }
  return out.slice(0, 6);
}

function stripTag(tag: string): string {
  return tag.replace(/[[\]\s]/g, "");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
