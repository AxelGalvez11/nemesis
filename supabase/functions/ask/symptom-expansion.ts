// Symptom-question -> clinical-term expansion for the live research fan-out (PubMed / Europe PMC /
// MedlinePlus / ClinicalTrials). Pure, deterministic, no LLM call.
//
// WHY THIS EXISTS: PubMed and MedlinePlus both do strict AND-of-all-words matching. A natural
// "why is my X" question sent verbatim ("why is my skin itchy") retrieves 0 hits from both, while
// the bare clinical/consumer term ("itchy skin" / "pruritus") retrieves thousands. `extractSearchTerms`
// (search-query.ts) already strips a fixed list of conversational LEADING_PREFIXES, but that list has
// no entry starting with "why" — this module is additive, NOT a rewrite of that file, so its existing
// (ungated) callers are completely unaffected.
//
// GATED: only called from the SYMPTOM_RETRIEVAL_BREADTH-gated branch in index.ts's augmentWithLive.
// With the flag off, this file is imported but never invoked, so the live engine is byte-identical.
//
// Deliberately conservative: a small explicit "why" pattern strip + a small symptom-synonym map for
// terms known to fail literal PubMed/MedlinePlus matching. Returns null when there's nothing to
// expand, so callers can fall back to the existing behavior untouched.

// Leading "why is/does/do/am/are my/i ..." conversational scaffolding. Longest match first so e.g.
// "why do i have" is stripped whole rather than leaving "have <symptom>" behind.
const WHY_PREFIXES: readonly string[] = [
  "why is my",
  "why are my",
  "why does my",
  "why do i have",
  "why do i get",
  "why am i getting",
  "why am i having",
  "why is it that my",
  "why does it feel like my",
];

const SORTED_WHY_PREFIXES = [...WHY_PREFIXES].sort((a, b) => b.length - a.length);

// Trailing filler words that add nothing to a literature/consumer-health search once the leading
// scaffolding is gone (mirrors search-query.ts's TRAILING_FILLERS, kept separate on purpose — see
// file header on why this module never shares mutable state with the ungated extractSearchTerms).
const TRAILING_FILLERS: readonly string[] = [
  "all the time",
  "right now",
  "lately",
  "again",
  "so much",
  "so bad",
  "constantly",
];
const SORTED_TRAILING_FILLERS = [...TRAILING_FILLERS].sort((a, b) => b.length - a.length);

