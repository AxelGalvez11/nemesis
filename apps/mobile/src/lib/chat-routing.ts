import { isStudyCreationPreferenceReply } from "@nemesis/shared";

/**
 * Zero-cost request routing for Nemesis chat — a FAITHFUL COPY of
 * apps/web/lib/workspace/chat-routing.ts (cloud-first pivot, phone chat §6).
 * Keep this in sync with the web original; the two must classify identically
 * so a thread shared between phone and web behaves the same either side.
 *
 * The client makes this decision deterministically instead of spending a model
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
const CHANGING_FACT_PATTERN = /\bwho\s+(?:is|are|won|leads|runs|owns)|\b(?:president|prime minister|ceo|champion|winner)\b/i;
const LIVE_SPORTS_PATTERN = /\b(world cup|super bowl|olympics?|playoffs?|finals?|tournament|match|game|who won|score|standings)\b/i;
const EMERGING_ENTITY_PATTERN = /\b(?:what|who)\s+(?:is|are)\s+(?:the\s+)?[\p{L}\p{N}._-]+(?:\s+[\p{L}\p{N}._-]+){0,4}\s+(?:agent|ai|app|company|framework|library|model|platform|plugin|product|project|service|software|tool)\b/iu;
const LEARNING_PATTERN = /\b(explain|teach|learn|study|solve|derive|prove|analy[sz]e|compare|contrast|why|how|calculate|debug|interpret|summari[sz]e|quiz|flashcards?|practice|step[- ]by[- ]step|concept|theorem|case|argument|equation|code)\b/i;
const CASUAL_PATTERN = /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening)|who are you|what can you do)[!.?\s]*$/i;
const RECENT_YEAR_PATTERN = /\b202[4-9]\b/;

// A message that asks Nemesis to SAVE or CREATE something in the student's own
// workspace — a flashcard deck, a practice test, a mind map, a Library note. These
// MUST leave on the tools-capable model: the write is performed by a tool call,
// and tool calls only ride the non-thinking model (deepseek-chat, see
// chat-effort.ts:toolsAllowed). Route a save to the reasoner and it answers in
// prose and saves nothing — which is exactly why "make me flashcards on beta
// blockers" (LEARNING_PATTERN matches "flashcards") used to do nothing.
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
const DIRECT_ARTIFACT_REQUEST =
  /\b(?:i (?:need|want)|give me|please (?:make|create|prepare)|can you (?:make|create|prepare))\b[^.?!]{0,80}\b(?:flash\s?cards?|mind\s?maps?|practice tests?|mock exams?|question banks?|slides?|slide decks?|presentations?|study notes?|study guides?)\b/i;
const BARE_ARTIFACT_REQUEST =
  /^(?:please\s+)?(?:\d+\s+)?(?:flash\s?cards?|mind\s?maps?|practice tests?|mock exams?|question banks?|slides?|slide decks?|presentations?|study notes?|class notes?|lecture notes?|study guides?)\b/i;
const CREATE_ASSESSMENT =
  /\b(?:make|create|build|generate|draft|whip up|put together|give me|set up)\s+(?:me\s+)?(?:an?|another|some|\d+)?\s*(?:new\s+)?(?:practice\s+|mock\s+)?(?:tests?|quiz(?:zes)?|exams?|question\s+banks?)\b/i;
const CODE_TEST =
  /\b(?:unit|integration|e2e|end-to-end|regression|snapshot)\s+tests?\b|\btests?\s+(?:for|of)\s+(?:this|that|the|my)\s+(?:function|method|class|component|module|code|file|endpoint)\b|\btest\s+(?:suite|case|file|harness)s?\b/i;
const ASKS_ABOUT = /^(?:what|why|how|when|where|who|which)\b/i;

/** Does this message ask to persist something in the student's workspace? Pure
 *  and exported so the routing tests can pin the real phrasings students use. */
export function detectsSaveRequest(text: string, priorAssistantText = ""): boolean {
  const compact = text.trim();
  if (ASKS_ABOUT.test(compact)) return false;
  if (isStudyCreationPreferenceReply(compact, priorAssistantText)) return true;
  if (SAVE_VERB.test(compact) && SAVE_ARTIFACT.test(compact)) return true;
  if (CREATE_ASSESSMENT.test(compact) && !CODE_TEST.test(compact)) return true;
  if (DIRECT_ARTIFACT_REQUEST.test(compact)) return true;
  if (BARE_ARTIFACT_REQUEST.test(compact)) return true;
  return SAVE_TO_WORKSPACE.test(compact);
}

export function classifyChatRequest(text: string, priorAssistantText = ""): ChatRouteDecision {
  const compact = text.trim();
  // A save request wins over every reasoner route below so its tools can fire.
  // Web is kept when the topic needs it (deepseek-chat can still search), and
  // route "conversation" is never emitted for a save — the phone has no web
  // re-promotion step today, but the web copy does, and these two files are meant
  // to classify identically.
  if (detectsSaveRequest(compact, priorAssistantText)) {
    const wantsWeb =
      RESEARCH_PATTERN.test(compact) ||
      CURRENT_PATTERN.test(compact) ||
      CHANGING_FACT_PATTERN.test(compact) ||
      LIVE_SPORTS_PATTERN.test(compact) ||
      EMERGING_ENTITY_PATTERN.test(compact) ||
      EXPLICIT_WEB_PATTERN.test(compact) ||
      RECENT_YEAR_PATTERN.test(compact) ||
      /https?:\/\//i.test(compact);
    return wantsWeb
      ? { model: "deepseek-chat", route: "current", savesToWorkspace: true, searchWeb: true }
      : { model: "deepseek-chat", route: "learning", savesToWorkspace: true, searchWeb: false };
  }
  if (RESEARCH_PATTERN.test(compact)) {
    return { route: "research", model: "deepseek-reasoner", searchWeb: true, reasoningEffort: "high" };
  }
  if (
    CURRENT_PATTERN.test(compact) ||
    CHANGING_FACT_PATTERN.test(compact) ||
    LIVE_SPORTS_PATTERN.test(compact) ||
    EMERGING_ENTITY_PATTERN.test(compact) ||
    EXPLICIT_WEB_PATTERN.test(compact) ||
    RECENT_YEAR_PATTERN.test(compact) ||
    /https?:\/\//i.test(compact)
  ) {
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

/**
 * The route for one turn, once the composer's Deep research toggle is taken into
 * account. `research` is the forced research decision when that toggle is on, and
 * null when it isn't.
 *
 * A SAVE REQUEST BEATS THE TOGGLE. Deep research runs on the reasoner, which
 * carries no tools — so "make me flashcards on beta blockers" with the toggle left
 * on would produce an essay and save nothing, and the student would have no way to
 * tell why. Deep research is a persistent toggle they may have flipped days ago;
 * "make me flashcards" is what they typed just now, so the fresher, more specific
 * instruction wins. The research route is still honoured for every turn that
 * isn't asking us to write something into their account.
 *
 * Pure and separate from the caller so this precedence has a test rather than
 * living as one condition inside a 40-line send function.
 */
export function routeForTurn(
  text: string,
  research: ChatRouteDecision | null,
  priorAssistantText = "",
): ChatRouteDecision {
  if (research && !detectsSaveRequest(text, priorAssistantText)) return research;
  return classifyChatRequest(text, priorAssistantText);
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
