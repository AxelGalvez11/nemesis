import { isStudyCreationPreferenceReply } from "@nemesis/shared";

import { detectsWorkspaceIntent } from "./workspace-intent";

/**
 * Zero-cost request routing for Nemesis chat.
 *
 * The browser makes this decision deterministically instead of spending a model
 * call on classification. What it decides is how to TALK about the turn — which
 * instruction rides, whether a workspace snapshot is attached.
 *
 * 🔴 IT NO LONGER DECIDES WHICH MODEL ANSWERS, OR HOW HARD (owner 2026-08-06:
 * "The client must not be trusted to authorize an expensive model"). This type
 * used to carry `model: "deepseek-chat" | "deepseek-reasoner"` and an optional
 * `reasoningEffort: "high"`, both of which went out on the wire and both of
 * which the gateway obeyed — so a browser chose what a turn cost. The server now
 * classifies the student's own words and picks the model itself; see
 * supabase/functions/_shared/work-class.ts.
 *
 * (`reasoningEffort` was already inert before it was removed: the composer's
 * effort pill went in 2026-07-31, every turn has been pinned to Medium since,
 * and Medium stripped the one branch that ever set it. The field survived its
 * own feature by five weeks, which is the argument for deleting it rather than
 * leaving it "in case".)
 */

export type ChatRoute = "conversation" | "learning" | "current" | "research";

export interface ChatRouteDecision {
  route: ChatRoute;
  searchWeb: boolean;
  /** Set when the student asked Nemesis to SAVE something into their own
   *  workspace.
   *
   *  🔴 Read the history here as history. This flag used to be load-bearing for
   *  a reason that no longer exists — tool calls only rode the non-thinking
   *  model, and this was what stopped the effort dial switching the tools off.
   *  Every route carries tools since 2026-08-06, so it defends
   *  nothing now. What it still does: keep a save off the expensive flagship,
   *  and mark the turn for SAVE_INSTRUCTION. */
  savesToWorkspace?: boolean;
  /** Set when the student is asking ABOUT their own workspace — their calendar,
   *  Library, or Study state — or asking for it to be reorganized.
   *
   *  🔴 Also historical in the same way: it used to guarantee the tools-capable
   *  model AND suppress sendChatTurn's web re-promotion and its paid pre-turn
   *  search. Neither mechanism exists any more — every route has tools, and the
   *  model decides about the web through search_web. What remains is the
   *  workspace instruction and the orientation snapshot. */
  workspaceIntent?: boolean;
}
const RESEARCH_PATTERN = /\b(deep research|research report|literature review|systematic review|compare (?:the )?(?:evidence|sources|studies)|primary sources?|scholarly sources?|peer[- ]reviewed|with citations?|cite (?:your|the) sources?|evidence for and against|state of the art|write (?:a )?report)\b/i;
const CURRENT_PATTERN = /\b(latest|current|currently|today|tonight|yesterday|tomorrow|news|price|weather|score|schedule|standings|release|version|update|recent|live|who (?:is|won|leads|runs|owns))\b/i;
const EXPLICIT_WEB_PATTERN = /\b(search(?: the)? web|web search|look(?:\s+(?:it|this|that))?\s+up|browse|online|internet)\b/i;
const LEARNING_PATTERN = /\b(explain|teach|learn|study|solve|derive|prove|analy[sz]e|compare|contrast|why|how|calculate|debug|interpret|summari[sz]e|quiz|flashcards?|practice|step[- ]by[- ]step|concept|theorem|case|argument|equation|code)\b/i;
const CASUAL_PATTERN = /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening)|who are you|what can you do)[!.?\s]*$/i;
const RECENT_YEAR_PATTERN = /\b202[4-9]\b/;

