// The Learning Canvas data model.
//
// A canvas is ONE thing a student is trying to understand — a lecture, a chapter, a topic —
// and it is a document whose paragraphs have identities. That is the whole point: the model
// rewrites block 17 without regenerating blocks 1-40, so a "make this simpler" costs one
// paragraph instead of a page.
//
// Nothing here talks to the network or to React. It is the shape everything else agrees on,
// so the ops validator, the renderer and the prompts cannot drift apart.

/** Where the canvas is in the learning arc. The UI demonstrates this progression; the model
 *  never picks it — only an explicit user action or a validated transition op moves it. */
import type { LearningEvent } from "./canvas-events";

export type CanvasState =
  | "empty"
  | "sources_attached"
  | "orient"
  | "learn"
  | "recall"
  | "test"
  | "diagnose"
  | "targeted_relearn"
  | "retest"
  | "complete";

export const CANVAS_STATES: readonly CanvasState[] = [
  "empty",
  "sources_attached",
  "orient",
  "learn",
  "recall",
  "test",
  "diagnose",
  "targeted_relearn",
  "retest",
  "complete",
];

/** The starting level the student picks once, in the orient step. Stored on the canvas so a
 *  later regeneration keeps the same pitch, and so this can eventually be inferred instead
 *  of asked (§7) without changing anything downstream. */
export type CanvasLevel = "fundamentals" | "basics_known" | "advanced" | "exam";

export const CANVAS_LEVELS: readonly CanvasLevel[] = ["fundamentals", "basics_known", "advanced", "exam"];

export const LEVEL_LABELS: Record<CanvasLevel, string> = {
  fundamentals: "Start from fundamentals",
  basics_known: "I know the basics",
  advanced: "Advanced",
  exam: "Exam-focused",
};

/** How the lesson should be pitched. Rides in the prompt; kept next to the level so the two
 *  can never disagree. */
export const LEVEL_INSTRUCTIONS: Record<CanvasLevel, string> = {
  fundamentals:
    "The learner is starting from the beginning. Build the ground floor first: define every term the moment it is used, and do not assume prior coursework.",
  basics_known:
    "The learner knows the basics. Skip introductory definitions of common terms and spend the space on mechanism, distinctions and the parts people get wrong.",
  advanced:
    "The learner is advanced. Go straight to the difficult parts, edge cases, and the reasoning behind the standard account. Do not rehearse fundamentals.",
  exam:
    "The learner is preparing for an assessment. Prioritise what is most likely to be examined and what is most commonly confused. Be direct about what matters and what does not.",
};

export type CanvasBlockType =
  | "heading"
  | "paragraph"
  | "concept"
  | "example"
  | "callout"
  | "citation"
  | "question";

export const CANVAS_BLOCK_TYPES: readonly CanvasBlockType[] = [
  "heading",
  "paragraph",
  "concept",
  "example",
  "callout",
  "citation",
  "question",
];

/** Points at the excerpt a block was built from. `excerptId` is a stable id we minted when we
 *  split the source (see canvas-grounding.ts) — NOT a page number. Nemesis cannot cite below
 *  file level today, and a made-up page number is worse than an honest excerpt. */
export interface SourceRef {
  sourceId: string;
  excerptId: string;
}

/** A term the lesson introduces that the learner probably has not met yet.
 *
 *  Carries NO definition on purpose. A gloss written at generation time is written before we
 *  know who is reading it, costs tokens for every term nobody clicks, and answers "what does
 *  this word mean in general" — the one question that is reliably useless, because "power"
 *  means four different things and the sentence decides which. The definition is fetched on
 *  demand with the sentence, the block and the objective attached. */
export interface BlockTerm {
  term: string;
  /** The objective this term belongs to, when the model tied it to one. */
  conceptId?: string;
}

