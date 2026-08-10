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

import { blocksForConcepts } from "./canvas-diagnosis";
import { parseEvaluation } from "./canvas-judge";
import type { CognitiveAction } from "./canvas-policy";
import {
  conceptLabel,
  type CanvasFreeQuestion,
  type LearnerResponse,
  type ResponseEvaluation,
  type RetrievalFormat,
  type RetrievalTask,
} from "./canvas-model";
import { parseCanvasOps, validateOps, type CanvasOp } from "./canvas-ops";
import {
  parseFreeQuestions,
  parseLesson,
  parseTeachingReply,
  parseRecallCards,
  parseSelectionAnswer,
  parseShortAnswer,
  parseSimplifiedContent,
  parseTestQuestions,
  type ParsedLesson,
} from "./canvas-parse";
import {
  commandMessages,
  explainBlockMessages,
  evaluationMessages,
  lessonMessages,
  recallMessages,
  relearnMessages,
  selectionMessages,
  simplifyMessages,
  teachingMessages,
  testMessages,
  type EvaluationInput,
  type RelearnMiss,
} from "./canvas-prompts";
import type { CanvasSelection, SelectionAction } from "./canvas-selection";
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
  format: RetrievalFormat,
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
      format,
      ...(onlyConceptIds?.length ? { onlyConceptIds } : {}),
    }),
    signal,
  );
  if (error) return { value: null, error };
  const conceptIds = canvas.concepts.map((concept) => concept.id);
  const questions: CanvasQuestion[] = text
    ? format === "free"
      ? parseFreeQuestions(text, conceptIds, canvas.sources)
      : parseTestQuestions(text, conceptIds, canvas.sources)
    : [];
  return questions.length
    ? { value: questions, error: null }
    : { value: null, error: "Nemesis couldn't write questions for this. Try generating the lesson again." };
}

// ------------------------------------------------------------------- judging

/** Read one free-text answer.
 *
 *  A refused judgement is NOT an error the learner sees. It means we did not manage to assess
 *  that answer — the page moves on, the diagnosis simply has one less piece of evidence, and
 *  nobody is told they were wrong on the strength of a malformed reply. */
/** 🔴 THE ONE EVIDENCE BOUNDARY. Named for what it does — evaluate a learning response — and not
 *  for the surface that happens to call it first. Recall cards, test prompts, and later a
 *  worked derivation, a spoken answer in a second language or a diagram rebuilt from memory all
 *  arrive here in the same shape, and all produce the same kind of evidence.
 *
 *  Nothing about scheduling happens here. See canvas-scheduling.ts. */
export async function evaluateLearningResponse(
  uid: string,
  canvas: LearningCanvas,
  input: Omit<EvaluationInput, "concepts">,
  signal?: AbortSignal,
): Promise<CanvasCallResult<ResponseEvaluation>> {
  const { text, error } = await ask(
    uid,
    evaluationMessages({ ...input, concepts: canvas.concepts }),
    signal,
  );
  if (error) return { value: null, error };

  const { evaluation, rejected } = parseEvaluation(text ?? "", {
    conceptIds: canvas.concepts.map((concept) => concept.id),
  });
  if (rejected.length > 0) console.warn("canvas evaluation: refused parts of a reading", rejected);
  return evaluation
    ? { value: evaluation, error: null }
    : { value: null, error: "Nemesis couldn't read that answer. Your response was saved." };
}

/** A free-response test prompt as an evaluation task. */
export function questionAsTask(
  canvas: LearningCanvas,
  question: CanvasFreeQuestion,
  response: LearnerResponse,
): Omit<EvaluationInput, "concepts"> {
  return {
    prompt: question.q,
    task: question.task,
    objective: { conceptId: question.conceptId, label: conceptLabel(canvas, question.conceptId) },
    expectedEvidence: {
      ...question.expectedEvidence,
      ...(question.why ? { referenceAnswer: question.why } : {}),
    },
    response,
    ...(question.sourceRefs?.length ? { context: { sourceRefs: question.sourceRefs } } : {}),
  };
}

/** An existing flashcard as an evaluation task.
 *
 *  This is the whole migration story for the old card format: the back becomes a reference
 *  answer, which is one kind of expected evidence among several. Nothing about the card has to
 *  change, and nothing downstream has to know a card was involved. */
export function cardAsTask(
  canvas: LearningCanvas,
  card: RecallCard,
  response: LearnerResponse,
  task: RetrievalTask = "explain",
): Omit<EvaluationInput, "concepts"> {
  return {
    prompt: card.front,
    task,
    objective: { conceptId: card.conceptId, label: conceptLabel(canvas, card.conceptId) },
    expectedEvidence: { referenceAnswer: card.back },
    response,
    ...(card.sourceRefs?.length ? { context: { sourceRefs: card.sourceRefs } } : {}),
  };
}

// ------------------------------------------------------------ teaching loop

export interface TeachingChange {
  ops: CanvasOp[];
  followUp: CanvasFreeQuestion | null;
}

/** Turn a chosen teaching action into a validated, SCOPED change to the page.
 *
 *  🔴 The scope is not advisory. `validateOps` is given the ids of the blocks that teach this
 *  objective and refuses every other block — and because `replace_canvas` and `rewrite_section`
 *  are whole-canvas operations, scoping also puts them out of reach. Without it the model
 *  regenerates the page on almost every turn, which would silently undo the one behaviour this
 *  surface is judged on: fixing one paragraph fixes one paragraph. */
