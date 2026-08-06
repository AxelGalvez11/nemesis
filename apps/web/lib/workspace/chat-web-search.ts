import { UNTRUSTED_CONTENT_RULE, wrapUntrusted } from "@nemesis/shared";

export interface ChatWebResult {
  title: string;
  url: string;
  description: string;
}

/**
 * A result as the model sees it, carrying the number it must cite.
 *
 * 🔴 THE NUMBER IS ASSIGNED BY THE TURN, NOT BY THE SEARCH. An answer's inline
 * [n] markers resolve POSITIONALLY against the sources stored on the message,
 * so a second search_web call in the same turn cannot start counting at 1
 * again: its results append to one running list and are numbered from where
 * the previous call stopped. Getting this wrong does not fail loudly — it
 * points a citation pill at the wrong page.
 */
export interface NumberedWebResult extends ChatWebResult {
  n: number;
}

// 🔴 THE KEYWORD LISTS THAT USED TO LIVE HERE ARE GONE (owner 2026-08-06).
//
// Seven regexes decided, before the model ever saw the question, whether to buy
// a live web search. Measured against the source-routing acceptance set on the
// day they were removed, they:
//
//   * searched the web to answer "who are you?"          (\bwho\s+(is|are))
//   * searched for "who is my professor for pharmacology" (same rule, and the
//     answer is in the student's own course data — the web has never heard of
//     their professor)
//   * searched for "what are my sources for this note"    ("sources")
//   * searched for "explain the 2026 syllabus"            (a recent year, which
//     in a syllabus is a DATE)
//   * and missed "Has the Supreme Court ruled on that case yet?", which needs
//     the web and contains not one listed word.
//
// The lists could not have worked. A word list is English-only, it cannot see
// whether "schedule" means the student's timetable or a train timetable, and
// every fix to one false positive opened another. What replaces it is the
// search_web tool in agent-tools.ts: the model reads the question and decides,
// the same way it already decided about the Library and the Calendar.
//
// Nothing takes their place here on purpose. A "narrow fast path" for a literal
// URL was considered and dropped: the model handles a pasted URL correctly, and
// a surviving shortcut is where the next keyword list starts growing back.

/** How many web results reach the model. Ten, not five (owner 2026-08-04):
 *  a medicine, law, or engineering question rarely settles inside the first
 *  five hits, a search costs one metered unit regardless of how many results
 *  it returns, and five more snippets are only a few hundred extra tokens. */
export const MAX_WEB_RESULTS = 10;

/**
 * Number a fresh batch of results, continuing from what the turn already has.
 *
 * `already` is every source collected by earlier search_web calls this turn.
 * A result whose URL is already on the list keeps its ORIGINAL number rather
 * than being added twice — two searches on one topic legitimately overlap, and
 * the same page cited as both [2] and [7] reads as two sources agreeing.
 */
export function numberWebResults(already: ChatWebResult[], fresh: ChatWebResult[]): {
  numbered: NumberedWebResult[];
  added: ChatWebResult[];
} {
  const sources = [...already];
  const numbered: NumberedWebResult[] = [];
  for (const result of usableWebResults(fresh)) {
    const seen = sources.findIndex((existing) => existing.url === result.url);
    if (seen >= 0) {
      numbered.push({ ...sources[seen]!, n: seen + 1 });
      continue;
    }
    sources.push(result);
    numbered.push({ ...result, n: sources.length });
  }
  return { added: sources.slice(already.length), numbered };
}

/** The results that actually reach the model, in the exact order they are numbered in the prompt.
 *  The sources stored on the message MUST come from this same list: the answer's inline [n] markers
 *  are resolved positionally, so a list filtered differently would point a pill at the wrong source. */
export function usableWebResults(results: ChatWebResult[]): ChatWebResult[] {
  return results.filter((result) => result.url && (result.title || result.description)).slice(0, MAX_WEB_RESULTS);
}

/**
 * One search_web result batch, as the model reads it.
 *
 * Still fenced as untrusted, and MORE carefully than before rather than less:
 * these snippets are whatever a stranger put on a web page, and a page that
 * wants to be found by a study assistant can write anything it likes in the
 * description a search engine echoes back. The one thing that changed is who
 * asked for them — the model now chose to search, so this text arrives as a
 * tool result rather than stapled to the student's message.
 */
export function formatWebSearchContext(results: NumberedWebResult[]): string {
  if (results.length === 0) return "";
  return [
    "Live web search results. When a sentence relies on one of them, end that sentence with that result's number in square brackets, like [1]. "
    + "Use the number shown against each result — they continue across searches within this turn, so do not renumber them. Only cite a number for a "
    + "fact that actually came from these results, use at most one number per sentence, and never write the raw URL in the prose.",
    UNTRUSTED_CONTENT_RULE,
    ...results.map((result) =>
      wrapUntrusted(
        `result ${result.n}`,
        `${result.n}. ${result.title || result.url}\nURL: ${result.url}\n${result.description}`,
      ),
    ),
  ].join("\n\n");
}
