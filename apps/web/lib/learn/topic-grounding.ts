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
// 🔴🔴 THE COUNT CAP IS GONE — owner call, 2026-08-19: "why even cap? shouldnt deepseek decide
// whether the sources are enough and or good or not? ... take off caps because latency shouldnt be
// an issue if quality is good." It was three. The reasoning for three was that promoting every hit
// "would make Brave's rank order the curriculum", and that reasoning was answered rather than
// overruled: rank order is not the curriculum, because nothing downstream teaches in rank order.
// The teaching controller reads knowledge extracted from every source together and chooses what is
// worth the learner's next minute; giving it three of ten pages does not protect it from a bad
// ranking, it just gives it less to choose from and makes WHICH three a decision made here, by a
// constant, with no view of the material.
//
// 🔴 ONE SEARCH, STILL. That half of the old rule stands and is a different question — searching
// five reworded variants spends five metered units to answer one question, and no one asked for
// that.
//
// 🔴 AND THE DEDUPLICATION STAYS, BECAUSE IT WAS NEVER A BUDGET. One page per host is a QUALITY
// property: a topic taught from three pages of one site inherits that site's framing, and it would
// still do that at thirty. What was removed is the count; what is kept is everything that made the
// chosen pages worth reading.

export interface WebHit {
  url: string;
  title?: string;
  description?: string;
}

// 🔴 `groundingQuery` WAS DELETED, AND SO WAS THE REASON IT EXISTED. It stripped five layers of
// prefix off the canvas title before searching — "can you|could you|please|i want to|help me", then
// "teach|tutor|coach|quiz|test|drill|walk me through|study|revise|learn", then "me|us", then
// "understand|grasp|figure out|wrap my head around", then "about|on|the basics of". All of it was
// patching one thing: a canvas whose TITLE was the learner's whole sentence.
//
// That was always a bug in its own right, not just a bad search — `learnFromAside`'s own comment
// records canvases called "what is incretin?". The title comes from the model's `topic` now (see
// lib/learn/turn-router.ts), which is the subject and nothing else, so there is no instruction left
// to strip. Where the model names no subject, `begin` starts from the attached material instead of
// titling a canvas with a sentence and then searching for it.

/**
 * Which results are worth reading, in answer order.
 *
 * 🔴 A LINK WITHOUT A TITLE OR A DESCRIPTION IS NOT A LEAD, IT IS A ROW. Brave returns those, and
 * promoting one costs a page fetch, an extraction, and a durable source the learner never chose.
 * Deduplicated by host as well as by URL: three pages of one site is a narrower grounding than one
 * page each from three, and a topic taught from a single domain inherits that domain's framing.
 */
export function groundingSources(hits: readonly WebHit[]): WebHit[] {
  const chosen: WebHit[] = [];
  const seenUrl = new Set<string>();
  const seenHost = new Set<string>();
  for (const hit of hits) {
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
