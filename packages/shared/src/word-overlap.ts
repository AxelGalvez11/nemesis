/**
 * Deciding whether two pieces of the student's own text are about the same thing.
 *
 * Lifted out of brain-context.ts so course filing uses the SAME rule the
 * retrieval filter does. Writing a second word-overlap matcher is how the two
 * drift: one starts treating "week" as meaningful, the other doesn't, and the
 * app files a note somewhere its own search would not look for it.
 *
 * 🔴 FIELD-AGNOSTIC BY CONSTRUCTION. There is no list of subjects here and there
 * must never be one — the only vocabulary this compares is the student's own
 * words against their own course names. That is what makes it work identically
 * for a law student, a machinist and a nursing student.
 */

/**
 * Words too common to mean anything when two texts share them.
 *
 * Deliberately generic English, never subject matter: the moment this list
 * contains a discipline's vocabulary it stops working for the next student.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "about", "after", "again", "against", "because", "been", "before", "being",
  "between", "both", "cannot", "could", "does", "doing", "down", "during",
  "each", "from", "further", "have", "having", "here", "into", "just", "like",
  "make", "more", "most", "much", "only", "other", "over", "same", "should",
  "some", "such", "than", "that", "their", "them", "then", "there", "these",
  "they", "this", "those", "through", "under", "until", "very", "well", "were",
  "what", "when", "where", "which", "while", "with", "would", "your",
  // 🔴 THE SHORT ONES EXIST BECAUSE THE FLOOR MOVED. Everything above was
  // written when the minimum word length was four, so a three-letter filler
  // word could never reach this list and none were ever added. NAME_MIN_WORD
  // lets them through — and "The Art of War" would then match any sentence
  // containing "the". Caught by a test on the first run after the change.
  "the", "and", "for", "but", "not", "you", "are", "was", "its", "out",
  "can", "has", "had", "her", "his", "our", "who", "why", "how", "all",
  "any", "one", "two", "new", "get", "got", "way", "use", "may", "per",
  "via", "than", "then", "them", "into", "onto", "from", "that", "this",
  "each", "some", "such", "very", "here", "were",
]);

/** Four characters, the default: shorter words are mostly filler in prose. */
export const DEFAULT_MIN_WORD = 4;

/**
 * Three, for matching NAMES rather than prose.
 *
 * 🔴 "LAW" IS THREE LETTERS. The default threshold silently deleted it from
 * "Contract Law", so a law student's every lecture scored one point lower than
 * it should and the course could never be matched on its most distinctive word.
 * Same for "Art". A name is chosen to be distinctive at any length, which prose
 * is not — so names get their own floor, and it is the ONLY difference.
 */
export const NAME_MIN_WORD = 3;

/** Distinctive words in a piece of text: long enough to carry meaning, and not filler. */
export function contentWords(text: string, minLength = DEFAULT_MIN_WORD): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z0-9'-]*/g) ?? [];
  return new Set(
    words.filter((word) => word.length >= minLength && !STOPWORDS.has(word)),
  );
}

export function sharesVocabulary(asked: ReadonlySet<string>, candidate: string): boolean {
  if (asked.size === 0) return false;
  for (const word of contentWords(candidate)) {
    if (asked.has(word)) return true;
  }
  return false;
}
