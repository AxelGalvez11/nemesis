// Every model call the canvas makes.
//
// All of them go through `postChatCompletion` — the same door chat uses, which means the same
// device key, the same `X-Nemesis-Client: web` cost attribution, the same daily/monthly budget
// enforcement and the same upgrade prompt when a learner runs out. That is deliberate: the
// unit-economics audit found the one lane that had its own path was also the one lane with no
// meter on it, and a new surface must not recreate that hole.
//
// Nothing here decides what happens to the page. These functions return validated content or
// null; the caller applies it.

import { postChatCompletion } from "@/lib/workspace/chat-api";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";

import { parseCanvasOps, validateOps, type CanvasOp } from "./canvas-ops";
import {
  parseLesson,
  parseRecallCards,
  parseShortAnswer,
  parseTestQuestions,
  type ParsedLesson,
} from "./canvas-parse";
import {
  commandMessages,
  explainBlockMessages,
  lessonMessages,
  recallMessages,
  relearnMessages,
  testMessages,
} from "./canvas-prompts";
import type {
  CanvasBlock,
  CanvasQuestion,
  CanvasSource,
  LearningCanvas,
  RecallCard,
} from "./canvas-model";

/** Writing a document is a writing job, not a reasoning job, and the non-thinking model is the
 *  one that reliably returns clean JSON on this lane — the thinking model is where the repo's
 *  raw-markup-in-the-content-channel problems came from. */
const WRITE: ChatRouteDecision = { route: "conversation", model: "deepseek-chat", searchWeb: false };

export interface CanvasCallResult<T> {
  value: T | null;
  /** A student-readable line when something went wrong, else null. */
  error: string | null;
}

async function ask(
  uid: string,
  messages: Parameters<typeof postChatCompletion>[1],
  signal?: AbortSignal,
  onDelta?: (delta: string, accumulated: string) => void,
): Promise<{ text: string | null; error: string | null }> {
  const reply = await postChatCompletion(uid, messages, {
    decision: WRITE,
    signal,
    ...(onDelta ? { onDelta } : {}),
  });
  if (reply.errorText) return { text: null, error: reply.errorText };
  return { text: reply.text, error: null };
}

// -------------------------------------------------------------------- lesson

export async function generateLesson(
  uid: string,
  input: { topic: string; level: LearningCanvas["level"]; sources: readonly CanvasSource[] },
  signal?: AbortSignal,
): Promise<CanvasCallResult<ParsedLesson>> {
  const { text, error } = await ask(
    uid,
    lessonMessages({ topic: input.topic, level: input.level ?? "basics_known", sources: input.sources }),
    signal,
  );
  if (error) return { value: null, error };
  const lesson = text ? parseLesson(text, input.sources) : null;
  return lesson
    ? { value: lesson, error: null }
    : { value: null, error: "Nemesis couldn't build a lesson from that. Try again, or add more material." };
}

// ------------------------------------------------------------------ commands

/** A learner's typed command, turned into validated operations.
 *
 *  🔴 `selected` is what makes this cost one paragraph instead of a page. When it is non-empty
 *  the prompt names the only ids the model may touch AND the validator refuses everything
 *  else — belt and braces, because a prompt is advice and a validator is a rule. */
export async function runCommand(
  uid: string,
  canvas: LearningCanvas,
  command: string,
  selected: readonly CanvasBlock[],
  signal?: AbortSignal,
): Promise<CanvasCallResult<CanvasOp[]> & { rejected: number }> {
  const { text, error } = await ask(
    uid,
    commandMessages({
      command,
      canvasTitle: canvas.title,
      blocks: canvas.blocks,
      selected,
      concepts: canvas.concepts,
      sources: canvas.sources,
      level: canvas.level,
    }),
    signal,
  );
  if (error) return { value: null, error, rejected: 0 };

  const proposed = parseCanvasOps(text ?? "");
  const { ops, rejected } = validateOps(canvas, proposed, {
    ...(selected.length ? { scopeBlockIds: selected.map((block) => block.id) } : {}),
  });
  if (ops.length === 0) {
    return {
      value: null,
      error:
        rejected.length > 0
          ? "Nemesis proposed a change that didn't fit the page. Nothing was altered."
          : "Nemesis didn't change anything. Try saying it a different way.",
      rejected: rejected.length,
    };
  }
  return { value: ops, error: null, rejected: rejected.length };
}

