// Deciding whether a typed message is a QUESTION (answer it, do not touch the document) or an
// INSTRUCTION about the document (keep the existing behaviour: write it into the canvas).
//
// Product mandate rule 1 (owner, 2026-08-15): "The learner must be able to ask ordinary questions
// about their sources WITHOUT being forced into tutoring behaviour." Today every typed message
// that reaches `learning-canvas.tsx`'s `submit()` and is not a rewrite request goes to
// `session.command()`, which always mutates the canvas document, using a system prompt that says
// outright "you are not chatting". A learner who asks "what does osmolarity mean" or "who wrote
// this act" gets a paragraph permanently inserted into their study document instead of a plain
// reply. This file is the decision that pulls the genuinely conversational subset out of that
// path; `canvas-chat.ts` is what answers them once pulled out.
//
// 🔴 CONSERVATIVE BY DESIGN, NOT BY OMISSION. The failure mode on the other side is worse: routing
// an edit instruction to a transient reply would make "Summarize this" (contract §24, explicitly
// preserved) silently stop writing anything to the page. So this only pulls out text that reads as
// a QUESTION and does not open with a document-editing verb. Everything else, including a bare
// declarative statement with no question mark, keeps taking the path it takes today.
//
// 🔴 FIELD-AGNOSTIC BY CONSTRUCTION. Both lists below are about the GRAMMAR of the request, not its
// subject: "what is X" is a question shape whether X is a statute, a bond angle or a verb tense,
// and "summarize this" is an editing instruction on the same terms regardless of field. Neither
// list names a discipline, and neither would need to.

/** Openings that read as a question independent of punctuation, so "what is a tort" routes the
 *  same way whether or not the learner bothered to type the question mark. */
const INTERROGATIVE_OPENING =
  /^(what|why|how|when|where|which|who|whose|does|do|did|is|are|was|were|can|could|would|should|will|has|have|had)\b/i;

/**
 * An instruction to change or extend the document, which always outranks a trailing question
 * mark. "Summarize this for me?" is still an instruction to write a summary; the politeness at
 * the end does not turn it into a request for a spoken-style reply.
 *
 * 🔴 THIS IS A LIST OF INSTRUCTIONS TO THE SYSTEM, THE SAME JUSTIFICATION `asksForRewrite` (lib/learn/
 * canvas-phrases.ts) ALREADY RELIES ON FOR THE IDENTICAL REASON: a verb naming what to DO with the
 * document generalises across every field it could be written about.
 */
const EDIT_DOCUMENT_IMPERATIVE =
  /^(summarize|summarise|write|draft|add|insert|create|make|outline|expand|continue|compose|generate|list|rewrite|edit|update|revise|build|turn this into|convert this into)\b/i;

/**
 * Is this typed message a plain question Nemesis should just answer, rather than an instruction
 * about the study document?
 *
 * 🔴 CALLED ONLY AFTER `routeComposerText` HAS ALREADY RULED OUT A REWRITE. `learning-canvas.tsx`'s
 * `submit()` only reaches this function on `routing.kind === "ordinary"`: a rewrite phrase
 * ("make this simpler", "I don't understand this") is already routed elsewhere by the time this
 * runs, so this function does not need to repeat that check.
 */
export function isOrdinaryChatQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // The instruction reading wins over the question mark, not the other way round.
  if (EDIT_DOCUMENT_IMPERATIVE.test(trimmed)) return false;
  return INTERROGATIVE_OPENING.test(trimmed) || trimmed.endsWith("?");
}
