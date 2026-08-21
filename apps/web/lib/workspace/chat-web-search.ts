import { UNTRUSTED_CONTENT_RULE, wrapUntrusted } from "@nemesis/shared";

export interface ChatWebResult {
  title: string;
  url: string;
  description: string;
}

/**
 * A message that carries a URL is asking for that page, whatever else it says.
 *
 * 🔴 THE ONLY KEYWORD RULE LEFT IN THIS FILE, AND IT IS NOT A KEYWORD RULE. Everything else that
 * used to live here — EXPLICIT_WEB_PATTERN, CURRENT_INFO_PATTERN, CHANGING_FACT_PATTERN,
 * LIVE_SPORTS_PATTERN, EMERGING_ENTITY_PATTERN, RECENT_YEAR_PATTERN — was a list of English words
 * standing in for "does this need the live web". A word list cannot answer that: it is English-only,
 * so a student asking in Spanish never got a search, and it is blind to shape, so "has the EU signed
 * off on that rule yet" contains no listed word and was answered from stale training data. That
 * judgement is now made by the model, once, alongside everything else it decides (chat-intent.ts).
 *
 * A URL is different in kind. It is not a guess about what the student meant; the address is
 * literally in the message, and no reading of the sentence changes whether one is present. So it
 * stays in code, and it is checked in ADDITION to the model's answer rather than instead of it.
 */
export function carriesUrl(text: string): boolean {
  return /https?:\/\//i.test(text);
}

/**
 * The ceiling the SEARCH PROVIDER imposes, which is the only one left.
 *
 * 🔴 IT IS A FACT ABOUT BRAVE, NOT A POLICY OF OURS. `braveContextParams` clamps to this, so asking
 * for more is asking for something that cannot arrive. Every cap that used to sit under it was ours
 * and is gone: a client constant of ten, the limit this app sent, the search function's own default
 * of five, and a final slice that discarded anything past ten even when it had already been fetched
 * and paid for. One search bills one metered unit whatever the count comes back, so each of those
 * was throwing away evidence that had cost the same either way.
 *
 * How many to read is now the model's call (`webResults`, see @nemesis/shared chat-intent.ts): a
 * definition settles in three pages and a four-way comparison does not, and only the thing reading
 * the question knows which it is.
 */
export const PROVIDER_MAX_WEB_RESULTS = 50;

/**
 * The results that actually reach the model, in the exact order they are numbered in the prompt.
 *
 * The sources stored on the message MUST come from this same list: the answer's inline [n] markers
 * are resolved positionally, so a list filtered differently would point a pill at the wrong source.
 *
 * 🔴 IT NO LONGER TRUNCATES. Filtering out a row with no url and nothing to read is a judgement
 * about whether a result IS one; deciding that the eleventh good page is not worth showing was a
 * judgement about the question, made by a constant that never saw it.
 */
export function usableWebResults(results: ChatWebResult[]): ChatWebResult[] {
  return results.filter((result) => result.url && (result.title || result.description));
}

/**
 * The pages an answer actually relied on, in answer order.
 *
 * Search results are evidence leads, not automatically useful learning material. Promoting every
 * result into a Canvas would turn one cited answer into ten durable sources and make Brave's rank
 * order the curriculum. The answer already contains the model's claim-level selection as [n]
 * citations, so preserve that selection rather than inventing a second ranking rule here.
 */
export function citedWebResults(answer: string, sources: readonly ChatWebResult[]): ChatWebResult[] {
  const cited: ChatWebResult[] = [];
  const seen = new Set<number>();
  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const index = Number(match[1]) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= sources.length || seen.has(index)) continue;
    const source = sources[index];
    if (!source) continue;
    seen.add(index);
    cited.push(source);
  }
  return cited;
}

export function formatWebSearchContext(results: ChatWebResult[]): string {
  const usable = usableWebResults(results);
  if (usable.length === 0) return "";
  // Titles and snippets are whatever a stranger put on a web page, and a page
  // that wants to be found by a study assistant can say anything it likes in the
  // description a search engine echoes back. Same fence as an attachment: this
  // is the more exposed of the two, because nobody chose to open it.
  return [
    "PROVISIONAL EXTERNAL EVIDENCE from live web search. Search snippets are evidence leads, not automatically settled facts and not learner knowledge. Use them for current claims only to the degree they support those claims. When a sentence relies on one of them, end that sentence with that result's number in square brackets, like [1]. Only cite a number for a fact that actually came from these results, use at most one number per sentence, and never write the raw URL in the prose.",
    UNTRUSTED_CONTENT_RULE,
    ...usable.map((result, index) =>
      wrapUntrusted(
        `result ${index + 1}`,
        `${index + 1}. ${result.title || result.url}\nURL: ${result.url}\n${result.description}`,
      ),
    ),
  ].join("\n\n");
}
