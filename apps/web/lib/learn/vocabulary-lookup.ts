// Is this selection a TERM worth defining — and have we already defined it for this learner?
//
// 🔴 THE OWNER'S RULE: *"if user selects a non vocab term like an article, then it should disregard
// that likely."* Someone drags across a line and catches "the" on the end of it; asking a model to
// define "the", storing the answer, and offering it back for ever is three kinds of wrong at once.
//
// 🔴 AND THERE IS NO STOP-WORD LIST, DELIBERATELY. The obvious implementation is an array of
// English function words, and it fails this product in the way this codebase keeps having to
// re-learn: Nemesis serves a law student, a mechanical engineering student and someone studying in
// Spanish or Mandarin with the same code. An English list marks "the" and walks straight past "el",
// "der" and "の", so the feature would work for one language and silently misbehave for the rest.
//
// 🔴 THE SIGNAL IS FREQUENCY IN THE LEARNER'S OWN MATERIAL, WHICH IS STRUCTURAL AND WORKS IN ANY
// LANGUAGE. Function words are function words because they appear everywhere: a word occurring in a
// large fraction of a document's sentences is doing grammatical work, not carrying meaning, and
// that is true of "the", "de", "और" and "は" alike. A technical term behaves the opposite way — it
// clusters in the passages that are about it. So the material decides, not a list we maintain.
//
// 🔴 IT REFUSES, IT DOES NOT RANK. Every rule here answers one question — would defining this be a
// waste of the learner's attention? — and the honest failure direction is to allow: a definition
// nobody needed costs one lookup, and refusing a real term the learner is stuck on costs the thing
// the feature exists for.

/** Letters and digits in any script. Deliberately not `\w`, which is ASCII-only. */
const LETTER = /[\p{L}\p{N}]/u;
const NON_WORD = /[^\p{L}\p{N}]+/gu;

/**
 * A selection longer than this is not a vocabulary lookup, whatever it contains.
 *
 * Three words is a term of art ("res ipsa loquitur", "minimum inhibitory concentration"); a
 * sentence is something to explain, and `Explain` is the action that already covers it.
 */
const MAX_WORDS = 3;

/**
 * A word appearing in more than this share of the material's sentences is doing grammatical work.
 *
 * 🔴 MEASURED AGAINST SENTENCES, NOT TOKENS, AND THE DIFFERENCE MATTERS. Counting tokens makes the
 * threshold depend on how long the document's sentences are; counting the sentences a word appears
 * IN asks the question that actually distinguishes the two kinds of word — is this everywhere, or
 * is it clustered where the topic is?
 *
 * 🔴 DELIBERATELY HIGH, AND THE FIRST VALUE I CHOSE WAS WRONG IN THE DANGEROUS DIRECTION. At 0.34
 * this rule refused "marco" in a Spanish document about reading frames — the word the document is
 * ABOUT — because a focused text naturally mentions its subject in half its sentences. That is the
 * failure that matters: refusing a real term denies the learner the one thing the feature is for,
 * while allowing an article costs a single wasted lookup.
 *
 * So the bar is near-ubiquity. In ordinary prose the commonest function words appear in the large
 * majority of sentences in every language that has them; a content word, even the subject of the
 * page, rarely does. Everything in the wide gap between resolves to "define it".
 */
const FUNCTION_WORD_SHARE = 0.7;

/**
 * Too little material to judge frequency by. Below this the share is noise — in four sentences a
 * genuine key term easily appears in half of them — so the frequency rule stands down entirely and
 * only the structural checks apply.
 */
const MIN_SENTENCES = 8;

/** Why a selection is not a definition lookup. Named so a refusal can be counted and tested. */
export type LookupRefusal =
  /** No letters or digits at all — punctuation, a stray bracket, whitespace. */
  | "not-a-word"
  /** Longer than a term of art. `Explain` is the action for this, and it already exists. */
  | "too-long"
  /** A single character. Real one-character terms exist in maths and are handled by the caller,
   *  which knows whether it is looking at prose or notation. */
  | "too-short"
  /** It appears throughout this material, which is what function words do in every language. */
  | "function-word";

export type LookupDecision = { define: true } | { define: false; refusal: LookupRefusal };

/** The key a definition is stored and found under. Case- and spacing-insensitive, script-agnostic. */
export function glossaryKey(term: string): string {
  return term.trim().toLowerCase().replace(NON_WORD, " ").trim();
}

/**
 * How often each word appears across the material's sentences, as a share of them.
 *
 * 🔴 COMPUTED FROM WHAT THE LEARNER IS ACTUALLY READING, NOT FROM A CORPUS. A word that is rare in
 * general English can be this document's connective tissue, and a word that is common in general
 * English can be the very thing a chapter is about — "work" in a physics text, "consideration" in a
 * contracts one. The document is the only sample that answers the right question.
 */
export function wordShares(material: string): Map<string, number> {
  const sentences = material
    .split(/[.!?\n]+/u)
    .map((piece) => piece.trim())
    .filter((piece) => LETTER.test(piece));
  const shares = new Map<string, number>();
  if (sentences.length === 0) return shares;

  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    // Per sentence, each distinct word counts once — the question is "in how many sentences", not
    // "how many times", so a word repeated three times in one line is not three pieces of evidence.
    const seen = new Set(glossaryKey(sentence).split(" ").filter(Boolean));
    for (const word of seen) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  for (const [word, count] of counts) shares.set(word, count / sentences.length);
  return shares;
}

/**
 * Should this selection be looked up as a definition?
 *
 * 🔴 PURE, SO EVERY REFUSAL IS TESTABLE WITHOUT A MODEL OR A DOCUMENT. The caller supplies the
 * material's own word shares; this decides.
 */
export function worthDefining(input: {
  term: string;
  /** From `wordShares` over the canvas's text. Empty means "we cannot judge" — see `MIN_SENTENCES`. */
  shares?: Map<string, number>;
  /** How many sentences the shares were computed over, so a thin sample can stand the rule down. */
  sentenceCount?: number;
}): LookupDecision {
  const key = glossaryKey(input.term);
  if (!key || !LETTER.test(key)) return { define: false, refusal: "not-a-word" };

  const words = key.split(" ").filter(Boolean);
  if (words.length > MAX_WORDS) return { define: false, refusal: "too-long" };
  // 🔴 ONLY FOR A SINGLE WORD. "pH" and "μ" are two characters and are real terms; what this
  // catches is a stray letter caught by the edge of a drag, and a multi-word selection cannot be one.
  if (words.length === 1 && key.length < 2) return { define: false, refusal: "too-short" };

  const shares = input.shares;
  const enough = (input.sentenceCount ?? 0) >= MIN_SENTENCES;
  if (shares && enough) {
    // 🔴 EVERY WORD MUST BE COMMON, NOT ANY. "the reading frame" contains "the" and is a real term;
    // refusing on any single common word would reject most multi-word terms in most languages,
    // because most of them contain an article or a preposition.
    const allCommon = words.every((word) => (shares.get(word) ?? 0) >= FUNCTION_WORD_SHARE);
    if (allCommon) return { define: false, refusal: "function-word" };
  }

  return { define: true };
}
