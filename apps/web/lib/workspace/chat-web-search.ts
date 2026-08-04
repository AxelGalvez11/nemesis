import { UNTRUSTED_CONTENT_RULE, wrapUntrusted } from "@nemesis/shared";

export interface ChatWebResult {
  title: string;
  url: string;
  description: string;
}

const EXPLICIT_WEB_PATTERN = /\b(search(?: the)? web|web search|look(?:\s+(?:it|this|that))?\s+up|browse|online|internet|source(?:s)?|cite|link(?:s)?)\b/i;
const CURRENT_INFO_PATTERN = /\b(latest|current|currently|today|tonight|yesterday|tomorrow|news|price|weather|score|schedule|standings|release|version|update|recent|live)\b/i;
const CHANGING_FACT_PATTERN = /\bwho\s+(?:is|are|won|leads|runs|owns)|\b(?:president|prime minister|ceo|champion|winner)\b/i;
const LIVE_SPORTS_PATTERN = /\b(world cup|super bowl|olympics?|playoffs?|finals?|tournament|match|game|who won|score|standings)\b/i;
const RECENT_YEAR_PATTERN = /\b202[4-9]\b/;
const EMERGING_ENTITY_PATTERN = /\b(?:what|who)\s+(?:is|are)\s+(?:the\s+)?[\p{L}\p{N}._-]+(?:\s+[\p{L}\p{N}._-]+){0,4}\s+(?:agent|ai|app|company|framework|library|model|platform|plugin|product|project|service|software|tool)\b/iu;

export function shouldSearchWeb(query: string): boolean {
  const compact = query.trim();
  if (compact.length < 3) return false;
  return EXPLICIT_WEB_PATTERN.test(compact)
    || CURRENT_INFO_PATTERN.test(compact)
    || CHANGING_FACT_PATTERN.test(compact)
    || LIVE_SPORTS_PATTERN.test(compact)
    || EMERGING_ENTITY_PATTERN.test(compact)
    || RECENT_YEAR_PATTERN.test(compact)
    || /https?:\/\//i.test(compact);
}

/** Time-sensitive searches need an explicit date. Without it, providers can
 * rank an old winner or schedule above today's result. */
export function buildFreshSearchQuery(query: string, now = new Date()): string {
  if (!CURRENT_INFO_PATTERN.test(query) && !CHANGING_FACT_PATTERN.test(query) && !LIVE_SPORTS_PATTERN.test(query)) return query;
  const date = now.toISOString().slice(0, 10);
  return `${query.trim()} current as of ${date}`;
}

/** How many web results reach the model. Ten, not five (owner 2026-08-04):
 *  a medicine, law, or engineering question rarely settles inside the first
 *  five hits, a search costs one metered unit regardless of how many results
 *  it returns, and five more snippets are only a few hundred extra tokens. */
export const MAX_WEB_RESULTS = 10;

/** The results that actually reach the model, in the exact order they are numbered in the prompt.
 *  The sources stored on the message MUST come from this same list: the answer's inline [n] markers
 *  are resolved positionally, so a list filtered differently would point a pill at the wrong source. */
export function usableWebResults(results: ChatWebResult[]): ChatWebResult[] {
  return results.filter((result) => result.url && (result.title || result.description)).slice(0, MAX_WEB_RESULTS);
}

export function formatWebSearchContext(results: ChatWebResult[]): string {
  const usable = usableWebResults(results);
  if (usable.length === 0) return "";
  // Titles and snippets are whatever a stranger put on a web page, and a page
  // that wants to be found by a study assistant can say anything it likes in the
  // description a search engine echoes back. Same fence as an attachment: this
  // is the more exposed of the two, because nobody chose to open it.
  return [
    "Live web search results. Use these for current facts. When a sentence relies on one of them, end that sentence with that result's number in square brackets, like [1]. Only cite a number for a fact that actually came from these results, use at most one number per sentence, and never write the raw URL in the prose.",
    UNTRUSTED_CONTENT_RULE,
    ...usable.map((result, index) =>
      wrapUntrusted(
        `result ${index + 1}`,
        `${index + 1}. ${result.title || result.url}\nURL: ${result.url}\n${result.description}`,
      ),
    ),
  ].join("\n\n");
}