export async function applyTeachingAction(
  uid: string,
  canvas: LearningCanvas,
  input: {
    action: CognitiveAction;
    objectiveId: string;
    prompt: string;
    said: string;
    demonstrated: readonly string[];
  },
  signal?: AbortSignal,
): Promise<CanvasCallResult<TeachingChange>> {
  const scope = blocksForConcepts(canvas.blocks, [input.objectiveId]);

  const { text, error } = await ask(
    uid,
    teachingMessages({
      action: input.action,
      canvasTitle: canvas.title,
      objectiveLabel: conceptLabel(canvas, input.objectiveId),
      objectiveId: input.objectiveId,
      prompt: input.prompt,
      said: input.said,
      demonstrated: input.demonstrated,
      scope,
      sources: canvas.sources,
      level: canvas.level,
    }),
    signal,
  );
  if (error) return { value: null, error };

  const proposed = parseCanvasOps(text ?? "");
  // An empty scope means the page has no block for this idea yet, so there is nothing to
  // rewrite — but new blocks still have to land somewhere, so the insert targets fall back to
  // the whole document rather than being refused outright.
  const { ops } = validateOps(canvas, proposed, {
    ...(scope.length ? { scopeBlockIds: scope.map((block) => block.id) } : {}),
  });
  const { followUp } = parseTeachingReply(
    text ?? "",
    canvas.concepts.map((concept) => concept.id),
    canvas.sources,
  );

  // A change that neither rewrote anything nor asked anything is not worth applying, and
  // reporting success for it would leave the learner staring at an unchanged page.
  if (ops.length === 0 && !followUp) {
    return { value: null, error: "Nemesis couldn't work out what to change. Nothing was altered." };
  }
  return { value: { ops, followUp }, error: null };
}

// --------------------------------------------------------- targeted relearn

export async function generateRelearn(
  uid: string,
  canvas: LearningCanvas,
  relevantBlocks: readonly CanvasBlock[],
  misses: readonly RelearnMiss[],
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

// ----------------------------------------------------------------- selection

export interface SelectionExplanation {
  term: string;
  text: string;
  /** Only set when the learner's own material actually defines this. */
  sourceLabel?: string;
}

/** Define / Explain / Example / Why for an exact highlighted range.
 *
 *  Returns text for a popover. It deliberately does NOT touch the page: looking up one word must
 *  not disturb the paragraph being read, and a definition that rewrote the passage underneath
 *  the learner would move the thing they were looking at while they looked at it. */
export async function explainSelection(
  uid: string,
  canvas: LearningCanvas,
  selection: CanvasSelection,
  action: SelectionAction,
  signal?: AbortSignal,
): Promise<CanvasCallResult<SelectionExplanation>> {
  const block = selection.blockId
    ? canvas.blocks.find((candidate) => candidate.id === selection.blockId)
    : undefined;
  const objective = selection.conceptIds?.[0] ? conceptLabel(canvas, selection.conceptIds[0]) : "";

  const { text, error } = await ask(
    uid,
    selectionMessages({
      action,
      selectedText: selection.selectedText,
      surroundingText: selection.surroundingText,
      ...(block ? { passage: block.content } : {}),
      canvasTitle: canvas.title,
      ...(objective ? { objective } : {}),
      sources: canvas.sources,
    }),
    signal,
  );
  if (error) return { value: null, error };

  const answer = text ? parseSelectionAnswer(text) : null;
  if (!answer) return { value: null, error: "Nemesis had nothing useful to add about that." };

  // A source title the canvas does not actually have is decoration, and decoration that looks
  // like provenance is worse than none — so it is checked against the real source list rather
  // than trusted from the reply.
  const named = answer.fromSource
    ? canvas.sources.find((source) => source.title.toLowerCase() === answer.fromSource.toLowerCase())
    : undefined;

  return {
    value: {
      term: selection.selectedText,
      text: answer.text,
      ...(named ? { sourceLabel: named.title } : {}),
    },
    error: null,
  };
}

/** "Simpler" — the one selection action that edits the page, and it edits ONE block.
 *
 *  Scoped through the same validator the teaching loop uses, which is what keeps
 *  `replace_canvas` and `rewrite_section` out of reach. Unscoped, a request to simplify one
 *  sentence comes back as a regenerated page. */
export async function simplifySelection(
  uid: string,
  canvas: LearningCanvas,
  selection: CanvasSelection,
  signal?: AbortSignal,
): Promise<CanvasCallResult<{ ops: CanvasOp[]; before: string; blockId: string }>> {
  const block = selection.blockId
    ? canvas.blocks.find((candidate) => candidate.id === selection.blockId)
    : undefined;
  if (!block) return { value: null, error: "That text isn't part of the document, so there's nothing to rewrite." };

  const { text, error } = await ask(
    uid,
    simplifyMessages({
      selectedText: selection.selectedText,
      block,
      canvasTitle: canvas.title,
      sources: canvas.sources,
    }),
    signal,
  );
  if (error) return { value: null, error };

  const content = text ? parseSimplifiedContent(text) : null;
  if (!content) return { value: null, error: "Nemesis couldn't rewrite that. Nothing was changed." };

  const { ops } = validateOps(
    canvas,
    [{ operation: "replace_block", blockId: block.id, content }],
    { scopeBlockIds: [block.id] },
  );
  if (ops.length === 0) return { value: null, error: "Nemesis couldn't rewrite that. Nothing was changed." };

  // `before` is captured HERE, at the moment of the write. Once the ops are applied the original
  // wording is gone and no later step can reconstruct it.
  return { value: { ops, before: block.content, blockId: block.id }, error: null };
}
