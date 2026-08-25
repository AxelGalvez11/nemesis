"use client";

// The canvas's brain: one piece of state, and every way it is allowed to change.
//
// Kept out of the components so the page stays a rendering of a canvas rather than a place
// where learning logic hides. Everything that decides anything — what is weak, what may
// change, where the arc goes next — lives in lib/learn and is unit-tested; this wires those
// decisions to the network and to React.

import { useCallback, useEffect, useRef, useState } from "react";

import { coverageNoticeForModel, readCoverage } from "@nemesis/shared";

import { useAuth } from "@/components/AuthProvider";
import { deviceKey, searchWebContext } from "@/lib/workspace/chat-api";
import type { CanvasVisualRequest } from "@/lib/learn/canvas-visual";
import { extractFile } from "@/lib/workspace/chat-attachments";
import type { ChatWebResult } from "@/lib/workspace/chat-web-search";
import type { ComposerCapability } from "@/lib/learn/composer-capability";
import { applyCurriculumPlan, applyResearchedPlan, courseRefusalLine, loadCurriculumPlan } from "@/lib/learn/curriculum-course";
import { researchCurriculum, researchRefusalLine } from "@/lib/learn/curriculum-research";
import type { CurriculumPlan } from "@/lib/learn/curriculum-plan";
import { courseGate, type TurnDecision } from "@/lib/learn/turn-router";
import { rememberLine } from "@/lib/learn/learner-memory";
import type { TurnStage } from "@/lib/learn/turn-preview";
import { groundingSources, needsGrounding } from "@/lib/learn/topic-grounding";
import { canvasCapture, captureStateChange } from "@/lib/learn/canvas-analytics";
import {
  explainBlock,
  generateRelearn,
  generateRecall,
  generateTest,
  applyTeachingAction,
  cardAsTask,
  evaluateLearningResponse,
  askSelection,
  defineSelection as apiDefineSelection,
  questionAsTask,
  runCommand,
} from "@/lib/learn/canvas-api";
import { blocksForConcepts, clearEvidenceForRetest, diagnose } from "@/lib/learn/canvas-diagnosis";
import { appendEvent, type NewLearningEvent } from "@/lib/learn/canvas-events";
import { appendMoment, sameMoment, type NewCanvasMoment } from "@/lib/learn/canvas-moment";
import { makeFlashcardsDeliverable, makeNoteDeliverable, makeReportDeliverable, makeSlidesDeliverable, readDeliverableAsk, readResearchAsk, type DeliverableKind } from "@/lib/learn/canvas-deliverables";
import { buildExcerpts, buildExcerptsFromModel, excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import { CANVAS_FILING_FOLDER, coverageNote, loadCanonicalSource, refreshedCoverageNotes } from "@/lib/learn/canvas-sources";
import { ensureKnowledgeForCanvas } from "@/lib/learn/canvas-knowledge";
import { verdictIsPass } from "@/lib/learn/canvas-judge";
import { actionMutatesCanvas, determineNextCognitiveAction } from "@/lib/learn/canvas-policy";
import { deriveSchedulingSignal } from "@/lib/learn/canvas-scheduling";
import {
  conceptLabel,
  type CanvasBlock,
  type CanvasLevel,
  type LearnerInputModality,
  type CanvasSource,
  type CanvasState,
  type LearningCanvas,
  type ResponseEvaluation,
  type RetrievalFormat,
  type CanvasOutput,
} from "@/lib/learn/canvas-model";
import type { RelearnMiss } from "@/lib/learn/canvas-prompts";
import { applyOps, applyRewrite, restoreBlock } from "@/lib/learn/canvas-ops";
import { finishReading } from "@/lib/learn/canvas-reading";
import type { CanvasSelection } from "@/lib/learn/canvas-selection";
import { canStart, canTransition } from "@/lib/learn/canvas-state";
import { RECALL_PLACEHOLDER, RESPONSE_PLACEHOLDER } from "@/lib/learn/canvas-tasks";
import { readingSubjectFor, thinkingCopy } from "@/lib/learn/thinking-phases";
import { deleteCanvas, loadCanvas, mergeSourceIntoCanvas, newCanvas, saveCanvas } from "@/lib/learn/canvas-store";
import { ensureCanvasDeck, gradeStudyCard, writeRecallCards } from "@/lib/learn/canvas-study-bridge";

import { isPreContent } from "@/lib/learn/canvas-hosting";
import type { TestRun } from "@/lib/learn/test-run";
import { findLabelledFigure } from "@/lib/learn/figure-occlusion-api";
import { withFigureQuestions } from "@/lib/learn/occlusion-check";
import {
  clarifyAnswerFact,
  readClarifyAnswer,
  type UserQuestion,
} from "@/lib/learn/clarify-question";
import { askCanvasChat, type TurnSurroundings } from "./canvas-chat";
import { prepareWebSourcePromotion } from "./web-source-promotion";

const RECALL_CARDS = 8;
const TEST_QUESTIONS = 6;
const RETEST_QUESTIONS = 4;

/** What the canvas is asking for right now, if anything.
 *
 *  The persistent composer reads this to decide what it is FOR: what to call itself, and where
 *  a submission should go. There is exactly one answer surface on the canvas, and this is how
 *  it knows which prompt it is answering. */
export interface ActiveTask {
  kind: "recall" | "question";
  id: string;
  /** What is being asked, so the composer can label itself against the real prompt. */
  prompt: string;
  /** The placeholder the composer shows — derived from the retrieval task, because
   *  "Explain it in your own words" is wrong for a prompt whose answer is one noun. */
  placeholder: string;
  index: number;
  total: number;
  /** Once answered, the composer goes back to being a place to ask about the feedback. */
  answered: boolean;
}

/** Which part of the page is working. Local rather than global so §21 holds: simplifying one
 *  paragraph must light up that paragraph, not blank the document. */
export interface BusyState {
  /**
   * 🔴 `"rewrite"` IS NOT `"command"`, AND THE DIFFERENCE IS THE WHOLE POINT OF §11. Both scope to
   * a block, but `"command"` also puts the COMPOSER into its busy state — which is right when the
   * learner typed something and is waiting on it, and wrong when they asked a paragraph to rewrite
   * itself. §11 says *"the existing passage enters a subtle processing state"*: the passage, not
   * the page, and not the place they type. Reusing `"command"` here would have lit up the one
   * control that has nothing to do with what is happening.
   */
  kind: "lesson" | "command" | "rewrite" | "recall" | "test" | "relearn" | "source" | null;
  /** The block a scoped command is working on, so only it shows as busy. */
  blockIds?: string[];
  label?: string;
}

/** A transient answer, shared between `askAbout` (block-scoped, via a citation marker) and
 *  `converse` (canvas-wide, `blockId: null`) so both write the same shape and contract rule 2's
 *  "clears on the next turn" rule only has one store to apply to. Named so the `useState` call and
 *  the `CanvasSession` field below cannot quietly drift into two different shapes. */
/**
 * The longest selection that becomes an underlined term.
 *
 * 🔴 A BOUND, BECAUSE "DEFINE" ACCEPTS A PHRASE AND UNDERLINING A SENTENCE IS NOT A VOCABULARY
 * MARK. `selectionShape` already calls anything past eight words a passage; this is the same
 * instinct expressed in characters, since what matters here is how much of the page wears a line
 * under it.
 */
const LOOKUP_MARK_MAX_CHARS = 40;

type CanvasAside = {
  text: string;
  blockId: string | null;
  /**
   * Which of the two things this text is. Nemesis ANSWERING something, or Nemesis introducing a
   * lesson it is about to give.
   *
   * 🔴🔴 THEY LOOK IDENTICAL AND BEHAVE OPPOSITELY, WHICH IS WHY THE DIFFERENCE HAD TO BE STORED.
   * Both are one short paragraph set by `converse`, and both used to be indistinguishable once
   * written. But an ANSWER is a turn that replaced whatever was on screen, and an OPENING is the
   * first sentence OF what is about to be on screen: "Hydroxyl it is. Quick pass before we dig
   * in:" is followed by the lesson, not instead of it.
   *
   * 🔴 IT WAS FOUND IN A BROWSER, NOT IN REVIEW, AND NOTHING PURE COULD HAVE SEEN IT. Treating both
   * as answers made an opening line displace the teaching screen it was introducing — so
   * "Teach me the hydroxyl functional group" printed one sentence and then never showed the lesson,
   * for the rest of the session. That is worse than the defect being fixed, and every unit test
   * still passed.
   *
   * 🔴 THE MODEL ALREADY DECIDES THIS. `then: "reply" | "study"` is the turn router's own output and
   * the two branches below are already separate; this records which one wrote the text rather than
   * inventing a second classification of it.
   */
  kind: "reply" | "opening";
  /** Pages that earned a place: what the promote control and `learnFromAside` act on. */
  sources?: readonly ChatWebResult[];
  /**
   * Every page the search returned, in the order the model was numbered against.
   *
   * 🔴 `[n]` RESOLVES INTO THIS AND NEVER INTO `sources`, which is in ANSWER order — see
   * `CanvasTurnReply`. It is also what the pill row falls back to when the model cited nothing, so
   * a searched answer never presents itself as something the model simply knew.
   */
  consulted?: readonly ChatWebResult[];
  /** The learner's own question, retained only for the transient general-answer aside. Never
   *  mistaken for their goal: the answer text is not what they asked for. */
  question?: string;
  /** The subject the model read out of the turn, or absent when it had none. What `learnFromAside`
   *  starts when the learner asks to be taught it. */
  topic?: string;
  /** Figures this reply draws, validated, in the order its `[figure n]` markers count into. */
  visuals?: readonly CanvasVisualRequest[];
} | null;

/**
 * What came back from a typed request about a highlighted range.
 *
 * 🔴 "REWROTE THE PASSAGE" AND "COULD NOT" ARE DIFFERENT ANSWERS AND MUST LOOK DIFFERENT. Both used
 * to be `null`, and the caller closed the popover on it — which is right for a rewrite, whose result
 * is on the page, and wrong for a failure, whose result is the error message inside the popover
 * being closed.
 */
export type SelectionReply =
  | { kind: "answer"; term: string; text: string; sourceLabel?: string }
  | { kind: "rewritten" };

export interface CanvasSession {
  canvas: LearningCanvas;
  busy: BusyState;
  error: string | null;
  /**
   * What the learner said to open this sitting, when the canvas began from an utterance rather than
   * from an attached file. `null` on a canvas reopened later, or one started from material.
   *
   * 🔴 THE SITTING'S, NOT THE CANVAS'S. Deliberately not read from or written to the stored canvas:
   * it answers "what did they come here for just now", and a persisted answer would still be
   * steering the teaching controller on a visit a week later. See `TeachingContext.opening`.
   */
  opening: string | null;
  /**
   * A transient answer to a question that did not change the page (§4).
   *
   * 🔴 `blockId: null` IS A GENUINE, RENDERED CASE, NOT AN UNUSED CORNER OF THE TYPE. It was
   * already representable (this field predates this comment) but nothing ever constructed one and
   * nothing ever rendered one: `canvas-document.tsx`'s per-block rendering only ever matches
   * `aside.blockId === block.id`, which a null `blockId` can never satisfy. `converse` below is
   * the first thing that mints one, for a question that is not about any particular passage, and
   * `learning-canvas.tsx` renders that case at the top of the canvas rather than under a block.
   */
  aside: CanvasAside;
  /**
   * The live thinking preview for the turn in flight.
   *
   * 🔴 TRANSIENT BY CONSTRUCTION. Cleared when the turn ends: once the answer is on screen a line
   * about what was going to happen is noise, and the owner asked for it to fade rather than
   * persist — *"it should not remain as a separate reasoning transcript below the answer"*.
   */
  milestones: readonly string[];
  stage: TurnStage;
  /** A real step running inside the turn — the caption's fallback when no milestone covers it. */
  work: string | null;
  /** Words the learner has already asked the meaning of, for `lookedUpMarks`. Sitting-scoped. */
  lookedUp: readonly string[];
  /** The id of the prompt whose answer is being read, or null. */
  judging: string | null;
  ready: boolean;
  dismissError: () => void;
  /** A short, true, non-failure message for the learner. See the implementation for why it shares
   *  the error strip. */
  showNotice: (message: string) => void;
  /** §11 — restore a passage the learner had rewritten, from the copy kept on the block. */
  restoreRewritten: (blockId: string) => void;
  /** §12 — record that the learner finished reading the chunk on screen. Writes no evidence. */
  finishReadingChunk: () => void;
  dismissAside: () => void;
  attachFiles: (files: FileList | File[]) => Promise<void>;
  /**
   * Read a web page and add it as a source, the same way an uploaded file becomes one.
   *
   * 🔴 REUSES `attachFiles` RATHER THAN A SECOND SOURCE-BUILDING PATH. A page's extracted text is
   * wrapped as a synthetic file and handed to the exact function a real upload already goes
   * through, so filing, knowledge extraction, and every other consequence of "this canvas gained a
   * source" happen in exactly one place. A parallel implementation here would be a second copy of
   * that logic, free to drift the moment one of them changes.
   */
  attachUrl: (url: string) => Promise<void>;
  /** Starts the arc. Takes the topic for a topic-first canvas (§6B); omit it when
   *  material is already attached. */
  begin: (topic?: string) => void;
  command: (text: string, selected: readonly CanvasBlock[]) => Promise<void>;
  askAbout: (block: CanvasBlock, question: string) => Promise<void>;
  /**
   * Take one conversational turn: read what the learner meant, say something back, and carry out
   * whatever that turn asked for. See canvas-chat.ts for the call and lib/learn/turn-router.ts for
   * why the model rather than a regex decides which of those it is.
   *
   * 🔴 NOT SCOPED TO A BLOCK, UNLIKE `askAbout`. "What does osmolarity mean" typed with nothing
   * selected is not about any one passage, so this asks the whole canvas's material (when it has
   * any) and general knowledge together, and a plain answer lands in the SAME `aside` state
   * `askAbout` already uses, with `blockId: null`.
   *
   * Returns the decision so the caller can keep the conversation's own transcript; the canvas is
   * already updated by the time it resolves.
   */
  converse: (
    said: string,
    surroundings: TurnSurroundings,
    /** Fired immediately before a `study` turn writes into an existing study document, so the
     *  caller can stamp the action that was in flight when the learner asked for material. */
    onStudyDocument?: () => void,
    /** The one passage the learner staged, which scopes the turn without classifying it. */
    staged?: CanvasBlock | null,
    /** The one-shot capability the learner attached to this submission, or null. It becomes a
     *  FACT in the model's packet (`TurnContext.courseRequested`), never a branch in this file —
     *  the model still decides what the turn meant. */
    capability?: ComposerCapability | null,
    /** Whether this turn may be parked behind a clarification card. False on a resumed turn. */
    mayAsk?: boolean,
  ) => Promise<TurnDecision | null>;
  /**
   * The course this canvas is working through, or null — loaded with the canvas, set the moment
   * one is applied, and persisted on the territory marker so a refresh keeps it.
   *
   * 🔴 SCOPE, NEVER STATE. It says where this canvas is going; it carries no progress and no
   * mastery, and nothing may derive either from it.
   */
  coursePlan: CurriculumPlan | null;
  /**
   * The one decision Nemesis is waiting on before it can finish a turn, or null. Null nearly always.
   *
   * 🔴 IT IS FED TO `answerSink`, NOT READ DIRECTLY BY THE COMPOSER. That is the whole placement
   * argument: a pending question the sink cannot see is one `composerIntent` cannot see, and a
   * learner who types their answer instead of tapping it would have their canvas re-titled and
   * regenerated. See canvas-hosting.ts.
   */
  clarifying: UserQuestion | null;
  /** Decisions already settled this sitting, as facts for the packet. Empty nearly always. */
  clarified: readonly string[];
  /**
   * Settle the pending decision and finish the turn it was holding.
   *
   * 🔴 THIS IS NOT AN ANSWER TO A COGNITIVE TASK AND MUST NEVER REACH ONE. No judge, no evidence
   * row, no objective. A preference filed as knowledge is read by the retention model as if the
   * learner had demonstrated something.
   */
  answerClarification: (
    text: string,
    surroundings: TurnSurroundings,
    onStudyDocument?: () => void,
  ) => Promise<TurnDecision | null>;
  /** They closed the card instead of answering. The turn is dropped, not guessed at. */
  dismissClarification: () => void;
  /** The learner asked to be checked on this canvas (§38's phrase path). A request, not a run:
   *  `learning-canvas.tsx` builds the questions, because the objectives live in the policy
   *  runtime and this hook does not know what an objective is. */
  testRequested: boolean;
  /** The questions the TURN wrote, when it wrote usable ones.
   *
   *  🔴 CARRIED BESIDE `testRequested` RATHER THAN REPLACING IT, because the two answer different
   *  questions: whether a check was asked for, and whether this particular turn happened to supply
   *  the questions for it. A course canvas asks for one and supplies none — its pool does that. */
  testQuestions: TestRun | null;
  /** The test is over, or they closed it. Nothing about it is kept. */
  clearTest: () => void;
  /** The sites the turn in flight is reading, deduped, in the order the search ranked them.
   *  Empty between turns and while a request is still outgoing. */
  searchedDomains: readonly string[];
  /** How many new things the last turn remembered. 0 when it remembered nothing. */
  memoryNotice: number;
  /** They read or dismissed the memory notice. */
  clearMemoryNotice: () => void;
  /** Turn the current conversational answer into an active learning session. Cited web pages are
   *  promoted through the ordinary source-ingestion door before the existing Canvas policy starts. */
  learnFromAside: () => Promise<void>;
  markKnown: (blockId: string, known: boolean) => void;
  toggleCollapsed: (blockId: string, collapsed: boolean) => void;
  gradeRecall: (
    cardId: string,
    grade: "again" | "hard" | "good" | "easy",
    evidence?: {
      said?: string;
      via?: LearnerInputModality;
      revealed?: boolean;
      evaluation?: ResponseEvaluation;
    },
  ) => Promise<void>;
  /** Retrieval by producing something rather than self-grading (§31). */
  attemptRecall: (cardId: string, text: string, via: LearnerInputModality) => Promise<void>;
  /** They asked to see the answer: recorded as a retrieval we did not obtain. */
  revealRecall: (cardId: string) => Promise<void>;
  answer: (questionId: string, picked: number) => void;
  /** Records the learner's own words and asks the judge what they show. */
  respond: (questionId: string, text: string, via: LearnerInputModality, tookMs?: number) => Promise<void>;
  /** What the canvas is asking for right now — null while reading. */
  activeTask: ActiveTask | null;
  /** Move to the next prompt of the round, or off the end of it. */
  advanceTask: () => void;
  /** The ONE way a learner answers anything. Routes to the recall or the test path by what is
   *  currently being asked, so there is never a second answer field. */
  answerActiveTask: (text: string, via: LearnerInputModality, tookMs?: number) => Promise<void>;
  /** "I don't know" — an explicit statement of state, which is real evidence, unlike a reveal
   *  shortcut that only tells us they looked. */
  admitUnknown: () => Promise<void>;
  /** What a marked vocabulary word means. Returns text for a popover. */
  defineSelection: (selection: CanvasSelection) => Promise<{ term: string; text: string; sourceLabel?: string } | null>;
  /** Rewrite one passage in place. The turn router's `then: "rewrite"` lands here, with the
   *  sentence the learner typed, so the rewrite is the one they asked for. */
  rewriteSelection: (selection: CanvasSelection, request: string) => Promise<void>;
  /**
   * The learner highlighted something and said what they wanted, in their own words.
   *
   * Which of the two outcomes happens is the model's reading of `request`, not a flag the caller
   * sets. `null` means neither happened and `selectionError` says why — a case the caller must not
   * confuse with a rewrite, or a failed request would silently close the popover carrying its own
   * error message.
   */
  askAboutSelection: (selection: CanvasSelection, request: string) => Promise<SelectionReply | null>;
  /** Session management (§10). Kept away from the teaching API above on purpose — these change
   *  what the session IS, not what the learner is doing inside it. */
  rename: (title: string) => void;
  /** Record a thing Nemesis made (a deck, a note); appends to `outputs` and persists. */
  addOutput: (output: CanvasOutput) => void;
  /** Make a deliverable from what the canvas holds and file it in the library — owner
   *  2026-08-25. The deck/note lands in the library's own tables AND on `outputs`. */
  makeDeliverable: (kind: DeliverableKind) => Promise<void>;
  /** The deliverable currently being made, or null — drives the Outputs tab's busy row. */
  making: DeliverableKind | null;
  remove: () => Promise<void>;
  /** Record what the learner did. 🔴 Telemetry only — see canvas-events.ts. */
  recordEvent: (event: NewLearningEvent) => void;
  /** Records a learner-visible moment for the History Rail. 🔴 Never evidence — see the
   *  implementation's own note, and lib/learn/canvas-moment.ts. */
  recordMoment: (moment: NewCanvasMoment) => void;
  selectionBusy: boolean;
  selectionError: string | null;
  clearSelectionAnswer: () => void;
  reset: () => void;
}

export function useCanvasSession(canvasId: string | null): CanvasSession {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  /** Which deliverable is being made right now, for the Outputs tab's own busy state. */
  const [making, setMaking] = useState<DeliverableKind | null>(null);
  const makingRef = useRef(false);

  const [canvas, setCanvas] = useState<LearningCanvas>(() => newCanvas());
  const [busy, setBusy] = useState<BusyState>({ kind: null });
  /**
   * The live thinking preview: what the model said it would be doing, and how far the work has got.
   *
   * 🔴 TWO PIECES OF STATE, NOT A RESOLVED STRING, because the line to show is a function of BOTH
   * and of what is running — `turn-preview.ts` does that resolution and stays pure. Keeping a
   * resolved string here would put the one decision that must be testable inside a React hook.
   *
   * 🔴 SEPARATE FROM `busy`. `busy.label` is the name of a step genuinely executing —
   * `thinking-phases.ts` allows nothing else in that slot. Milestones are the model's words for
   * stages that have opened. Merging them would let a model's sentence be read by every consumer
   * that trusts `busy` to mean "this is running now".
   */
  const [milestones, setMilestones] = useState<readonly string[]>([]);
  const [stage, setStage] = useState<TurnStage>("decided");
  /**
   * A real step running inside the turn, named, for the caption slot.
   *
   * 🔴🔴 DELIBERATELY NOT `busy`, AND THE REASON IS THE COMPOSER. `busy.kind !== null` is what
   * DISABLES the text box — so routing a PubChem lookup through it would lock the learner out of
   * their own composer for the length of a third-party round trip, which is precisely the *"inert
   * loading screen"* the owner asked this feature not to become. The caption and the lockout are
   * two different questions and had been sharing one answer.
   */
  const [work, setWork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What the learner said to open this sitting, when a canvas began from an utterance rather than
   *  from a file. Read by the teaching controller; see `TeachingContext.opening`. */
  const [opening, setOpening] = useState<string | null>(null);
  const [aside, setAside] = useState<CanvasAside>(null);
  /**
   * Words the learner has stopped and asked about in this sitting.
   *
   * 🔴 A SITTING, NOT A PROFILE. `learner_lookups` is the durable record and `learner-friction.ts`
   * is emphatic that curiosity is not a claim about a person — this is the much smaller thing the
   * screen needs: which words on the page in front of them they have already opened, so those
   * words carry the dotted underline that says "you can open this again".
   */
  const [lookedUp, setLookedUp] = useState<readonly string[]>([]);
  /**
   * The one decision Nemesis is waiting on, and the turn it is holding until the answer lands.
   *
   * 🔴 ONE, NOT A QUEUE. Two pending questions would make "which one does this typed sentence
   * answer?" a real question, and that is precisely the ambiguity `AnswerSink` is a union to
   * prevent. A second decision is a second turn.
   *
   * 🔴 THE ORIGINAL UTTERANCE RIDES ALONG, BECAUSE THE ANSWER RESUMES THE TURN BY RE-ASKING IT.
   * Replaying `decision.then` locally would freeze what Nemesis decided before it knew the answer —
   * the depth it picks changes the topic, the opening line and sometimes whether teaching is even
   * the right move. Re-running the same utterance WITH the answer as a stated fact lets the model
   * finish the turn it started rather than have the software finish it on its behalf.
   */
  // 🔴 THE CAPABILITY IS PART OF THE PARKED TURN. A clarification pauses a submission; the chip
  // the learner attached to that submission is a fact about it, and the resumed turn must carry
  // it or a Course press that got (rightly) asked "how deep?" could never build — `courseGate`
  // drops a curriculum request from any turn that does not carry the chip.
  const [clarifying, setClarifying] = useState<
    { question: UserQuestion; said: string; capability: ComposerCapability | null } | null
  >(null);
  /**
   * The learner asked to be checked on this canvas's material (§38's phrase path).
   *
   * 🔴🔴 A REQUEST, NOT A RUN, AND THE SPLIT IS DELIBERATE. Building the questions needs the
   * canvas's objectives and evidence, which live in the policy runtime and not here — this hook
   * has never known what an objective is and should not start. So the session records only that
   * the ask happened; `learning-canvas.tsx` holds both halves and is where `buildTestRun` runs.
   *
   * 🔴 IT IS A BOOLEAN, NOT A MODE. It is set by one turn, cleared the moment the test is closed
   * or a new turn starts, and nothing persists it. §38 permits a test as a phrase precisely
   * because it cannot become a state the learner is left sitting inside.
   */
  const [testRequested, setTestRequested] = useState(false);
  /**
   * How many things this turn just remembered, for the "Memory updated" line.
   *
   * 🔴 A COUNT, NOT THE SENTENCES. The notice says something was kept and where to read it;
   * printing the fact itself into the canvas would put a claim about the learner on their screen
   * mid-lesson, and the place to read and delete those is Settings, where all of them are.
   */
  const [memoryNotice, setMemoryNotice] = useState(0);
  /**
   * The sites this turn is reading, for the dock's favicon chips.
   *
   * 🔴 CLEARED WHEN THE SEARCH BEGINS, NOT WHEN THE TURN ENDS. `onSearching(null)` means a fresh
   * request just went out, so last round's hosts are already wrong — leaving them up would show
   * chips for pages this answer does not stand on, which is the exact claim the dock's contract
   * with `thinking-phases.ts` forbids.
   */
  const [searchedDomains, setSearchedDomains] = useState<readonly string[]>([]);
  const [testQuestions, setTestQuestions] = useState<TestRun | null>(null);
  /**
   * Which turn's check is on screen.
   *
   * 🔴🔴 A COUNTER, BECAUSE THE OBVIOUS GUARD IS WRONG. The diagram behind an occlusion check
   * arrives seconds after the chips do — a repository search plus a vision read — and in that gap
   * the learner may have sent another turn. The first version of this guarded on
   * `current === null`, reasoning that a cleared check means the turn is over. That is false in
   * the one case the feature exists for: a turn may ask for a picture check and write NO text
   * questions, so `current` is legitimately null and the diagram would have been thrown away
   * every time. Comparing turns says what was actually meant.
   */
  const checkTurn = useRef(0);
  /**
   * Decisions already settled this sitting, phrased as facts for the packet.
   *
   * 🔴 THIS SITTING ONLY, AND THAT IS A KNOWN LIMIT RATHER THAN AN OVERSIGHT. Nothing here is
   * written to the canvas row, so a reload loses it and the model may ask again. Persisting it is a
   * schema change and belongs to the owner; asking twice across a reload is mildly annoying, where
   * a half-migrated column that some canvases have and others do not is a bug in the packet.
   */
  const [clarified, setClarified] = useState<readonly string[]>([]);
  /** The prompt whose answer is being read right now. Per-question rather than a page-wide busy
   *  flag, so judging one answer does not freeze the rest of the page. */
  const [judging, setJudging] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Which prompt of the current round the learner is on.
   *
   *  🔴 THIS LIVES HERE, NOT IN THE STAGE. It used to be `useState(0)` inside CanvasRecall and
   *  again inside CanvasTest, which is exactly why each of them had to grow its own answer box:
   *  the persistent composer is a sibling of the stage and had no way of knowing what was being
   *  asked. One cursor in the session is what lets one composer answer everything. */
  const [cursor, setCursor] = useState(0);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // Saving is debounced against a ref so a burst of edits writes once, and so the save always
  // sees the newest canvas rather than the one captured when the timer was set.
  const latest = useRef(canvas);
  latest.current = canvas;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveCanvas(uid, latest.current), 600);
  }, [uid]);

  /** Every state change funnels through here so nothing can update the canvas without also
   *  stamping the time and scheduling a save. */
  const update = useCallback(
    (change: (current: LearningCanvas) => LearningCanvas) => {
      setCanvas((current) => {
        const next = change(current);
        if (next === current) return current;
        latest.current = { ...next, updatedAt: new Date().toISOString() };
        return latest.current;
      });
      persist();
    },
    [persist],
  );

  /** 🔴 Records an interaction and NOTHING ELSE. It must never touch `weakConceptIds`, an
   *  evaluation, or a scheduling grade — those come from performance, and a tooltip is not a
   *  performance. `canvas-events.test.ts` holds the line behaviourally. */
  const recordEvent = useCallback(
    (event: NewLearningEvent) => {
      update((current) =>
        appendEvent(current, event, new Date().toISOString(), `e${current.events.length}-${Date.now()}`),
      );
    },
    [update],
  );

  const [coursePlan, setCoursePlan] = useState<CurriculumPlan | null>(null);

  /**
   * Records that a learner-visible moment happened, for the History Rail.
   *
   * 🔴 SITS BESIDE `recordEvent` AND IS NOT IT. That one is capped telemetry that drops its oldest
   * rows and includes tooltip opens and text selections — transient system activity the rail must
   * not show. This one is the ordering spine the rail reads: when something happened, and which
   * durable entity it was. See lib/learn/canvas-moment.ts.
   *
   * 🔴 IT MUST NEVER TOUCH A VERDICT, `weakConceptIds`, OR A SCHEDULING GRADE — the same rule
   * `recordEvent` carries, for the stronger reason: history is read-only navigation, and a rail
   * that could move the learner model would make rewinding destructive.
   *
   * 🔴 CONSECUTIVE DUPLICATES ARE DROPPED. React effects run twice in development StrictMode and a
   * re-render must not buy a second marker for one answer.
   */
  const recordMoment = useCallback(
    (moment: NewCanvasMoment) => {
      update((current) => {
        if (sameMoment(current.moments.at(-1), moment)) return current;
        return {
          ...current,
          moments: appendMoment(
            current.moments,
            moment,
            new Date().toISOString(),
            `m${current.moments.length}-${Date.now()}`,
          ),
        };
      });
    },
    [update],
  );

  const go = useCallback(
    (to: CanvasState) => {
      captureStateChange(latest.current, to);
      update((current) => ({ ...current, state: to }));
    },
    [update],
  );

  // Load, or start fresh.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (canvasId) {
        let found: Awaited<ReturnType<typeof loadCanvas>> = null;
        try {
          found = await loadCanvas(uid, canvasId);
        } catch {
          // 🔴 A LOAD THAT THREW MUST NOT LEAVE THE HOLDING SCREEN UP FOR EVER. This IIFE had no
          // catch, so a network blip here skipped `setReady(true)` permanently and the learner
          // watched an empty centre that never settled (owner report, 2026-08-23, reopening a
          // canvas). And it must NOT fall through to `newCanvas()` either: an empty fresh canvas
          // standing where their work was reads as the work being gone, which is worse than the
          // truth. The truth is a sentence, on the same screen, with the exit still above it.
          if (alive) setError("This canvas didn't load. Check your connection, then open it again. Nothing on it is lost.");
          return;
        }
        if (alive && found) {
          setCanvas(found);
          latest.current = found;
          setReady(true);

          // The course rides the territory marker; a refresh must keep it (acceptance item 10).
          // Fire-and-forget beside the coverage refresh below, for the same reason: the canvas is
          // usable before either lands, and neither failing may block it.
          void loadCurriculumPlan(uid, canvasId).then((plan) => {
            if (alive && plan) setCoursePlan(plan);
          });

          // 🔴🔴 THE COVERAGE DISCLOSURE IS RE-DERIVED ON LOAD, BECAUSE IT WAS A SNAPSHOT AND
          // COVERAGE NOW IMPROVES. `coverageNote` is computed once when a file is attached and
          // written onto the canvas. That was harmless while a document could never be read more
          // fully than it was on the day it arrived — and as of the automatic figure pass it is
          // read more fully, in the background, minutes after the upload.
          //
          // Without this, an already-attached canvas keeps saying "8 pictures were not read" about
          // a document whose pictures now have descriptions. The knowledge pipeline is unaffected
          // (it reads `parsed_documents` fresh every time), which is exactly what makes this the
          // failure this project calls DEGRADED, NOT COMPLETE: the data got better, the words on
          // screen did not, and only the words are what the learner can see.
          //
          // 🔴 AFTER `setReady`, NOT BEFORE. This is a second round trip per attached source and
          // the canvas must not wait on it — a stale sentence for one beat is a great deal better
          // than a blank screen, which is what putting this in front of the paint would buy.
          //
          // 🔴 AND IT ONLY WRITES WHEN SOMETHING CHANGED. `refreshedCoverageNotes` returns the same
          // array when every note is unchanged, so the common case costs one read and no write.
          const refreshed = await refreshedCoverageNotes(found.sources);
          if (alive && refreshed !== found.sources) {
            const updated = { ...latest.current, sources: [...refreshed] };
            setCanvas(updated);
            latest.current = updated;
            void saveCanvas(uid, updated);
          }
          return;
        }
      }
      if (!alive) return;
      const fresh = newCanvas();
      setCanvas(fresh);
      latest.current = fresh;
      canvasCapture("canvas_created", fresh);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [canvasId, uid]);

  // Time on task, for the completion state. Only counted while the tab is actually visible —
  // "14 min active learning" must not include an hour in a background tab.
  useEffect(() => {
    let since = Date.now();
    const flush = () => {
      const elapsed = Date.now() - since;
      since = Date.now();
      if (elapsed > 500 && document.visibilityState === "visible") {
        update((current) => ({ ...current, activeMs: current.activeMs + elapsed }));
      }
    };
    const onVisibility = () => {
      flush();
      since = Date.now();
    };
    const timer = setInterval(flush, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [update]);

  const requireUid = useCallback((): string | null => {
    if (!uid) setError("Sign in to use the canvas.");
    return uid;
  }, [uid]);

  // ------------------------------------------------------------------ sources

  const attachFiles = useCallback(
    async (files: FileList | File[], sourceUrl?: string) => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      // 🔴 THE SAME VOCABULARY THE POLICY LANE USES, AND SET FROM THE FILE ITSELF. This was a
      // bare `"Reading"` — one unchanging word for the whole of an ingestion that, on a 124 MB
      // lecture deck, is the longest wait in the product. `readingSubjectFor` reads the shape out
      // of the file the learner just handed over, so a deck says it is reading slides because it
      // IS reading slides, not because a timer advanced a list.
      const firstName = Array.from(files)[0]?.name ?? "";
      setBusy({ kind: "source", label: thinkingCopy("reading_source", readingSubjectFor(firstName)) });
      try {
        for (const file of Array.from(files)) {
          // The existing extraction chokepoint — same door chat attachments, Library import
          // and syllabus import all use. No second pipeline.
          //
          // 🔴 `keep` IS WHAT MAKES CROSS-SESSION LEARNING POSSIBLE AT ALL. Without it a file
          // under 4 MB took the inline lane, which has no stored row for a parse to attach to —
          // so a canvas attachment produced no `library_sources` row, no `parsed_documents` row
          // and no durable id. Everything the canvas then learned from that document was anchored
          // to a string that means nothing outside this one canvas: a second canvas built on the
          // same lecture could not tell it was the same lecture, and retrieval, which needs a
          // filed row, returned nothing at all. Chat keeps the old default on purpose — a photo
          // dropped into a conversation should not silently become a permanent document.
          const extracted = await extractFile(file, id, { folderPath: CANVAS_FILING_FOLDER, keep: true });
          // 🔴 A SLOT NUMBER, NOT A DOCUMENT IDENTITY — AND IT IS ONLY UNIQUE BECAUSE NOTHING
          // REMOVES A SOURCE. This mints a fresh ordinal on every attach, which is why the
          // duplicate guard in `mergeSourceIntoCanvas` used to compare `id` and could never
          // fire: production canvas `186d0749` holds one document three times, as s2/s3/s4.
          // Deduplication now happens there, on `librarySourceId`, which names the DOCUMENT.
          //
          // 🔴 IF YOU EVER ADD "remove this source", THIS LINE BECOMES A BUG. With one of three
          // sources removed the next attach mints `s3` again, collides with the survivor, and
          // the id branch of `isSameDocument` overwrites a DIFFERENT document. Deriving from a
          // count is safe only while the count never goes down. Make it monotonic then — not
          // now, because renaming ids is a migration for every stored canvas and every anchor
          // already written against one.
          const sourceId = `s${latest.current.sources.length + 1}`;
          const note = coverageNote(extracted.coverage);

          // 🔴 READ BACK WHAT SURVIVED, RATHER THAN TRUSTING WHAT WAS RETURNED. The upload
          // response carries the model the parser produced in that request; the canvas has to
          // work from the one that got STORED, because that is what every later reader sees —
          // this canvas after a reload, a second canvas, retrieval, extraction. While the two are
          // built from different inputs, a write that silently failed or a shape the envelope
          // reader rejects looks perfect here and empty everywhere else.
          const canonical = extracted.librarySourceId
            ? await loadCanonicalSource(extracted.librarySourceId)
            : { ok: false as const, reason: "not-found" as const };

          const source: CanvasSource = {
            id: sourceId,
            // 🔴🔴 AN IMAGE IS TITLED BY ITS FILE, NOT BY WHAT A MODEL SAW IN IT. Reported
            // 2026-08-20 as "nemesis does not accept any images" — and it accepts them perfectly.
            // What the learner saw was a chip reading "[An illustration of three solid black
            // horizontal bars of varying lengths stacked vertically against a light gray
            // background." Their photo, described back at them in brackets, truncated. That reads
            // as a failure, and it is the same shape as the drawing that was sent back to be
            // proofread: the product answering a picture with prose about the picture.
            //
            // 🔴 THE DESCRIPTION IS NOT DISCARDED — it is the source's CONTENT, which is exactly
            // what a vision read produces and what the canvas learns from. Only the NAME changes,
            // to the one the learner recognises.
            title: extracted.kind === "image" ? file.name : extracted.title ?? file.name,
            kind: extracted.kind ?? "text",
            // Three inputs, in order of how much is known about them, and the fallbacks are
            // fallbacks rather than dead code: an image has no structural pass at all, and a PDF
            // the structural reader could not open falls back to `unpdf`.
            //
            //   1. the STORED canonical parse — the one everything else reads;
            //   2. the model from this request — right, but only until the tab closes;
            //   3. the flat text — a heading becomes a guess and a table becomes pipe soup.
            //
            // 🔴 AND A MISSING MODEL IS "UNKNOWN", NEVER "FLAT". Reading absence the second way
            // is how a two-column paper gets filed as prose.
            excerpts: canonical.ok
              ? excerptsFromSourceContext(sourceId, canonical.context)
              : extracted.model
                ? buildExcerptsFromModel(sourceId, extracted.model)
                : buildExcerpts(sourceId, extracted.text),
            ...(note ? { coverageNote: note } : {}),
            // 🔴 STATED, NOT LEFT TO BE INFERRED. A reader must not have to work out durability
            // from whether some other field happens to be set — an ephemeral source can teach this
            // canvas perfectly well, and must not pretend to support anything that outlives it.
            durability: extracted.librarySourceId ? "durable" : "ephemeral",
            ...(extracted.librarySourceId ? { librarySourceId: extracted.librarySourceId } : {}),
            ...(canonical.ok ? { parseQuality: canonical.context.quality } : {}),
            // A promoted web result remains traceable to the page it came from. This metadata is
            // supplied only by `attachUrl`; ordinary uploads correctly leave it absent.
            ...(sourceUrl ? { sourceUrl } : {}),
          };
          update((current) => mergeSourceIntoCanvas(current, source));
          // 🔴 THE MOMENT, NOT A COPY OF THE SOURCE. It stores the id; the title is read back
          // from `canvas.sources` when the rail draws, so renaming a source renames its history row
          // and detaching one cannot leave a stale title on the rail. See lib/learn/canvas-moment.ts.
          recordMoment({ kind: "source", sourceIds: [source.id] });

          // 🔴 THE FIRST TIME THE RUNNING APP CREATES DURABLE KNOWLEDGE. Until this landed,
          // `extractKnowledgeObjects` existed and was called only by tests and scripts, so the
          // production tables could only ever be filled by hand — which is why nothing could
          // accumulate across sessions no matter how correct the extractor was.
          //
          // 🔴 THE SAME FUNCTION A SECOND CANVAS CALLS ON OPEN, AND THAT IS WHY IT CONVERGES.
          // Attaching here and resolving there are the identical path over the identical source,
          // so both land on the same identity keys and therefore the same rows. A bespoke
          // extract-on-attach would be a second implementation of the step the cross-session claim
          // rests on, free to drift from it by one edit.
          //
          // Deliberately BEST-EFFORT and after the canvas has already been updated: a learner
          // whose material is attached and readable must not lose the attachment because the
          // knowledge layer had a bad day. §13 — "semantic extraction failed" must never be
          // reported as "file upload failed". What fails here costs adaptation, not the lesson.
          if (canonical.ok && extracted.librarySourceId) {
            void (async () => {
              // No bypass here on purpose: attaching a file is not a request to run the policy on
              // material it cannot teach, so the ordinary rule decides whether anything is stored.
              const resolved = await ensureKnowledgeForCanvas(uid, latest.current);
              canvasCapture("knowledge_extracted", latest.current, {
                objectives: resolved.objectives.length,
                outcome: resolved.outcome,
                // 🔴 LOGGED, BECAUSE `objectives: 0` NO LONGER MEANS EXTRACTION FOUND NOTHING.
                // Knowledge is stored only for a canvas the policy owns, so a mixed document now
                // reports zero objectives having extracted plenty — and without these three fields
                // that reads in production as a broken extractor rather than a deliberate refusal.
                owned: resolved.ownership.owns,
                refusal: resolved.ownership.refusal,
                substantiveUnits: resolved.coverage.substantive,
                unrepresentedUnits: resolved.coverage.unrepresented,
              });
            })();
          }

          canvasCapture("source_attached", latest.current, {
            kind: source.kind,
            excerpts: source.excerpts.length,
            chars: extracted.text.length,
            // Logged so the proportion of canvases running on a degraded parse is findable in
            // production without a student having to report one.
            durability: extracted.librarySourceId ? "durable" : "ephemeral",
            grounding: canonical.ok ? "canonical" : extracted.model ? "response-model" : "text",
            ...(canonical.ok ? { quality: canonical.context.quality } : {}),
          });
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nemesis couldn't read that file.");
      } finally {
        setBusy({ kind: null });
      }
    },
    [recordMoment, requireUid, update],
  );

  /**
   * Read a web page and file it as a source.
   *
   * 🔴 THE SCRAPE ROUTE IS SHARED, NOT NOTEBOOK-SPECIFIC. `/api/notebooks/extract/url` fetches a
   * URL and returns plain text; nothing about its implementation reads or writes a notebook, and
   * `components/workspace/notebooks/notebook-source-actions.ts` already calls it as exactly that,
   * a generic "read this page" utility. A second route with the identical body would be the same
   * Firecrawl call behind a different path for no reason.
   *
   * 🔴 THE URL IS PROVENANCE, NOT SOURCE CONTENT. `CanvasSource.sourceUrl` carries it separately,
   * so the learner can reopen the page without teaching the extractor the synthetic claim
   * `Source: https://...`. The scraped body remains exactly the body the page reader returned.
   */
  const attachUrl = useCallback(
    async (rawUrl: string) => {
      const id = requireUid();
      if (!id) return;
      const url = rawUrl.trim();
      if (!url) return;
      setError(null);
      setBusy({ kind: "source", label: "Reading that page" });
      try {
        const key = await deviceKey(id);
        if (!key) throw new Error("Sign in to add a web link.");
        const response = await fetch("/api/notebooks/extract/url", {
          body: JSON.stringify({ url }),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          method: "POST",
        });
        const body = (await response.json().catch(() => null)) as
          | { title?: string; text?: string; sourceUrl?: string; error?: string }
          | null;
        if (!response.ok || !body?.text) throw new Error(body?.error ?? "Nemesis couldn't read that page.");
        const promotion = prepareWebSourcePromotion({
          requestedUrl: url,
          ...(body.sourceUrl ? { returnedUrl: body.sourceUrl } : {}),
          text: body.text,
          ...(body.title ? { title: body.title } : {}),
        });
        // The identical door every other material lane already shares (see the file-level
        // comment on `attachFiles` above): filing, knowledge extraction and every later reader
        // treat this exactly as they would a learner's own uploaded text file.
        await attachFiles(
          [new File([promotion.content], promotion.fileName, { type: "text/markdown" })],
          promotion.sourceUrl,
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nemesis couldn't read that page.");
        setBusy({ kind: null });
      }
    },
    [attachFiles, requireUid],
  );

  /** Start learning. The topic is passed in rather than set first and read back:
   *
   *  🔴 `setTopic(t); begin();` looked fine and was a race. `latest.current` is only written
   *  inside the `setCanvas` updater, and React runs that eagerly only when the fiber has no
   *  pending work — which the active-time interval routinely creates. So the topic-first entry
   *  path (§6B, one of the two documented ways in) intermittently read a canvas with no title
   *  and refused with "Add material, or say what you want to learn." Taking the topic as an
   *  argument removes the ordering dependency instead of narrowing the window. */
  // ------------------------------------------------------------------- lesson

  /**
   * Open the canvas.
   *
   * 🔴 IT GENERATES NOTHING TO READ — §24, AND IT IS THE WHOLE POINT OF THIS FUNCTION NOW.
   *
   *     "Source ingestion is not source summarization."
   *     "The first generated artifact is normally a diagnostic, not a document overview."
   *
   * Uploading a lecture used to call `generateLesson`, which wrote 8-25 headed paragraphs, and the
   * owner's own canvas opened on a heading reading "What this document covers" followed by a
   * summary of material they had just handed us. Nemesis was telling a learner what was in their
   * document before finding out what they already understood.
   *
   * Both ways in now do the same thing here: move out of the pre-content state and let the policy
   * runtime ask. `ensureKnowledgeForCanvas` runs on every canvas already, so there is nothing to
   * await and no second path to keep in step.
   *
   * 🔴 REMOVING THIS CALL ALONE WOULD HAVE SHIPPED A BLANK PAGE, WHICH IS WHY THE KNOWLEDGE CHANGE
   * IS IN THE SAME PR. `extractKnowledgeObjects` is a structured-table lane; the owner's 15-page
   * lecture has `table_count: 0` in its stored parse, so it minted zero objectives and the policy
   * had nothing to ask. `canvas-knowledge.ts` now reads such a document with the same constructor
   * the topic lane uses, so there is a question waiting where the summary used to be.
   *
   * 🔴 "SUMMARIZE THIS" IS UNAFFECTED AND MUST STAY THAT WAY. §24 keeps that path explicitly. It
   * runs through `command()` below, which asks for the summary the learner actually requested,
   * grounded in their sources. What is gone is producing one nobody asked for.
   *
   * `level` is optional and is only ever a level the learner actually expressed.
   */
  const openCanvas = useCallback(
    async (level?: CanvasLevel) => {
      const id = requireUid();
      if (!id) return;
      if (level) update((current) => ({ ...current, level }));
      setError(null);
      update((current) => ({ ...current, state: "learn" }));
    },
    [requireUid, update],
  );

  /**
   * Open the canvas by DOING something with the material, rather than by asking the learner to
   * classify themselves first.
   *
   * 🔴 THIS USED TO ROUTE INTO `orient`, AND `orient` WAS A WALL. The composer was hidden while it
   * showed (`showComposer` excluded the state), so the only way into a canvas was to pick one of
   * four labels — "Start from fundamentals", "I know the basics", "Advanced", "Exam-focused" —
   * before Nemesis had used a single thing it already knew. That is the six-stage machine's defect
   * at a different scale: a route decided before anything about the learner was established.
   *
   * It is also a bad input. Two people who choose "I know the basics" know completely different
   * things, and neither answer says which concepts are solid, which have decayed, or which
   * misconception is in the way. Those are discovered from what someone DOES.
   *
   * 🔴 WHAT THIS IS NOT, YET. A real `initializeCanvas` reads learner state, objective state,
   * recent evidence and the calendar, and picks the opening action from them. None of those exist
   * yet — so this does the honest version: it starts from the SOURCE and the learner's own words,
   * and asks nothing. When the policy lands it replaces the call below; it does not have to undo a
   * question we should never have asked.
   */
  const begin = useCallback(
    (topic?: string) => {
      const title = topic?.trim() ?? "";
      const check = canStart({ sources: latest.current.sources, title: title || latest.current.title });
      if (!check.ok) {
        setError(check.reason);
        return;
      }
      if (title) update((current) => ({ ...current, title }));

      /**
       * 🔴 A TOPIC WITH NO MATERIAL USED TO OPEN AN EMPTY ROOM. Measured in production: "Teach me
       * innate immunity." set a title and a state, and every step after that reads KNOWLEDGE, which
       * is built from SOURCES — of which there were none. The learner asked to be taught and got
       * *"Nemesis has your material but hasn't found anything to ask you about yet."*
       *
       * So ground it first: one search, a few pages, promoted through `attachUrl` — the SAME door
       * `learnFromAside` already uses and the same door an uploaded lecture goes through. There is
       * one ingestion pipeline and one knowledge substrate; only where the material came from
       * differs.
       *
       * 🔴 AND IT OPENS THE CANVAS EITHER WAY. If the search returns nothing usable, the learner
       * still lands in their canvas and can attach something — the old empty state, reached
       * honestly, rather than a spinner that never resolves. Grounding is a best effort on the way
       * in, never a gate.
       */
      const ground = async () => {
        const id = requireUid();
        if (id && needsGrounding({ attachedSources: latest.current.sources.length, topic: title })) {
          setBusy({ kind: "source", label: "Finding material on that" });
          try {
            // The title IS the subject: it came from the model, not from what the learner typed.
            const found = await searchWebContext(id, title);
            const chosen = groundingSources(found.sources);
            // 🔴🔴 ONE PAGE PER `try`, NOT ONE `try` AROUND THE WHOLE LOOP. With a cap of three this
            // barely mattered; with the cap removed (owner call, 2026-08-19) a single unreachable
            // page part-way down the list would have aborted every page after it, and the outer
            // catch would have swallowed that silently — so a topic would ground on four pages
            // instead of twelve and look exactly like a topic that only had four. The failure this
            // prevents is the one that reads as "he took the cap off and it stopped working".
            let promoted = 0;
            for (const source of chosen) {
              try {
                await attachUrl(source.url);
                promoted += 1;
              } catch {
                // This page could not be read. The others still can.
              }
            }
            canvasCapture("canvas_topic_grounded", latest.current, {
              // 🔴 WHAT LANDED, NOT WHAT WAS CHOSEN. The old line recomputed `groundingSources` and
              // reported its length, so the number recorded was how many pages we MEANT to read —
              // which is the same number whether ingestion worked or every page failed.
              offered: chosen.length,
              promoted,
            });
          } catch {
            // Nothing usable came back. The canvas still opens; see the note above.
          }
          setBusy({ kind: null });
        }
        // The learner's own words are the goal signal. "Teach me organic chemistry from scratch"
        // already says where to start, so there is nothing left to ask them.
        await openCanvas();
      };
      void ground();
    },
    [attachUrl, openCanvas, requireUid, update],
  );

  /**
   * A canvas stored at `orient` is one that never got past the level picker. Start it.
   *
   * 🔴 WITHOUT THIS THOSE CANVASES BECOME DEAD ENDS. `orient` was only ever escapable by choosing
   * one of four labels, and that screen is gone — so a canvas sitting in that state has no forward
   * path at all and would open to an empty page for ever. Old rows must keep working; that is the
   * whole reason `orient` survives in the state union rather than being deleted from it.
   *
   * Guarded on having produced NOTHING, so this can only ever fire for a canvas that genuinely
   * never ran. A ref rather than state, because the effect must not re-fire while the generation it
   * started is still in flight.
   */
  const resumedOrient = useRef(false);
  useEffect(() => {
    if (!ready || resumedOrient.current) return;
    const current = latest.current;
    if (current.state !== "orient") return;
    if (current.blocks.length > 0 || current.recall.length > 0 || current.questions.length > 0) return;
    resumedOrient.current = true;
    void openCanvas();
  }, [openCanvas, ready]);

  // ----------------------------------------------------------------- commands

  const command = useCallback(
    async (text: string, selected: readonly CanvasBlock[]) => {
      const id = requireUid();
      if (!id || !text.trim()) return;
      setError(null);
      setAside(null);
      setBusy({
        kind: "command",
        blockIds: selected.map((block) => block.id),
        label: selected.length ? "Rewriting" : "Updating",
      });
      const result = await runCommand(id, latest.current, text.trim(), selected);
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        return;
      }
      update((current) => applyOps(current, result.value ?? []));
      canvasCapture("canvas_section_rewritten", latest.current, {
        scoped: selected.length > 0,
        selected: selected.length,
        applied: result.value.length,
        rejected: result.rejected,
      });
    },
    [requireUid, update],
  );

  /** Questions that do not change the page. Answered in a popover that disappears — the whole
   *  point of §4 is that asking does not build a transcript down the side of the document. */
  const askAbout = useCallback(
    async (block: CanvasBlock, question: string) => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "command", blockIds: [block.id], label: "Looking" });
      const result = await explainBlock(id, latest.current, block, question);
      setBusy({ kind: null });
      if (!result.value) setError(result.error);
      else setAside({ blockId: block.id, kind: "reply", text: result.value });
    },
    [requireUid],
  );

  /**
   * One conversational turn: read it, say something, and do what it asked for.
   *
   * 🔴🔴 THE MODEL DECIDES WHAT THE TURN MEANT; THIS FUNCTION DECIDES WHAT THAT CAN DO. Those are
   * different jobs and keeping them apart is the whole point. `askCanvasChat` comes back with
   * "reply" or "study" — an intent, in the learner's terms. Which mechanism a "study" turn reaches
   * is not the model's to pick, because it depends on a fact the canvas already holds and the
   * model would only be guessing at: a canvas that has not begun starts a session, and a canvas
   * that has steers the study document it already owns. Handing that choice to the model would be
   * asking it to rediscover something the software knows for certain.
   *
   * 🔴 SAME `aside` STATE `askAbout` USES, `blockId: null`. Two answer stores would have meant two
   * places contract rule 2's "clears on the next turn" rule had to be implemented, and the second
   * one would have been the one nobody remembered to wire up. `learning-canvas.tsx`'s
   * `applyExplanationEvent` already clears any non-null `aside` on `new_turn`; it does not
   * distinguish which of the two callers set it, and it does not need to.
   *
   * 🔴 A `study` TURN THAT REACHES `command` SETS NO ASIDE, BECAUSE `command` CLEARS ONE. The
   * document rewriting itself IS the reply there, and a sentence that appeared for an instant and
   * then vanished under the write would read as a glitch rather than as an answer.
   */
  const makeDeliverable = useCallback(
    async (kind: DeliverableKind, topic?: string) => {
      // The ref, not the state: two clicks in one frame both see `making === null`.
      if (makingRef.current) return;
      if (!uid) {
        setError("Sign in to save things to your library.");
        return;
      }
      makingRef.current = true;
      setMaking(kind);
      try {
        const result =
          kind === "flashcards"
            ? await makeFlashcardsDeliverable(uid, latest.current)
            : kind === "slides"
              ? await makeSlidesDeliverable(uid, latest.current, topic)
              : kind === "report"
                // 🔴 THE ONLY DELIVERABLE THAT NEEDS A TOPIC RATHER THAN LIKING ONE. The other
                // three read the canvas; this one goes and searches for material the canvas does
                // not have, so with nothing to research there is nothing to do. The canvas title
                // is the fallback because "research this" on an open canvas plainly means its
                // subject.
                ? await makeReportDeliverable(uid, latest.current, topic || latest.current.title || "")
                : await makeNoteDeliverable(uid, latest.current);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        update((current) => ({ ...current, outputs: [...(current.outputs ?? []), result.output] }));
        // The notice strip, deliberately — see showNotice's own comment above.
        setError(
          kind === "flashcards"
            ? "Flashcards saved to your Library."
            : kind === "slides"
              ? "Slides saved to your Library. Download them from the outputs panel, in any of twenty looks."
              : kind === "report"
                ? "Research saved to your Library, with its sources."
                : "Note saved to your Library.",
        );
      } finally {
        makingRef.current = false;
        setMaking(null);
      }
    },
    [uid, update],
  );

  const converse = useCallback(
    async (
      question: string,
      surroundings: TurnSurroundings,
      onStudyDocument?: () => void,
      /**
       * The passage the learner staged, when they staged exactly one.
       *
       * 🔴 IT SCOPES THE TURN, IT DOES NOT CLASSIFY IT. The block's text goes into the packet so
       * the model can resolve "this", and a `study` turn writes against that block rather than
       * against the whole document. What the learner wants done with it is still the model's
       * reading — which is the point: it used to be `/^(where|which source|what source)\b/i`, so
       * three openers were answered beside the passage and every other sentence silently EDITED it.
       */
      staged?: CanvasBlock | null,
      capability?: ComposerCapability | null,
      /**
       * May this turn be parked behind a clarification card?
       *
       * 🔴 FALSE ON THE RESUMED TURN, AND IT IS A GUARD RATHER THAN A PROMPT RULE. The contract
       * already tells the model not to ask again once the learner has answered, and a model that
       * ignores it would otherwise park the same utterance forever: answer, re-ask, answer,
       * re-ask, with the learner doing all the work. A prompt cannot make a loop unreachable; this
       * can. The turn still runs — the question is simply dropped and `then` happens.
       */
      mayAsk = true,
    ): Promise<TurnDecision | null> => {
      const id = requireUid();
      if (!id) return null;
      const said = question.trim();
      if (!said) return null;
      // 🔴 AN UNMISTAKABLE ARTIFACT ASK IS AN ORDER, NOT A QUESTION (owner 2026-08-25: "if you
      // ask them to make a PowerPoint, then it'll do it for you"). Routed before the policy
      // turn: the learner asked for a THING, and a lesson about the thing instead reads as a
      // refusal. readDeliverableAsk is deliberately narrow — every ambiguous phrasing falls
      // through to the ordinary turn.
      // 🔴 RESEARCH IS CHECKED FIRST, because the two parsers overlap on one phrasing and the
      // wrong winner is expensive in opposite directions. "Research X and make me slides" is an
      // order to go and find things out; answering it with a deck built from an empty canvas
      // produces a confident presentation about nothing. The research parser needs an explicit
      // research verb, so it fires only when the learner said one.
      const toResearch = readResearchAsk(said);
      if (toResearch) {
        setBusy({ blockIds: [], kind: "command", label: "Planning the research" });
        try {
          await makeDeliverable("report", toResearch);
        } finally {
          setBusy({ kind: null });
        }
        return null;
      }
      const askedFor = readDeliverableAsk(said);
      if (askedFor) {
        setBusy({ blockIds: [], kind: "command", label: askedFor === "slides" ? "Building your slides" : askedFor === "flashcards" ? "Making your flashcards" : "Writing your note" });
        try {
          await makeDeliverable(askedFor, said);
        } finally {
          setBusy({ kind: null });
        }
        return null;
      }
      setError(null);
      setBusy({ kind: "command", blockIds: [], label: "Thinking" });
      // 🔴 THE LABEL CHANGES UNDER THE LEARNER WHEN THE TURN ACTUALLY BUYS A SEARCH, and only then.
      // `thinking-phases.ts`'s rule holds: a caption is emitted by a step that is genuinely running,
      // never by a timer walking through plausible-sounding stages.
      const result = await askCanvasChat(id, latest.current, said, surroundings, undefined, staged?.content ?? "", (found, domains) => {
        // 🔴 THE HOSTS TRACK THE BEAT THEY ARRIVED ON. `[]` on the outgoing request clears the
        // previous round; the real list replaces it the moment the results land.
        setSearchedDomains(domains);
        // 🔴 THE COUNT WHEN THERE IS ONE, AND NEVER A GUESS BEFORE. `thinking-phases.ts`'s rule is
        // that a caption is emitted by a step genuinely running; a number invented before the
        // results land would be the same theatre with more precision.
        setBusy({
          blockIds: [],
          kind: "command",
          label: found === null
            ? "Searching the web"
            : found === 1
              ? "Reading 1 page"
              : `Reading ${found} pages`,
        });
      },
      // 🔴🔴 THE PLAN BECOMES THE CAPTION, RATHER THAN SITTING BESIDE ONE. A stated intention and a
      // phase name are the same slot on screen — one line, beside the character, lit left to right
      // — and showing both would print two descriptions of one wait. When the model has said what
      // it is about to do, that is strictly better than "Thinking": it is specific, it is in the
      // learner's own subject, and `readTurnDecision` has already refused it if it claimed a step
      // this turn did not ask for.
      //
      // 🔴 IT DOES NOT OVERWRITE A NAMED STEP THAT IS GENUINELY RUNNING. `onSearching` fires while
      // pages are being fetched and says how many; that is a fact about work in flight, and a plan
      // is a claim about work to come. The search caption wins for as long as it is true.
      (next) => setMilestones(next),
      (next) => setStage(next),
      // 🔴 A REAL STEP, REPORTED WHILE IT RUNS, AND IT DOES NOT LOCK THE COMPOSER. The preview
      // prefers a milestone over it, so this shows only where the model had nothing to say about
      // the stage the turn is in.
      (label) => setWork(label),
      // The one-shot capability, as a FACT in the packet. Never a branch in this function.
      capability === "course");
      setBusy({ kind: null });
      setMilestones([]);
      setStage("decided");
      setWork(null);
      // 🔴🔴 GATED BEFORE ANYTHING READS IT — owner ruling, 2026-08-23: a course builds ONLY behind
      // the Course chip. The contract says so too, but "teach me" over a fat PDF read as a course
      // order once already, and the cost was a minutes-long research pass and a canvas renamed
      // under the learner. The prompt asks; this makes the leak unreachable (the `mayAsk` split).
      const decision = result.decision && courseGate(result.decision, capability === "course");
      if (!decision) {
        // 🔴 A REAL FAILURE IS STILL REPORTED; AN UNREADABLE TURN IS NOT NARRATED. `result.error`
        // is the network, the refusal, the quota — everything the learner can act on, and it is
        // shown unchanged. What went with the owner's complaint (see the `decision.say` branch
        // below) is the invented fallback for the remaining case, which told them a sentence about
        // Nemesis's state instead of anything about their request.
        if (result.error) setError(result.error);
        return null;
      }

      // 🔴 EVERY TURN ANSWERS THIS, INCLUDING BY CLEARING IT. A test that survived into the next
      // submission would be the mode §38 bans; setting rather than only-setting-true is what makes
      // that structural instead of a habit.
      //
      // 🔴 THE "ONLY ON A STUDY TURN" HALF OF THIS COMMENT WAS TRUE UNTIL 2026-08-24 and went with
      // the rigid lane. A "quiz me" is an ordinary reply now, so gating on `study` made the chips
      // unreachable — a feature that shipped and could never fire again. What stops it becoming a
      // mode is the clearing above, not the turn's kind.
      setTestRequested(decision.wantsTest);
      // 🔴 CLEARED ON EVERY TURN, LIKE THE REQUEST ITSELF. Questions from two turns ago answering
      // under a third turn's ask is the "mode" shape §38 exists to prevent.
      setTestQuestions(decision.wantsTest ? decision.check : null);
      const thisTurn = (checkTurn.current += 1);

      // 🔴🔴 THE DIAGRAM ARRIVES AFTER THE CHIPS, AND THAT IS DELIBERATE (owner 2026-08-25: image
      // occlusion "as part of its testing tools"). Finding a licensed diagram and having vision
      // locate its labelled parts is a repository search plus a paid model call — seconds, not
      // milliseconds. Awaiting it before showing the check would hold the whole reply hostage to
      // a picture that may not exist, so the text questions go up immediately and the picture
      // questions join them when they land.
      //
      // 🔴 IT NEVER THROWS AND NEVER BLOCKS. `findLabelledFigure` returns null for every failure —
      // no picture, no labels, vision off, wrong scale — and `withFigureQuestions` then returns
      // the run untouched. A check that could have had a diagram and does not is a smaller check;
      // a check that crashed is no check.
      if (decision.wantsTest && decision.checkFigure) {
        void findLabelledFigure(decision.checkFigure).then((figure) => {
          if (!figure) return;
          // 🔴 THE TURN GUARD IS THE WHOLE REASON THIS IS SAFE. Between the request and the reply
          // the learner may have sent another turn. Applying now would put this turn's diagram
          // under the next turn's questions — the cross-turn bleed the clearing above exists to
          // prevent, arriving through the back door of an async result.
          if (checkTurn.current !== thisTurn) return;
          setTestQuestions((current) => withFigureQuestions(current, figure));
        });
      }

      // 🔴🔴 REMEMBERED BESIDE THE TURN, NEVER INSTEAD OF IT, AND NEVER AWAITED BY IT. Everything
      // below runs exactly as it would on a turn that noticed nothing durable; a memory write that
      // failed, or a table that has not been migrated yet, must not cost the learner their answer.
      // `rememberLine` swallows its own failures for the same reason.
      //
      // 🔴 EMPTY ON ALMOST EVERY TURN. `readRemembered` already capped and validated the list, so
      // there is nothing to decide here — this is the write, not a second gate on what may be
      // stored. The gates live in the contract paragraph and in `readRemembered`.
      if (decision.remember.length > 0 && uid) {
        void Promise.all(
          decision.remember.map((fact) =>
            rememberLine(uid, { kind: fact.kind, sourceCanvasId: id, statement: fact.statement }),
          ),
        ).then((written) => {
          // 🔴🔴 SAID ONLY WHEN SOMETHING WAS ACTUALLY WRITTEN — owner 2026-08-24, asking whether
          // memory works "like it does in ChatGPT where you can see the memory prompt and the
          // updates". `rememberLine` returns false for a near-duplicate, and announcing "memory
          // updated" for a fact already held would train the learner to ignore the notice, which is
          // the one thing a transparency signal cannot afford. Counting the trues is the difference.
          const saved = written.filter(Boolean).length;
          if (saved > 0) setMemoryNotice(saved);
        });
      }

      // 🔴 THE COURSE IS APPLIED BESIDE THE TURN, NEVER INSTEAD OF IT. Everything below runs
      // exactly as it does on a turn with no course in it — `begin`, `command` and the aside are
      // untouched — which is what keeps a course a SCOPE the canvas gains rather than a mode it
      // enters. Applied here, before the branches, only so a refusal can ride the same reply the
      // turn was going to show anyway: a Course press that failed and said nothing would be a
      // control that does nothing, this codebase's most-repeated defect.
      //
      // 🔴 AND IT NEVER FORCES `study`. `decision.then` was decided by `asAction`'s three-value
      // whitelist before this line runs; a reply turn that also asked for a course stays a reply.
      let courseNote = "";
      if (decision.curriculumFor) {
        const applied = await applyCurriculumPlan(id, latest.current, decision.curriculumFor, new Date().toISOString());
        if (applied.ok) setCoursePlan(applied.plan);
        else if (applied.refusal === "no-curriculum-for-subject") {
          // 🔴 A LIBRARY MISS IS NOT A REFUSAL ANY MORE — owner decision three, 2026-08-23:
          // "always deep-research; a course is worth the wait." The pass rides the same busy
          // caption machinery as the turn's own search, and every label below is emitted by a
          // step genuinely running (thinking-phases.ts's rule). Only research FAILING is a
          // refusal now, and it says so beside the reply like every other one.
          const researched = await researchCurriculum(id, decision.curriculumFor, {
            onStep: (label) => setBusy({ blockIds: [], kind: "command", label }),
          });
          setBusy({ kind: null });
          if (researched.ok) {
            setCoursePlan(
              await applyResearchedPlan(id, latest.current, researched.skeleton, researched.sources, new Date().toISOString()),
            );
          } else {
            courseNote = researchRefusalLine(researched.refusal, decision.curriculumFor);
          }
        } else courseNote = courseRefusalLine(applied.refusal, decision.curriculumFor);
      }

      // 🔴 HANDED BACK, NOT ACTED ON. Which passage a rewrite lands on is §11's referent rule, and
      // the runtime state it reads (unread chunk, awaiting demonstration) lives in the component.
      // See `routeRewrite` in lib/learn/canvas-phrases.ts.
      if (decision.then === "rewrite") return decision;
      // 🔴🔴 PARKING IS DECIDED HERE, NOT BY THE MODEL, AND THE THREE REFUSALS ARE THE FEATURE.
      // `turn-router.ts` returns a question beside the action it parks and defers nothing itself;
      // this is the caller it says owns the parking. A card is hosted only when the learner owes
      // nothing (two things awaiting an answer at once is the shape `canvas-hosting.ts` exists to
      // make impossible), when this is not already the resumed turn, and when the question survived
      // parsing. Every refusal falls through to running `then` immediately, which is always a legal
      // reading of a clarification: going ahead is what Nemesis would have done without asking.
      if (decision.question && mayAsk && !surroundings.answerOwed) {
        // The chip rides into the parked turn — see `clarifying`'s own comment.
        setClarifying({ capability: capability ?? null, question: decision.question, said });
        // The sentence above the card. `reply` rather than `opening` because this turn IS the
        // reply: nothing is about to transition underneath it, and the learner is being asked to
        // look at the card rather than being introduced to a lesson.
        if (decision.say) {
          setAside({
            blockId: null,
            kind: "reply",
            question: said,
            consulted: result.consulted,
            sources: result.sources,
            text: decision.say,
            topic: decision.topic ?? undefined,
            visuals: decision.visuals,
          });
        }
        return decision;
      }

      // 🔴🔴 A TOPIC NEVER STARTS A LESSON ANY MORE — OWNER ORDER, 2026-08-24. This branch used to
      // split on `isPreContent`: with nothing on the canvas it called `begin()`, which seized the
      // screen, swapped the composer for an answer box and started asking template-generated recall
      // questions. That was the "super rigid teaching flow" the owner asked to be removed, and the
      // fix is to simply not enter it: a bare topic falls through to the reply below and gets
      // TAUGHT there, in the conversation, with the full set of figures available.
      //
      // 🔴 THE DOCUMENT HALF SURVIVES, BECAUSE IT IS A DIFFERENT THING. Working through material
      // the learner actually attached was never the complaint, and it is where the laid-out study
      // document comes from. So `study` is honoured only when there IS something to work on.
      //
      // 🔴 THE GUARD IS HERE AND NOT ONLY IN THE PROMPT, WHICH IS THE WHOLE POINT. `turn-router.ts`
      // now tells the model that a bare topic is a `reply`, but a prompt is a request and this is a
      // rule: a model that says "study" anyway on an empty canvas gets a conversation, not a
      // takeover. Verified by `no-rigid-lane.test.ts`.
      if (decision.then === "study" && !isPreContent(latest.current.state)) {
        // 🔴 THE LEARNER'S OWN WORDS, KEPT FOR THIS SITTING ONLY — the document controller needs the
        // difference between "work through this" and "test me on this", which the topic alone
        // cannot carry. Not persisted: a stored one would still be steering next week.
        setOpening(said);
        // 🔴 STAMPED BEFORE THE WRITE, NOT AFTER IT. `materialOwnsAttention` compares the action
        // that was in flight WHEN THE LEARNER ASKED against the one in flight now; reading it
        // after the round trip would record whichever action the policy had moved on to.
        onStudyDocument?.();
        await command(said, staged ? [staged] : []);
        return decision;
      }

      // 🔴 THE ANSWER COMES BACK IN FULL, WHATEVER THE OFFER SAYS. `offer` changes one line of copy
      // above a button the learner may ignore; it never shortens or withholds what they asked for.
      // Offering is not seizing.
      // 🔴🔴 A TURN THAT SPOKE NO PROSE ENDS QUIETLY — OWNER, 2026-08-24: *"[it] keeps saying that
      // annoying thing, 'Nemesis had nothing to add'. Why is that even there? I don't even want
      // that."* It was an error banner for something that is usually not an error: a turn whose
      // work WAS the thing on screen — the check chips, a drawing, a write — with no sentence
      // beside it. Announcing that as a failure put a complaint above an answer that had arrived.
      //
      // 🔴 THE CAUSE WAS FIXED IN THE PROMPT RATHER THAN HERE. `turn-router.ts` now says a check
      // never replaces the answer, which is what produced the empty `say` the owner kept meeting.
      // This stops the leftover case from shouting; it does not hide a failed request, which
      // arrives as `result.error` above and is still shown.
      //
      // 🔴🔴🔴 BUT SILENCE IS ONLY CORRECT WHEN SOMETHING ELSE IS ACTUALLY ON SCREEN, AND THE FIRST
      // VERSION OF THIS DID NOT CHECK. `if (!decision.say) return null` traded an annoying sentence
      // for a BLANK CANVAS: measured on production minutes later, "Show me a diagram of meiosis"
      // came back with no prose and the learner watched an empty page for a minute — no error, no
      // picture, nothing to retry. Stored canvas e5e484dd: moment kind `user`, assistantText null.
      // That is WORSE than the message it replaced, because the message at least said the turn was
      // over.
      //
      // So the question is whether the turn PRODUCED anything, not whether it spoke:
      //   • prose           → render it, with whatever it drew
      //   • no prose, drew  → render the drawing. The picture IS the answer, which is exactly the
      //                       "show me a diagram" case this lane exists for.
      //   • no prose, asked → the chips are their own surface and are already mounted; stay quiet.
      //   • none of those   → nothing happened, and saying so is the honest outcome. The sentence
      //                       describes THEIR request rather than Nemesis's state, which is what
      //                       was actually wrong with "Nemesis had nothing to add".
      const drew = decision.visuals.length > 0;
      const asked = (decision.check?.questions.length ?? 0) > 0;
      if (!decision.say && !drew) {
        if (!asked) setError("That came back empty. Ask again and it will retry.");
        return null;
      }
      setAside({
        // Under the passage when they staged one, at the top of the canvas when they did not.
        blockId: staged?.id ?? null,
        // 🔴 THE ONE THAT DISPLACES. This branch is reached only when the router said `reply`, which
        // means the learner asked something rather than asking to be taught — so this text IS the
        // turn, and whatever the policy was showing steps aside for it. The `study` branch above
        // writes `opening` for the opposite reason.
        kind: "reply",
        question: said,
        consulted: result.consulted,
        sources: result.sources,
        text: [decision.say, courseNote].filter(Boolean).join("\n\n"),
        topic: decision.topic ?? undefined,
        visuals: decision.visuals,
      });
      return decision;
    },
    // 🔴 `begin` LEFT THIS LIST WHEN THE TOPIC BRANCH DID. It is still exported and still runs —
    // but only from `learnFromAside`, where the learner deliberately asks for the laid-out lesson.
    // Nothing a conversation says can start one any more.
    [command, requireUid],
  );

  /**
   * The learner settled the decision Nemesis was waiting on. Record it, then finish the turn.
   *
   * 🔴🔴 IT NEVER TOUCHES EVIDENCE, AND THAT IS THE POINT OF THE WHOLE SEPARATE PATH. `answerActiveTask`
   * and `policy.submit` reach a judge and write a `learner_evidence` row against an objective.
   * Picking "Academic" over "Overview" demonstrates nothing about what somebody knows; filing it as
   * knowledge would put a preference in the durable record the retention model reads. So this
   * function shares no line with either of them, and `composerIntent` returns a different kind so
   * that a call site cannot reach the wrong one by accident.
   *
   * 🔴 THE ANSWER IS FED BACK AS A FACT AND THE ORIGINAL UTTERANCE IS RE-ASKED. See `clarifying`.
   */
  const answerClarification = useCallback(
    async (
      text: string,
      surroundings: TurnSurroundings,
      onStudyDocument?: () => void,
    ): Promise<TurnDecision | null> => {
      const pending = clarifying;
      if (!pending) return null;
      const answer = readClarifyAnswer(pending.question, text);
      // 🔴 AN EMPTY SUBMISSION IS NOT AN ANSWER AND MUST NOT DISCARD THE QUESTION. Clearing here
      // would leave the learner staring at a card that had silently stopped mattering.
      if (!answer) return null;
      const fact = clarifyAnswerFact(pending.question, answer);
      setClarified((facts) => [...facts, fact]);
      setClarifying(null);
      setAside(null);
      return converse(
        pending.said,
        // The fact is in the packet on THIS turn, not merely from the next one. `clarified` state
        // has not committed yet when this runs, and a resumed turn that could not see its own
        // answer is the one turn where it matters most.
        { ...surroundings, answerOwed: false, clarified: [...surroundings.clarified, fact] },
        onStudyDocument,
        // No staged passage on a resumed turn — the card, not a selection, is what held it.
        null,
        // 🔴 THE ORIGINAL SUBMISSION'S CAPABILITY, NOT null. This used to drop it as "consumed",
        // which was harmless while the chip was only a hint — and fatal once `courseGate` made it
        // the ONLY course door: the one flow that is CERTAIN to want a course (press Course, get
        // asked "how deep?", answer) would resume without the chip and the gate would drop the
        // build. The card paused the submission; resuming it is the same submission finishing.
        pending.capability,
        false,
      );
    },
    [clarifying, converse],
  );

  /**
   * The learner dismissed the question instead of answering it.
   *
   * 🔴 IT DOES NOT RESUME THE TURN, AND THAT IS THE HONEST READING. Answering says "build it this
   * way"; closing the card says "not now". Guessing an answer and building anyway would be the
   * software deciding the thing it just admitted it could not decide. The learner's next sentence
   * starts a fresh turn, which is what dismissing a question means everywhere else.
   */
  const clearTest = useCallback(() => {
    setTestRequested(false);
    setTestQuestions(null);
    // 🔴 A DISMISSAL INVALIDATES A DIAGRAM STILL IN FLIGHT. Without this, closing a check and then
    // waiting a few seconds re-opens it with picture questions in it — a test the learner has
    // already declined reappearing on its own.
    checkTurn.current += 1;
  }, []);

  const clearMemoryNotice = useCallback(() => setMemoryNotice(0), []);

  const dismissClarification = useCallback(() => {
    setClarifying(null);
  }, []);

  /**
   * Cross the boundary from information to learning only after the learner asks to.
   *
   * Ordinary questions remain ordinary answers. This action is the strong contextual evidence
   * that the same question should now become a learning goal. Any live pages the answer actually
   * cited are ingested through `attachUrl`, so web-grounded learning and uploaded-course learning
   * converge on the same durable source and knowledge substrate.
   */
  const learnFromAside = useCallback(async () => {
    const current = aside;
    if (!current || current.blockId !== null) return;
    // 🔴 THE SUBJECT THE MODEL READ, AND ONLY THAT. `begin` takes this as the canvas TITLE, and
    // falling back to the raw question is what left canvases called "what is incretin?". The Learn
    // this button is already gated on `aside.topic` existing, so the fallback was never reachable
    // for a good reason — only for a bad one.
    const topic = (current.topic ?? "").trim();
    if (!topic) return;
    const sources = current.sources ?? [];
    setAside(null);
    for (const source of sources) await attachUrl(source.url);
    canvasCapture("canvas_learning_started_from_answer", latest.current, { webSources: sources.length });
    begin(topic);
  }, [aside, attachUrl, begin]);

  const markKnown = useCallback(
    (blockId: string, known: boolean) => {
      update((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, known } : block)),
      }));
    },
    [update],
  );

  const toggleCollapsed = useCallback(
    (blockId: string, collapsed: boolean) => {
      update((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, collapsed } : block)),
      }));
    },
    [update],
  );

  // ------------------------------------------------------------------- recall

  // 🔴 THE SIX-STAGE ENTRY POINTS ARE DELETED (owner, §38): startRecall, startTest, startRetest,
  // startChoiceTest, finishTest, relearn and finish. Each had exactly ONE call site, all inside the
  // handler behind "Retest me" / "Fix my weak spots" / "I've read this" — controls #585 proved
  // unreachable in every observable state, and which the owner has now ruled out by description:
  // "The only button should be 'continue' below reading passages, thats it."
  //
  // Nothing routes to them any more. The reading-pace half came back as `Continue` (§38/§39); the
  // rest are behaviours the system owes automatically — §18 makes re-testing its job and objective
  // ordering already targets weak spots — so a button for either was the learner managing the
  // learning system (§26).

  const gradeRecall = useCallback(
    async (
      cardId: string,
      grade: "again" | "hard" | "good" | "easy",
      evidence?: {
      said?: string;
      via?: LearnerInputModality;
      revealed?: boolean;
      evaluation?: ResponseEvaluation;
    },
    ) => {
      const card = latest.current.recall.find((candidate) => candidate.id === cardId);
      // The same Postgres function the Study tab grades through, so the scheduling is real.
      void gradeStudyCard(card?.studyCardId, grade);
      update((current) => {
        const recallResults = [
          ...current.recallResults.filter((result) => result.cardId !== cardId),
          {
            cardId,
            conceptId: card?.conceptId ?? null,
            at: new Date().toISOString(),
            grade,
            ...(evidence ?? {}),
          },
        ];
        // The deck is finished the moment the last card is graded — the funnel needs the
        // "got through recall" number, not just the "started recall" one.
        if (current.recall.length > 0 && recallResults.length >= current.recall.length) {
          canvasCapture("canvas_recall_completed", current, {
            cards: current.recall.length,
            again: recallResults.filter((result) => result.grade === "again").length,
          });
        }
        return { ...current, recallResults };
      });
    },
    [update],
  );

  /** Retrieval by producing something, rather than by revealing and marking yourself (§31).
   *
   *  🔴 THE ORDER HERE IS THE ARCHITECTURE. The performance is evaluated first, that evidence is
   *  what gets stored, and only then is a review grade derived from it. Deriving the grade first
   *  and keeping only that would leave a spaced-repetition app with a text box on it — the
   *  evaluation is the thing Nemesis is actually for. */
  const attemptRecall = useCallback(
    async (cardId: string, text: string, via: LearnerInputModality) => {
      const said = text.trim();
      if (!said) return;
      const card = latest.current.recall.find((candidate) => candidate.id === cardId);
      if (!card) return;

      const id = requireUid();
      if (!id) {
        await gradeRecall(cardId, deriveSchedulingSignal({ evaluation: null }).grade, { said, via });
        return;
      }

      recordEvent({
        type: "response_submitted",
        ...(card.conceptId ? { conceptIds: [card.conceptId] } : {}),
        payload: { via, stage: "recall" },
      });

      setJudging(cardId);
      const result = await evaluateLearningResponse(
        id,
        latest.current,
        cardAsTask(latest.current, card, { text: said, via }),
      );
      setJudging(null);

      const evaluation = result.value;
      if (!evaluation) canvasCapture("canvas_judge_failed", latest.current, { cardId });
      else {
        canvasCapture("canvas_response_judged", latest.current, {
          verdict: evaluation.verdict,
          errorType: evaluation.errorType ?? null,
          confidence: evaluation.confidence,
          via,
          conceptId: card.conceptId,
          stage: "recall",
        });
      }

      // Earlier successful retrievals of this same idea, from previous rounds on this canvas.
      // This is what separates "right just now" from "right again", and without it the
      // scheduler could never award Easy — the rule would exist only in its tests.
      //
      // `timeSinceLastExposureMs` is deliberately NOT passed: nothing on a RecallResult records
      // when it happened, and inventing a gap from the canvas's own timestamps would be a
      // guess dressed as a measurement. Repeat success is the honest half of the same test.
      const priorSuccesses = card.conceptId
        ? latest.current.recallResults.filter(
            (entry) =>
              entry.cardId !== cardId &&
              entry.conceptId === card.conceptId &&
              entry.evaluation &&
              verdictIsPass(entry.evaluation.verdict),
          ).length
        : 0;

      const signal = deriveSchedulingSignal({ evaluation, hintsUsed: 0, priorSuccesses });
      await gradeRecall(cardId, signal.grade, {
        said,
        via,
        ...(evaluation ? { evaluation } : {}),
      });
    },
    [gradeRecall, recordEvent, requireUid],
  );

  /** They asked to see the answer instead of attempting it.
   *
   *  §7: that is itself evidence — we did not obtain a retrieval — and it is recorded as such.
   *  The learner is deliberately NOT asked how well they knew it afterwards: someone who has
   *  just read the answer is the worst available judge of whether they could have produced it,
   *  and asking puts the metacognitive work back on them for a worse signal than we already have. */
  const revealRecall = useCallback(
    async (cardId: string) => {
      const signal = deriveSchedulingSignal({ evaluation: null, revealed: true });
      await gradeRecall(cardId, signal.grade, { revealed: true });
    },
    [gradeRecall],
  );

  // --------------------------------------------------------------------- test

  const runTest = useCallback(
    async (state: "test" | "retest", format: RetrievalFormat = "free") => {
      // Retired — see `startRecall`. This one call covers `startTest`, `startRetest` AND
      // `startChoiceTest`, which all delegate here, so there is no fourth entrance behind them.
      if (!canTransition(latest.current.state, state)) return;
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "test", label: state === "retest" ? "Writing your retest" : "Writing your test" });
      const retest = state === "retest";
      const result = await generateTest(
        id,
        latest.current,
        retest ? RETEST_QUESTIONS : TEST_QUESTIONS,
        format,
        retest ? latest.current.weakConceptIds : undefined,
      );
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        canvasCapture("canvas_generation_failed", latest.current, { stage: state, format });
        return;
      }
      captureStateChange(latest.current, "test");
      setCursor(0);
      update((current) => ({
        // A retest replaces the evidence about the concepts it re-assesses — including the
        // recall grades. Without that a single "Again" kept a concept weak forever and the
        // canvas could never be finished.
        //
        // The plain-test branch clears responses alongside answers for the same reason: a new
        // set of questions makes the old ones' evidence stale, and evidence that outlives its
        // round is what made this state unreachable the first time.
        ...(retest
          ? clearEvidenceForRetest(current, current.weakConceptIds)
          : { ...current, answers: [], responses: [] }),
        questions: result.value ?? [],
        state,
      }));
    },
    [requireUid, update],
  );


  const answer = useCallback(
    (questionId: string, picked: number) => {
      update((current) => {
        const question = current.questions.find((candidate) => candidate.id === questionId);
        // Only a choice question has an option to have picked. A stray call against a free
        // prompt is a bug upstream, and scoring it against `undefined` would silently mark it
        // wrong rather than showing that bug.
        if (!question || question.format !== "choice") return current;
        return {
          ...current,
          answers: [
            ...current.answers.filter((entry) => entry.questionId !== questionId),
            { questionId, picked, correct: picked === question.answer },
          ],
        };
      });
    },
    [update],
  );

  /** Record what the learner said, then ask the judge what it showed.
   *
   *  The answer is stored BEFORE the model is called and is never removed if the call fails.
   *  Someone who just explained something at length must not lose their words because a judge
   *  timed out — an unjudged response simply carries no evidence (see diagnose). */
  const respond = useCallback(
    async (questionId: string, text: string, via: LearnerInputModality, tookMs?: number) => {
      const said = text.trim();
      if (!said) return;

      const question = latest.current.questions.find((candidate) => candidate.id === questionId);
      if (!question || question.format !== "free") return;

      update((current) => ({
        ...current,
        responses: [
          ...current.responses.filter((entry) => entry.questionId !== questionId),
          {
            questionId,
            // Captured here, not derived later: the question this came from is replaced on the
            // next round, and by then nothing can say what this answer was evidence about.
            ...(question.conceptId ? { objectiveIds: [question.conceptId] } : {}),
            at: new Date().toISOString(),
            text: said,
            via,
            ...(tookMs !== undefined ? { tookMs } : {}),
          },
        ],
      }));

      recordEvent({
        type: "response_submitted",
        ...(question.conceptId ? { conceptIds: [question.conceptId] } : {}),
        payload: { via, stage: "test", ...(tookMs !== undefined ? { tookMs } : {}) },
      });

      const id = requireUid();
      if (!id) return;
      setJudging(questionId);
      const result = await evaluateLearningResponse(
        id,
        latest.current,
        questionAsTask(latest.current, question, { text: said, via, ...(tookMs !== undefined ? { tookMs } : {}) }),
      );
      setJudging(null);

      if (!result.value) {
        // Deliberately not surfaced as a page error: the learner did their part, and "we could
        // not read that" is a fact about us, not a verdict about them.
        canvasCapture("canvas_judge_failed", latest.current, { questionId });
        return;
      }

      const evaluation = result.value;
      canvasCapture("canvas_response_judged", latest.current, {
        verdict: evaluation.verdict,
        errorType: evaluation.errorType ?? null,
        confidence: evaluation.confidence,
        via,
        conceptId: question.conceptId,
        stage: "test",
      });
      update((current) => ({
        ...current,
        responses: current.responses.map((entry) =>
          entry.questionId === questionId ? { ...entry, evaluation } : entry,
        ),
      }));

      // ── The teaching loop ────────────────────────────────────────────────
      //
      // 🔴 This is the step that makes the canvas adaptive rather than a graded quiz.
      //
      // 🔴🔴 THE DECISION IS THE JUDGE'S, NOT A LADDER'S (owner 2026-08-22: "deepseek needs to
      // pick the next move"). This comment used to say "the decision is deterministic" and
      // described an `if` ladder over verdict and confidence. The move now arrives ON the
      // evaluation — chosen by the model that read the answer — and `determineNextCognitiveAction`
      // enforces only what that model cannot see from one reply: a revealed answer, a missing
      // reading, the attempt cap, and a move with an empty list to act on.
      //
      // 🔴 WHAT IS UNCHANGED IS THE COST. There is still no second model call: the move rides home
      // on the evaluation that had to be made anyway, so this stays one call to read and one to
      // WRITE the correction, exactly as before.
      const objectiveId = question.conceptId;
      const action = determineNextCognitiveAction({
        evaluation,
        attempts: latest.current.correctiveAttempts[objectiveId ?? ""] ?? 0,
      });
      canvasCapture("canvas_action_chosen", latest.current, {
        action: action.type,
        because: action.because,
        verdict: evaluation.verdict,
        conceptId: objectiveId,
      });
      if (!actionMutatesCanvas(action) || !objectiveId) return;

      setBusy({ kind: "relearn", label: "Working through that with you" });
      const change = await applyTeachingAction(id, latest.current, {
        action,
        objectiveId,
        prompt: question.q,
        said,
        demonstrated: evaluation.demonstrated,
      });
      setBusy({ kind: null });
      if (!change.value) return;

      const { ops, followUp } = change.value;
      // What the correction actually said, so it can sit beside their answer as well as in the
      // document. Taken from the ops we just validated rather than asked for separately.
      const taught = ops
        .map((op) =>
          op.operation === "replace_block"
            ? op.content
            : op.operation === "insert_before" || op.operation === "insert_after"
              ? op.block.content
              : op.operation === "annotate_block"
                ? op.note
                : "",
        )
        .filter(Boolean)
        .join("\n\n");

      update((current) => {
        const mutated = applyOps(current, ops);
        // The follow-up goes immediately after the prompt it follows up, so "Next" lands on it
        // rather than on whatever the generator happened to put there.
        const at = current.questions.findIndex((entry) => entry.id === questionId);
        const questions = followUp
          ? [
              ...current.questions.slice(0, at + 1),
              followUp,
              ...current.questions.slice(at + 1),
            ]
          : current.questions;
        return {
          ...mutated,
          questions,
          correctiveAttempts: {
            ...current.correctiveAttempts,
            [objectiveId]: (current.correctiveAttempts[objectiveId] ?? 0) + 1,
          },
          responses: current.responses.map((entry) =>
            entry.questionId === questionId
              ? {
                  ...entry,
                  action: action.type,
                  ...(taught ? { taught } : {}),
                  ...(followUp ? { followUpQuestionId: followUp.id } : {}),
                }
              : entry,
          ),
        };
      });
    },
    [recordEvent, requireUid, update],
  );


  // ---------------------------------------------------------------- relearn



  const reset = useCallback(() => {
    const fresh = newCanvas();
    latest.current = fresh;
    setCanvas(fresh);
    canvasCapture("canvas_created", fresh);
  }, []);

  // ── The one thing being asked, and the one way to answer it ─────────────
  //
  // Derived rather than stored: the prompts themselves live on the canvas, the cursor says
  // which one, and everything else follows. Storing a duplicate of the current prompt would be
  // one more thing to keep in step with a document the teaching loop rewrites mid-round.
  const activeTask: ActiveTask | null = (() => {
    if (canvas.state === "recall") {
      const card = canvas.recall[cursor];
      if (!card) return null;
      return {
        kind: "recall",
        id: card.id,
        prompt: card.front,
        placeholder: RECALL_PLACEHOLDER,
        index: cursor,
        total: canvas.recall.length,
        answered: canvas.recallResults.some((entry) => entry.cardId === card.id),
      };
    }
    if (canvas.state === "test" || canvas.state === "retest") {
      const question = canvas.questions[cursor];
      if (!question) return null;
      return {
        kind: "question",
        id: question.id,
        prompt: question.q,
        // A multiple-choice prompt is answered by picking, not by typing, so the composer stays
        // a place to ask about it rather than pretending to be the answer field.
        placeholder: question.format === "free" ? RESPONSE_PLACEHOLDER[question.task] : "",
        index: cursor,
        total: canvas.questions.length,
        answered:
          question.format === "choice"
            ? canvas.answers.some((entry) => entry.questionId === question.id)
            : canvas.responses.some((entry) => entry.questionId === question.id),
      };
    }
    return null;
  })();

  // Read through a ref for the same reason `latest` exists: these handlers are called from
  // async paths and from event listeners, where a value captured at render time can already be
  // a round out of date.
  const activeTaskRef = useRef(activeTask);
  activeTaskRef.current = activeTask;

  const advanceTask = useCallback(() => setCursor((current) => current + 1), []);

  const answerActiveTask = useCallback(
    async (text: string, via: LearnerInputModality, tookMs?: number) => {
      const task = activeTaskRef.current;
      if (!task || task.answered) return;
      if (task.kind === "recall") await attemptRecall(task.id, text, via);
      else await respond(task.id, text, via, tookMs);
    },
    [attemptRecall, respond],
  );

  /** §24: not the same thing as showing the answer. "I don't know" is the learner reporting
   *  their state, which is evidence; a reveal shortcut only records that they read something.
   *  Either way no retrieval was obtained, so the scheduler hears the same thing — but this
   *  path is chosen deliberately rather than reached by pressing space. */
  const admitUnknown = useCallback(async () => {
    const task = activeTaskRef.current;
    if (!task || task.answered) return;
    canvasCapture("canvas_unknown_admitted", latest.current, { kind: task.kind, id: task.id });
    recordEvent({ type: "unknown_admitted", payload: { kind: task.kind, id: task.id } });
    if (task.kind === "recall") await revealRecall(task.id);
    else await respond(task.id, "I don't know.", "typed");
  }, [recordEvent, respond, revealRecall]);

  /** Shared preamble for every selection call: who is asking, and clearing the last error. */
  const beginSelection = useCallback(() => {
    const id = requireUid();
    // 🔴 Reported in the popover, not only in the page-level error strip. The learner asked about
    // one word and is looking at that word; an explanation that appears at the bottom of the
    // screen is an explanation they will not connect to what they just did.
    if (!id) setSelectionError("Sign in to use the canvas.");
    else {
      setSelectionError(null);
      setSelectionBusy(true);
    }
    return id;
  }, [requireUid]);

  /** Underline a word the learner has now had explained, so the page shows what they asked about.
   *
   *  🔴 A WORD, NOT A SENTENCE. Underlining a whole rewritten paragraph is not what was asked for,
   *  and `LOOKUP_MARK_MAX_CHARS` is what keeps a dragged passage out of the glossary marks. */
  const markLookedUp = useCallback((selectedText: string) => {
    const word = selectedText.trim();
    if (!word || word.length > LOOKUP_MARK_MAX_CHARS) return;
    setLookedUp((known) => (known.some((k) => k.toLowerCase() === word.toLowerCase()) ? known : [...known, word]));
  }, []);

  /** What a marked vocabulary word means. The click IS the question, so no words are involved and
   *  the answer is worth remembering — this is the one lookup `recordLookup` caches. */
  const defineSelection = useCallback(
    async (selection: CanvasSelection) => {
      const id = beginSelection();
      if (!id) return null;
      markLookedUp(selection.selectedText);
      recordEvent({
        type: "definition_opened",
        ...(selection.blockId ? { blockId: selection.blockId } : {}),
        ...(selection.conceptIds ? { conceptIds: selection.conceptIds } : {}),
        selectedText: selection.selectedText,
      });
      const result = await apiDefineSelection(id, latest.current, selection);
      setSelectionBusy(false);
      if (!result.value) {
        setSelectionError(result.error);
        return null;
      }
      return result.value;
    },
    [beginSelection, markLookedUp, recordEvent],
  );

  /**
   * Rewrite one passage in place, because the turn router read the learner's sentence and returned
   * `then: "rewrite"`.
   *
   * 🔴🔴 IT GOES THROUGH `askSelection` LIKE EVERYTHING ELSE, AND CARRIES WHAT THEY ACTUALLY TYPED.
   * This used to call a second implementation, `simplifySelection`, whose prompt asked for "the same
   * meaning, plainer construction" and nothing else — so the learner's sentence was read once, by
   * the router, to decide THAT a rewrite was wanted, and then discarded before deciding WHICH one.
   * "Make this shorter", "add an example here" and "say this more simply" all produced the same
   * simplification. The words go the whole way now, and there is one rewrite implementation instead
   * of two free to drift.
   *
   * 🔴 AND IT CAN COME BACK AS AN ANSWER. The router decided from the composer packet; this call
   * also sees the block itself, and may reasonably conclude the passage should stand. That lands in
   * the aside — the same place a conversational reply lands — because the alternative is a turn
   * where the learner typed something and nothing at all happened.
   */
  const rewriteSelection = useCallback(
    async (selection: CanvasSelection, request: string) => {
      const id = beginSelection();
      if (!id) return;
      // 🔴 THE PASSAGE SHOWS THE WORK, NOT THE POPOVER (§11). Unlike a typed request from the ask
      // box, this path already knows a rewrite is intended — the router said so — so the paragraph
      // can honestly show that it is the thing being worked on.
      if (selection.blockId) setBusy({ blockIds: [selection.blockId], kind: "rewrite" });
      const result = await askSelection(id, latest.current, selection, request);
      setSelectionBusy(false);
      setBusy({ kind: null });
      if (!result.value) {
        setSelectionError(result.error);
        return;
      }
      const outcome = result.value;
      recordEvent({
        type: outcome.kind === "rewrite" ? "simplification_requested" : "explanation_requested",
        ...(selection.blockId ? { blockId: selection.blockId } : {}),
        ...(selection.conceptIds ? { conceptIds: selection.conceptIds } : {}),
        selectedText: selection.selectedText,
      });
      // 🔴 `applyRewrite`, NOT `applyOps` — and the difference is a field that already existed and
      // was being thrown away. The rewrite has always returned `before`, captured at the moment of
      // the write. §11's *"keep the old version internally so it can be restored"* was one
      // assignment away the whole time.
      if (outcome.kind === "rewrite") update((current) => applyRewrite(current, outcome));
      else setAside({ blockId: selection.blockId ?? null, kind: "reply", text: outcome.answer.text });
    },
    [beginSelection, recordEvent, update],
  );

  /**
   * The learner highlighted something and typed what they wanted done about it.
   *
   * 🔴 THIS FUNCTION DOES NOT READ WHAT THEY TYPED. Whether the request means "tell me" or "change
   * this" is decided by the model (`askSelection`), and the two outcomes arrive already
   * distinguished. A branch here on the words would be the deleted toolbar growing back inside the
   * thing that replaced it.
   *
   * 🔴 THE PASSAGE GOES BUSY ONLY ONCE WE KNOW IT IS BEING REWRITTEN, which is after the reply. A
   * typed request cannot say in advance which of the two it is, so unlike `rewriteSelection` there
   * is nothing honest to show on the paragraph while the model is still deciding.
   */
  const askAboutSelection = useCallback(
    async (selection: CanvasSelection, request: string): Promise<SelectionReply | null> => {
      const id = beginSelection();
      if (!id) return null;
      const result = await askSelection(id, latest.current, selection, request);
      setSelectionBusy(false);
      if (!result.value) {
        setSelectionError(result.error);
        return null;
      }
      const outcome = result.value;
      recordEvent({
        type: outcome.kind === "rewrite" ? "simplification_requested" : "explanation_requested",
        ...(selection.blockId ? { blockId: selection.blockId } : {}),
        ...(selection.conceptIds ? { conceptIds: selection.conceptIds } : {}),
        selectedText: selection.selectedText,
      });
      if (outcome.kind === "rewrite") {
        update((current) => applyRewrite(current, outcome));
        return { kind: "rewritten" };
      }
      markLookedUp(selection.selectedText);
      return { kind: "answer", ...outcome.answer };
    },
    [beginSelection, markLookedUp, recordEvent, update],
  );

  /**
   * §12 — the learner says they have finished the chunk on screen.
   *
   * 🔴 TWO STORES, KEPT APART FROM THE FIRST LINE. The STATE (which material has been read) goes
   * on the block; the TIMING goes in the interaction log and nowhere else. §25 says the timing may
   * later be useful evidence about difficulty, and R3 says the reading itself is not evidence of
   * knowledge — so the timing must land somewhere that provably cannot become a verdict.
   * `canvas-events.ts` is exactly that place: it carries `activeElapsedMs` already (active time,
   * not wall clock, so walking away for 25 minutes does not read as deep thought), and
   * `canvas-events.test.ts` appends fifty events and asserts `diagnose()` is unchanged. Nothing
   * here can reach a judgement, and that is enforced rather than intended.
   *
   * 🔴 IT WRITES NO `learner_evidence`. Reading is not demonstration. `recordEvent` and
   * `recordEvidence` are different functions with different stores, and this calls the first.
   */
  const finishReadingChunk = useCallback(() => {
    recordEvent({ type: "reading_finished" });
    update((current) => finishReading(current, new Date().toISOString()));
  }, [recordEvent, update]);

  /** §11 — put a rewritten passage back the way it was written. Local, immediate and free: the
   *  previous wording is already on the block, so this costs no model call and cannot fail. */
  const restoreRewritten = useCallback(
    (blockId: string) => {
      recordEvent({ blockId, type: "simplification_restored" });
      update((current) => restoreBlock(current, blockId));
    },
    [recordEvent, update],
  );

  return {
    canvas,
    busy,
    error,
    aside,
    milestones,
    stage,
    work,
    lookedUp,
    /** The decision Nemesis is waiting on, or null. See `clarify-question.ts`. */
    clarifying: clarifying?.question ?? null,
    /** Decisions already settled this sitting, as facts for the packet. */
    clarified,
    answerClarification,
    dismissClarification,
    testQuestions,
    testRequested,
    clearTest,
    searchedDomains,
    memoryNotice,
    clearMemoryNotice,
    judging,
    opening,
    ready,
    dismissError: () => setError(null),
    /**
     * Say something short and true to the learner that is NOT a failure.
     *
     * 🔴 IT SHARES THE ERROR STRIP DELIBERATELY, AND THAT IS A DESIGN DECISION RATHER THAN REUSE.
     * The alternative is a second floating notice surface, which means two things can be on screen
     * saying two things, and §19 asks for an interface that almost disappears. The strip is already
     * neutral rather than red — bordered, secondary text — so it reads as a notice, and it is
     * dismissible by the same control.
     *
     * The one thing this must never become is a place to report internal state. A refusal here
     * names the action that resolves it; "ambiguous referent" is not the learner's problem.
     */
    showNotice: (message: string) => setError(message),
    recordMoment,
    restoreRewritten,
    finishReadingChunk,
    dismissAside: () => setAside(null),
    attachFiles,
    attachUrl,
    begin,
    command,
    askAbout,
    converse,
    coursePlan,
    learnFromAside,
    markKnown,
    toggleCollapsed,
    gradeRecall,
    attemptRecall,
    revealRecall,
    answer,
    respond,
    activeTask,
    advanceTask,
    answerActiveTask,
    admitUnknown,
    rename: (title: string) => update((current) => ({ ...current, title: title.slice(0, 300) })),
    /** Record a thing Nemesis just made for the learner (a deck, a note). Appends and
     *  persists; the Outputs tab and the Library both read what this writes. */
    addOutput: (output: CanvasOutput) =>
      update((current) => ({ ...current, outputs: [...(current.outputs ?? []), output] })),
    makeDeliverable,
    making,
    remove: async () => {
      // Written through before navigating away. The debounced autosave would otherwise fire
      // after the row is already flagged deleted and quietly resurrect it.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await deleteCanvas(uid, latest.current.id);
    },
    askAboutSelection,
    defineSelection,
    rewriteSelection,
    recordEvent,
    selectionBusy,
    selectionError,
    clearSelectionAnswer: () => setSelectionError(null),
    reset,
  };
}


