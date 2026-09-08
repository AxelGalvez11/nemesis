// The mind map, made on purpose rather than fallen out of an answer.
//
// Owner, 2026-09-07: *"I built a mind map. Yes, build a mind map ... make it similar to Notebook LM.
// I think they also use mermaid flowcharts. Like, I don't know, because it looks similar to that,
// honestly."* And, of where it belongs: *"I would reserve the mind maps for the sidebar"*, then
// *"only a [tile] makes them"*.
//
// 🔴🔴 NOTEBOOKLM'S IS NOT A MERMAID FLOWCHART, AND HIS UNCERTAINTY WAS WORTH CHECKING. Driven in
// his own notebook the same day (docs/canvas-workspace-reference.md §12): the root sits on the LEFT
// as a pill, children fan RIGHT on curved connectors, and every child carries a `>` chevron because
// you unfold ONE BRANCH AT A TIME. It opens in the Studio side panel with a title, a source chip and
// a thumbs pair. A mermaid render is a finished picture; theirs unfolds, which is the giveaway.
//
// 🔴 WHICH IS WHAT NEMESIS ALREADY DRAWS. `mindmap-view.tsx` has been an unfoldable tree since
// 2026-09-03 (*"one that I can click on and then reveals more nodes"*) and has a `panel` mode that
// fills the side panel. What was missing was never the picture: it was that a mind map arrived
// inside a chat answer and was gone when you scrolled past. This makes it a THING, made by a tile,
// saved with the board, and reopened from the panel.
//
// 🔴 MERMAID IS STILL THE WIRE FORMAT, AND THAT IS NOT A CONTRADICTION. The model writes a
// `mindmap` block because it writes those well and `parseMermaidMindmap` already reads them; what
// changed is that the result is stored as a tree and drawn by our own component, instead of being
// rendered where it landed. Nobody sees mermaid.
//
// PURE apart from the model call, which the caller passes in.

import { canvasBriefFor, canvasHasMaterial } from "@/lib/learn/canvas-deliverables";
import type { LearningCanvas } from "@/lib/learn/canvas-model";
import { parseMermaidMindmap, parseOutlineMindmap, mindmapStats, type MindmapNode } from "@/lib/learn/mindmap-tree";
import { postChatCompletion } from "@/lib/workspace/chat-api";

/** Room for sixty short nodes and the fence around them, and no more. */
const MINDMAP_MAX_TOKENS = 1200;

/** Deep enough to be a ladder, small enough to open one rung at a time. NotebookLM's opens at five. */
export const MINDMAP_MIN_NODES = 6;
export const MINDMAP_MAX_NODES = 60;

export const MINDMAP_SYSTEM = [
  "You lay out one mind map of the learner's material, as a mermaid mindmap block and nothing else.",
  "",
  "Answer with exactly this and no prose around it:",
  "```mermaid",
  "mindmap",
  "  root((The subject))",
  "    A first branch",
  "      Something under it",
  "    A second branch",
  "```",
  // 🔴🔴 SHALLOW TO DEEP, WHICH IS THE OWNER'S OWN WORDS FOR WHAT A MIND MAP IS FOR (2026-09-03:
  // "a ladder of things you need to know from shallow to deeply detailed"). A flat list of twenty
  // siblings is an index, not a map, and unfolding it teaches nothing.
  "The root is the subject in a few words. Under it put three to six big ideas, and under each of those the specifics.",
  "Go three to five levels deep. The big ideas nearest the root, the detail at the leaves.",
  `Never more than ${MINDMAP_MAX_NODES} nodes in total.`,
  "One idea per node, a few words, no sentences and no punctuation at the end.",
  "Every node comes from the material below and nothing else. Never add a branch the material does not support.",
  "Never use emojis. Never use em dashes; use a comma, a colon, or a new sentence.",
].join("\n");

/**
 * Read a mind map out of a reply, or nothing.
 *
 * 🔴 TWO FORMATS, BECAUSE A MODEL ASKED FOR MERMAID SOMETIMES WRITES AN OUTLINE. `parseOutlineMindmap`
 * already exists for exactly that and costs nothing to try; refusing a perfectly good indented list
 * because it lacked a fence would be a retry the learner pays for.
 *
 * 🔴 A MAP THAT IS TOO SMALL IS A REFUSAL, NOT A MAP. Three nodes is a sentence with boxes round it,
 * and unfolding it reveals nothing. The floor is the same judgement `readCardsJson` makes about a
 * deck of two cards.
 */
export function readBoardMindmap(text: string): MindmapNode | null {
  const root = parseMermaidMindmap(text) ?? parseOutlineMindmap(text);
  if (!root) return null;
  const { nodes } = mindmapStats(root);
  return nodes >= MINDMAP_MIN_NODES ? root : null;
}

/** Why no honest map could be built, so the card can say something true. */
export type BoardMindmapResult = { root: MindmapNode } | { error: string };

/**
 * Ask for one, once, with a single retry.
 *
 * 🔴 THE RETRY IS THE PATTERN `makeBoardCheck` AND `board-turn.ts` ALREADY USE, and it exists for a
 * measured reason: the same prompt on the same thread produces a clean answer twice and something
 * unreadable once. "The map came back unusable" is a dead end for a learner who did nothing wrong.
 */
export async function makeBoardMindmap(
  uid: string,
  canvas: LearningCanvas,
  topic?: string,
): Promise<BoardMindmapResult> {
  if (!canvasHasMaterial(canvas)) return { error: "There is nothing on this canvas to map yet." };
  const subject = topic?.trim();
  const ask = subject ? `Map this in particular: ${subject}` : "Map what this canvas covers.";
  const brief = [await canvasBriefFor(canvas, subject), ask].filter(Boolean).join("\n\n");
  const messages = [
    { content: MINDMAP_SYSTEM, role: "system" as const },
    { content: brief, role: "user" as const },
  ];
  const first = await postChatCompletion(uid, messages, { maxTokens: MINDMAP_MAX_TOKENS });
  if (!first.text) return { error: first.errorText ?? "The model call failed. No mind map was made." };
  const root = readBoardMindmap(first.text);
  if (root) return { root };
  const second = await postChatCompletion(
    uid,
    [...messages, { content: first.text, role: "assistant" as const }, { content: "That was not a mermaid mindmap block. Answer again with the block and nothing else.", role: "user" as const }],
    { maxTokens: MINDMAP_MAX_TOKENS },
  );
  const retried = second.text ? readBoardMindmap(second.text) : null;
  return retried ? { root: retried } : { error: "The mind map came back unusable, so nothing was saved. Try again." };
}
