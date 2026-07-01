// Pure search-term extractor for the retry-on-empty path in gatherLiveCandidates.
//
// Conversational benign questions ("how do i get rid of heartburn fast?") send the whole sentence
// to PubMed, whose automatic term-mapping then matches NOTHING — while the bare key term
// ("heartburn") retrieves well (live: "what helps with heartburn?" -> 15 hits, "heartburn remedies"
// -> 27, "how do i get rid of heartburn fast?" -> 0). This strips the conversational scaffolding so
// a 0-result benign query can be RETRIED with the term that actually matches.
//
// It builds the PRIMARY research search string (index.ts: `extractSearchTerms(question) || question`
// -> researchQuery for the free-text research sources: MedlinePlus / PubMed / Europe PMC) AND is reused
// on the retry-on-empty path. It only ever simplifies the free-text RESEARCH string — never the literal
// drug `term`/mentions that the field-scoped sources (openFDA / FAERS / ClinicalTrials) and the
// fabrication guard use — so an imperfect strip can change research recall but can NEVER fabricate a
// source or change which drug is looked up. For a KNOWN entity, understandQuery may further rewrite the
// research query, so this mainly shapes the no-drug / colloquial-claim path. Deterministic + unit-tested
// (no LLM call). Returns "" when there is nothing worth simplifying (no prefix/filler matched, or the
// residue is empty / too thin / a bare pronoun), in which case the caller falls back to the full question.

// Leading conversational scaffolding. Longest match wins, so "how do i get rid of" is removed whole
// rather than leaving "get rid of heartburn" behind. NOTE: keep generic interrogatives ("how to",
// "how do i") in the list but NOT verb-specific variants like "how to lower" — we want to keep the
// verb phrase ("lower blood pressure") as the search term.
const LEADING_PREFIXES: readonly string[] = [
  "how do i get rid of",
  "how do you get rid of",
  "how can i get rid of",
  "how to get rid of",
  "how do i deal with",
  "how do i treat",
  "how do i stop",
  "how do i fix",
  "how do i manage",
  "what can i take for",
  "what can i do for",
  "what can i do about",
  "what should i take for",
  "what should i do about",
  "what helps with",
  "what helps for",
  // Cause / definition interrogatives — recover the topic from a colloquial claim so the primary
  // research query matches a MedlinePlus/PubMed topic instead of sending the whole sentence:
  // "what causes white flakes in hair" -> "white flakes in hair", "why do i have dandruff" -> "dandruff",
  // "what is berberine" -> "berberine". (Longest-match-first keeps "what is the best way to" intact.)
  "what causes",
  "what is causing",
  "whats causing",
  "why do i have",
  "why do i get",
  "why do i keep getting",
  "why am i getting",
  "what is",
  "what are",
  "what is the best way to",
  "what's the best way to",
  "whats the best way to",
  "best way to",
  "how to treat",
  "how to stop",
  "how to get rid of",
  "how do i",
  "how to",
  "ways to",
  "tips for",
  "help with",
];

// Trailing filler adverbs/qualifiers that add nothing to a literature search.
const TRAILING_FILLERS: readonly string[] = [
  "right away",
  "without medication",
  "without meds",
  "without drugs",
  "at home",
  "immediately",
  "naturally",
  "overnight",
  "quickly",
  "quick",
  "fast",
  "asap",
];

// Leading determiners/possessives to drop once the prefix is gone ("for a headache" -> "headache").
const LEADING_ARTICLE = /^(a|an|the|my|some|any)\s+/;

// A residue that is only one of these carries no searchable topic.
const PRONOUN_RESIDUE: ReadonlySet<string> = new Set([
  "it",
  "this",
  "that",
  "them",
  "those",
  "these",
  "things",
  "stuff",
]);

const SORTED_PREFIXES = [...LEADING_PREFIXES].sort((a, b) => b.length - a.length);
const SORTED_FILLERS = [...TRAILING_FILLERS].sort((a, b) => b.length - a.length);

/**
 * Strip conversational scaffolding from a benign question to recover its searchable topic.
 * Returns "" when there is nothing worth retrying with. Pure + deterministic.
 */
export function extractSearchTerms(raw: string): string {
  // Normalize: lowercase, punctuation -> space, collapse whitespace.
  const normalized = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  let s = normalized;
  let changed = false;

  // Strip ONE leading prefix (longest match first).
  for (const p of SORTED_PREFIXES) {
    if (s === p || s.startsWith(p + " ")) {
      s = s.slice(p.length).trim();
      changed = true;
      break;
    }
  }

  // Strip up to two leading articles/possessives ("for a" already consumed the preposition).
  for (let i = 0; i < 2; i++) {
    const m = s.match(LEADING_ARTICLE);
    if (!m) break;
    s = s.slice(m[0].length);
    changed = true;
  }

  // Strip ONE trailing filler (longest match first).
  for (const f of SORTED_FILLERS) {
    if (s === f || s.endsWith(" " + f)) {
      s = s.slice(0, s.length - f.length).trim();
      changed = true;
      break;
    }
  }

  s = s.replace(/\s+/g, " ").trim();

  if (!changed) return ""; // nothing simplified — retrying the identical string is pointless
  if (s.length < 3) return ""; // too thin to be a useful search term
  if (s.split(" ").every((w) => PRONOUN_RESIDUE.has(w))) return ""; // bare pronoun residue
  return s;
}
