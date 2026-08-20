/**
 * Turning what the student MEANT into what this turn can actually DO.
 *
 * 🔴 THIS IS THE HALF A MODEL CANNOT KNOW. `chat-intent.ts` reads the message; this decides what
 * the product is able to do about it — which of our models can carry tools, which route buys the
 * thinking model, which flags are load-bearing further down the pipeline. Meaning is a reading;
 * this is arithmetic over facts about our own stream.
 *
 * 🔴 SHARED, BECAUSE THE PHONE HAD ITS OWN COPY. apps/mobile/src/lib/chat-routing.ts carried the
 * same thirteen regexes as the web one, with CHANGING_FACT_PATTERN already drifted between them —
 * the web version had learnt to exclude "who are you" and the phone's had not, so the identical
 * question bought a paid search on one surface and not the other. Nobody noticed, because nothing
 * could: they were two files.
 *
 * The server remains the authority on plan eligibility: `reasoningEffort: "high"` may upgrade
 * Pro/Max to the premium model, while lighter plans retain DeepSeek Flash with thinking enabled.
 */

import type { ChatIntent } from "./chat-intent.ts";

export type ChatRoute = "conversation" | "learning" | "current" | "research";
export type ChatModelAlias = "deepseek-chat" | "deepseek-reasoner";

export interface ChatRouteDecision {
  route: ChatRoute;
  model: ChatModelAlias;
  searchWeb: boolean;
  reasoningEffort?: "high";
  /** What to type into the search engine, when `searchWeb`. Empty means "use what they asked". */
  webQuery?: string;
  /** Set when the student asked Nemesis to SAVE something into their own
   *  workspace. Load-bearing, not a label: the write happens through a tool call,
   *  tool calls only ride the non-thinking model, and this flag is what stops the
   *  effort dial from quietly switching the tools off (chat-effort.ts). */
  savesToWorkspace?: boolean;
  /** Set when the student is asking ABOUT their own workspace — their calendar,
   *  Library, or Study state — or asking for it to be reorganized. As
   *  load-bearing as savesToWorkspace, for the same reason: these turns are
   *  answered THROUGH tools, so they must ride the tools-capable model and the
   *  effort dial must not strip them. */
  workspaceIntent?: boolean;
}

/**
 * The decision behind every turn we could not read.
 *
 * Conversation on the tools-capable model, for the reason spelled out on DEFAULT_INTENT: losing a
 * turn's thinking is a slightly shallower answer, losing a turn's tools is Nemesis telling a
 * student it cannot see their calendar.
 */
export const DEFAULT_DECISION: ChatRouteDecision = {
  model: "deepseek-chat",
  route: "conversation",
  searchWeb: false,
};

/**
 * A turn whose only content is an attachment — the student typed nothing, so
 * there is no question to read.
 *
 * Still a learning turn on the thinking model, because that is what reads a
 * lecture well. But never a web-search turn: the only text that could have
 * asked for one is the file itself, and a slide citing a recent year is not a
 * student asking for today's news.
 */
export const ATTACHMENT_ONLY_DECISION: ChatRouteDecision = {
  model: "deepseek-reasoner",
  route: "learning",
  searchWeb: false,
};

/**
 * What the turn can do, given what the student meant.
 *
 * 🔴 EVERY BRANCH HERE IS A FACT ABOUT OUR SYSTEM, NOT A READING OF THE MESSAGE. The model already
 * said what it wants; this decides what is possible. The one rule that overrides the model outright
 * is the tools rule, and it overrides in the safe direction: a turn that touches the student's own
 * data must ride `deepseek-chat`, because our stream does not retain the `reasoning_content` a
 * thinking model has to echo back on a tool round (chat-effort.ts:toolsAllowed). A "research" turn
 * that also needs the calendar cannot have both, and the calendar wins — an answer that reasons
 * beautifully about data it could not read is worse than a plainer answer that read it.
 */
export function decisionFromIntent(intent: ChatIntent): ChatRouteDecision {
  const touchesWorkspace = intent.workspace !== "none";
  const searchWeb = intent.needsWeb;
  const route: ChatRoute = searchWeb && intent.mode === "conversation" ? "current" : intent.mode;
  const decision: ChatRouteDecision = {
    // Research and learning both want the thinking model; conversation and a plain current-events
    // lookup do not need it. A workspace turn cannot have it at all.
    model: !touchesWorkspace && (route === "research" || route === "learning" || route === "current")
      ? "deepseek-reasoner"
      : "deepseek-chat",
    route,
    searchWeb,
    ...(searchWeb && intent.webQuery ? { webQuery: intent.webQuery } : {}),
    ...(intent.workspace === "write" ? { savesToWorkspace: true } : {}),
    ...(intent.workspace === "read" ? { workspaceIntent: true } : {}),
  };
  // Deep research is the one route that spends high effort by default. Never on a workspace turn,
  // where high effort would strip the tools right back off again.
  if (route === "research" && !touchesWorkspace) return { ...decision, reasoningEffort: "high" };
  return decision;
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
