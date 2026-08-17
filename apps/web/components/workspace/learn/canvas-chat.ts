// The one model call the Canvas makes that does NOT touch the document.
//
// Every other call in this product (lib/learn/canvas-api.ts's `runCommand`, `generateLesson`, and
// the rest) writes into the persistent study document, through a system prompt that says outright
// "you are not chatting" and that grounds every claim in the attached material or refuses it.
// Product mandate rule 1 (owner, 2026-08-15) asks for the other half: "the learner must be able to
// ask ordinary questions about their sources WITHOUT being forced into tutoring behaviour." This
// file is that other half. It answers a question in plain running text, the answer is shown as a
// transient aside (see `use-canvas-session.ts`'s `askGeneral`), and it disappears on the next turn
// under the same rule that already governs "Explain this" (contract rule 2, canvas-explanation-
// turn.ts). Nothing here proposes a document operation, and nothing here is stored past the turn.
//
// 🔴 THE SAME DOOR EVERYTHING ELSE USES. `postChatCompletion` is the shared call every chat surface
// in this app goes through: the same device key, the same cost attribution header, the same daily
// budget enforcement. A new answer surface that reached the model through its own path would be
// the exact hole the unit-economics audit already found once (see lib/learn/canvas-api.ts's own
// header comment) and this file exists specifically not to repeat it.
//
// 🔴 WEB SEARCH RIDES THE SAME REGEX-FIRST GATE SESSIONS CHAT ALREADY USES (`shouldSearchWeb`,
// lib/workspace/chat-web-search.ts). Nothing here reimplements that decision; it is imported and
// reused so a canvas question about "the current inflation rate" and a Sessions question about the
// same thing are judged by the identical rule rather than by two rules that can quietly diverge.

import { postChatCompletion, searchWebContext, type WireMsg } from "@/lib/workspace/chat-api";
import {
  buildFreshSearchQuery,
  citedWebResults,
  shouldSearchWeb,
  type ChatWebResult,
} from "@/lib/workspace/chat-web-search";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";
import { sourceDisagreementInstruction } from "@/lib/workspace/source-authority";
import { groundingBlock } from "@/lib/learn/canvas-grounding";
import type { LearningCanvas } from "@/lib/learn/canvas-model";

/** The non-thinking model, same choice `lib/learn/canvas-api.ts`'s own `ask()` makes for every
 *  other canvas call: a plain reply is a writing job, not a reasoning job, and `searchWeb` here is
 *  descriptive only (the actual search runs beforehand, in `askCanvasChat`, and its result is
 *  folded into the user message before this decision object ever reaches the wire). */
const CHAT_DECISION: ChatRouteDecision = { route: "conversation", model: "deepseek-chat", searchWeb: false };

/**
 * The instruction that keeps this call from turning into a sixth way to write the document.
 *
 * 🔴 STATED, THE SAME WAY THE DOCUMENT PROMPT STATES ITS OWN NO-EM-DASH RULE (lib/learn/canvas-
 * prompts.ts's `NO_EM_DASH`). That constant is not exported and lives outside this directory's own
 * copy guard, so it is restated here in its own words rather than imported: both say the same
 * thing to the model, in different sentences, which also means this file's literal source text
 * carries no dash character of the kind it is telling the model to avoid.
 */
const CHAT_SYSTEM =
  "You are Nemesis. Answer the learner's question directly, the way a knowledgeable person would " +
  "answer it in conversation. This is a plain reply, not a study document: no heading, no bullet " +
  "list of learning points, no proposed exercise, and nothing framed as a lesson. Write a few plain " +
  "sentences, as short as the question allows. " +
  "You may draw on the learner's attached material below when it is relevant, and you may also " +
  "answer from what you already know: unlike the study document, this reply is not limited to the " +
  "attached material, and a question outside it should still get a real answer. " +
  "When live web results are supplied, use them for anything time-sensitive and reference the " +
  "numbered result inline like this: [1]. " +
  "Write plainly. No heading, no closing offer to help further, no unearned enthusiasm. Never use " +
  "an em dash character in your answer; use a comma, a colon, or a new sentence instead. " +
  "Never assume the learner's field or level beyond what this message tells you.";

/** Pure prompt construction, kept separate from the network call so it can be checked without a
 *  model in the loop, the same split `lib/learn/canvas-prompts.ts` and its own test file use. */
export function chatMessages(input: {
  canvasTitle: string;
  question: string;
  /** Excerpts from the canvas's own attached material, when it has any. Empty string when not. */
  materialContext: string;
  /** Formatted live web results, when a search ran. Empty string when it did not. */
  webContext: string;
}): WireMsg[] {
  const sourceRule = sourceDisagreementInstruction({
    hasAttachedMaterial: input.materialContext.trim().length > 0,
    hasExternalEvidence: input.webContext.trim().length > 0,
  });

  return [
    { content: [CHAT_SYSTEM, sourceRule].filter(Boolean).join("\n\n"), role: "system" },
    ...(input.materialContext.trim()
      ? [{
        content:
          "ATTACHED COURSE OR ASSESSMENT MATERIAL. This is source context, not something the learner "
          + "said in their question.\n\n"
          + input.materialContext.trim(),
        role: "system" as const,
      }]
      : []),
    ...(input.webContext.trim()
      ? [{
        content:
          "PROVISIONAL EXTERNAL EVIDENCE retrieved live for this answer. This is source context, not "
          + "something the learner said or has demonstrated knowing.\n\n"
          + input.webContext.trim(),
        role: "system" as const,
      }]
      : []),
    {
      content:
        (input.canvasTitle ? `The learner is on a canvas titled "${input.canvasTitle}" and asked:\n\n` : "The learner asked:\n\n") +
        `"${input.question}"`,
      role: "user",
    },
  ];
}

export interface CanvasChatReply {
  text: string | null;
  /** Live web results actually used, in the order cited. Empty when no search ran. */
  sources: readonly ChatWebResult[];
  error: string | null;
}

/**
 * Answer a question conversationally. Never proposes a document operation; the caller decides
 * only where the plain-text answer is shown (see `askGeneral` in `use-canvas-session.ts`).
 */
export async function askCanvasChat(
  uid: string,
  canvas: LearningCanvas,
  question: string,
  signal?: AbortSignal,
): Promise<CanvasChatReply> {
  let webContext = "";
  let sources: ChatWebResult[] = [];
  if (shouldSearchWeb(question)) {
    const result = await searchWebContext(uid, buildFreshSearchQuery(question), signal);
    webContext = result.context;
    sources = result.sources;
  }

  const reply = await postChatCompletion(
    uid,
    chatMessages({
      canvasTitle: canvas.title,
      materialContext: groundingBlock(canvas.sources),
      question,
      webContext,
    }),
    { decision: CHAT_DECISION, signal },
  );

  if (reply.errorText) return { error: reply.errorText, sources: [], text: null };
  return {
    error: null,
    // Only the pages the answer cited become promotion candidates. Search rank is retrieval
    // evidence, not permission to turn every hit into durable learning material.
    sources: reply.text ? citedWebResults(reply.text, sources) : [],
    text: reply.text,
  };
}
