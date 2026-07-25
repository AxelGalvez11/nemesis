// Answer effort — the student's own dial over how hard the engine thinks,
// layered on top of the deterministic route classification in chat-routing.ts.
// Ported from web's lib/workspace/chat-effort.ts (owner 2026-07-22: "in the
// chat composer there needs to be an option to choose intelligence"), so both
// surfaces mean the same thing by "Instant".
//
// The route decides what KIND of question this is; effort decides how much
// compute to spend on it. An explicit choice always beats the route's guess,
// which is why Medium strips the research route's automatic high effort.
//
// How each level lands at the valve (supabase nemesis-llm):
//   instant → deepseek-chat      → v4-flash, thinking off. Fastest.
//   medium  → whatever the route picked. Today's behaviour, unchanged.
//   high    → reasoning_effort:"high" → v4-pro on Agent Pro/Max, deepest
//             thinking elsewhere. Costs the most tokens per turn.
//
// The web copy also exports a one-line HINT per level for its picker. This one
// deliberately does NOT: the owner asked for "just those words" in the phone's
// menu, so a hint map here would only be dead weight inviting someone to render
// it (owner 2026-07-22).

import type { ChatRouteDecision } from "./chat-routing";

export type ChatEffort = "instant" | "medium" | "high";

export const CHAT_EFFORTS: ChatEffort[] = ["instant", "medium", "high"];

export const CHAT_EFFORT_LABEL: Record<ChatEffort, string> = {
  high: "High",
  instant: "Instant",
  medium: "Medium",
};

export const DEFAULT_CHAT_EFFORT: ChatEffort = "medium";

export function isChatEffort(value: unknown): value is ChatEffort {
  return value === "instant" || value === "medium" || value === "high";
}

/** Apply the student's choice to a routed decision. Web search is never
 *  touched — a current-events question needs live sources at any effort. */
export function applyChatEffort(decision: ChatRouteDecision, effort: ChatEffort): ChatRouteDecision {
  if (effort === "instant") {
    return { ...decision, model: "deepseek-chat", reasoningEffort: undefined };
  }
  if (effort === "high") {
    // A SAVE KEEPS ITS TOOLS, whatever the dial says. High effort means the
    // thinking flagship, which cannot carry tool calls (see toolsAllowed) — so
    // "make me flashcards on beta blockers" with the dial left on High would come
    // back as prose having saved nothing, with no way for the student to tell why.
    // The dial is a preference stored in SecureStore that persists across launches;
    // the save is what they typed a second ago. The specific, fresher instruction
    // wins. Deliberately silent: there is nothing for the student to fix, and the
    // answer they asked for still arrives.
    if (decision.savesToWorkspace) return { ...decision, reasoningEffort: undefined };
    return { ...decision, reasoningEffort: "high" };
  }
  return { ...decision, reasoningEffort: undefined };
}

/** Whether the workspace tools can ride this turn. Thinking-mode turns must echo
 *  `reasoning_content` back on tool rounds, which our stream does not retain — so
 *  both the reasoner models and any high-effort turn (which the valve may upgrade
 *  to the thinking flagship) go out without tools.
 *
 *  Ported from web's chat-effort.ts. Both surfaces must agree: a thread moves
 *  between phone and web, and "the same question saved a deck on my laptop and
 *  didn't on my phone" is the worst version of this bug. */
export function toolsAllowed(decision: ChatRouteDecision): boolean {
  return !decision.model.includes("reasoner") && decision.reasoningEffort !== "high";
}