// A message that asks Nemesis to SAVE or CREATE something in the student's own
// workspace — a flashcard deck, a practice test, a mind map, a Library note, or
// a calendar event.
//
// 🔴 THE ORIGINAL STAKES ARE HISTORY, AND THE MATCHING IS NOT. This used to
// read "these MUST leave on the tools-capable model", because tool calls only
// rode deepseek-chat and routing a save to the reasoner meant it answered in
// prose and saved nothing — which is why "make me flashcards on beta blockers"
// (LEARNING_PATTERN matches "flashcards") once did nothing at all. Every route
// carries tools since 2026-08-06, so that failure cannot recur through this
// path. Detecting a save still decides which INSTRUCTION rides the turn, and
// the phrasings below are the ones students actually use.
//
// Two shapes are matched, deliberately narrow so ordinary learning questions
// never trip it:
//   1. A creation verb next to an UNAMBIGUOUS study artifact ("make flashcards",
//      "build a mind map", "create a practice test"). Those nouns never mean
//      anything but the artifact, so a nearby verb is enough. "write" is NOT a
//      save verb — "write a literature review" / "write a test for this
//      function" must stay on their normal routes.
//   2. An explicit "into my workspace" phrase for the AMBIGUOUS targets:
//      "add these to my deck", "save this as a note", "put my exam on my
//      calendar". "note"/"schedule"/"test" alone are ordinary words, so they
//      only count when anchored to the student's own deck/library/notes/calendar.
const SAVE_ARTIFACT =
  /\b(?:flash\s?cards?|mind\s?maps?|practice tests?|mock exams?|question banks?|study sets?|decks?|slides?|slide decks?|presentations?|study notes?|class notes?|lecture notes?|study guides?)\b/i;
const SAVE_VERB = /\b(?:make|create|build|generate|add|save|put together|whip up|draft|prep(?:are)?|turn\s+(?:this|that|these|it)\s+into|give me|set up)\b/i;
const SAVE_TO_WORKSPACE = /\b(?:to|in|into|on)\s+my\s+(?:deck|library|notes?|calendar|study(?:\s+(?:deck|list))?)\b|\bon my calendar\b|\bas a (?:library )?note\b|\b(?:add|put|save|schedule)\b[^.?!]{0,40}\bcalendar\b/i;

// Owner 2026-07-28: "i asked the chat to create test and instead of creating it
// in the test page it just dumped it into chat".
//
// SAVE_ARTIFACT above only knows "practice test" and "mock exam", so a bare
// "create a test" — which is how anyone actually asks — matched no artifact,
// was not a save, and went out on the tool-less reasoner. The model then wrote
// the whole test into the conversation because writing it was the only thing it
// could do. Same for "quiz" and "exam".
//
// A bare test/quiz/exam cannot join SAVE_ARTIFACT, because SAVE_VERB includes
// "prep" and "help me prepare for my test" is studying, not creating. So this
// requires the create verb to govern the noun DIRECTLY: "create a test" counts,
// "prepare for my test" does not, and "quiz me on the top 100 drugs" — a request
// to BE quizzed, not for a saved artifact — does not either, because nothing
// creates there.
//
// "write" is deliberately absent, matching SAVE_VERB: "write a test for this
// function" is a coding request and the suite has pinned that since long before
// this. CODE_TEST catches the rest of the programming sense, which a create verb
// otherwise walks straight into.
const CREATE_ASSESSMENT =
  /\b(?:make|create|build|generate|draft|whip up|put together|give me|set up)\s+(?:me\s+)?(?:an?|another|some|\d+)?\s*(?:new\s+)?(?:practice\s+|mock\s+)?(?:tests?|quiz(?:zes)?|exams?|question\s+banks?)\b/i;
const CODE_TEST =
  /\b(?:unit|integration|e2e|end-to-end|regression|snapshot)\s+tests?\b|\btests?\s+(?:for|of)\s+(?:this|that|the|my)\s+(?:function|method|class|component|module|code|file|endpoint)\b|\btest\s+(?:suite|case|file|harness)s?\b/i;

