// Deep Research — meta-mode gate: GROUND the extracted numbers (the never-LLM-guess enforcement).
//
// PURE and deterministic. Every study the LLM extracted is re-verified against the REAL source text
// before a single number is allowed into the pooling math. A study survives ONLY if:
//   1. its citation_tag is a real tag in the merged 1..N pool,
//   2. the cited source actually carries text (fail-closed when it does not),
//   3. the source actually studies the PICO intervention (and any SPECIFIC named active comparator),
//      so we never pool different drugs/classes into one number under a too-broad question,
//   4. its counts are arithmetically possible (0 <= events <= arm size),
//   5. its source_quote is a VERBATIM substring of that source's full text (NFKC-normalized, with
//      leading/trailing punctuation trimmed so a model-added period does not reject a correct quote),
//   6. each of the four counts appears as a standalone INTEGER inside that quote (no decimal/longer-run
//      laundering, e.g. 5 != "5.0" and 15 != "150"),
//   7. no count grossly disagrees with a percentage printed beside it in the source (a role/transcription
//      guard, loose by design), and
//   8. its outcome matches the PICO outcome (so we never pool incommensurable outcomes).
// One study per source (duplicates dropped). Every exclusion is recorded with a reason so the report
// can say honestly how many studies were found, pooled, and excluded — and why.

import type { Pico } from "../../../../packages/shared/src/research.ts";
import type { StudyArm } from "../../../../packages/shared/src/meta-analysis.ts";
import type { RetrievedChunk } from "../citation.ts";
import type { RawExtractedStudy } from "./extract.ts";

export type DropCode =
  | "tag_not_in_pool"
  | "source_text_unavailable"
  | "intervention_mismatch"
  | "comparator_mismatch"
  | "invalid_counts"
  | "quote_not_in_source"
  | "numbers_not_in_quote"
  | "percentage_mismatch"
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
  intervention_mismatch: "the cited source did not study the intervention being pooled",
  comparator_mismatch: "the cited source did not study the comparator being pooled",
  invalid_counts: "the reported counts were arithmetically impossible",
  quote_not_in_source: "the quoted sentence was not found verbatim in the cited source",
  numbers_not_in_quote: "not all of the counts appeared in the quoted sentence",
  percentage_mismatch: "a reported count disagreed with the percentage printed beside it in the source",
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

/** True when `n` appears as a standalone INTEGER — not part of a longer run (15 must not match 150) and
 *  not the integer part of a decimal (5 must not match "5.0", which would launder a percentage into a
 *  count). The boundaries forbid an adjacent digit OR decimal separator on either side; the decimal
 *  separator covers both "." and the middle dot "·" (U+00B7) that Lancet/BMJ use (e.g. "0·85"). */
function hasNumber(haystack: string, n: number): boolean {
  return new RegExp(`(?<![\\d.\\u00b7])${n}(?![.\\u00b7]?\\d)`).test(haystack);
}

/** Strip leading/trailing whitespace and punctuation so a model-added period or unbalanced parenthesis
 *  does not defeat the verbatim-substring check. Interior text — and every number — is untouched, so
 *  this only ever makes the needle SHORTER; it can never make a fabricated quote match. */
function trimEdges(s: string): string {
  return s.replace(/^[\s\p{P}]+/u, "").replace(/[\s\p{P}]+$/u, "");
}

/** Substring presence of a clinical term in the source text (NFKC + lowercase, separators kept). */
function sourceMentions(term: string, text: string): boolean {
  const t = norm(term);
  return t.length > 0 && norm(text).includes(t);
}

/** Placebo / usual-care style comparators (and the parsePico default "placebo or standard care").
 *  These are not required to appear verbatim in a source — only a SPECIFIC named active comparator is
 *  enforced, so a too-generic comparator never over-blocks a real same-intervention trial. */
const GENERIC_COMPARATORS = [
  "placebo",
  "standard care",
  "standard of care",
  "usual care",
  "usual standard of care",
  "control",
  "sham",
  "no treatment",
  "no active treatment",
  "best supportive care",
  "supportive care",
  "routine care",
  "conventional",
];

function isGenericComparator(comparator: string): boolean {
  const n = norm(comparator);
  return !n || GENERIC_COMPARATORS.some((g) => n.includes(g));
}

/** If a percentage is printed immediately after `count` in the quote (no other digit between them),
 *  return it; otherwise null. e.g. "482 patients (22.9%)" → 22.9. LOOSE by design: it only fires on the
 *  clean "<count> … (<pct>%)" form, so it never drops a study merely because no percentage was given. A
 *  trailing "% CI / % confidence / % credible" is a confidence LEVEL, not an event rate, so it is ignored
 *  (otherwise "482 patients (95% CI …)" would be mis-read as a 95% event rate and wrongly dropped). */
function pctAfterCount(haystack: string, count: number): number | null {
  const m = haystack.match(
    new RegExp(`(?<![\\d.])${count}(?![\\d.])[^%\\d]{0,24}?(\\d{1,3}(?:\\.\\d+)?)\\s*%(?!\\s*(?:ci\\b|confidence|credible))`),
  );
  return m ? parseFloat(m[1]) : null;
}

/** Percentage points of slack allowed between a count's implied rate and the rate printed beside it.
 *  Generous so legitimate denominator differences (ITT vs evaluable) pass; only gross role/transcription
 *  errors — e.g. an events count paired with the wrong arm size — exceed it. */
const PCT_TOLERANCE = 5;

/** True when an arm's count grossly disagrees with the percentage the source printed next to it. */
function percentageConflict(numbers: string, s: RawExtractedStudy): boolean {
  const arms: ReadonlyArray<readonly [number, number]> = [
    [s.events_treatment, s.total_treatment],
    [s.events_control, s.total_control],
  ];
  for (const [events, total] of arms) {
    if (total <= 0) continue;
    const stated = pctAfterCount(numbers, events);
    if (stated == null) continue;
    if (Math.abs(stated - (events / total) * 100) > PCT_TOLERANCE) return true;
  }
  return false;
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
    // Comparability: the cited source must actually study the PICO intervention, and any SPECIFIC named
    // active comparator must be present too (generic placebo / usual-care comparators are not enforced).
    // This is what stops a too-broad PICO from pooling different drug classes into one number.
    if (!sourceMentions(pico.intervention, text)) { dropped.push(drop(s, "intervention_mismatch")); continue; }
    if (!isGenericComparator(pico.comparator) && !sourceMentions(pico.comparator, text)) {
      dropped.push(drop(s, "comparator_mismatch"));
      continue;
    }
    if (s.events_treatment > s.total_treatment || s.events_control > s.total_control) {
      dropped.push(drop(s, "invalid_counts"));
      continue;
    }
    const quoteNorm = trimEdges(norm(s.source_quote));
    if (!norm(text).includes(quoteNorm)) { dropped.push(drop(s, "quote_not_in_source")); continue; }
    const numbers = numHaystack(quoteNorm);
    const allPresent = [s.events_treatment, s.total_treatment, s.events_control, s.total_control].every((n) => hasNumber(numbers, n));
    if (!allPresent) { dropped.push(drop(s, "numbers_not_in_quote")); continue; }
    if (percentageConflict(numbers, s)) { dropped.push(drop(s, "percentage_mismatch")); continue; }
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
