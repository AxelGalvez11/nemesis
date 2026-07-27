/**
 * Zero-cost request routing for Nemesis chat.
 *
 * The browser makes this decision deterministically instead of spending a model
 * call on classification. The server remains the authority on plan eligibility:
 * `reasoningEffort: "high"` may upgrade Pro/Max to the premium model, while
 * lighter plans retain DeepSeek Flash with thinking enabled.
 */

export type ChatRoute = "conversation" | "learning" | "current" | "research";
export type ChatModelAlias = "deepseek-chat" | "deepseek-reasoner";

export interface ChatRouteDecision {
  route: ChatRoute;
  model: ChatModelAlias;
  searchWeb: boolean;
  reasoningEffort?: "high";
  /** Set when the student asked Nemesis to SAVE something into their own
   *  workspace. Load-bearing, not a label: the write happens through a tool call,
   *  tool calls only ride the non-thinking model, and this flag is what stops the
   *  effort dial from quietly switching the tools off (chat-effort.ts). */
  savesToWorkspace?: boolean;
}
const RESEARCH_PATTERN = /\b(deep research|research report|literature review|systematic review|compare (?:the )?(?:evidence|sources|studies)|primary sources?|scholarly sources?|peer[- ]reviewed|with citations?|cite (?:your|the) sources?|evidence for and against|state of the art|write (?:a )?report)\b/i;
const CURRENT_PATTERN = /\b(latest|current|currently|today|tonight|yesterday|tomorrow|news|price|weather|score|schedule|standings|release|version|update|recent|live|who (?:is|won|leads|runs|owns))\b/i;
const EXPLICIT_WEB_PATTERN = /\b(search(?: the)? web|web search|look(?:\s+(?:it|this|that))?\s+up|browse|online|internet)\b/i;
const LEARNING_PATTERN = /\b(explain|teach|learn|study|solve|derive|prove|analy[sz]e|compare|contrast|why|how|calculate|debug|interpret|summari[sz]e|quiz|flashcards?|practice|step[- ]by[- ]step|concept|theorem|case|argument|equation|code)\b/i;
const CASUAL_PATTERN = /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening)|who are you|what can you do)[!.?\s]*$/i;
const RECENT_YEAR_PATTERN = /\b202[4-9]\b/;

// A message that asks Nemesis to SAVE or CREATE something in the student's own
// workspace — a flashcard deck, a practice test, a mind map, a Library note, or
// a calendar event. These MUST leave on the tools-capable model: the write is
// performed by a tool call, and tool calls only ride the non-thinking model
// (deepseek-chat, see chat-effort.ts:toolsAllowed). Route a save to the reasoner
// and it answers in prose and saves nothing — which is exactly why "make me
// flashcards on beta blockers" (LEARNING_PATTERN matches "flashcards") used to
// do nothing. See classifyChatRequest below.
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
const OFFER_TARGET = /\b(?:notes?|flash\s?cards?|cards?|practice tests?|tests?|quiz(?:zes)?|mind\s?maps?|study guides?|deck|slides?|summary|outline)\b/i;
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
  if (SAVE_VERB.test(compact) && SAVE_ARTIFACT.test(compact)) return true;
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
export const ATTACHMENT_ONLY_DECISION: ChatRouteDecision = { model: "deepseek-reasoner", route: "learning", searchWeb: false };

export function classifyChatRequest(text: string, priorAssistantText = ""): ChatRouteDecision {
  const compact = text.trim();
  // A save request wins over every reasoner route below so its tools can fire.
  // We keep web when the topic needs it (deepseek-chat can still search), and we
  // never emit route "conversation" for a save, so sendChatTurn's web
  // re-promotion (which only upgrades "conversation" to the reasoner) can't
  // quietly undo this.
  if (detectsSaveRequest(compact, priorAssistantText)) {
    const wantsWeb = RESEARCH_PATTERN.test(compact) || CURRENT_PATTERN.test(compact) || EXPLICIT_WEB_PATTERN.test(compact) || RECENT_YEAR_PATTERN.test(compact);
    return wantsWeb
      ? { route: "current", model: "deepseek-chat", savesToWorkspace: true, searchWeb: true }
      : { route: "learning", model: "deepseek-chat", savesToWorkspace: true, searchWeb: false };
  }
  if (RESEARCH_PATTERN.test(compact)) {
    return { route: "research", model: "deepseek-reasoner", searchWeb: true, reasoningEffort: "high" };
  }
  if (CURRENT_PATTERN.test(compact) || EXPLICIT_WEB_PATTERN.test(compact) || RECENT_YEAR_PATTERN.test(compact)) {
    return { route: "current", model: "deepseek-reasoner", searchWeb: true };
  }
  if (CASUAL_PATTERN.test(compact)) {
    return { route: "conversation", model: "deepseek-chat", searchWeb: false };
  }
  if (LEARNING_PATTERN.test(compact) || compact.length >= 120) {
    return { route: "learning", model: "deepseek-reasoner", searchWeb: false };
  }
  return { route: "conversation", model: "deepseek-chat", searchWeb: false };
}

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