export interface CanvasBlock {
  id: string;
  type: CanvasBlockType;
  content: string;
  /** Which excerpts of which sources this block was built from. Emitted at generation time —
   *  asking for it afterwards would just invite the model to invent one. */
  sourceRefs?: SourceRef[];
  /** Which concepts this block teaches. Drives targeted relearning: a weak concept selects
   *  the blocks that cover it. */
  conceptIds?: string[];
  /** A short clarification attached to the block by an `annotate_block` op, shown beside it
   *  rather than replacing what it explains. */
  note?: string;
  /** Folded away by `collapse_block` — kept in the document, out of the reading flow. Used
   *  for "I already know this" and "hide low-value detail". */
  collapsed?: boolean;
  /** Marked known by the learner. Excluded from recall and test generation. */
  known?: boolean;
  /** Terms this block introduces that the learner probably has not met yet, named by the model
   *  that wrote the block.
   *
   *  🔴 CANDIDATES, NOT MARKS. Only a couple of these are ever shown, and which ones depends on
   *  the learner — see canvas-vocabulary.ts, which owns that gate. Emitted at generation time
   *  for the same reason `sourceRefs` is: the model knows what it just introduced, and asking
   *  it afterwards would only invite it to invent something plausible. */
  terms?: BlockTerm[];
}

/** A concept is the unit the diagnosis speaks in. Nemesis has no global concept entity (we
 *  checked — no table, no id, no field anywhere), so a canvas carries its own short list.
 *  Deliberately not a new global taxonomy: just enough for "which ideas are blocking you". */
export interface CanvasConcept {
  id: string;
  label: string;
}

/** One attached source, with its text already extracted and split. The text is held on the
 *  canvas because re-extracting costs real money — a partly-readable file re-runs the whole
 *  pipeline, vision included, on every read. */
export interface CanvasSource {
  id: string;
  title: string;
  /** "pdf" | "docx" | "pptx" | "text" | "image" — whatever the extractor reported. */
  kind: string;
  excerpts: SourceExcerpt[];
  /** The extractor's own account of what it could and could not read, when it gave one.
   *  Carried so a lesson built on a half-read document can say so. */
  coverageNote?: string;
}

export interface SourceExcerpt {
  id: string;
  /** The heading this text sat under, when the document had one. Never invented. */
  label: string | null;
  text: string;
}

/** A recall prompt. Reveal-then-self-grade by default (§11): typing is opt-in, because the
 *  bottleneck we care about is retrieval attempts per minute, not words per minute. */
export interface RecallCard {
  id: string;
  front: string;
  back: string;
  conceptId: string | null;
  sourceRefs?: SourceRef[];
  /** Set when this card was written through to study_cards, so grading can reach the real
   *  scheduler instead of staying a toy. */
  studyCardId?: string;
  /** Set when the learner types instead of self-grading. */
  typed?: boolean;
}

/** How a retrieval prompt asks for its answer.
 *
 *  Free response is the default and the entire point. "Explain it in your own words" is the
 *  most repeated instruction in the brief (§2, §7, §17, §18, §20, §21, §31-33, §35, §36, §48),
 *  because a learner who explains produces evidence a radio button cannot carry: you cannot
 *  detect a misconception from which of four options someone clicked. Multiple choice survives
 *  only where the brief keeps it — exam simulation, and telling near-identical options apart. */
export type RetrievalFormat = "free" | "choice";

/** What the learner is asked to DO.
 *
 *  Retrieval is generation, and generation has many shapes — naming, defining, explaining,
 *  reconstructing, predicting, solving. "Explain it in your own words" is one of them, not the
 *  category. Asking someone to explain the quadratic formula is usually worse than asking them
 *  to solve an equation with it, and vocabulary needs the word produced rather than the concept
 *  discussed. The teaching policy picks the shape; this is the vocabulary it picks from.
 *
 *  🔴 STRUCTURAL, never subject-matter. Every entry has to read sensibly for a nursing student,
 *  a first-year law student and someone learning to weld. §18 lists one field-specific format —
 *  "identify a drug" — and it is deliberately absent: a retrieval task only one discipline can
 *  use is exactly what the field-agnostic rule forbids. */
export type RetrievalTask =
  | "name"
  | "define"
  | "explain"
  | "mechanism"
  | "reconstruct"
  | "compare"
  | "predict"
  | "apply"
  | "solve";