// ── accepting an offer the app itself made ───────────────────────────────────
// The lecture-intake skill ends every deck upload with "Want me to turn this
// into notes, flashcards, a practice test, or all three?" — and the student
// then replies with one word. "flashcards" carries no save verb, so the two
// rules above cannot see it; LEARNING_PATTERN matches `flashcards?` and sends
// the turn to the reasoner, which has no tools. Observed live 2026-07-27: the
// model wrote "[Calling tool: add_flashcards ...]" as PROSE, invented a
// "Pharmacology" deck that does not exist, and reported 14 cards saved. Nothing
// was written.
//
// The words alone can never decide this — "notes" and "all three" are not save
// requests in isolation. The offer is the missing half, so both sides must
// agree: the previous assistant turn ended by offering to build something, AND
// this reply is a short acceptance.
const OFFER_VERB = /\b(?:want me to|would you like me to|do you want me to|shall i|should i|i can)\b/i;
// `calendar`/`events`/`dates` are here because syllabus-intake's offer is "Want
// me to add these to your calendar?". Without them the offer went unrecognised,
// and a bare "yes" only kept its tools by falling through to the conversation
// route — which quietly breaks the moment the effort dial is on High, since
// that strips tools from everything except a decision flagged savesToWorkspace.
const OFFER_TARGET = /\b(?:notes?|flash\s?cards?|cards?|practice tests?|tests?|quiz(?:zes)?|mind\s?maps?|study guides?|deck|slides?|summary|outline|calendar|events?|dates|schedule)\b/i;
const ACCEPTANCE = /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|do it|go ahead|sounds good|all (?:three|of them|of it|of the above)|both|everything)\b/i;
/** A reply longer than this is the student saying something new, not "yes". */
const ACCEPTANCE_MAX_CHARS = 80;
/** Openers that make a short artifact-word reply a QUESTION about the artifact
 *  ("explain how flashcards help memory") rather than a request to build one. */
const NOT_AN_ACCEPTANCE = /^(?:what|why|how|when|where|who|which|is|are|does|can|could|would|explain|tell|describe|define|compare)\b/i;
/** Opens a question ABOUT something rather than a request FOR it. Deliberately
 *  excludes "can/could/would you", which are how students phrase a polite ask. */
const ASKS_ABOUT = /^(?:what|why|how|when|where|who|which)\b/i;

/** Did the assistant's previous turn end by offering to CREATE something? Only
 *  the last line counts — that is where an offer lands, and a mid-answer
 *  mention of flashcards is not an offer. */
export function offersToCreate(assistantText: string): boolean {
  const lastLine = assistantText.trim().split("\n").map((line) => line.trim()).filter(Boolean).pop() ?? "";
  if (!lastLine.endsWith("?")) return false;
  return OFFER_VERB.test(lastLine) && OFFER_TARGET.test(lastLine);
}

/** Is this reply a short "yes, build it"? Checked only against a real offer. */
export function acceptsOffer(text: string): boolean {
  const compact = text.trim();
  if (!compact || compact.length > ACCEPTANCE_MAX_CHARS || compact.includes("?")) return false;
  // "do it" and "ok" start with words NOT_AN_ACCEPTANCE would otherwise reject.
  if (ACCEPTANCE.test(compact)) return true;
  if (NOT_AN_ACCEPTANCE.test(compact)) return false;
  return OFFER_TARGET.test(compact);
}

/** Does this message ask to persist something in the student's workspace? Pure
 *  and exported so the routing tests can pin the real phrasings students use.
 *
 *  `priorAssistantText` is optional so every existing call site is unchanged;
 *  pass it wherever the conversation is available, because it is the only thing
 *  that can classify a bare "flashcards" or "all three". */
