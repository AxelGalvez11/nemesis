// Does this record actually answer the question that was asked?
//
// Owner 2026-08-24: *"I need the searches to be accurate to have relevance. If it doesn't have
// relevance, then I don't see why we would use this."*
//
// 🔴🔴🔴 THIS IS A PRECISION BAR, AND IT IS SUPPOSED TO COST RECALL. A literature answer is a
// numbered list a learner reads as "these support what I just said". One unrelated row does not
// dilute that list — it discredits it, because the learner cannot tell which of the ten are the
// wrong ones and now has to check all of them. Ten results with three duds is worse than four
// results, and the owner's instruction above is exactly that trade, made deliberately.
//
// 🔴 IT IS NEEDED EVEN THOUGH THE UPSTREAMS ALREADY SEARCH. Every index here ranks its own hits, so
// the top of each list is usually right; the failure is the TAIL. Asked for five results an index
// returns five whether or not it has five, so a field it knows nothing about still yields its best
// five guesses. Measured live 2026-08-24: "adverse possession doctrine property law" returned, from
// arXiv, *"Space-Creating versus Dead Possession: An Off-Ball Possession-Quality Index for
// Broadcast"* — a sports-analytics paper, correctly ranked by arXiv as the closest thing it had to
// property law, and nonsense in a law student's source list. arXiv was not wrong. Passing its tail
// through unfiltered was.
//
// 🔴 STRUCTURAL, WITH NO SUBJECT VOCABULARY ANYWHERE — CLAUDE.md's standing rule, and the same
// mistake this file would be easiest to make. There is no list of legal words, no medical boost, no
// per-field threshold. The only inputs are the learner's own query and the record's own text, so
// the rule behaves identically for a law student and a machinist without knowing which is which.

/**
 * Words that appear everywhere and therefore separate nothing.
 *
 * 🔴 TWO GROUPS, AND THE SECOND IS THE ONE TO BE CAREFUL WITH. The first is English function words.
 * The second is scholarly boilerplate — words used in the academic writing of EVERY discipline, so
 * they carry no signal about topic. A history paper, an engineering paper and a virology paper all
 * contain "study" and "results". Anything belonging to a particular field must never be added here:
 * that would be a subject keyword list wearing a stopword costume, and it would silently re-scope
 * the product to whichever field got left out.
 */
export const STOPWORDS = new Set([
  "the", "of", "and", "in", "for", "an", "to", "on", "with", "by", "from", "at", "as", "is", "are",
  "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its", "or", "not",
  "but", "if", "into", "than", "then", "there", "their", "them", "we", "our", "us", "you", "your",
  "they", "his", "her", "hers", "do", "does", "did", "can", "could", "should", "would", "may",
  "might", "will", "shall", "about", "between", "during", "after", "before", "over", "under",
  "when", "which", "who", "whom", "whose", "how", "what", "why", "also", "such", "both", "each",
  "any", "all", "some", "more", "most", "other", "have", "has", "had",
  "study", "studies", "research", "paper", "papers", "article", "results", "result", "analysis",
  "using", "used", "use", "based", "new", "novel", "approach", "method", "methods", "data",
  // 🔴 RESEARCH-DESIGN WORDS, WHICH DESCRIBE HOW A STUDY WAS RUN RATHER THAN WHAT IT IS ABOUT.
  // Measured 2026-08-24: "metformin cardiovascular outcomes randomised trial" kept an arXiv paper
  // titled "Sample size calculations for multilevel factorial longitudinal cluster randomised
  // trials" — a statistics-methodology paper with no connection to the subject, which cleared the
  // bar purely on "randomised" and "trial".
  //
  // 🔴 THESE ARE NOT MEDICAL WORDS, AND THE DISTINCTION IS THE WHOLE JUSTIFICATION FOR THE LINE.
  // Education runs randomised controlled trials. So does agriculture, economics and psychology. A
  // law article is reviewed, an engineering design is evaluated. They name a METHOD, and a method
  // is shared across fields, which is exactly what makes them useless for telling one topic from
  // another. Words that carry subject — "outcomes", "effect", "model" — are deliberately NOT here,
  // because those do distinguish topics in the fields that use them.
  "trial", "trials", "randomised", "randomized", "controlled", "cohort", "systematic", "review",
  "reviews", "meta", "evaluation", "assessment", "investigation", "comparison", "survey",
])

