/**
 * Turning what the student MEANT into what this turn can actually DO.
 *
 * 🔴 THIS FILE USED TO BE THE CLASSIFIER. It carried RESEARCH_PATTERN, CURRENT_PATTERN,
 * EXPLICIT_WEB_PATTERN, LEARNING_PATTERN, CASUAL_PATTERN, SAVE_ARTIFACT, SAVE_VERB,
 * SAVE_TO_WORKSPACE, CREATE_ASSESSMENT, CODE_TEST, OFFER_VERB, OFFER_TARGET and ACCEPTANCE, and
 * `classifyChatRequest` walked them in order to guess what a sentence was. All of that is gone; the
 * meaning is read by a model now (chat-intent.ts). What is left is the half a model cannot know:
 * which of our models can carry tools, what a route instruction says, and which flags are
 * load-bearing further down the pipeline.
 *
 * The server remains the authority on plan eligibility: `reasoningEffort: "high"` may upgrade
 * Pro/Max to the premium model, while lighter plans retain DeepSeek Flash with thinking enabled.
 */

import type { ChatIntent } from "./chat-intent";

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

/** The extra line a WORKSPACE turn carries when its tools are attached. The
 *  snapshot message (buildWireMessages) holds the data; this holds the rule. */
export const WORKSPACE_INSTRUCTION =
  "This turn is about the student's own workspace. Ground every claim in what the tools return THIS turn — start from the " +
  "attached snapshot for orientation, then read deeper before stating contents, counts, or dates. The snapshot's lists are " +
  "samples: for anything about 'everything', a full semester, or a reorganization, read the complete state first " +
  "(get_library_tree, list_calendar_events with the real range, get_study_overview). When you change things, say plainly what " +
  "changed and what you left alone; when something is ambiguous or risky, ask before acting.";

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
 * Still the right split now that the decision is semantic rather than a keyword
 * match: what a turn IS comes from the student, and the model deciding that
 * should be reading their message, not forty pages of somebody else's slides.
 * What the attachments are is given to it separately, by name, as a fact.
 */
export function promptWithoutAttachments(wireText: string): string {
  // Attached with NOTHING typed — the commonest case, and the one a
  // hand-written fixture keeps missing. prepareChatAttachments trims the wire
  // text, so the blank line before the first header is GONE and the header
  // starts the string. Matching only "\n\n### Attachment: " returned the entire
  // lecture as though the student had typed it.
  if (wireText.trimStart().startsWith(ATTACHMENT_BLOCK_MARKER)) return "";
  const marker = wireText.indexOf(`\n\n${ATTACHMENT_BLOCK_MARKER}`);
  return (marker === -1 ? wireText : wireText.slice(0, marker)).trim();
}

/** The names of the files riding on this turn, read back out of the wire text.
 *  A fact about the turn, handed to the intent call so it knows a lecture is
 *  attached without being given forty pages of it. */
export function attachmentNames(wireText: string): string[] {
  const names: string[] = [];
  for (const line of wireText.split("\n")) {
    if (!line.startsWith(ATTACHMENT_BLOCK_MARKER)) continue;
    const name = line.slice(ATTACHMENT_BLOCK_MARKER.length).trim();
    if (name) names.push(name);
  }
  return names;
}
