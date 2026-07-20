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

export function classifyChatRequest(text: string): ChatRouteDecision {
  const compact = text.trim();
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
