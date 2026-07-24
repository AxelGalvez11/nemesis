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
const SAVE_ARTIFACT = /\b(?:flash\s?cards?|mind\s?maps?|practice tests?|study sets?|decks?)\b/i;
const SAVE_VERB = /\b(?:make|create|build|generate|add|save|put together|whip up|draft|prep(?:are)?|turn\s+(?:this|that|these|it)\s+into|give me|set up)\b/i;
const SAVE_TO_WORKSPACE = /\b(?:to|in|into|on)\s+my\s+(?:deck|library|notes?|calendar|study(?:\s+(?:deck|list))?)\b|\bon my calendar\b|\bas a (?:library )?note\b|\b(?:add|put|save|schedule)\b[^.?!]{0,40}\bcalendar\b/i;

/** Does this message ask to persist something in the student's workspace? Pure
 *  and exported so the routing tests can pin the real phrasings students use. */
export function detectsSaveRequest(text: string): boolean {
  const compact = text.trim();
  if (SAVE_VERB.test(compact) && SAVE_ARTIFACT.test(compact)) return true;
  return SAVE_TO_WORKSPACE.test(compact);
}

// A message that asks how the student is DOING — retention, scores, what to
// review next. Same tool-gate hazard as a save, one layer up: "how am I doing
// on cardio pharm?" trips LEARNING_PATTERN ("how"), lands on the reasoner, and
// toolsAllowed() strips every tool — so read_study_performance would be absent
// on exactly the questions it exists to answer, and the model would confabulate
// a progress report instead of reading the real review log.
//
// Deliberately enumerated rather than a wildcard, because the failure mode is
// asymmetric: a missed performance question just answers without data (today's
// behaviour), while a false positive drops a genuine reasoning question onto the
// non-thinking model. So every arm needs BOTH a first-person self-reference and
// a performance noun; "how do I calculate retention" and "explain spaced
// repetition" must not match. Pinned by chat-routing.test.ts.
const PERFORMANCE_PATTERNS: RegExp[] = [
  // "how am I doing", "how'm I doing on my cards", "how is my retention"
  /\bhow(?:'s|'m|\s+(?:is|am|are|was|were))\s+(?:i|my)\b[^.?!]{0,60}\b(?:doing|performing|progress|retention|accuracy|scores?|results?|cards?|decks?|tests?|quiz(?:zes)?|flash\s?cards?|studying|reviews?)\b/i,
  // "how did I do on the last test"
  /\bhow\s+did\s+i\s+do\b/i,
  // possessive performance nouns — "my retention", "my weak areas", "my stats"
  /\bmy\s+(?:study\s+|test\s+|quiz\s+|overall\s+)?(?:progress|retention|accuracy|performance|scores?|results?|stats|statistics|streak|lapses|weak(?:\s+(?:areas?|spots?|topics?|points?|subjects?))?)\b/i,
  // "what should I review / focus on / study next"
  /\bwhat\s+(?:should|do|ought)\s+i\s+(?:need\s+to\s+)?(?:review|study|focus|work|practice|drill|brush\s+up)\b/i,
  // "am I ready for the exam"
  /\bam\s+i\s+(?:ready|prepared|on\s+track|behind|improving)\b/i,
  // "which cards do I keep missing", "what topics am I failing"
  /\b(?:which|what)\s+(?:cards?|topics?|decks?|questions?|subjects?|areas?)\s+(?:do\s+|am\s+|are\s+)?i\s+(?:keep|always|often|usually|still|consistently)?\s*(?:miss|missing|forget|forgetting|fail|failing|struggl\w*|get(?:ting)?\s+wrong)\b/i,
  // "based on my study data", "look at my review history"
  /\b(?:based\s+on|look\s+at|check|pull\s+up|according\s+to)\s+my\s+(?:study\s+|review\s+|test\s+)?(?:data|history|logs?|reviews?|results?|performance|record)\b/i,
];

/** Does this message ask Nemesis to look at how the student is doing? Pure and
 *  exported so the routing tests can pin real student phrasings. */
export function detectsPerformanceRequest(text: string): boolean {
  const compact = text.trim();
  return PERFORMANCE_PATTERNS.some((pattern) => pattern.test(compact));
}

/** A turn that must keep the tools-capable model, whatever else it looks like:
 *  the answer is performed by a tool call, not by thinking harder. */
export function needsWorkspaceTools(text: string): boolean {
  return detectsSaveRequest(text) || detectsPerformanceRequest(text);
}

export function classifyChatRequest(text: string): ChatRouteDecision {
  const compact = text.trim();
  // A save request wins over every reasoner route below so its tools can fire.
  // We keep web when the topic needs it (deepseek-chat can still search), and we
  // never emit route "conversation" for a save, so sendChatTurn's web
  // re-promotion (which only upgrades "conversation" to the reasoner) can't
  // quietly undo this.
  if (needsWorkspaceTools(compact)) {
    // A performance question is about the student's OWN logged data — the web
    // has nothing to add, so it never promotes to search even if it happens to
    // say "latest" ("how did I do on my latest test").
    const wantsWeb =
      !detectsPerformanceRequest(compact) &&
      (RESEARCH_PATTERN.test(compact) || CURRENT_PATTERN.test(compact) || EXPLICIT_WEB_PATTERN.test(compact) || RECENT_YEAR_PATTERN.test(compact));
    return wantsWeb
      ? { route: "current", model: "deepseek-chat", searchWeb: true }
      : { route: "learning", model: "deepseek-chat", searchWeb: false };
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
