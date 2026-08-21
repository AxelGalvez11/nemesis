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
import {
  chooseCanvasModel,
  EscalationLedger,
  type CanvasEscalationReason,
} from "./canvas-escalation";
import { parseEvaluation, verdictIsTrustworthy } from "./canvas-judge";
import { computePlots } from "./plot-compute";
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
  causalMessages,
  territoryMessages,
  testMessages,
  type EvaluationInput,
  type RelearnMiss,
} from "./canvas-prompts";
import { parseCausalTerritory } from "./causal-grounded";
import { parseSemanticTerritory } from "./semantic-grounded";
import { parseTerritory, type TerritoryResult } from "./knowledge-territory";
import type { KnowledgeObject } from "./knowledge-types";
import type { CanvasSelection, SelectionAction } from "./canvas-selection";
import { knownDefinition } from "./learner-friction";
import { loadLookups, recordLookup } from "./learner-lookups-store";
import { wordShares, worthDefining } from "./vocabulary-lookup";
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

/**
 * The same lane, thinking.
 *
 * 🔴 REACHED ONLY THROUGH `chooseCanvasModel`, AND ONLY AFTER SOMETHING MEASURABLY FAILED. See
 * `canvas-escalation.ts`: this is the SAME MODEL at the same per-token price with `thinking`
 * enabled, so the whole cost of the rung is the reasoning tokens it emits — which is why it is the
 * rung to reach for rather than a premium tier. A paid plan raises how many rescues a session may
 * make; it never changes which model an ordinary turn uses.
 */
const RESCUE: ChatRouteDecision = { route: "conversation", model: "deepseek-reasoner", searchWeb: false };

export interface CanvasCallResult<T> {
  value: T | null;
  /** A student-readable line when something went wrong, else null. */
  error: string | null;
}

/**
 * One escalation ledger per learner, for as long as the tab is open.
 *
 * 🔴 PER LEARNER RATHER THAN MODULE-GLOBAL, for the reason `VisionLedger` is async-local: a single
 * shared counter would let one person's failed lesson spend another's rescue budget. A Map keyed
 * by uid is the browser equivalent — one entry, one tab, one person — and it is bounded by the
 * number of accounts a single browser session can hold, which is one.
 */
const LEDGERS = new Map<string, EscalationLedger>();

/** The ledger for this learner, created on first use. `plan` is a ceiling and nothing else. */
export function escalationLedgerFor(uid: string, plan: string | null = null): EscalationLedger {
  const existing = LEDGERS.get(uid);
  if (existing) return existing;
  const fresh = new EscalationLedger(plan);
  LEDGERS.set(uid, fresh);
  return fresh;
}

/** What this learner's session escalated for, for telemetry and for the owner's cost view. */
export function escalationReport(uid: string): ReturnType<EscalationLedger["report"]> {
  return escalationLedgerFor(uid).report();
}

async function ask(
  uid: string,
  messages: Parameters<typeof postChatCompletion>[1],
  signal?: AbortSignal,
  onDelta?: (delta: string, accumulated: string) => void,
  decision: ChatRouteDecision = WRITE,
): Promise<{ text: string | null; error: string | null }> {
  const reply = await postChatCompletion(uid, messages, {
    decision,
    signal,
    ...(onDelta ? { onDelta } : {}),
  });
  if (reply.errorText) return { text: null, error: reply.errorText };
  return { text: reply.text, error: null };
}

/**
 * Ask cheaply; if the answer does not survive validation, ask once more with the thinking model.
 *
 * 🔴🔴 THE VALIDATOR IS THE ESCALATION SIGNAL, AND IT IS THE ONLY ONE THIS FUNCTION TRUSTS. Nothing
 * here guesses that a turn is hard. `read` is the SAME parser the caller would have run anyway —
 * `parseCanvasOps`, `parseLesson`, `parseEvaluation` — and `null` from it means the cheap model
 * produced something the product cannot use. Today that is a dead end the learner reads as "try
 * again"; one retry on a rung that costs the same per token is the cheapest thing that turns a
 * failed turn into a turn.
 *
 * 🔴 ONE RESCUE. NEVER A LOOP. `alreadyEscalatedThisTurn` is passed as `true` on the second pass by
 * construction — there is no third pass in this function — which is what stops a model having a bad
 * minute from becoming an invoice.
 */