/** Explanations that do not change the page — "why was my answer wrong?", "explain this card".
 *  Shown in a transient popover and never appended to the document (§4). */
export async function explainBlock(
  uid: string,
  canvas: LearningCanvas,
  block: CanvasBlock,
  command: string,
  signal?: AbortSignal,
  onDelta?: (delta: string, accumulated: string) => void,
): Promise<CanvasCallResult<string>> {
  const { text, error } = await ask(
    uid,
    explainBlockMessages({ block, canvasTitle: canvas.title, command, sources: canvas.sources }),
    signal,
    onDelta,
  );
  if (error) return { value: null, error };
  const answer = text ? parseShortAnswer(text) : null;
  return answer ? { value: answer, error: null } : { value: null, error: "Nemesis had nothing to add." };
}

// -------------------------------------------------------------------- recall

export async function generateRecall(
  uid: string,
  canvas: LearningCanvas,
  count: number,
  signal?: AbortSignal,
): Promise<CanvasCallResult<RecallCard[]>> {
  const { text, error } = await ask(
    uid,
    recallMessages({
      canvasTitle: canvas.title,
      blocks: canvas.blocks,
      concepts: canvas.concepts,
      count,
    }),
    signal,
  );
  if (error) return { value: null, error };
  const cards = text ? parseRecallCards(text, canvas.concepts.map((concept) => concept.id), canvas.sources) : [];
  return cards.length
    ? { value: cards, error: null }
    : { value: null, error: "Nemesis couldn't write recall prompts from this lesson." };
}

// ---------------------------------------------------------------------- test

export async function generateTest(
  uid: string,
  canvas: LearningCanvas,
  count: number,
  onlyConceptIds?: readonly string[],
  signal?: AbortSignal,
): Promise<CanvasCallResult<CanvasQuestion[]>> {
  const { text, error } = await ask(
    uid,
    testMessages({
      canvasTitle: canvas.title,
      blocks: canvas.blocks,
      concepts: canvas.concepts,
      count,
      ...(onlyConceptIds?.length ? { onlyConceptIds } : {}),
    }),
    signal,
  );
  if (error) return { value: null, error };
  const questions = text
    ? parseTestQuestions(text, canvas.concepts.map((concept) => concept.id), canvas.sources)
    : [];
  return questions.length
    ? { value: questions, error: null }
    : { value: null, error: "Nemesis couldn't write questions for this. Try generating the lesson again." };
}

// --------------------------------------------------------- targeted relearn

export async function generateRelearn(
  uid: string,
  canvas: LearningCanvas,
  relevantBlocks: readonly CanvasBlock[],
  misses: readonly { question: string; picked: string; correct: string; why: string }[],
  signal?: AbortSignal,
): Promise<CanvasCallResult<CanvasOp[]>> {
  const weak = canvas.concepts.filter((concept) => canvas.weakConceptIds.includes(concept.id));
  const { text, error } = await ask(
    uid,
    relearnMessages({
      canvasTitle: canvas.title,
      weak,
      relevantBlocks,
      sources: canvas.sources,
      level: canvas.level,
      misses,
    }),
    signal,
  );
  if (error) return { value: null, error };

  // The only place `replace_canvas` is permitted — the whole point here is a new, much
  // shorter document. Everywhere else the validator refuses it.
  const { ops } = validateOps(canvas, parseCanvasOps(text ?? ""), { allowWholeCanvas: true });
  const useful = ops.filter((op) => op.operation === "replace_canvas");
  return useful.length
    ? { value: useful, error: null }
    : { value: null, error: "Nemesis couldn't focus the lesson on your weak spots. Nothing was changed." };
}