/**
 * Crude English suffix stripping, applied to BOTH the query and the record.
 *
 * 🔴 DELIBERATELY CRUDE, AND THE ALTERNATIVE IS WORSE. Without it, exact whole-word matching fails
 * on ordinary inflection: a query saying "welded steel joints" misses a paper titled "welding of
 * steel joint details", which is plainly the same subject. Those misses land hardest on precisely
 * the fields this product must not disadvantage — English morphology is not evenly distributed
 * across disciplines, and a bar tuned on noun-heavy medical phrasing would quietly punish the more
 * verbal phrasing of law and history.
 *
 * 🔴 IT IS NOT A STEMMER AND MUST NOT GROW INTO ONE. Real stemming (Porter, Snowball) conflates
 * words that mean different things and is language-specific — and this product takes questions in
 * any language. Four suffixes, only on tokens long enough that the stripped form still means
 * something, is the most that can be done without the rule starting to have opinions.
 */
function normalise(token: string): string {
  if (token.length < 5) return token
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, token.length - suffix.length)
    }
  }
  return token
}

/** Tokens of a piece of text, normalised and deduplicated. */
function tokenSet(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3) out.add(normalise(raw))
  }
  return out
}

/** Terms worth matching on: long enough to mean something, not boilerplate, deduplicated. */
export function distinctiveTerms(query: string): string[] {
  const out = new Set<string>()
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) out.add(normalise(raw))
  }
  return [...out]
}

/**
 * How many of a query's distinctive terms a record must carry to be shown at all.
 *
 * 🔴 CLAMPED TO THE NUMBER OF TERMS AVAILABLE, or a one-word query could never be satisfied. A bare
 * "metformin" or "CRISPR" or "estoppel" is a legitimate question with exactly one distinctive term,
 * and a floor of two would return nothing for every single-word query — reading to the learner as
 * "no such research exists" while actually meaning "this rule cannot be met".
 */
export function requiredMatches(termCount: number): number {
  return Math.min(termCount, Math.max(2, Math.ceil(termCount * 0.5)))
}

export interface Relevance {
  /** How many distinct query terms this record carries. Decides whether it is shown at all. */
  matched: number
  /** Title matches weighted double. Orders the survivors; never decides entry. */
  score: number
  /** The bar `matched` had to clear. */
  needed: number
  /** True when this record may be shown. */
  keep: boolean
}

/**
 * Score one record against the query.
 *
 * 🔴 TITLE AND BODY ARE WEIGHED DIFFERENTLY BUT COUNT THE SAME. A term in the title is stronger
 * evidence of aboutness than one buried in an abstract, so it doubles the SCORE — but `matched` is
 * what decides entry, and it counts a term once wherever it appears. Otherwise a paper whose title
 * happens to repeat the query would outrank one that actually covers more of it.
 */
export function relevanceOf(query: string, title: string, body: string): Relevance {
  const terms = distinctiveTerms(query)
  const needed = requiredMatches(terms.length)
  // 🔴 NOTHING DISTINCTIVE TO MATCH ON MEANS NOTHING IS SHOWN — never "here is everything". A query
  // of pure stopwords ("what about all of these") gives this function no way to tell a good record
  // from a bad one, and the honest answer to that is an empty list rather than an arbitrary one.
  if (terms.length === 0) return { matched: 0, score: 0, needed: 1, keep: false }

  const titleTokens = tokenSet(title)
  const bodyTokens = tokenSet(body)
  let matched = 0
  let score = 0
  for (const term of terms) {
    const inTitle = titleTokens.has(term)
    const inBody = bodyTokens.has(term)
    if (inTitle || inBody) matched += 1
    score += (inTitle ? 2 : 0) + (inBody ? 1 : 0)
  }
  return { matched, score, needed, keep: matched >= needed }
}
