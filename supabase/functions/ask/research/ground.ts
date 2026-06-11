// Deep Research — meta-mode gate: GROUND the extracted numbers (the never-LLM-guess enforcement).
//
// PURE and deterministic. Every study the LLM extracted is re-verified against the REAL source text
// before a single number is allowed into the pooling math. A study survives ONLY if:
//   1. its citation_tag is a real tag in the merged 1..N pool,
//   2. the cited source actually carries text (fail-closed when it does not),
//   3. its counts are arithmetically possible (0 <= events <= arm size),
//   4. its source_quote is a VERBATIM substring of that source's full text (NFKC-normalized),
//   5. each of the four counts appears as a standalone number inside that quote, and
//   6. its outcome matches the PICO outcome (so we never pool incommensurable outcomes).
// One study per source (duplicates dropped). Every exclusion is recorded with a reason so the report
// can say honestly how many studies were found, pooled, and excluded — and why.

import type { Pico } from "../../../../packages/shared/src/research.ts";
import type { StudyArm } from "../../../../packages/shared/src/meta-analysis.ts";
import type { RetrievedChunk } from "../citation.ts";
import type { RawExtractedStudy } from "./extract.ts";

export type DropCode =
  | "tag_not_in_pool"
  | "source_text_unavailable"
  | "invalid_counts"
  | "quote_not_in_source"
  | "numbers_not_in_quote"
  | "different_outcome"
  | "duplicate_source";

export interface DroppedStudy {
  citation_tag: string;
  label: string;
  outcome_label: string;
  code: DropCode;
  reason: string;
}

export interface GroundingResult {
  /** Grounded studies in the poolable cluster (PICO outcome), one per source. */
  studies: StudyArm[];
  /** Every excluded study with a human-readable reason. */
  dropped: DroppedStudy[];
  /** The outcome the grounded studies share (the PICO outcome). */
  outcome: string;
  /** Total raw studies considered. */
  considered: number;
}

const REASONS: Record<DropCode, string> = {
  tag_not_in_pool: "cited a source that was not in the searched set",
  source_text_unavailable: "the cited source had no readable text to verify against",
  invalid_counts: "the reported counts were arithmetically impossible",
  quote_not_in_source: "the quoted sentence was not found verbatim in the cited source",
  numbers_not_in_quote: "not all of the counts appeared in the quoted sentence",
  different_outcome: "reported a different outcome than the one being pooled",
  duplicate_source: "duplicated a source already counted",
};

/** NFKC + lowercase + whitespace-collapse — used for the substring check (separators kept). */
function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A number-matching haystack: normalized, with digit-group separators (commas/spaces) removed so
 *  "1,234" and "1 234" match the integer 1234. */
function numHaystack(quoteNorm: string): string {
  return quoteNorm.replace(/(?<=\d)[,\s]+(?=\d)/g, "");
}

/** True when `n` appears as a standalone number (not part of a longer run, e.g. 15 must not match 150). */
function hasNumber(haystack: string, n: number): boolean {
  return new RegExp(`(?<!\\d)${n}(?!\\d)`).test(haystack);
}

/** Lenient outcome match: substring either direction, or >= 1/3 token overlap (Jaccard). */
function outcomeMatches(label: string, target: string): boolean {
  const a = norm(label);
  const b = norm(target);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = new Set(a.split(/[^a-z0-9]+/).filter(Boolean));
  const tb = new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter) >= 1 / 3;
}

function drop(s: RawExtractedStudy, code: DropCode): DroppedStudy {
  return { citation_tag: s.citation_tag, label: s.label, outcome_label: s.outcome_label, code, reason: REASONS[code] };
}

/**
 * Verify each extracted study against its real source. Returns the grounded, PICO-matched, deduped
 * studies plus a reason for every drop. PURE: unit-testable.
 */
export function groundStudies(raw: RawExtractedStudy[], chunks: RetrievedChunk[], pico: Pico): GroundingResult {
  const byTag = new Map(chunks.map((c) => [c.tag, c]));
  const studies: StudyArm[] = [];
  const dropped: DroppedStudy[] = [];
  const usedTags = new Set<string>();

  for (const s of raw) {
    const chunk = byTag.get(s.citation_tag);
    if (!chunk) { dropped.push(drop(s, "tag_not_in_pool")); continue; }
    const text = chunk.chunk_text;
    if (!text || !text.trim()) { dropped.push(drop(s, "source_text_unavailable")); continue; }
    if (s.events_treatment > s.total_treatment || s.events_control > s.total_control) {
      dropped.push(drop(s, "invalid_counts"));
      continue;
    }
    const quoteNorm = norm(s.source_quote);
    if (!norm(text).includes(quoteNorm)) { dropped.push(drop(s, "quote_not_in_source")); continue; }
    const numbers = numHaystack(quoteNorm);
    const allPresent = [s.events_treatment, s.total_treatment, s.events_control, s.total_control].every((n) => hasNumber(numbers, n));
    if (!allPresent) { dropped.push(drop(s, "numbers_not_in_quote")); continue; }
    if (!outcomeMatches(s.outcome_label, pico.outcome)) { dropped.push(drop(s, "different_outcome")); continue; }
    if (usedTags.has(s.citation_tag)) { dropped.push(drop(s, "duplicate_source")); continue; }

    usedTags.add(s.citation_tag);
    studies.push({
      label: s.label || chunk.title || `Study ${s.citation_tag}`,
      citation_tag: s.citation_tag,
      source_quote: s.source_quote.trim(),
      outcome_label: s.outcome_label,
      events_treatment: s.events_treatment,
      total_treatment: s.total_treatment,
      events_control: s.events_control,
      total_control: s.total_control,
    });
  }

  return { studies, dropped, outcome: pico.outcome, considered: raw.length };
}
