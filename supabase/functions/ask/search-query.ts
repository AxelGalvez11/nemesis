// Pure search-term extractor for the retry-on-empty path in gatherLiveCandidates.
//
// Conversational benign questions ("how do i get rid of heartburn fast?") send the whole sentence
// to PubMed, whose automatic term-mapping then matches NOTHING — while the bare key term
// ("heartburn") retrieves well (live: "what helps with heartburn?" -> 15 hits, "heartburn remedies"
// -> 27, "how do i get rid of heartburn fast?" -> 0). This strips the conversational scaffolding so
// a 0-result benign query can be RETRIED with the term that actually matches.
//
// It runs ONLY on the retry path (the primary fan-out already returned 0 AND no drug was named), so
// an imperfect strip can only ever turn "0 results" into "0 results" — it can NEVER dilute a query
// that already retrieved. Deterministic + unit-tested (no LLM call): the ANSWER stays grounded in
// whatever real sources the retry surfaces; only the SEARCH STRING is simplified here, never the
// claims. Returns "" when there is nothing useful to retry with (no simplification possible, or the
// residue is empty / too thin / a bare pronoun).

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

// ---------------------------------------------------------------------------------------------
// buildSubQueries: deterministic sub-query expansion (Phase 1 of the retrieval-depth workstream).
//
// The engine today runs ONE dense search per ask, embedding the raw (trimmed) question directly
// (see retrieve.ts / index.ts's primary `retrieve({ question, ... })` call — `extractSearchTerms`
// is used ONLY on the separate 0-result retry path, not the primary search). This turns a single
// question + its classification into a small, ordered list of search strings so a later stage
// (Task 2) can fan out into a few parallel recalls and merge the results into one pool before the
// single generate call. Pure string assembly ONLY — no LLM call, no randomness — so the same
// question + classification always yields the identical ordered array. That determinism is
// required so saved-chat replays and the guardrail suite stay stable, and so the fan-out stays
// bounded (never unbounded/agentic).
//
// DEVIATION FROM THE LITERAL BRIEF, NOTED: the brief says "element 0 = extractSearchTerms(question)
// ... so worst case = today's behavior." But extractSearchTerms only strips conversational
// lead-ins and returns "" whenever nothing was stripped (by design — see its own doc comment,
// "retrying the identical string is pointless"). For ordinary questions (including every prompt in
// the workstream's own baseline table, e.g. "Is sucralose bad for me?", "How effective is
// tirzepatide for weight loss?") it returns "". Using that empty string as element 0 verbatim
// would make the worst case *no retrieval* instead of *today's retrieval* — the opposite of the
// stated goal. So element 0 is `extractSearchTerms(question)` when it produces something, and
// falls back to the trimmed raw question (the exact string today's primary search already embeds)
// when extractSearchTerms returns "". `extractSearchTerms` is still consulted first and still wins
// when it has something to offer (e.g. the retry-path heartburn case), so it stays "in the
// formula" as the brief asked; only a real question ever produces base="" -> that only happens
// for empty/whitespace-only input, matching "[] if base is empty".
//
// Intent -> keyword map. Only intents where a keyword phrase plausibly sharpens literature recall
// get an entry; conversational/non-clinical intents (smalltalk, investment, drug_sourcing,
// general_health, health_context, label_summary, trial_lookup, pregnancy_pediatrics,
// supplement_peptide) are deliberately omitted so they add nothing beyond the base query.
const INTENT_KEYWORDS: Readonly<Partial<Record<string, string>>> = {
  side_effects: "adverse effects safety",
  emergency_overdose: "adverse effects safety",
  mechanism: "mechanism of action",
  evidence_for_claim: "randomized trial efficacy",
  comparison: "randomized trial efficacy",
  dosing: "dosing",
  drug_interaction: "drug interaction",
  drug_overview: "overview",
};

/**
 * Build up to 4 deterministic, deduped search-query strings from one question + its
 * classification. Element 0 is `extractSearchTerms(question)` when it yields something, otherwise
 * the trimmed raw question (the exact string today's primary dense search already embeds) — so
 * element 0 is only "" when the question itself is empty/whitespace, matching "[] if base is
 * empty" and guaranteeing worst case = today's single-query behavior. For each entity mention (in
 * order, capped so the total output stays <= 4), adds an "<entity> <intent-keyword>" variant when
 * the intent maps to a useful keyword. Duplicates (case-insensitive) are dropped, including the
 * case where a variant collides with the base or with another variant. Pure + deterministic: no
 * LLM call, no randomness.
 */
export function buildSubQueries(question: string, entityMentions: readonly string[], intent: string): string[] {
  const base = extractSearchTerms(question) || question.trim();
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  push(base);

  const keyword = INTENT_KEYWORDS[intent];
  if (keyword) {
    for (const entity of entityMentions) {
      if (out.length >= 4) break;
      const trimmedEntity = entity.trim();
      if (!trimmedEntity) continue;
      push(`${trimmedEntity} ${keyword}`);
    }
  }

  return out.slice(0, 4);
}
