// Deciding whether an expected element shows up in a raw HandwritingObservation — kept separate
// from the vision call itself so this decision can be read, tested, and revised without
// re-prompting the model. See types.ts's file header for why the model is never told what to
// look for.
//
// 🔴 "unclear" IS THE DEFAULT. "absent" IS THE HARDEST VALUE TO EARN, AND THAT IS DELIBERATE —
// the same asymmetry `lib/learn/learner-evidence.ts`'s `satisfies()` already states for the
// scaffold ladder: "the error is deliberately in the under-claiming direction... against silently
// skipping something they never showed, which is invisible and compounds". Here the direction
// that must never happen is a false "absent": a learner who wrote a correct answer in different
// words, or whose handwriting a weak string match simply failed to recognise, must not be recorded
// as having omitted it. A string matcher is a poor judge of paraphrase, so this function is
// conservative on purpose — it earns "absent" only when the reading itself is trustworthy AND the
// overlap is exactly zero, and falls back to "unclear" for every softer case, including a partial
// match that is not confident enough to call "present" either.

import type { ElementMatch, ElementPresence, HandwritingObservation } from "./types";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "its",
  "of", "on", "or", "that", "the", "this", "to", "was", "were", "with",
]);

/** Lowercase, strip punctuation, collapse whitespace. PURE. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words worth comparing — short connectors dropped so "the" matching "the" cannot manufacture a
 *  false present. PURE. */
function significantWords(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** The fraction of an expected element's significant words that must appear in the observation
 *  before it counts as "present". Not 1.0: a learner's own phrasing ("sodium ions move in" for
 *  "sodium enters the cell") should not be punished for dropping one word of a multi-word cue. */
const PRESENT_THRESHOLD = 0.6;

/** The smallest true thing to quote: prefer a single item whose own words matched, over the whole
 *  transcription, so `evidenceQuote` points at what actually justified the match rather than
 *  dumping the entire page. Falls back to the transcription when the match came from running text
 *  rather than any one item. PURE. */
function quoteFor(observation: HandwritingObservation, matchedWords: readonly string[]): string | null {
  for (const item of observation.items) {
    const itemWords = new Set(significantWords(item.text));
    if (matchedWords.some((word) => itemWords.has(word))) return item.text;
  }
  const transcription = observation.transcription.trim();
  return transcription ? transcription.slice(0, 200) : null;
}

/**
 * Whether each expected element shows up in the raw observation.
 *
 * 🔴 "absent" REQUIRES A TRUSTWORTHY READING. An abstained, empty, or low-confidence observation
 * says nothing about whether the learner wrote something — only that this function could not see
 * it clearly — so every expected element resolves to "unclear" rather than "absent" whenever the
 * reading itself cannot be trusted. Only a confident, non-empty reading with genuinely zero word
 * overlap earns "absent".
 */
export function matchExpectedElements(
  observation: HandwritingObservation,
  expectedElements: readonly string[],
): ElementMatch[] {
  const haystackText = [observation.transcription, ...observation.items.map((item) => item.text)].join("\n");
  const haystackWords = new Set(significantWords(haystackText));
  const readingIsTrustworthy =
    !observation.abstained &&
    haystackText.trim().length > 0 &&
    (observation.transcriptionConfidence === null || observation.transcriptionConfidence >= 0.5);

  return expectedElements.map((expected) => {
    const expectedWords = significantWords(expected);
    // An expected element with no significant words (empty string, or all stopwords) cannot be
    // evaluated at all — "unclear" is the honest answer, not a guess in either direction.
    if (expectedWords.length === 0) return { evidenceQuote: null, expected, presence: "unclear" };

    const matchedWords = expectedWords.filter((word) => haystackWords.has(word));
    const overlap = matchedWords.length / expectedWords.length;

    let presence: ElementPresence;
    let evidenceQuote: string | null = null;
    if (overlap >= PRESENT_THRESHOLD) {
      presence = "present";
      evidenceQuote = quoteFor(observation, matchedWords);
    } else if (readingIsTrustworthy && matchedWords.length === 0) {
      presence = "absent";
    } else {
      presence = "unclear";
    }
    return { evidenceQuote, expected, presence };
  });
}