export const RETRIEVAL_TASKS: readonly RetrievalTask[] = [
  "name",
  "define",
  "explain",
  "mechanism",
  "reconstruct",
  "compare",
  "predict",
  "apply",
  "solve",
];

/** What a good performance would contain.
 *
 *  Every field is optional because different tasks are checked against different things: a
 *  derivation has required steps, a comparison has claims that must appear on both sides, a
 *  vocabulary prompt has one acceptable production. A flashcard has only a reference answer,
 *  which is why an existing card converts into this without inventing anything — the reference
 *  answer is a kind of expected evidence, not a different concept. */
export interface ExpectedEvidence {
  requiredConcepts?: string[];
  acceptableClaims?: string[];
  requiredSteps?: string[];
  commonMisconceptions?: string[];
  referenceAnswer?: string;
}

/** One performance by the learner, in whatever modality they used. */
export interface LearnerResponse {
  text: string;
  via: "typed" | "spoken";
  /** Milliseconds from the task appearing to it being submitted. A signal, never a score (§23). */
  tookMs?: number;
}

interface QuestionBase {
  id: string;
  q: string;
  /** The model answer, shown only after the learner has committed to their own. */
  why: string;
  conceptId: string | null;
  sourceRefs?: SourceRef[];
}

/** Matches the existing TestQuestion shape in study-artifact-content.ts (q/options/answer/why)
 *  so the existing generator prompt, answer-position balancer and scorer all still apply. */
export interface CanvasChoiceQuestion extends QuestionBase {
  format: "choice";
  options: string[];
  answer: number;
}

export interface CanvasFreeQuestion extends QuestionBase {
  format: "free";
  task: RetrievalTask;
  /** What a complete performance would contain. Never shown before answering. */
  expectedEvidence: ExpectedEvidence;
}

export type CanvasQuestion = CanvasChoiceQuestion | CanvasFreeQuestion;

/** Canvases saved before free response existed carry questions with no `format`. They were all
 *  multiple choice, so that is what its absence means. Applied when a canvas is read and never
 *  when it is written, so no stored row has to be migrated. */
export function normaliseQuestion(raw: CanvasQuestion | Record<string, unknown>): CanvasQuestion {
  const format = (raw as { format?: unknown }).format;
  if (format === "free" || format === "choice") return raw as CanvasQuestion;
  return { ...(raw as Omit<CanvasChoiceQuestion, "format">), format: "choice" };
}

export interface CanvasAnswer {
  questionId: string;
  picked: number;
  correct: boolean;
}

/** What one performance showed.
 *
 *  Deliberately NOT correct/incorrect (§5, §20, §21). `misconception` is the state the old data
 *  model made unreachable: an answer records which wrong option was picked, never the belief
 *  behind it, so "you think the 3 only multiplies the first term" was not expressible even in
 *  principle. */
export type Verdict = "strong" | "understood" | "partial" | "incorrect" | "misconception";

export const VERDICTS: readonly Verdict[] = [
  "strong",
  "understood",
  "partial",
  "incorrect",
  "misconception",
];

/** WHY a performance fell short. Two answers can both be wrong and need opposite teaching: a
 *  forgotten term wants a cue and another attempt, a backwards causal model wants the model
 *  replaced before retrieval is worth asking for again. The scheduler cannot tell these apart —
 *  it receives the same grade for both — so the distinction has to live here. */
export type ErrorType =
  | "recall_failure"
  | "conceptual"
  | "procedural"
  | "vocabulary"
  | "careless"
  | "missing_prerequisite";

export const ERROR_TYPES: readonly ErrorType[] = [
  "recall_failure",
  "conceptual",
  "procedural",
  "vocabulary",
  "careless",
  "missing_prerequisite",
];

/** 🔴 THIS IS THE LEARNER EVIDENCE. A scheduling grade is derived from it and is not a
 *  substitute for it — storing only the grade would throw away everything Nemesis actually
 *  cares about and leave a spaced-repetition app wearing a canvas. */
