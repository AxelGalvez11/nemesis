// An answer to a pinned note, written back into the document rather than into the conversation.
//
// 🔴🔴 THE OWNER'S REASON IS THE WHOLE DESIGN (2026-09-04): *"it would be useful to have annotations
// with chat responses within the document so users dont bloat the main chat"*. A learner reading one
// lecture asks a dozen small questions about a dozen spots. Sent to the canvas they arrive as a
// dozen turns that push the thing they were actually working on off the screen, and every one of
// them reads out of context because the spot it was about is in another panel. Answered in place,
// each stays beside the sentence that prompted it and the conversation keeps its shape.
//
// 🔴 SHORT ON PURPOSE, AND THE LENGTH IS THE FEATURE. This lands in a popover in the margin, not in
// a reading column. An answer that needs headings is an answer that belongs in the canvas, and the
// reply carries a way to take it there.
//
// 🔴 NO RETRIEVAL, NO TOOLS, NO CARDS. The canvas lane already does all of that and does it better;
// duplicating any of it here would be a second cognition with its own opinions. This lane knows
// exactly one thing: the words at the spot the learner pointed at.

import { THINKING_STANCE } from "@nemesis/shared";

import type { CommentAnchor } from "@/lib/workspace/document-comments";
import { postChatCompletion, type WireMsg } from "@/lib/workspace/chat-api";

/** How much of the unit's own text travels with the question. */
export const SPOT_TEXT_LIMIT = 4000;

/**
 * The instruction.
 *
 * 🔴 FIELD-AGNOSTIC, and it has to stay that way. Nothing here names a subject, and nothing may:
 * this same prompt answers a note on a statute, a circuit diagram and a nursing drug table.
 *
 * 🔴 NO EM DASHES (owner, 2026-08-25). The rule covers every prompt string in the app, because the
 * model copies the punctuation it is shown.
 */
export const COMMENT_ANSWER_SYSTEM = [
  "You are Nemesis, answering a note a learner pinned to one exact spot in a document they are reading.",
  "",
  // 🔴🔴 THE STANCE RIDES HERE TOO, AND `every-surface-has-a-stance.test.ts` CAUGHT ITS ABSENCE the
  // hour this lane was written. The thread has a follow-up field, so a learner can push back on
  // this answer where they are standing. A margin that folds the moment it is argued with, beside
  // a canvas that holds its ground, is the exact drift that guard exists to stop: the answer a
  // student believes is the one that agreed with them.
  THINKING_STANCE,
  "",
  "Your answer appears in the margin beside their note, inside the document. It is not a chat message.",
  "",
  "How to answer:",
  "- Answer the note they wrote, about the spot they pinned it to. Nothing else in the document is the subject unless they asked about it.",
  "- Keep it under 120 words. Plain sentences. No headings, no bold, no numbered sections.",
  "- A short list is allowed when the answer really is a list, at most three items.",
  "- If the text of the spot is given to you, ground the answer in it and quote at most one short phrase from it.",
  "- If you were given no text for the spot, say what you can from the document's name and their note, and say plainly which part you cannot see. Never invent what the page says.",
  "- Never use an em dash.",
  "- Do not offer to make flashcards, notes or anything else, and do not ask what else they want. This is an answer, not a menu.",
].join("\n");

export interface CommentAnswerInput {
  fileName: string;
  unitLabel: string;
  unit: number | null;
  anchor: CommentAnchor;
  /** The learner's own note. */
  body: string;
  /** The text of the unit the note sits on, when the reader has it. */
  spotText?: string | null;
  /** Earlier turns in this thread, oldest first, so a follow-up knows what was said. */
  thread?: readonly { author: "learner" | "nemesis"; body: string }[];
}

/**
 * The messages the ask becomes. PURE, so its shape can be pinned without a network in the loop.
 *
 * 🔴 THE QUOTE BEATS THE POSITION, the same rule `commentAskPrompt` states: "page 14" tells the
 * model where a finger was and nothing about what is under it.
 */
export function commentAnswerMessages(input: CommentAnswerInput): WireMsg[] {
  const where = input.unit !== null ? ` on ${input.unitLabel} ${input.unit}` : "";
  const quoted = input.anchor.quote?.replace(/\s+/g, " ").trim();
  const gesture = quoted
    ? `They highlighted "${quoted.replace(/"/g, "'")}"`
    : input.anchor.box
      ? "They marked an area"
      : input.anchor.block !== undefined
        ? `They pointed at paragraph ${input.anchor.block + 1}`
        : "They pointed at a spot";
  const spot = (input.spotText ?? "").trim().slice(0, SPOT_TEXT_LIMIT);
  const parts = [
    `Document: "${input.fileName}".`,
    `${gesture}${where}.`,
    spot
      ? `The text of that ${input.unitLabel} reads:\n\n${spot}`
      : `No text could be read for that ${input.unitLabel}, so you cannot see what it says.`,
    `Their note: "${input.body.trim()}"`,
  ];
  const history = (input.thread ?? []).map(
    (turn): WireMsg => ({ content: turn.body, role: turn.author === "nemesis" ? "assistant" : "user" }),
  );
  return [
    { content: COMMENT_ANSWER_SYSTEM, role: "system" },
    { content: parts.join("\n\n"), role: "user" },
    ...history,
  ];
}

/**
 * Ask, and hand back what came out. Null when nothing usable did.
 *
 * 🔴 BEST-EFFORT LIKE EVERY OTHER READER CALL. A failed answer must degrade to "that did not come
 * back, try again" in the popover; it may never take the reader down with it.
 */
export async function answerComment(
  uid: string | null,
  input: CommentAnswerInput,
  options?: { signal?: AbortSignal },
): Promise<string | null> {
  if (!uid) return null;
  try {
    const reply = await postChatCompletion(uid, commentAnswerMessages(input), {
      decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    const text = reply.text?.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}