async function askValidated<T>(
  uid: string,
  messages: Parameters<typeof postChatCompletion>[1],
  read: (text: string) => T | null,
  signal?: AbortSignal,
): Promise<{ value: T | null; error: string | null; escalated: CanvasEscalationReason | null }> {
  // 🔴 EVERY CANVAS CALL PASSES THROUGH HERE, WHICH IS WHY §45'S COMPUTATION HOOKS IN AT THIS ONE
  // LINE. A lesson, a command, a relearn and a selection explanation can all carry a plot, and
  // wiring each of the fourteen entry points separately would mean fourteen chances to forget one.
  // `computePlots` returns its input untouched unless the answer actually contains a formula, so
  // the turns that never draw a curve pay a substring test and no round trip.
  const first = await ask(uid, messages, signal);
  if (first.error) return { error: first.error, escalated: null, value: null };
  const value = first.text ? read(await computed(first.text, signal)) : null;
  if (value !== null) return { error: null, escalated: null, value };

  const ledger = escalationLedgerFor(uid);
  const choice = chooseCanvasModel(
    { alreadyEscalatedThisTurn: false, reason: "cheap-model-unusable-output" },
    ledger.state(),
  );
  if (!choice.escalated) {
    console.info(JSON.stringify({ event: "canvas_escalation_declined", detail: choice.detail }));
    return { error: null, escalated: null, value: null };
  }

  ledger.note(choice.reason);
  console.info(JSON.stringify({
    event: "canvas_escalated",
    detail: choice.detail,
    model: choice.model,
    reason: choice.reason,
    spent: ledger.spent,
  }));
  const second = await ask(uid, messages, signal, undefined, RESCUE);
  if (second.error) return { error: second.error, escalated: choice.reason, value: null };
  return { error: null, escalated: choice.reason, value: second.text ? read(await computed(second.text, signal)) : null };
}

/** §45's formulas, turned into points on the server. See lib/learn/plot-compute.ts. */
function computed(text: string, signal?: AbortSignal): Promise<string> {
  return computePlots(text, undefined, signal);
}

// -------------------------------------------------------------------- lesson

