// Turning a topic nobody attached anything for into something Nemesis can actually teach.
//
// 🔴 THE GAP THIS CLOSES, MEASURED IN PRODUCTION. "Teach me innate immunity." routed to teaching
// correctly and then produced a canvas saying *"Nemesis has your material but hasn't found anything
// to ask you about yet."* — because `begin(topic)` set a title and a state, and every downstream
// step reads KNOWLEDGE, which is built from SOURCES, of which there were none. The learner asked to
// be taught and got an empty room.
//
// 🔴 THE FIX REUSES THE PATH THAT ALREADY WORKS RATHER THAN INVENTING A SECOND ONE. `learnFromAside`
// already turns a conversation into a lesson by promoting the pages the answer cited through
// `attachUrl` — the ordinary source-ingestion door, so filing, extraction, knowledge and citations
// all happen exactly as they do for an uploaded lecture. A bare topic has no cited pages yet, so
// this finds some. Everything after that is identical, which is the point: there is ONE ingestion
// pipeline and one knowledge substrate, and the source of the material is the only thing that
// varies.
//
// 🔴 CONSERVATIVE BY MANDATE, AND THE NUMBERS ARE THE PRODUCT RULE, NOT A GUESS. One search, then
// a small number of pages actually read. Searching five reworded variants would cost five metered
// units to answer the same question, and promoting all ten hits would make Brave's rank order the
// curriculum and hand the learner ten durable sources they never chose.

/** How many pages a topic is grounded on before teaching starts. */
export const GROUNDING_SOURCE_LIMIT = 3;

export interface WebHit {
  url: string;
  title?: string;
  description?: string;
}

/**
 * The one query to run for a topic.
 *
 * 🔴 THE LEARNER'S OWN WORDS, MINUS THE INSTRUCTION TO US. "Teach me innate immunity" is a request
 * aimed at Nemesis; searching for it verbatim spends the query on the word "teach" and returns
 * lesson plans and tutoring services rather than the subject. What is wanted is the noun phrase
 * underneath. Everything stripped here is an instruction TO THE SYSTEM, which is why removing it is
 * field-agnostic — it never touches the subject, in any discipline.
 */
export function groundingQuery(topic: string): string {
  const stripped = topic
    .trim()
    .replace(/^(?:can you|could you|please|i(?:'| a)?m ready to|i want to|i(?:'| wou)?ld like to|help me)\s+/i, "")
    .replace(/^(?:teach|tutor|coach|quiz|test|drill|train|walk me through|take me through|study|revise|review|learn)\s+/i, "")
    .replace(/^(?:me|us)\s+/i, "")
    // "Help me UNDERSTAND inflation" — the comprehension verb is part of the request, not the
    // subject, and it survives the teaching-verb pass because "help me" was stripped first.
    .replace(/^(?:understand|grasp|get|figure out|make sense of|wrap my head around)\s+/i, "")
    .replace(/^(?:about|on|the basics of|through)\s+/i, "")
    .replace(/[.?!]+$/, "")
    .trim();
  // If stripping ate everything, the original was the subject after all.
  return stripped || topic.trim();
}

/**
 * Which results are worth reading, in answer order.
 *
 * 🔴 A LINK WITHOUT A TITLE OR A DESCRIPTION IS NOT A LEAD, IT IS A ROW. Brave returns those, and
 * promoting one costs a page fetch, an extraction, and a durable source the learner never chose.
 * Deduplicated by host as well as by URL: three pages of one site is a narrower grounding than one
 * page each from three, and a topic taught from a single domain inherits that domain's framing.
 */
export function groundingSources(hits: readonly WebHit[], limit = GROUNDING_SOURCE_LIMIT): WebHit[] {
  const chosen: WebHit[] = [];
  const seenUrl = new Set<string>();
  const seenHost = new Set<string>();
  for (const hit of hits) {
    if (chosen.length >= limit) break;
    const url = hit.url?.trim();
    if (!url) continue;
    if (!hit.title?.trim() && !hit.description?.trim()) continue;
    if (seenUrl.has(url)) continue;
    let host = "";
    try {
      host = new URL(url).host.replace(/^www\./, "");
    } catch {
      // An unparseable URL cannot be deduplicated by host, and `attachUrl` would fail on it anyway.
      continue;
    }
    if (seenHost.has(host)) continue;
    seenUrl.add(url);
    seenHost.add(host);
    chosen.push(hit);
  }
  return chosen;
}

/**
 * Does this canvas need grounding before it can teach?
 *
 * 🔴 THE ONLY CASE IS "A TOPIC AND NOTHING ELSE". A canvas with sources already has material —
 * grounding it from the web would add pages the learner did not ask for alongside their own
 * lecture, and quietly dilute the thing they came to study with whatever a search engine returned.
 * Their material is the curriculum whenever they supplied one.
 */
export function needsGrounding(input: { topic: string; attachedSources: number }): boolean {
  return input.attachedSources === 0 && input.topic.trim().length > 0;
}
