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

/**
 * A level the learner EXPRESSED, about THIS canvas. Almost always absent.
 *
 * 🔴 THE GOVERNING RULE, AND IT OUTLIVES THIS TYPE:
 *
 *     UNKNOWN STAYS UNKNOWN.  SELF-REPORT IS A PRIOR.  DEMONSTRATED PERFORMANCE IS EVIDENCE.
 *
 * Turning the absence of evidence into evidence is the one thing a learner model must never do.
 * This field is where that was happening: nobody was asked any more, and `generateLesson` filled
 * the gap with `"basics_known"` — so every learner arrived at the model described as knowing the
 * basics. An invented claim about a person, applied to everyone, invisible because the prompt
 * looked perfectly well-formed. Absent now travels as absent, all the way to the prompt, which is
 * told the level is unknown rather than left to guess a pitch from the subject.
 *
 * 🔴 AND IT IS PER-CANVAS, NEVER A PROPERTY OF THE PERSON. There must be no `user.level`. "Advanced"
 * is meaningless on its own — someone can be advanced at calculus and a novice at organic
 * chemistry, strong at algebraic manipulation and weak at proofs. A coarse label attached to a
 * human being would leak into unrelated sessions and misteach them, which is precisely the
 * "global mode" this architecture is being built to remove.
 *
 * Its long-term fate is to disappear. Once objective-level evidence exists, an expressed level is
 * at most a weak opening prior that the first demonstrated performance overrides. The same rule
 * applies there: "no learner state" must never be resolved to "beginner" any more than it was
 * resolved to "basics_known". No state means Nemesis needs evidence.
 */
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
  /**
   * Where in the STORED DOCUMENT this sat, when the source came from a parse that had structure.
   *
   * 🔴 WITHOUT THESE, "SHOW ME WHERE THAT CAME FROM" CANNOT BE ANSWERED. `excerptId` is a
   * canvas-local string (`s1:e3`) that means nothing outside the canvas that minted it, and
   * `CanvasSource` carries no pointer to the parse it was built from. So a calendar event whose
   * only provenance is a `SourceRef` can say "from your syllabus" and cannot say "page 14". For a
   * date — the most consequential thing here — that is the difference between evidence and a
   * claim.
   *
   * All optional, because a source may genuinely have no structure: an image, or a PDF that fell
   * back to flat text. ABSENT MEANS UNKNOWN, never "page 1" — the same rule the document model
   * follows about never inventing a locator a format cannot provide.
   */
  parsedDocumentId?: string;
  /** 0-based unit (page/slide/sheet). Rendered +1, and only when `unitKind` allows a number. */
  unitIndex?: number;
  /** The document model's own block ids, in reading order. */
  blockIds?: string[];
  /** Enclosing headings, outermost first — the address that survives re-pagination. */
  headingPath?: string[];
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
  /**
   * When the learner said they had finished reading this (contract §12).
   *
   * 🔴 A PACING SIGNAL, NOT EVIDENCE, AND THE NAME IS LOAD-BEARING. §28's lifecycle reaches
   * RESOLVED when *"the learner demonstrates understanding"*; pressing Continue demonstrates
   * nothing, and R3 says reading is not evidence of knowledge. Calling this `resolvedAt` would
   * invite the next person to wire demonstration-driven compression to a reading click — storing a
   * claim about the learner they never made. §28's RESOLVED is a different state and is not
   * buildable yet: it needs per-objective verdicts, which do not exist.
   *
   * 🔴 IT MUST NOT HIDE ANYTHING. See `canvas-reading.ts` for the J1 precedent — a one-click
   * control that filtered material out of the document on a learner's own claim was removed from
   * this surface as a defect. Read material recedes; it does not collapse and it does not leave.
   *
   * Absent on every block written before §12.
   */
  readAt?: string;
  /**
   * The wording this block had before the learner asked for it to be rewritten (§11).
   *
   * 🔴 §11 IS "REWRITE IN PLACE", NOT "APPEND ANOTHER EXPLANATION" — and the second half of that
   * sentence is what this field is for: *"Keep the old version internally so it can be restored.
   * Visually there is normally one active explanation, never competing versions stacked."* One
   * active explanation is what the reader sees; this is the internal copy that makes the rewrite
   * reversible rather than destructive.
   *
   * 🔴 THE ORIGINAL, NOT THE PREVIOUS ONE. Asked to simplify twice, this keeps what the block said
   * BEFORE the learner touched it, rather than the once-simplified middle version. "Restore" means
   * "put back the material as it was written", which is the only version the learner did not ask
   * for and therefore the only one they cannot reproduce. Keeping a stack instead would be a
   * revision history, which is a different feature and one §11 does not ask for.
   *
   * 🔴 SET ONLY BY A LEARNER-REQUESTED REWRITE. The teaching loop rewrites blocks too, through the
   * same `replace_block` op; those must NOT become restorable, or a block the learner never
   * touched grows a control offering to undo something they did not do. See `applyRewrite`.
   */
  previousContent?: string;
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
  /**
   * Whether anything learned from this source can outlive the session.
   *
   * 🔴 STATED, NOT INFERRED FROM WHETHER ANOTHER FIELD HAPPENS TO BE SET. Filing is best-effort —
   * a storage bucket can refuse a file whose type we could not name — so a canvas holds both kinds
   * and the difference is real, not cosmetic:
   *
   *   * `durable`   — a filed row exists. Knowledge extracted from it can be anchored, found by a
   *                   second canvas, indexed for retrieval, and cited later.
   *   * `ephemeral` — read and not kept. It can teach THIS canvas perfectly well, and it must not
   *                   pretend to support cross-session identity, search or future provenance.
   *
   * Absent on canvases written before this existed, which must be read as UNKNOWN — never as
   * durable. That is the same rule `coverage` follows, for the same reason.
   */
  durability?: "durable" | "ephemeral";
  /** The durable `library_sources.id` this canvas source is a view of.
   *
   *  🔴 THE CANVAS-LOCAL `id` ("s1") IS MEANINGLESS OUTSIDE THIS CANVAS. Two canvases built on the
   *  same lecture both call it "s1", and neither can tell they are looking at the same document.
   *  Anything meant to outlive one session — a knowledge object, a schedule candidate — must
   *  anchor to THIS id instead, which is the same row every canvas, the indexer and retrieval see.
   *  Absent when the material never became a filed source (a typed topic, or a canvas whose
   *  attachment predates filing), and absent means "not re-findable", never "not filed anywhere". */
  librarySourceId?: string;
  /** What SURVIVED PERSISTENCE, as the capability layer reads it — not what the parser believed
   *  it produced. `full` when the stored parse kept structure, `degraded` when only text did.
   *  Carried so a lesson or an extraction built on a degraded parse can say which it was. */
  parseQuality?: "full" | "degraded" | "failed";
  /**
   * The page this source was pasted from, when it was a link rather than a file.
   *
   * 🔴 A REAL FIELD, NOT A REASON TO FOLD THE ADDRESS INTO THE EXTRACTED TEXT. Before this existed,
   * a "paste a link" attachment had nowhere to put its own URL, so the only place left was the body
   * of the text a learner reads — a source's provenance sitting inside its own content, which is
   * exactly the kind of fact this file elsewhere insists on carrying as its own field rather than
   * inferring from another one (see `durability`'s comment for the same principle).
   *
   * Absent for every source that is not a pasted link — a file upload has no page it came from, and
   * absent here must be read as "not a link", never as "the URL was lost". `librarySourceId` is the
   * closest existing field and is not a substitute: it names a row in OUR storage, not a page
   * anywhere else, and a source can have one, the other, both, or neither.
   */
  sourceUrl?: string;
}

export interface SourceExcerpt {
  id: string;
  /** The heading this text sat under, when the document had one. Never invented. */
  label: string | null;
  text: string;
  /** The canonical unit (document block) this was cut from, when the excerpt was built from the
   *  persisted document model rather than from flat text.
   *
   *  🔴 THIS IS A BRIDGE, NOT AN ALIAS. A block id is not an excerpt id: one block can become
   *  several excerpts, and a legacy source has no blocks at all. Extraction records a
   *  `CanonicalSourceAnchor` (durable, quote-based, survives a reparse); the canvas cites a
   *  `SourceRef` (`{sourceId, excerptId}`, canvas-local). This field is what lets one be resolved
   *  into the other explicitly — see `groundCanonicalAnchor` — instead of the two being assumed to
   *  match, which would produce a locator that passes every check and points at nothing. */
  unitId?: string;
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