export function detectsSaveRequest(text: string, priorAssistantText = ""): boolean {
  const compact = text.trim();
  // "How do I make good flashcards?" is a question ABOUT the artifact, not a
  // request FOR one, but it carries both a save verb and a save noun. Asking
  // words only ever open a question; a request uses "can you", "could you" or
  // a bare imperative, none of which start this way.
  if (ASKS_ABOUT.test(compact)) return false;
  if (isStudyCreationPreferenceReply(compact, priorAssistantText)) return true;
  if (SAVE_VERB.test(compact) && SAVE_ARTIFACT.test(compact)) return true;
  if (CREATE_ASSESSMENT.test(compact) && !CODE_TEST.test(compact)) return true;
  if (SAVE_TO_WORKSPACE.test(compact)) return true;
  return offersToCreate(priorAssistantText) && acceptsOffer(compact);
}

/**
 * A turn whose only content is an attachment — the student typed nothing, so
 * there is no question to classify.
 *
 * Still a learning turn on the thinking model, because that is what reads a
 * lecture well. But never a web-search turn: the only text that could have
 * asked for one is the file itself, and a slide citing a recent year is not a
 * student asking for today's news.
 */
export const ATTACHMENT_ONLY_DECISION: ChatRouteDecision = { route: "learning", searchWeb: false };

export function classifyChatRequest(text: string, priorAssistantText = ""): ChatRouteDecision {
  const compact = text.trim();
  // A save request wins over every reasoner route below so its tools can fire.
  // We keep web when the topic needs it (deepseek-chat can still search), and we
  // never emit route "conversation" for a save, so sendChatTurn's web
  // re-promotion (which only upgrades "conversation" to the reasoner) can't
  // quietly undo this.
  if (detectsSaveRequest(compact, priorAssistantText)) {
    // RECENT_YEAR is deliberately NOT consulted here. In a save request a year
    // is part of a DATE — "add Aug 3 2026 exam to my calendar" — not a request
    // for current information, and every calendar request carries one. Measured
    // live 2026-07-27: that phrasing bought a paid search it had no use for.
    const wantsWeb = RESEARCH_PATTERN.test(compact) || CURRENT_PATTERN.test(compact) || EXPLICIT_WEB_PATTERN.test(compact);
    return wantsWeb
      ? { route: "current", savesToWorkspace: true, searchWeb: true }
      : { route: "learning", savesToWorkspace: true, searchWeb: false };
  }
  // An explicit deep-research request keeps the research pipeline — a student
  // asking for a literature review wants sources and synthesis, not their own
  // folders, even when the sentence brushes a workspace word.
  if (RESEARCH_PATTERN.test(compact)) {
    return { route: "research", searchWeb: true };
  }
  // A question about the student's OWN workspace outranks the remaining
  // reasoner routes, exactly like a save does — the answer comes from tools,
  // and tools only ride deepseek-chat. This check must sit ABOVE the
  // current-events branch: "organize my schedule", "what's due today",
  // "update my calendar" all contain CURRENT_PATTERN words, and before this
  // guard existed those exact phrasings were the ones guaranteed to lose
  // their tools and be told "you cannot see the calendar" (the 2026-08-05
  // calendar incident).
  if (detectsWorkspaceIntent(compact)) {
    const wantsWeb = EXPLICIT_WEB_PATTERN.test(compact);
    return { route: wantsWeb ? "current" : "conversation", searchWeb: wantsWeb, workspaceIntent: true };
  }
  if (CURRENT_PATTERN.test(compact) || EXPLICIT_WEB_PATTERN.test(compact) || RECENT_YEAR_PATTERN.test(compact)) {
    return { route: "current", searchWeb: true };
  }
  if (CASUAL_PATTERN.test(compact)) {
    return { route: "conversation", searchWeb: false };
  }
  if (LEARNING_PATTERN.test(compact) || compact.length >= 120) {
    return { route: "learning", searchWeb: false };
  }
  return { route: "conversation", searchWeb: false };
}

