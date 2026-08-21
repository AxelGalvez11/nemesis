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

/**
 * How much of the prompt the gathered pages may occupy.
 *
 * 🔴 A FACT ABOUT THE MODEL'S WINDOW, NOT A CAP ON THE SEARCH. Every cap on how MANY results come
 * back is gone and stays gone — the model asks for what the question needs. But the search loop
 * accumulates: four rounds of fifty is two hundred pages, re-sent in full every round, and at
 * roughly 300 tokens a page that is 60,000 tokens of web results alone, before the conversation,
 * the attached material and the prompt itself. Nothing bounded it, which is a hole I opened when I
 * made the loop accumulate.
 *
 * 120,000 characters is about 100 pages, or 30,000 tokens. Twice the budget history gets
 * (HISTORY_CHAR_BUDGET), because on a turn that searched, the evidence IS the turn — and still
 * leaving room for everything else. No question anyone has named has needed a hundred pages.
 */
export const WEB_CONTEXT_CHAR_BUDGET = 120_000;

/**
 * The pages that fit, newest first, and how many did not.
 *
 * 🔴 NEWEST FIRST BECAUSE LATER SEARCHES ARE THE REFINED ONES. The model searches again when the
 * first query was aimed wrong or when it needs a tiebreak, so what came back last is what it went
 * looking for on purpose. Dropping from the front would throw away the answer to the question it
 * had just worked out how to ask.
 */
export function webContextThatFits(
  results: readonly ChatWebResult[],
  budget = WEB_CONTEXT_CHAR_BUDGET,
): { kept: ChatWebResult[]; dropped: number } {
  const kept: ChatWebResult[] = [];
  let used = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const result = results[i];
    if (!result) continue;
    const cost = result.url.length + result.title.length + result.description.length;
    // Always keep at least one, however long: an empty context on a turn that searched is worse
    // than one oversized page.
    if (kept.length > 0 && used + cost > budget) break;
    kept.unshift(result);
    used += cost;
  }
  return { dropped: results.length - kept.length, kept };
}

export function formatWebSearchContext(results: ChatWebResult[]): string {
  const usable = usableWebResults(results);
  if (usable.length === 0) return "";
  // Titles and snippets are whatever a stranger put on a web page, and a page
  // that wants to be found by a study assistant can say anything it likes in the
  // description a search engine echoes back. Same fence as an attachment: this
  // is the more exposed of the two, because nobody chose to open it.
  const { dropped, kept } = webContextThatFits(usable);
  return [
    "PROVISIONAL EXTERNAL EVIDENCE from live web search. Search snippets are evidence leads, not automatically settled facts and not learner knowledge. Use them for current claims only to the degree they support those claims. When a sentence relies on one of them, end that sentence with that result's number in square brackets, like [1]. Only cite a number for a fact that actually came from these results, use at most one number per sentence, and never write the raw URL in the prose.",
    // 🔴 SAID OUT LOUD, NOT DROPPED QUIETLY. A model that believes it was shown everything it found
    // will answer as though it read everything it found.
    ...(dropped > 0
      ? [`${dropped} further page${dropped === 1 ? "" : "s"} were found and are not shown here — there was not room. `
        + "Say so if the answer turns on something you could not read."]
      : []),
    UNTRUSTED_CONTENT_RULE,
    ...kept.map((result, index) =>
      wrapUntrusted(
        `result ${index + 1}`,
        `${index + 1}. ${result.title || result.url}\nURL: ${result.url}\n${result.description}`,
      ),
    ),
  ].join("\n\n");
}