// Small, explicit symptom -> clinical/consumer-health synonym map. Conservative and additive: only
// covers common everyday symptom words verified (per the diagnosis) to under-match on PubMed/
// MedlinePlus in their plain-English form. `term` is what actually gets searched; `synonyms` are
// ADDED alongside it (not a replacement) so the search covers both the consumer phrase and the
// clinical name, exactly like the existing dandruff -> seborrheic dermatitis entry in
// entity-intelligence.ts (that catalog is left untouched; this is a parallel gated-only map).
const SYMPTOM_SYNONYMS: ReadonlyMap<string, readonly string[]> = new Map([
  ["itchy skin", ["pruritus"]],
  ["itchy", ["pruritus"]],
  ["itching", ["pruritus"]],
  ["dry skin", ["xerosis"]],
  ["bloating", ["abdominal distension"]],
  ["brain fog", ["cognitive impairment"]],
  ["hair loss", ["alopecia"]],
  ["heart racing", ["palpitations"]],
  ["racing heart", ["palpitations"]],
  ["dizzy", ["dizziness", "vertigo"]],
  ["dizziness", ["vertigo"]],
  ["numbness", ["paresthesia"]],
  ["tingling", ["paresthesia"]],
  ["swollen ankles", ["peripheral edema"]],
  ["swollen feet", ["peripheral edema"]],
  ["night sweats", ["nocturnal hyperhidrosis"]],
  ["dry mouth", ["xerostomia"]],
  ["shortness of breath", ["dyspnea"]],
  ["trouble sleeping", ["insomnia"]],
  ["can't sleep", ["insomnia"]],
  ["low energy", ["fatigue"]],
  ["no energy", ["fatigue"]],
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const LEADING_ARTICLE = /^(a|an|the|my|some|any)\s+/;

/**
 * Strip a leading "why is/does my ..." conversational frame and a trailing filler, returning the
 * bare symptom phrase. Returns "" when no WHY_PREFIXES match (nothing to strip) or the residue is
 * too thin. Pure + deterministic.
 */
function stripWhyFrame(raw: string): string {
  const normalized = norm(raw);
  if (!normalized) return "";

  let s = normalized;
  let changed = false;

  for (const p of SORTED_WHY_PREFIXES) {
    if (s === p || s.startsWith(p + " ")) {
      s = s.slice(p.length).trim();
      changed = true;
      break;
    }
  }
  if (!changed) return "";

  for (let i = 0; i < 2; i++) {
    const m = s.match(LEADING_ARTICLE);
    if (!m) break;
    s = s.slice(m[0].length);
  }

  for (const f of SORTED_TRAILING_FILLERS) {
    if (s === f || s.endsWith(" " + f)) {
      s = s.slice(0, s.length - f.length).trim();
      break;
    }
  }

  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 3) return "";
  return s;
}

/**
 * Look up clinical/consumer-health synonyms for a bare symptom phrase. Tries the whole phrase first
 * (longest match), then falls back to checking if any known symptom key appears in it as a whole
 * word. Returns [] when nothing in the map matches.
 */
function lookupSynonyms(symptomPhrase: string): string[] {
  const n = norm(symptomPhrase);
  if (!n) return [];
  const direct = SYMPTOM_SYNONYMS.get(n);
  if (direct) return [...direct];

  for (const [key, synonyms] of SYMPTOM_SYNONYMS) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(n)) return [...synonyms];
  }
  return [];
}

export interface SymptomExpansion {
  /** The bare symptom phrase stripped of "why is my..." scaffolding, e.g. "skin itchy". */
  symptomPhrase: string;
  /** Clinical/consumer-health synonyms found for the phrase, e.g. ["pruritus"]. Empty if none matched. */
  synonyms: string[];
  /**
   * The single search-ready term to send to the live sources. NEVER a concatenation of the phrase
   * and its synonyms — verified live against PubMed esearch AND MedlinePlus wsearch (both, not just
   * the AND-strict one the diagnosis called out) that joining them together UNDERPERFORMS either
   * alone on every case tested:
   *   MedlinePlus  "itchy skin"->29        "pruritus"->40        "skin itchy pruritus"->10
   *   MedlinePlus  "hair loss"->23         "alopecia"->9          "hair loss alopecia"->9
   *   MedlinePlus  "brain fog"->4          "cognitive impairment"->6  "brain fog cognitive impairment"->1
   *   PubMed       "hair loss"->47226      "alopecia"->32243      "hair loss alopecia"->32207
   *   PubMed       "brain fog"->19039      "cognitive impairment"->199790  concat->1404
   * The bare stripped phrase (`symptomPhrase`) is the one term guaranteed to exist whenever this
   * function returns non-null (the synonym map is a conservative, partial catalog), and it measured
   * well across every case above, so it — not a synonym, and never a join — is what `expandedQuery`
   * carries. `synonyms` is still returned (unused by the live-source call today) so a future caller
   * that wants to try the synonym as a SEPARATE fan-out query (not joined) has it available.
   */
  expandedQuery: string;
}

/**
 * Expand a conversational "why is my X" symptom question into a clinical-search-friendly string.
 * Returns null when the question doesn't match a recognized "why" frame. Pure + deterministic;
 * never throws.
 */
export function expandSymptomQuery(question: string): SymptomExpansion | null {
  const symptomPhrase = stripWhyFrame(question);
  if (!symptomPhrase) return null;

  const synonyms = lookupSynonyms(symptomPhrase);

  return {
    symptomPhrase,
    synonyms,
    expandedQuery: symptomPhrase,
  };
}