/**
 * The extra line a SAVE turn carries, on top of its route instruction.
 *
 * Routing the turn correctly only buys the tools; it does not make the model
 * reach for them. Owner 2026-07-28 asked that "anytime user asked for
 * flashcards or tests it should automatically create in the study page", and a
 * model handed both a tool and a blank page will often just write the artifact
 * out — which is what a student sees as "it went into the chat instead".
 *
 * Only sent when the tools are actually attached: a turn that promises to save
 * and cannot is worse than one that never offered (see CHAT_NO_TOOLS_PROMPT).
 */
/** The extra line a WORKSPACE turn carries when its tools are attached. The
 *  snapshot message (buildWireMessages) holds the data; this holds the rule. */
export const WORKSPACE_INSTRUCTION =
  "This turn is about the student's own workspace. Ground every claim in what the tools return THIS turn — start from the " +
  "attached snapshot for orientation, then read deeper before stating contents, counts, or dates. The snapshot's lists are " +
  "samples: for anything about 'everything', a full semester, or a reorganization, read the complete state first " +
  "(get_library_tree, list_calendar_events with the real range, get_study_overview). When you change things, say plainly what " +
  "changed and what you left alone; when something is ambiguous or risky, ask before acting.";

export const SAVE_INSTRUCTION =
  "This turn asks you to CREATE something in the student's workspace. The app has already collected any required deck format or test settings in the conversation; follow those exact choices. Do it with the tools — add_practice_test for a test or quiz, add_flashcards for cards, create_library_note for notes — and do it in this turn, not after asking permission. For flashcards, set each card_type to basic, cloze, or reversed as requested. " +
  "Never write the flashcards or the test questions out in your reply as a substitute for saving them: the student is looking for it on their Study page, and a copy in the chat is not there. " +
  "Once it is saved, say in one short line what you made and where it went.";

export function routeInstruction(route: ChatRoute): string {
  switch (route) {
    case "research":
      return "Treat this as research: synthesize the strongest supplied evidence, cite URLs beside supported claims, distinguish consensus from disagreement, and state important limitations.";
    case "current":
      return "Treat this as time-sensitive: rely on the supplied live results, cite relevant URLs, and say plainly when a current claim could not be verified.";
    case "learning":
      return "Teach for durable understanding: answer directly, show the reasoning at the learner's level, surface likely misconceptions, and use equations, examples, or code only when useful.";
    case "conversation":
      return "Respond directly and naturally. Keep simple questions concise, but do not omit details the user needs.";
  }
}

/** The header prepareChatAttachments puts above each attached file's text.
 *  Defined here rather than beside the builder because chat-attachments imports
 *  chat-api, so the reverse import would close a cycle. */
export const ATTACHMENT_BLOCK_MARKER = "### Attachment: ";

/**
 * What the student actually TYPED, with attached file contents removed.
 *
 * The routing and web-search matchers were reading the whole wire text, so a
 * lecture deck decided them: one slide citing "Smith et al., 2024" matches the
 * recent-year pattern and bought a live web search on every upload — paid for,
 * and then pasted into a prompt already carrying the deck. Raising the
 * attachment budget to 90k made that strictly likelier, which is what turned a
 * long-standing quirk into a regression worth fixing.
 *
 * Skill selection deliberately still sees the FULL text: whether a deck is
 * attached is exactly what lecture-intake needs to know. What a turn IS comes
 * from the student; what craft it needs can come from the attachment.
 */
export function promptWithoutAttachments(wireText: string): string {
  // Attached with NOTHING typed — the commonest case, and the one a
  // hand-written fixture keeps missing. prepareChatAttachments trims the wire
  // text, so the blank line before the first header is GONE and the header
  // starts the string. Matching only "\n\n### Attachment: " returned the entire
  // lecture as though the student had typed it, which is how a bare upload kept
  // buying a paid web search off a slide reading "Smith et al., 2024".
  if (wireText.trimStart().startsWith(ATTACHMENT_BLOCK_MARKER)) return "";
  const marker = wireText.indexOf(`\n\n${ATTACHMENT_BLOCK_MARKER}`);
  return (marker === -1 ? wireText : wireText.slice(0, marker)).trim();
}
