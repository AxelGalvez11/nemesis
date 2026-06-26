// Query-understanding helpers for terms that are NOT drug entities but matter for health questions.
//
// The classifier extracts drugs/supplements/compounds. A mainstream product name like "Celsius" may
// be health-relevant ("is celsius lethal?") but is not a drug label entity. If we treat it as a drug,
// openFDA field search/fabrication guard can misfire; if we leave it as a bare token, PubMed may miss
// the real topic. Keep this layer small, curated, and explicit: it adds search context and states the
// assumption instead of silently pretending the token is self-explanatory.

export interface ConsumerAlias {
  canonical: string;
  aliases: readonly string[];
  research_terms: readonly string[];
}

export interface QueryUnderstanding {
  /** Search string for free-text research providers (PubMed, Europe PMC, OpenAlex, MedlinePlus). */
  researchQuery: string;
  /** Topic string for non-label live providers (trials/FAERS); may be a normalized product name. */
  sourceQuery: string;
  /** Mentions that should still be treated as drug/supplement/compound names for entity resolution and openFDA. */
  fieldMentions: string[];
  /** User-visible assumptions to prepend to generation when useful. */
  assumptions: string[];
  /** Canonical product/topic names inferred from aliases. */
  normalizedTerms: string[];
}

const CONSUMER_ALIASES: readonly ConsumerAlias[] = [
  {
    canonical: "Celsius energy drink",
    aliases: ["celsius", "celcius", "celsuis"],
    research_terms: [
      "Celsius energy drink",
      "energy drink",
      "caffeine",
      "taurine",
      "guarana",
      "toxicity",
      "adverse effects",
      "arrhythmia",
    ],
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function hasWord(haystack: string, needle: string): boolean {
  const esc = norm(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!esc) return false;
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(haystack);
}

function matchesAlias(alias: ConsumerAlias, question: string, mentions: readonly string[]): boolean {
  const q = norm(question);
  return alias.aliases.some((a) => hasWord(q, a)) ||
    mentions.some((m) => alias.aliases.some((a) => norm(m) === norm(a)));
}

function isAliasMention(mention: string, aliases: readonly ConsumerAlias[]): boolean {
  const m = norm(mention);
  return aliases.some((a) => a.aliases.some((alias) => m === norm(alias)));
}

function dedupeWords(parts: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts.flatMap((p) => norm(p).split(/\s+/)).filter(Boolean)) {
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(" ");
}

export function understandQuery(
  question: string,
  entityMentions: readonly string[],
  baseResearchQuery: string = question,
): QueryUnderstanding {
  const aliases = CONSUMER_ALIASES.filter((a) => matchesAlias(a, question, entityMentions));
  const fieldMentions = entityMentions.filter((m) => !isAliasMention(m, aliases));

  if (aliases.length === 0) {
    return {
      researchQuery: baseResearchQuery,
      sourceQuery: fieldMentions.length ? fieldMentions.join(" ") : question,
      fieldMentions,
      assumptions: [],
      normalizedTerms: [],
    };
  }

  const normalizedTerms = aliases.map((a) => a.canonical);
  const extraTerms = aliases.flatMap((a) => a.research_terms);
  return {
    researchQuery: dedupeWords([baseResearchQuery, ...extraTerms]),
    sourceQuery: fieldMentions.length ? fieldMentions.join(" ") : normalizedTerms.join(" "),
    fieldMentions,
    assumptions: aliases.map((a) => `Interpreting "${a.aliases[0]}" as ${a.canonical}.`),
    normalizedTerms,
  };
}