export interface ResponseEvaluation {
  verdict: Verdict;
  /** 0-1: how much the response actually settled. A one-line answer to a broad task can be
   *  right and still be weak evidence, and the difference matters downstream. */
  confidence: number;
  /** What the performance showed they hold. */
  demonstrated: string[];
  /** What was absent or wrong. */
  missing: string[];
  /** Specific false beliefs the performance revealed, stated so they can be taught against. */
  misconceptions: string[];
  errorType?: ErrorType;
  /** The one concise thing the learner is shown. Everything above is for the engine — §9: the
   *  rich output is not for dumping onto the reader. */
  feedback: string;
  /** Other concepts on THIS canvas the performance showed to be shaky. Ids are checked against
   *  the canvas's own concept list; a judge naming a concept we never declared invented it. */
  alsoWeakConceptIds?: string[];
}

/** What the learner actually said, and what it showed.
 *
 *  `via` is kept because §23 treats time as a signal and speaking and writing run at very
 *  different speeds — twenty seconds of talking and twenty seconds of typing are not the same
 *  evidence, and a model that forgets which one happened will read hesitation into a fast typist. */
export interface CanvasResponse {
  questionId: string;
  /** Which objectives this performance is evidence FOR.
   *
   *  🔴 STORED, NOT DERIVED, and that is the whole point. Today the objective is recoverable by
   *  joining to `questions` — but `questions` is replaced wholesale on every new round, and an
   *  evidence record that can only name its objective through a table that no longer exists is
   *  not evidence, it is a dangling id. Recording it at capture costs nothing and cannot be
   *  reconstructed afterwards at any price.
   *
   *  Named `objectiveIds` rather than `conceptId` because evidence is the durable idea here and
   *  one performance can speak to more than one objective. `RecallResult.conceptId` is the same
   *  thing under an older, narrower name. */
  objectiveIds?: string[];
  /** When it happened, ISO. Absent on records written before we captured it — honestly unknown
   *  rather than backfilled with a plausible lie. */
  at?: string;
  text: string;
  via: "typed" | "spoken";
  tookMs?: number;
  /** True when the learner asked to see the answer instead of attempting it. That is itself
   *  evidence — we did not obtain a retrieval — and it is recorded rather than inferred. */
  revealed?: boolean;
  evaluation?: ResponseEvaluation;
  /** What the canvas decided to do about this performance, and what it taught in response.
   *
   *  The teaching text is kept on the evidence and not only inserted into the document, because
   *  the correction is ABOUT this answer — it belongs beside what they said. The document block
   *  the same change updated is a different thing serving a different moment. */
  action?: string;
  taught?: string;
  /** The prompt the canvas asked next, once it had taught the missing piece. */
  followUpQuestionId?: string;
}

export interface RecallResult {
  cardId: string;
  /** The objective this is evidence for. Already stored rather than joined, which is why recall
   *  evidence survives its card being regenerated and free-response evidence did not. */
  conceptId: string | null;
  /** When it happened, ISO. Absent on records written before we captured it. */
  at?: string;
  /** 🔴 THE SCHEDULER'S GRADE, AND NOTHING MORE. It answers one narrow question — when might
   *  this need retrieving again — and it is derived from `evaluation` below. It is not the
   *  learner state, it does not decide what the canvas does next, and it must never be the only
   *  thing kept: a grade is a summary of the evidence, and a summary is not a substitute. */
  grade: "again" | "hard" | "good" | "easy";
  /** What they produced, and what it showed. This is the evidence. */
  said?: string;
  via?: "typed" | "spoken";
  /** The learner asked to see the answer rather than attempting it. */
  revealed?: boolean;
  evaluation?: ResponseEvaluation;
}

/** Something Nemesis MADE for the learner, at their request — a summary, slides, a document.
 *
 *  🔴 NOT A SOURCE, and the distinction is the reason this exists while the list is still always
 *  empty (§4). A source is material Nemesis grounds its teaching ON; an output is an artifact it
 *  produced. They live in the same session and are opposite ends of it, and a single "files"
 *  list that flattened the two would be very cheap to write now and very expensive to unpick
 *  once anything depends on it.
 *
 *  `assetId` is where this is going: §6 wants the durable object stored once and REFERENCED, so
 *  attaching one recording to three canvases does not store the audio three times. There is no
 *  assets table yet, so the field is optional and nothing populates it. */
