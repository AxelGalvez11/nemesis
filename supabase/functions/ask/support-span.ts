// Claim → supporting-passage finder (the provenance highlight behind a citation).
//
// PURE and deterministic — NEVER an LLM. Given a generated claim and the verbatim text of a cited
// source, it returns the source sentence that best supports the claim AS A REAL SUBSTRING (with char
// offsets, so the UI can highlight exactly that span), or null when no passage clears a minimum overlap.
// "Null rather than a weak match" keeps the same never-fabricate discipline as the meta grounding gate:
// we only ever point at text the source actually contains, and we say nothing when we are not sure.

import type { AnswerPoint, AnswerSections, ClaimSupport } from "../../../packages/shared/src/answer.ts";
import type { RetrievedChunk } from "./citation.ts";

export interface SupportSpan {
  /** Verbatim substring of the source text: sourceText.slice(start, end) === quote. */
  quote: string;
  /** Char offset of the span in the source text. */
  start: number;
  /** Exclusive end offset. */
  end: number;
  /** Fraction of the claim's content words present in the span (0..1) — a transparency signal. */
  score: number;
}

// Common words carry no topical signal; excluding them stops a shared "the/of/in" from inflating overlap.
const STOP = new Set([
  "the", "a", "an", "of", "in", "on", "and", "or", "to", "for", "with", "was", "were", "is", "are",
  "be", "been", "by", "that", "this", "as", "at", "from", "than", "vs", "versus", "its", "their", "our",
  "we", "it", "these", "those", "but", "not", "no", "may", "can", "could", "also", "into", "over",
  "under", "between", "per", "both", "had", "has", "have", "who", "which", "when", "while", "during",
  "after", "before", "more", "most", "such", "they", "them", "there", "compared",
]);

/** Lowercased alphanumeric content tokens (length >= 2, stopwords removed). */
function contentTokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2 && !STOP.has(t));
}

interface Sentence {
  text: string;
  start: number;
  end: number;
}

/** Split into sentences, preserving each sentence's char offsets into the original text. A period
 *  flanked by digits — "1.4", "5.7", section numbers like "1.1" — is a decimal point, NOT a sentence
 *  boundary; consuming it inside the run keeps the whole figure in one sentence so a provenance
 *  highlight never begins mid-number (e.g. "4 percent" for a 1.4% claim). The two run alternatives are
 *  mutually exclusive on the current char (`[^.!?]` never matches "."), so there is no backtracking. */
function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /(?:[^.!?]+|(?<=\d)\.(?=\d))+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = m.index + lead;
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

/** Fraction of the claim's content words that must appear in a passage for it to count as support. */
const MIN_SCORE = 0.34;
/** And at least this many distinct content words must overlap (so one shared word is never enough). */
const MIN_MATCHED = 2;
/** Phase-2 cap: a claim whose support is spread across sentences may be grounded to a CONTIGUOUS run of
 *  at most this many sentences. Bounded ON PURPOSE — the window never lowers MIN_SCORE; it only lets the
 *  same fraction of claim words be satisfied across a few adjacent sentences instead of exactly one. */
const MAX_WINDOW_SENTENCES = 3;

/** Fraction of `claimTokens` present in `text`, or 0 when fewer than MIN_MATCHED distinct words overlap
 *  (so one shared word is never enough — the same floor in both phases). */
function passageScore(claimTokens: Set<string>, text: string): number {
  const passageTokens = new Set(contentTokens(text));
  let matched = 0;
  for (const t of claimTokens) if (passageTokens.has(t)) matched++;
  return matched >= MIN_MATCHED ? matched / claimTokens.size : 0;
}

/** Best SINGLE sentence clearing the bar (today's behavior, unchanged). */
function bestSingleSentence(claimTokens: Set<string>, sens: Sentence[]): SupportSpan | null {
  let best: SupportSpan | null = null;
  for (const sen of sens) {
    const score = passageScore(claimTokens, sen.text);
    if (score >= MIN_SCORE && (best === null || score > best.score)) {
      best = { quote: sen.text, start: sen.start, end: sen.end, score };
    }
  }
  return best;
}

