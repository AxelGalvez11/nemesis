// Claim → supporting-passage finder (the provenance highlight behind a citation).
//
// PURE and deterministic — NEVER an LLM. Given a generated claim and the verbatim text of a cited
// source, it returns the source sentence that best supports the claim AS A REAL SUBSTRING (with char
// offsets, so the UI can highlight exactly that span), or null when no passage clears a minimum overlap.
// "Null rather than a weak match" keeps the same never-fabricate discipline as the meta grounding gate:
// we only ever point at text the source actually contains, and we say nothing when we are not sure.

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

/** Split into sentences, preserving each sentence's char offsets into the original text. */
function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?]+[.!?]*/g;
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

/**
 * Best supporting sentence for `claim` within `sourceText`, or null if nothing clears the bar. PURE.
 */
export function bestSupportingSpan(claim: string, sourceText: string): SupportSpan | null {
  const claimTokens = new Set(contentTokens(claim));
  if (claimTokens.size === 0 || !sourceText.trim()) return null;

  let best: SupportSpan | null = null;
  for (const sen of sentences(sourceText)) {
    const senTokens = new Set(contentTokens(sen.text));
    let matched = 0;
    for (const t of claimTokens) if (senTokens.has(t)) matched++;
    const score = matched / claimTokens.size;
    if (matched >= MIN_MATCHED && score >= MIN_SCORE && (best === null || score > best.score)) {
      best = { quote: sen.text, start: sen.start, end: sen.end, score };
    }
  }
  return best;
}
