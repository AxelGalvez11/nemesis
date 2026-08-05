// Answer effort — the student's own dial over how hard the engine thinks,
// layered on top of the deterministic route classification in chat-routing.ts.
//
// The route decides what KIND of question this is; effort decides how much
// compute to spend on it. An explicit choice always beats the route's guess,
// which is why Medium strips the research route's automatic high effort.
//
// How each level lands at the valve (supabase nemesis-llm):
//   instant → deepseek-chat      → v4-flash, thinking off. Fastest, tools on.
//   medium  → whatever the route picked. Today's behaviour, unchanged.
//   high    → reasoning_effort:"high" → v4-pro on Agent Pro/Max, deepest
//             thinking elsewhere. Costs the most tokens per turn.

import type { ChatRouteDecision } from "./chat-routing";

export type ChatEffort = "instant" | "medium" | "high";

export const CHAT_EFFORTS: ChatEffort[] = ["instant", "medium", "high"];

export const CHAT_EFFORT_LABEL: Record<ChatEffort, string> = {
  high: "High",
  instant: "Instant",
  medium: "Medium",
};

/** One line of student-readable help per level, shown in the picker. */
export const CHAT_EFFORT_HINT: Record<ChatEffort, string> = {
  high: "Slowest and deepest — for hard problems",
  instant: "Fastest — quick questions and edits",
  medium: "Balanced thinking for most work",
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
    // The dial is a stored preference that persists across sessions; the save is
    // what they typed a second ago. The specific, fresher instruction wins.
    // Deliberately silent: there is nothing for the student to fix, and the answer
    // they asked for still arrives.
    // Same rule for a workspace READ: "what's due this week" on the High dial
    // used to lose every tool and answer blind. Both flags mean the answer
    // comes THROUGH tools, so both outrank the stored preference.
    if (decision.savesToWorkspace || decision.workspaceIntent) return { ...decision, reasoningEffort: undefined };
    return { ...decision, reasoningEffort: "high" };
  }
  return { ...decision, reasoningEffort: undefined };
}

/** Whether the workspace tools can ride this turn. Thinking-mode turns must
 *  echo `reasoning_content` on tool rounds, which our stream doesn't retain —
 *  so both the reasoner models and any high-effort turn (which the valve may
 *  upgrade to the thinking flagship) go out without tools. */
export function toolsAllowed(decision: ChatRouteDecision): boolean {
  return !decision.model.includes("reasoner") && decision.reasoningEffort !== "high";
}