export async function generateLesson(
  uid: string,
  input: { topic: string; level: LearningCanvas["level"]; sources: readonly CanvasSource[] },
  signal?: AbortSignal,
): Promise<CanvasCallResult<ParsedLesson>> {
  // 🔴 THE FAILED-PARSE PATH IS THE ESCALATION TRIGGER, AND IT USED TO BE A DEAD END. A lesson the
  // cheap model wrote and the parser refused reached the learner as "try again" — a turn that cost
  // money and produced nothing. One rescue on the thinking rung is the cheapest thing that turns
  // that into a lesson; see `canvas-escalation.ts` for why it is bounded and why a paid plan raises
  // only the bound.
  const { value: lesson, error } = await askValidated(
    uid,
    // 🔴 NO DEFAULT. `?? "basics_known"` used to sit here, so a canvas whose learner was never
    // asked told the model they knew the basics — a claim about a person, invented at the boundary
    // and applied to everyone. Absent is passed through as absent.
    lessonMessages({ topic: input.topic, level: input.level, sources: input.sources }),
    (text) => parseLesson(text, input.sources),
    signal,
  );
  if (error) return { value: null, error };
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
    // 🔴 THE ONE CASE WHERE A WHOLE-CANVAS WRITE IS SAFE, AND §24 NEEDS IT. Opening a document no
    // longer generates anything to read, so a canvas the learner has not asked to change has NO
    // blocks — and every other operation names one. Without this, "Summarize this" would have
    // nothing to insert before or after and would silently produce nothing, which is the one path
    // §24 explicitly preserves.
    //
    // 🔴 IT REPLACES NOTHING, WHICH IS WHY IT IS NOT THE DEFECT `allowWholeCanvas` GUARDS AGAINST.
    // That gate exists because a model given a free choice rewrites the whole page on every turn,
    // undoing the behaviour this surface is judged on: fixing one paragraph fixes one paragraph.
    // With zero blocks there is no paragraph to undo. The moment the canvas holds anything, the
    // gate is closed again and the scoped operations are the only way in.
    ...(canvas.blocks.length === 0 && selected.length === 0 ? { allowWholeCanvas: true } : {}),
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

// ----------------------------------------------------------------- territory

/**
 * A topic, turned into knowledge the policy can teach from — the front door.
 *
 * 🔴 IT REPLACES `generateLesson` FOR A TOPIC-FIRST CANVAS RATHER THAN RUNNING BESIDE IT. That is
 * the spend argument and also the product one: generating 64 paragraphs AND a territory would pay
 * twice to produce a document §M forbids showing.
 *
 * 🔴 IT RETURNS REFUSALS ALONGSIDE THE OBJECTS, AND THE CALLER MUST NOT DISCARD THEM. "We asked for
 * 35 and kept 9" is the difference between a topic that is genuinely thin and a parser quietly
 * dropping everything — and a count nobody reports is exactly how a degraded result passes for a
 * complete one.
 */
export async function constructTerritory(
  uid: string,
  topic: string,
  count: number,
  options: {
    /**
     * The learner's own material, when they attached any — §18's convergence, executed.
     *
     * 🔴 THE SAME CALL FOR BOTH WAYS IN. A typed topic and an uploaded lecture produce knowledge
     * through ONE constructor; only the grounding differs, and the parser holds the grounded lane
     * to a stricter rule (every surviving pair must point at an excerpt that resolves).
     *
     * 🔴 AND THE MATERIAL IS BOUNDED BY `groundingBlock`, WHICH SAYS SO IN THE PROMPT. A long
     * document is truncated at 120,000 characters of excerpts and the model is told how many were
     * left out, so it declines rather than claiming to have covered them. What that means for the
     * learner is stated in the caller: knowledge is drawn from what fitted, and coverage is
     * reported from the deterministic lane, which never counts these objects as representing
     * anything. We under-claim what was covered; we never over-claim it.
     */
    sources?: readonly CanvasSource[];
    signal?: AbortSignal;
  } = {},
): Promise<CanvasCallResult<TerritoryResult>> {
  const { signal, sources } = options;
  const { text, error } = await ask(uid, territoryMessages({ count, sources, topic }), signal);
  if (error) return { value: null, error };
  const territory = text ? parseTerritory({ sources, text, topic }) : null;
  return territory && territory.objects.length
    ? { value: territory, error: null }
    : {
        value: null,
        // 🔴 NAMES THE MATERIAL OR THE TOPIC AS THE THING THAT DID NOT WORK, NOT THE LEARNER. A
        // subject Nemesis cannot turn into checkable facts is a real answer — the honest move is to
        // say so, never to invent pairs so the surface has something on it.
        error: sources?.length
          ? "Nemesis couldn't find anything specific enough to ask you about in that material."
          : "Nemesis couldn't turn that topic into anything specific enough to ask about. Try naming it more narrowly.",
      };
}

/**
 * The mechanisms a document asserts, as grounded causal knowledge.
 *
 * 🔴 A SECOND READING OF THE SAME MATERIAL, NOT A REPLACEMENT FOR THE FIRST. A pair lane and a
 * causal lane are looking for different things in the same text: `losartan — Cozaar` is not a
 * mechanism and "a stop codon terminates translation early" is not a pair. Asking one model call to
 * return both would make the two compete for the same output budget and collapse toward whichever
 * shape the document has more of — which is exactly how a lecture full of mechanisms ends up
 * represented as a glossary.
 *
 * 🔴 IT RETURNS NULL RATHER THAN AN ERROR THE LEARNER SEES. This runs beside a lane that may well
 * have succeeded, so a failure here means "no mechanisms this time", never "the canvas failed". The
 * association lane owns the visible error, because it is the one that can leave the page empty.
 *
 * 🔴 AND IT IS ONE CALL PER TERRITORY BUILD, NOT PER OPEN. `groundedTerritory` writes a build-once
 * marker and holds a per-canvas lock, so the recurring cost of this is one request the first time a
 * canvas meets its material — the same order as the pair lane already standing next to it.
 */
export async function constructCausalKnowledge(
  uid: string,
  topic: string,
  sources: readonly CanvasSource[],
  signal?: AbortSignal,
): Promise<{
  objects: KnowledgeObject[];
  refusals: { reason: string; detail: string }[];
} | null> {
  if (sources.length === 0) return null;
  const { text, error } = await ask(uid, causalMessages({ sources, topic }), signal);
  if (error || !text) return null;
  // 🔴 THE MODEL THIS CLIENT ASKED FOR, WHICH IS THE ONLY MODEL FACT AVAILABLE HERE AND IS SAID AS
  // SUCH. The serving valve is configured outside this repository and has diverged from it before,
  // so a hardcoded name would be a claim we cannot check. Recording the requested route's model is
  // true, is what provenance is for, and moves with the route rather than with a literal.
  const causal = parseCausalTerritory({ model: WRITE.model, sources, text });
  const semantic = parseSemanticTerritory({ model: WRITE.model, sources, text });
  return {
    objects: [...causal.objects, ...semantic.objects],
    refusals: [...causal.refusals, ...semantic.refusals],
  };
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
  const messages = evaluationMessages({ ...input, concepts: canvas.concepts });
  const conceptIds = canvas.concepts.map((concept) => concept.id);
  const read = (text: string) => {
    const { evaluation, rejected } = parseEvaluation(text, { conceptIds });
    if (rejected.length > 0) console.warn("canvas evaluation: refused parts of a reading", rejected);
    return evaluation;
  };

  const { value: first, error } = await askValidated(uid, messages, read, signal);
  if (error) return { value: null, error };
  if (!first) return { value: null, error: "Nemesis couldn't read that answer. Your response was saved." };

  // 🔴🔴 THE SECOND NAMED REASON, AND IT IS A MEASUREMENT RATHER THAN A FEELING. Below
  // `TRUSTED_ENOUGH_TO_UPDATE_STATE` the judge is telling us it could not tell, and
  // `verdictIsTrustworthy` will refuse to let this verdict move anything Nemesis believes about the
  // learner. So the turn produced an observation and no claim: the person answered and found out
  // nothing about whether they were right. That is the unresolved ambiguity the owner's rule names,
  // already detected by code that exists, and re-judging once on the thinking rung is the only
  // thing that can settle it.
  //
  // 🔴 THE STRONGER READING IS TAKEN ONLY IF IT IS ACTUALLY MORE SETTLED. A rescue that comes back
  // equally unsure is not an improvement, and replacing a verdict with an equally uncertain one
  // would make the learner's record depend on which call happened to be second.
  if (!verdictIsTrustworthy(first)) {
    const ledger = escalationLedgerFor(uid);
    const choice = chooseCanvasModel(
      { alreadyEscalatedThisTurn: false, reason: "judgement-did-not-settle" },
      ledger.state(),
    );
    if (choice.escalated) {
      ledger.note(choice.reason);
      console.info(JSON.stringify({
        event: "canvas_escalated",
        confidence: first.confidence,
        detail: choice.detail,
        model: choice.model,
        reason: choice.reason,
        spent: ledger.spent,
      }));
      const second = await ask(uid, messages, signal, undefined, RESCUE);
      const rejudged = second.text ? read(second.text) : null;
      if (rejudged && rejudged.confidence > first.confidence) return { value: rejudged, error: null };
    }
  }

  return { value: first, error: null };
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

/**
 * 🔴 UNREACHABLE AT THIS COMMIT, AND KEPT AS THE COUNTER-EXAMPLE IT IS. MEASURED, NOT ASSUMED.
 *
 * This function computes a scoped selection and then throws it away:
 *
 *     blocksForConcepts(canvas.blocks, weakConceptIds)   →  fed to the prompt as context
 *     ops.filter(op => op.operation === "replace_canvas") →  every other op DISCARDED below
 *
 * So it regenerates the WHOLE page for a weakness in one concept — the exact behaviour
 * `applyTeachingAction` says its scope exists to prevent ("fixing one paragraph fixes one
 * paragraph"), and a direct violation of the interaction model's §K: do not regenerate unrelated
 * material merely because generation is cheap.
 *
 * 🔴 IT CANNOT FIRE. Its only caller is `session.relearn()`, reached solely from the stage-advance
 * control, and the two conditions are disjoint:
 *
 *     nextAction().to === "targeted_relearn"   ONLY in state `diagnose`
 *     the advance control renders              ONLY in states `learn` and `targeted_relearn`
 *
 * `composeSurface({ canvasState: "diagnose" }).document` is `false` under both
 * `policyPresenting` values, so `CanvasDocument` — which owns `onAdvance` — is never mounted in
 * `diagnose` at all. The composer's own `onAdvance` is wired to `policy.acknowledge` or to `null`
 * and never calls the stage advance. Separately, `canTransition(*, "diagnose")` is permitted from
 * NO state, so the validated route in is closed too; `diagnose` is only ever set by a direct
 * assignment in `finishTest`, which is itself unreachable for the same reason.
 *
 * 🔴 SO DO NOT "FIX" THE FILTER BELOW WITHOUT FIRST MAKING THIS REACHABLE. Repairing dead code
 * produces a scoped rewrite nobody can run and a green diff that proves nothing. If this arm is
 * ever revived, the one-line fix is to stop filtering to `replace_canvas` and let the scoped ops
 * through — and the scope is already computed for you.
 */
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

  // 🔴🔴 A DEFINITION THE LEARNER HAS ALREADY BEEN GIVEN COMES BACK WITHOUT A MODEL CALL. The
  // owner's ask, in one sentence: *"I want users to be able to highlight a word to define or explain
  // and have nemesis keep track of that to provide the definition in the future."* The second
  // encounter with a term is the common one — the same word appears on four slides — and paying for
  // it again is both slower for them and a cost with nothing behind it.
  //
  // 🔴 ONLY FOR `define`. "Explain this", "why", and "give me an example" are questions about a
  // passage in its context, and the answer to them is not reusable the way a term's meaning is.
  const remembered = action === "define" ? await rememberedDefinition(uid, selection) : null;
  if (remembered) return { value: remembered, error: null };

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

  // 🔴 REMEMBERED AFTER THE ANSWER EXISTS, AND THE WRITE CANNOT DELAY IT. `recordLookup` never
  // throws and returns a boolean; a glossary that failed to save must not cost the learner the
  // definition they are looking at.
  if (action === "define") {
    void recordLookup(uid, {
      canvasId: canvas.id,
      definition: answer.text,
      displayTerm: selection.selectedText,
    });
  }

  return {
    value: {
      term: selection.selectedText,
      text: answer.text,
      ...(named ? { sourceLabel: named.title } : {}),
    },
    error: null,
  };
}

/**
 * A definition this learner was already given for this selection — or nothing.
 *
 * 🔴 THE REFUSAL COMES FIRST, AND IT IS THE OWNER'S RULE: *"if user selects a non vocab term like an
 * article, then it should disregard that likely."* Someone drags across a line and catches "the" on
 * the end of it; storing a definition for "the" and offering it back for ever is three kinds of
 * wrong at once. `worthDefining` decides that from how often the word appears in the learner's OWN
 * material rather than from a stop-word list, so it works in every language — see
 * `vocabulary-lookup.ts` for why a list would work in English and silently misbehave elsewhere.
 *
 * 🔴 A REFUSAL RETURNS NULL, WHICH FALLS THROUGH TO THE MODEL RATHER THAN BLOCKING. This function's
 * job is to save a call, never to deny an answer: refusing to reuse is cheap, and refusing to ANSWER
 * would let a normalisation quirk silently break the feature for a word somebody genuinely needs.
 */
async function rememberedDefinition(
  uid: string,
  selection: CanvasSelection,
): Promise<SelectionExplanation | null> {
  const material = selection.surroundingText ?? "";
  const decision = worthDefining({
    sentenceCount: material.split(/[.!?\n]+/u).filter((piece) => piece.trim()).length,
    shares: wordShares(material),
    term: selection.selectedText,
  });
  if (!decision.define) return null;

  const known = knownDefinition(await loadLookups(uid), selection.selectedText);
  if (!known) return null;

  // 🔴 THE REUSE IS ITSELF A LOOKUP, AND RECORDING IT IS THE WHOLE FRICTION SIGNAL. Needing the same
  // word a second time after being told is precisely what `learner-friction.ts` counts; skipping the
  // write here because "we did not do any work" would make the signal measure our model spend
  // instead of the learner's difficulty, and it would never reach the threshold.
  void recordLookup(uid, {
    definition: known.definition,
    displayTerm: selection.selectedText,
  });
  return { term: selection.selectedText, text: known.definition };
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
