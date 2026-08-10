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

/** The shape of a free-response prompt.
 *
 *  🔴 STRUCTURAL, never subject-matter. "Walk through the mechanism" is the same request whether
 *  the mechanism is a signalling pathway, a statute applying to facts, or a load path through a
 *  truss. §18 lists one field-specific format — "identify a drug" — and it is deliberately absent
 *  here: a retrieval format only one discipline can use is exactly what the field-agnostic rule
 *  forbids, and it would silently make the canvas worse for a law or engineering student. */
export type FreePromptKind =
  | "define"
  | "explain"
  | "mechanism"
  | "compare"
  | "apply"
  | "recall";

export const FREE_PROMPT_KINDS: readonly FreePromptKind[] = [
  "define",
  "explain",
  "mechanism",
  "compare",
  "apply",
  "recall",
];

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
  kind: FreePromptKind;
  /** The points a complete answer has to make. Never shown before answering — this is what the
   *  judge checks against, and where "what you missed" comes from. */
  expected: string[];
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

/** What one free-text answer showed.
 *
 *  Deliberately NOT correct/incorrect (§5, §20, §21). `misconception` is the state the old data
 *  model made unreachable: an answer records which wrong option was picked, never the belief
 *  behind it, so "you think the 3 only multiplies the first term" was not expressible even in
 *  principle. */
export type Verdict = "understood" | "partial" | "incorrect" | "misconception";

export const VERDICTS: readonly Verdict[] = ["understood", "partial", "incorrect", "misconception"];

export interface ResponseJudgement {
  verdict: Verdict;
  /** What the answer got right, so the reply can name it back instead of only correcting (§4). */
  got: string[];
  /** The specific points missing or wrong — not a score. */
  missing: string[];
  /** Only meaningful on a `misconception` verdict: the belief the answer reveals. */
  misconception?: string;
  /** The short targeted correction shown in place of "Incorrect. The answer is B." (§20) */
  refinement: string;
  /** Other concepts on THIS canvas the answer showed to be shaky (§4 reads a partial grasp of a
   *  neighbouring idea out of one explanation). Ids are checked against the canvas's own concept
   *  list; a judge that names a concept we never declared has invented it, and is refused. */
  alsoWeakConceptIds?: string[];
}

/** What the learner actually said, in their own words.
 *
 *  `via` is kept because §23 treats time as a signal and speaking and writing run at very
 *  different speeds — twenty seconds of talking and twenty seconds of typing are not the same
 *  evidence, and a model that forgets which one happened will read hesitation into a fast typist. */
export interface CanvasResponse {
  questionId: string;
  text: string;
  via: "typed" | "spoken";
  /** Milliseconds from the prompt appearing to the answer being submitted. */
  tookMs?: number;
  judgement?: ResponseJudgement;
}

export interface RecallResult {
  cardId: string;
  conceptId: string | null;
  /** The four-way self-grade, mapped straight onto the existing scheduler's vocabulary. */
  grade: "again" | "hard" | "good" | "easy";
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