export interface CanvasOutput {
  id: string;
  title: string;
  /** "document" | "slides" | "diagram" | "export" — whatever produced it said it was. */
  kind: string;
  createdAt: string;
  assetId?: string;
}

export interface LearningCanvas {
  id: string;
  title: string;
  state: CanvasState;
  level: CanvasLevel | null;
  sources: CanvasSource[];
  blocks: CanvasBlock[];
  concepts: CanvasConcept[];
  recall: RecallCard[];
  recallResults: RecallResult[];
  questions: CanvasQuestion[];
  /** Answers to multiple-choice questions. Kept alongside `responses` rather than merged: the
   *  two carry genuinely different evidence, and flattening them would throw away the part that
   *  makes free response worth having. */
  answers: CanvasAnswer[];
  responses: CanvasResponse[];
  /** Corrective rounds already spent on each objective, keyed by concept id.
   *
   *  🔴 This is what stops the teaching loop grinding forever, so it has to be STORED rather
   *  than counted from the evidence. Responses are keyed by question and are replaced in place
   *  on a retry, so `responses.length` is not the number of attempts and never will be.
   *
   *  Reset when a round turns over: the cap is about grinding on one idea in one sitting, not a
   *  lifetime budget for a concept. */
  correctiveAttempts: Record<string, number>;
  /** Interaction telemetry: what the learner DID, as distinct from what they demonstrated.
   *
   *  🔴 NOT EVIDENCE. Nothing may turn a row of this into a verdict on its own — `diagnose()`
   *  does not read it, and `canvas-events.test.ts` asserts that appending fifty events cannot
   *  change a diagnosis. Capped and lossy: this is telemetry for INTERPRETING evidence, not the
   *  append-only evidence history, which is still to come. See canvas-events.ts. */
  events: LearningEvent[];
  /** Artifacts made from this canvas. Always empty today — nothing generates one yet — and
   *  carried anyway so the input/output distinction is in the model rather than in a comment.
   *  🔴 Needs its own line in `canvasToRow`, which enumerates by hand. */
  outputs: CanvasOutput[];
  /** Concepts the last diagnosis judged weak. Drives targeted relearning and the retest. */
  weakConceptIds: string[];
  /** Concepts that have since been corrected — kept so the completion state can say how many
   *  weak areas were fixed rather than how many were never wrong. */
  correctedConceptIds: string[];
  /** Deck the recall cards were written into, so a second visit reuses it. */
  studyDeckId?: string;
  /** Milliseconds of active learning, accumulated across visits. */
  activeMs: number;
  createdAt: string;
  updatedAt: string;
}

export function emptyCanvas(id: string, now: string): LearningCanvas {
  return {
    id,
    title: "",
    state: "empty",
    level: null,
    sources: [],
    blocks: [],
    concepts: [],
    recall: [],
    recallResults: [],
    questions: [],
    answers: [],
    responses: [],
    correctiveAttempts: {},
    events: [],
    outputs: [],
    weakConceptIds: [],
    correctedConceptIds: [],
    activeMs: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Blocks a learner should actually read right now: not folded away, not already known. */
export function readableBlocks(canvas: Pick<LearningCanvas, "blocks">): CanvasBlock[] {
  return canvas.blocks.filter((block) => !block.collapsed && !block.known);
}

export function conceptLabel(canvas: Pick<LearningCanvas, "concepts">, id: string | null): string {
  if (!id) return "";
  return canvas.concepts.find((concept) => concept.id === id)?.label ?? "";
}

/** The excerpt behind a reference, or null when the reference points at nothing. Never
 *  fabricates: a dangling ref resolves to nothing and the UI says so. */
export function resolveSourceRef(
  sources: readonly CanvasSource[],
  ref: SourceRef,
): { source: CanvasSource; excerpt: SourceExcerpt } | null {
  const source = sources.find((candidate) => candidate.id === ref.sourceId);
  if (!source) return null;
  const excerpt = source.excerpts.find((candidate) => candidate.id === ref.excerptId);
  return excerpt ? { source, excerpt } : null;
}
