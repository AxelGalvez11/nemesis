// Query-understanding helpers for terms that are NOT drug entities but matter for health questions.
//
// The classifier extracts drugs/supplements/compounds. The entity-intelligence layer recognizes
// consumer products / slang / aliases that should enrich free-text research search but must not be
// sent through drug-label field-scoped providers.

import { isKnownEntityMention, resolveKnownEntities } from "./entity-intelligence.ts";
import type { WebReconResult } from "./web-recon.ts";

export interface QueryUnderstanding {
  /** Search string for free-text research providers (PubMed, Europe PMC, OpenAlex, MedlinePlus). */
  researchQuery: string;
  /** Topic string for non-label live providers (trials/FAERS); may be a normalized product name. */
  sourceQuery: string;
  /** Mentions that should still be treated as drug/supplement/compound names for entity resolution and openFDA. */
  fieldMentions: string[];
  /** User-visible assumptions to prepend to generation when useful. */
  assumptions: string[];
  /** Canonical product/topic names inferred from aliases. */
  normalizedTerms: string[];
  /** True when a recognized consumer product shaped the query. */
  hasConsumerProduct: boolean;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function dedupeWords(parts: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts.flatMap((p) => norm(p).split(/\s+/)).filter(Boolean)) {
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(" ");
}

function uniqueStrings(parts: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

export function understandQuery(
  question: string,
  entityMentions: readonly string[],
  baseResearchQuery: string = question,
): QueryUnderstanding {
  const knownEntities = resolveKnownEntities(question, entityMentions);
  const hasConsumerProduct = knownEntities.some((e) => e.kind === "consumer_product");
  const consumerResearchTerms = new Set(
    knownEntities
      .filter((e) => e.kind === "consumer_product")
      .flatMap((e) => [e.normalized, ...e.biomedical_terms])
      .map(norm),
  );
  const fieldMentions = entityMentions.filter((m) => {
    if (isKnownEntityMention(m)) return false;
    return !consumerResearchTerms.has(norm(m));
  });

  if (knownEntities.length === 0) {
    return {
      researchQuery: baseResearchQuery,
      sourceQuery: fieldMentions.length ? fieldMentions.join(" ") : question,
      fieldMentions,
      assumptions: [],
      normalizedTerms: [],
      hasConsumerProduct,
    };
  }

  const normalizedTerms = knownEntities.map((e) => e.normalized);
  const extraTerms = knownEntities.flatMap((e) => e.biomedical_terms);
  return {
    researchQuery: dedupeWords([baseResearchQuery, ...extraTerms]),
    sourceQuery: fieldMentions.length ? fieldMentions.join(" ") : normalizedTerms.join(" "),
    fieldMentions,
    assumptions: knownEntities.flatMap((e) => e.assumptions),
    normalizedTerms,
    hasConsumerProduct,
  };
}

export function isConsumerProductOnlyQuery(understood: QueryUnderstanding): boolean {
  return understood.hasConsumerProduct && understood.fieldMentions.length === 0;
}

export function applyReconToUnderstanding(
  understood: QueryUnderstanding,
  recon: WebReconResult,
): QueryUnderstanding {
  const normalizedTerms = uniqueStrings([...understood.normalizedTerms, ...recon.normalized_terms]);
  const assumptions = uniqueStrings([...understood.assumptions, ...recon.assumptions]);
  const sourceQuery = understood.fieldMentions.length
    ? understood.sourceQuery
    : normalizedTerms.length
    ? normalizedTerms.join(" ")
    : understood.sourceQuery;

  return {
    ...understood,
    researchQuery: dedupeWords([understood.researchQuery, ...recon.normalized_terms, ...recon.biomedical_terms]),
    sourceQuery,
    assumptions,
    normalizedTerms,
    hasConsumerProduct: understood.hasConsumerProduct,
  };
}