/** SMALLEST contiguous window (2..MAX_WINDOW_SENTENCES) that clears the bar, or null. Smallest-first is
 *  deliberate: passageScore only grows with window size, so a "best score" rule would always emit the
 *  widest 3-sentence span — maximizing both length and the risk of stitching co-occurring words across a
 *  topic shift. The minimal passage that meets the bar is the honest "here is the support." The quote is
 *  the verbatim source slice spanning the window, so support is never fabricated. */
function bestWindowSpan(claimTokens: Set<string>, sens: Sentence[], sourceText: string): SupportSpan | null {
  for (let n = 2; n <= MAX_WINDOW_SENTENCES; n++) {
    let best: SupportSpan | null = null;
    for (let i = 0; i + n <= sens.length; i++) {
      const window = sens.slice(i, i + n);
      const score = passageScore(claimTokens, window.map((s) => s.text).join(" "));
      if (score >= MIN_SCORE && (best === null || score > best.score)) {
        const start = window[0].start;
        const end = window[n - 1].end;
        best = { quote: sourceText.slice(start, end), start, end, score };
      }
    }
    if (best !== null) return best; // smallest window-size that clears wins — tightest honest support
  }
  return null;
}

/**
 * Best supporting passage for `claim` within `sourceText`, or null if nothing clears the bar. PURE.
 * Two-phase: a single supporting sentence wins (unchanged behavior, tightest highlight); ONLY when no
 * single sentence supports the claim do we try a bounded contiguous multi-sentence window — for a claim
 * whose support is genuinely spread across adjacent sentences. The window keeps the SAME MIN_SCORE /
 * MIN_MATCHED bar and is capped, so it never manufactures support for a claim the source doesn't carry.
 */
export function bestSupportingSpan(claim: string, sourceText: string): SupportSpan | null {
  const claimTokens = new Set(contentTokens(claim));
  if (claimTokens.size === 0 || !sourceText.trim()) return null;
  const sens = sentences(sourceText);
  return bestSingleSentence(claimTokens, sens) ?? bestWindowSpan(claimTokens, sens, sourceText);
}

/** Deterministically attach each cited source's supporting passage to a claim. The quote is verbatim
 *  source text (provenance), so this never introduces a fabricated highlight; a claim whose cited
 *  source does not support it is simply left unmarked. Immutable — returns new objects. */
function supportForPoint(point: AnswerPoint, byTag: Map<string, string>): ClaimSupport[] {
  const out: ClaimSupport[] = [];
  const seen = new Set<string>();
  for (const tag of point.citation_ids) {
    if (seen.has(tag)) continue;
    const text = byTag.get(tag);
    if (!text) continue;
    const span = bestSupportingSpan(point.text, text);
    if (span) {
      out.push({ citation_tag: tag, quote: span.quote });
      seen.add(tag);
    }
  }
  return out;
}

function withSupport(points: AnswerPoint[], byTag: Map<string, string>): AnswerPoint[] {
  return points.map((p) => {
    const support = supportForPoint(p, byTag);
    return support.length ? { ...p, support } : p;
  });
}

/**
 * Attach supporting passages to every claim in the answer sections, resolving each claim's cited [n]
 * tags against the retrieved source text. PURE; additive (only sets the optional `support` field).
 */
export function attachSupport(
  sections: AnswerSections,
  chunks: ReadonlyArray<Pick<RetrievedChunk, "tag" | "chunk_text">>,
): AnswerSections {
  const byTag = new Map<string, string>();
  for (const c of chunks) if (c.chunk_text) byTag.set(c.tag, c.chunk_text);
  return {
    ...sections,
    what_we_know: withSupport(sections.what_we_know, byTag),
    what_we_do_not_know: withSupport(sections.what_we_do_not_know, byTag),
    safety_notes: withSupport(sections.safety_notes, byTag),
  };
}
