// Deterministic source/support ratings for the Evidence panel.
//
// This does NOT ask the model to rate its own work. It combines (a) source-role metadata
// (FDA label, RCT, systematic review, etc.) with (b) whether the citation layer found a verbatim
// supporting passage for the claim(s) that cited the source. It is a transparent UI signal, not a
// replacement for NLI/second-pass semantic verification.

import type {
  AnswerPoint,
  AnswerSections,
  Citation,
  SourceEvidenceRole,
  SourceSupportLevel,
} from "../../../packages/shared/src/answer.ts";
import type { ClaimRelation } from "../../../packages/shared/src/claim-relation.ts";
import type { RetrievedChunk } from "./citation.ts";

type RatingFields = Pick<
  Citation,
  | "support_level"
  | "support_score"
  | "evidence_role"
  | "evidence_weight"
  | "support_reason"
  | "claim_relation"
  | "relation_reason"
>;

const STOP = new Set([
  "the", "a", "an", "of", "in", "on", "and", "or", "to", "for", "with", "was", "were", "is", "are",
  "be", "been", "by", "that", "this", "as", "at", "from", "than", "may", "can", "could", "also",
  "it", "its", "their", "into", "about", "what", "which", "when", "how", "does", "do", "did",
]);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3 && !STOP.has(t));
}

function overlapScore(claim: string, sourceText: string): number {
  const claimTokens = new Set(tokens(claim));
  if (claimTokens.size === 0 || !sourceText.trim()) return 0;
  const sourceTokens = new Set(tokens(sourceText));
  let matched = 0;
  for (const t of claimTokens) if (sourceTokens.has(t)) matched++;
  return matched / claimTokens.size;
}

function hasSupportQuote(point: AnswerPoint, tag: string): boolean {
  return (point.support ?? []).some((s) => s.citation_tag === tag && s.quote.trim().length > 0);
}

function citedPointsForTag(sections: AnswerSections, tag: string): AnswerPoint[] {
  // Include the gated claim-check section so contradicting-evidence sources get support ratings too
  // (absent on a normal answer → unchanged).
  const points = [...sections.what_we_know, ...sections.safety_notes, ...(sections.what_contradicts ?? [])];
  return points.filter((p) => p.citation_ids.includes(tag));
}

export function evidenceRole(c: Pick<RetrievedChunk, "provider" | "publication_types" | "study_type">): {
  role: SourceEvidenceRole;
  weight: number;
  reason: string;
} {
  const provider = c.provider.toLowerCase();
  const types = (c.publication_types ?? []).map((t) => t.toLowerCase());
  const has = (needle: string) => types.some((t) => t.includes(needle));

  if (provider.includes("openfda") || provider.includes("dailymed") || provider.includes("label")) {
    return { role: "official_label", weight: 92, reason: "Official regulatory label/source." };
  }
  if (has("meta-analysis") || has("systematic review")) {
    return { role: has("meta-analysis") ? "systematic_review" : "systematic_review", weight: 88, reason: "Evidence synthesis publication type." };
  }
  if (has("randomized controlled trial")) {
    return { role: "randomized_trial", weight: 82, reason: "Randomized controlled trial publication type." };
  }
  if (has("clinical trial") || provider.includes("clinicaltrials") || c.study_type === "INTERVENTIONAL") {
    return { role: "clinical_trial", weight: 74, reason: "Clinical trial record or publication." };
  }
  if (has("observational") || c.study_type === "OBSERVATIONAL") {
    return { role: "observational_study", weight: 58, reason: "Observational evidence." };
  }
  if (has("case report")) {
    return { role: "case_report", weight: 42, reason: "Case report evidence." };
  }
  if (has("review")) {
    return { role: "review_article", weight: 62, reason: "Narrative review/background synthesis." };
  }
  if (provider.includes("medlineplus")) {
    return { role: "consumer_health", weight: 76, reason: "NLM consumer-health guidance." };
  }
  if (provider.includes("faers")) {
    return { role: "adverse_event_signal", weight: 36, reason: "Adverse-event signal; useful for safety surveillance, not causality." };
  }
  if (provider.includes("pubmed") || provider.includes("europepmc") || provider.includes("openalex")) {
    return { role: "research_article", weight: 52, reason: "Research article metadata; study design not fully classified." };
  }
  return { role: "background", weight: 30, reason: "Background source." };
}

function supportLevel(score: number, cited: boolean): SourceSupportLevel {
  if (!cited) return "reviewed";
  if (score >= 78) return "direct";
  if (score >= 56) return "partial";
  if (score >= 36) return "weak";
  return "background";
}

export function relationForSupport(level: SourceSupportLevel | undefined): ClaimRelation {
  if (level === "direct") return "supports";
  if (level === "partial") return "partial";
  if (level === "weak" || level === "background") return "mentions";
  return "reviewed";
}

export function rateSourceSupport(
  chunks: readonly RetrievedChunk[],
  sections: AnswerSections,
): Map<string, RatingFields> {
  const out = new Map<string, RatingFields>();
  for (const chunk of chunks) {
    const role = evidenceRole(chunk);
    const points = citedPointsForTag(sections, chunk.tag);
    const cited = points.length > 0;
    const quoteBacked = cited && points.some((p) => hasSupportQuote(p, chunk.tag));
    const lexical = cited
      ? Math.max(0, ...points.map((p) => overlapScore(p.text, chunk.chunk_text ?? "")))
      : 0;
    const claimScore = quoteBacked ? 100 : Math.round(lexical * 100);
    const supportScore = cited
      ? Math.round((claimScore * 0.68) + (role.weight * 0.32))
      : Math.max(18, Math.round(role.weight * 0.45));
    const level = supportLevel(supportScore, cited);
    const reason = cited
      ? quoteBacked
        ? `${role.reason} A verbatim supporting passage was found for a cited claim.`
        : `${role.reason} Cited by the answer; lexical support signal ${claimScore}/100.`
      : `${role.reason} Reviewed by retrieval/rerank but not cited in the final answer.`;
    out.set(chunk.tag, {
      support_level: level,
      support_score: supportScore,
      evidence_role: role.role,
      evidence_weight: role.weight,
      support_reason: reason,
      claim_relation: relationForSupport(level),
      relation_reason: reason,
    });
  }
  return out;
}
