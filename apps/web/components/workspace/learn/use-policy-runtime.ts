"use client";

// The loop, closed.
//
//     source → knowledge → objective → learner state → policy → task
//       → real answer → real evaluator → append-only evidence → state again → policy again
//
// 🔴 THE LOOP IS OUTSIDE THE POLICY, AND THIS FILE IS THE OUTSIDE. `chooseNextTeachingAction` sees
// one state and returns one action; nothing in it remembers being called. What makes the canvas
// adaptive is that evidence changes the state, so the next call is answered differently. If a
// sequence ever appears in this product again it will appear here, as an index or a "step" — there
// is deliberately neither.
//
// 🔴 AND NOTHING HERE DECIDES WHAT THE ANSWER SHOWED. The evaluator does. This file carries text to
// it and carries a verdict back; a `text === expected` shortcut would be faster, wrong about
// capitalisation and synonyms, and — the part that matters — unable to tell a wrong answer from a
// specific competing belief, which is the one distinction that changes the teaching.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { labTrace } from "@/lib/lab/trace";

import { useAuth } from "@/components/AuthProvider";
import { teachingExperimentStartedAt } from "@/lib/env";
import { canvasCapture } from "@/lib/learn/canvas-analytics";
import { evaluateLearningResponse } from "@/lib/learn/canvas-api";
import type { LearnerInputModality, LearningCanvas, ResponseEvaluation } from "@/lib/learn/canvas-model";
import { ensureKnowledgeForCanvas, type CanvasKnowledge } from "@/lib/learn/canvas-knowledge";
import {
  applyFocus,
  availableTerritories,
  WHOLE_CANVAS,
  type FocusScope,
} from "@/lib/learn/canvas-focus";
import { tempoFor, type HostedTask } from "@/lib/learn/canvas-hosting";
import { expositionFor, NO_EXPOSITION, type Exposition } from "@/lib/learn/cognitive-mode";
import { citationsForKnowledge, type KnowledgeCitation } from "@/lib/learn/knowledge-citation";
import { emptyCoverage } from "@/lib/learn/knowledge-coverage";
import type { KnowledgeObject } from "@/lib/learn/knowledge-types";
import { policyAllowed, policyForced, type PolicyOverride } from "@/lib/learn/policy-override";
import { loadEvidence, recordEvidence, type StoredObjective } from "@/lib/learn/learner-store";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";
import { readSelection } from "@/lib/learn/choice-set";
import {
  asUnaidedProduction,
  completionPromptFor,
  evidenceForSubmission,
  judgementOf,
  objectiveAsTask,
  outcomeFor,
  outcomeForSelection,
  recognitionPromptFor,
  retrievalPromptFor,
  unobtainedEvidence,
  type RetrievalPrompt,
} from "@/lib/learn/objective-task";
import { supportedObjectives } from "@/lib/learn/policy-runtime";
import { controllerFor } from "@/lib/learn/strategy-registry";
import type { TeachingAct } from "@/lib/learn/attention-budget";
import {
  conflictingStrategy,
  resolveStrategy,
  teachingExperimentEligible,
  type StrategyOutcome,
  type TeachingDecision,
  type TeachingStrategyId,
} from "@/lib/learn/teaching-strategy";
import { performanceOf, type TeachingAction } from "@/lib/learn/teaching-policy";
import { isAdmissionOfNotKnowing, isEchoOfTheCue } from "@/lib/learn/response-admission";
import {
  KNOWLEDGE_DEADLINE_MS,
  THINKING_VISIBLE_AFTER_MS,
  type ThinkingPhase,
} from "@/lib/learn/thinking-phases";

import { useDelayedFlag } from "./use-delayed-flag";

export interface PolicyRuntime {
  /** 🔴 THREE VALUES, NOT TWO. Resolving a canvas's knowledge is a round trip, and defaulting to
   *  "unavailable" while it runs would paint the legacy stage — and run its effects — for a canvas
   *  the policy is about to contribute to. A flash of the wrong runtime is not cosmetic here: the
   *  six-stage machine starts generating a lesson.
   *
   *  🔴 `ready` REPLACED `active`, AND THE RENAME IS THE WHOLE OF STEP 7b. "Active" meant *this
   *  runtime has taken the page*; there is no such state any more. `ready` means *this runtime can
   *  contribute a task* — the Canvas owns the surface and decides where to put it. Ownership is
   *  still computed and still reported (`ownership`), it just no longer decides whether a question
   *  may appear. See docs/canvas-task-hosting.md §1. */
  status: "loading" | "ready" | "unavailable";
  /** A teaching controller is running right now — see the state's own note. */
  deciding: boolean;
  /**
   * What the policy is contributing right now, or null when it has nothing to ask.
   *
   * 🔴 THE THING THE CANVAS HOSTS, AND IT IS SEPARATE FROM `status` ON PURPOSE. Three different
   * facts used to collapse into "inactive": the policy is off, coverage refused the canvas, and
   * there is nothing supported to ask. Only the first and last mean "no task". Merging them is how
   * an empty task shell gets hosted over a document.
   */
  task: HostedTask | null;
  /**
   * Could the policy have taken this whole canvas? Reported, never gating presentation.
   *
   * 🔴 IT KEEPS ITS EXACT MEANING. `policyOwnsCanvas` still runs, still requires
   * `unrepresented === 0`, and is still what `forced` discloses against. What changed is that a
   * `false` here no longer hides the canvas's supported knowledge from the learner — that was
   * whole-page scaffolding, and §14.1 says the answer to "it owns nothing" is composition, never a
   * lower bar.
   */
  ownership: CanvasKnowledge["ownership"];
  /** The territory the learner is working in. Session-local; never persisted (§11). */
  focus: FocusScope;
  setFocus: (scope: FocusScope) => void;
  /** What the learner could focus on, built from knowledge this canvas actually holds. */
  territories: readonly { label: string; identityKeys: readonly string[] }[];
  /**
   * Every claim this canvas holds, so the Sources panel can say where each one came from.
   *
   * 🔴 TAKEN FROM `knowledge.objectives` RATHER THAN FROM `supported`, WHICH IS THE WIDER OF THE
   * TWO — but not by as much as it looks, and the difference is worth stating exactly rather than
   * overclaimed. `supportedObjectives` filters to association + recall. Today that filter removes
   * nothing: `objectivesForKnowledge` returns `[]` for every type except `association` and
   * hardcodes `recall`, so a knowledge object of any other kind resolves no objective and never
   * reaches this list either. The two sets are currently identical.
   *
   * 🔴 SO THIS IS NOT YET THE GUARANTEE IT WILL NEED TO BE. Whoever widens
   * `objectivesForKnowledge` should know that the disclosure still only sees claims that MINTED AN
   * OBJECTIVE — a knowledge object nobody can be asked about would stay invisible here whatever its
   * provenance. Reading it off the knowledge objects rather than off the resolved objectives is the
   * fix, and it is cheap; it is not made now because there is nothing to observe it with while five
   * of the six kinds mint nothing (contract R4). Filed, not fudged.
   *
   * What it does buy today is real: `supported` is a filter someone may reasonably narrow, and a
   * provenance statement must not quietly narrow with it.
   */
  claims: readonly KnowledgeObject[];
  /**
   * Every evidence row loaded for this canvas's supported objectives, newest last.
   *
   * 🔴 A RAW PASS-THROUGH OF STATE THIS HOOK ALREADY HOLDS (`loadEvidence`, above) — added for the
   * Minimap (§H4/§23: "The Minimap owns no state. It reads the learner-state store."). No new
   * computation happens here; `projectLearnerState` (`learner-evidence.ts`) is the only sanctioned
   * reader, and callers must fold it themselves rather than re-deriving a status from raw rows.
   */
  evidence: readonly LearnerEvidence[];
  decision: TeachingDecision | null;
  /**
   * Where the claim in `decision` can honestly be shown to have come from — empty when nowhere.
   *
   * 🔴 RESOLVED HERE BECAUSE THIS IS WHERE BOTH HALVES EXIST AT ONCE, AND NOWHERE ELSE DOES. The
   * conversion needs the durable anchors (on the knowledge, which arrives from the store) AND this
   * canvas's own excerpt list (on `canvas.sources`, which the knowledge has never seen). The policy
   * that chose the decision has no canvas; the knowledge object outlives every canvas. This hook
   * holds both, so it is the seam.
   *
   * 🔴 IT IS DERIVED FROM `decision`, NOT FROM THE OBJECTIVE OR THE PROMPT, AND THAT PAIRING IS THE
   * CORRECTNESS PROPERTY. The correction screen prints `decision.knowledge.statement`; these
   * citations come from `decision.knowledge.sourceAnchors`. One object, so the citation cannot
   * describe a claim other than the one on screen — the failure `declaredCognitiveMode` exists to
   * prevent, in its provenance form.
   *
   * 🔴 EMPTY MEANS RENDER NOTHING. It is not "unknown" and not "no source" — see
   * `citationsForKnowledge`, which refuses rather than guesses.
   */
  citations: readonly KnowledgeCitation[];
  /**
   * Which teaching controller is running this session.
   *
   * 🔴 REPORTED ALL THE WAY TO THE SURFACE, FOR THE REASON `forced` IS. A session running the
   * baseline arm that looked identical to an ordinary one would make "which controller produced
   * this?" unanswerable by using the product — the exact cost the old `?policy=1` opt-in incurred,
   * and the reason it was replaced by a bypass that declares itself.
   *
   * 🔴 IT IS FIXED FOR THE SESSION. Derived from stable inputs on every render rather than held in
   * state, so a reload, a remount or a second tab all resolve the same arm. See `resolveStrategy`.
   */
  strategy: TeachingStrategyId;
  /** The question on screen, when the policy asked for one. */
  prompt: RetrievalPrompt | null;
  /**
   * What the judge said about the last answer, held until the learner moves on.
   *
   * 🔴 IT CARRIES ITS OWN EXPOSITION — §39. The verdict is a cognitive object in its own right, and
   * it is minted here rather than looked up later because the objective it belongs to is
   * unambiguous only at the moment of submission: by the time this renders, `decision` has already
   * moved on to whatever is owed next.
   */
  /**
   * 🔴 `via` IS CARRIED SO THE SCREEN CAN LABEL THE WORDS, NOT SO IT CAN JUDGE THEM. §46.2 requires
   * spoken transcripts to appear as the same learner-owned element typed answers do, and the
   * element records how the words arrived. It must never select a different STYLE: a spoken and a
   * typed causal explanation demonstrate the same capability (§26), and drawing them apart would
   * invent a distinction the cognition layer deliberately refuses to make.
   */
  feedback: {
    evaluation: ResponseEvaluation;
    answer: string;
    exposition: Exposition;
    /** 🔴 `null` WHEN NOTHING OBSERVED A MODALITY, which is what a tapped option is. Defaulting it
     *  to `typed` would put a claim about how the answer arrived onto a screen and into the DOM that
     *  nothing measured, which is the same fabrication the evidence log refuses one layer down. */
    via: LearnerInputModality | null;
  } | null;
  /**
   * A question is on screen and has not been answered yet.
   *
   * 🔴 ONE DEFINITION, TWO READERS, AND IT USED TO BE TWO COPIES. `learning-canvas.tsx` computed
   * `policy.decision?.action.type === "retrieve" && Boolean(policy.prompt) && !policy.feedback` in
   * two places — once to route composer text and once to decide who owns the Continue control — and
   * a second kind of ask would have had to be added to both. This codebase's own record of what
   * happens then is `presenting`: two places each deciding "what is on screen" and one of them being
   * wrong cost the product its corrections entirely.
   */
  awaitingAnswer: boolean;
  /**
   * What the policy has put on screen for the learner to take in, and how — contract §39.
   *
   * 🔴 THE POLICY DECLARES IT; THE CANVAS RENDERS THE CONSEQUENCE. `transient` advances by itself
   * after `exposureMs`; `deliberate` waits for the learner's Continue; `none` means nothing is being
   * read — a retrieval asking for production, or a hold. The Canvas must not infer any of this from
   * the verdict, the component type, or the length of the text.
   *
   * 🔴 AND THE DURATION IS IN THE TYPE ON PURPOSE. A renderer told "transient" and left to pick its
   * own window would apply a number nobody chose to material nobody sized. `Exposition` is a union
   * in which the duration exists exactly where the auto-advance does.
   */
  exposition: Exposition;
  judging: boolean;
  /**
   * This answer's evidence is written but not yet read back — do not decide the next prompt yet.
   *
   * 🔴 GATE AUTO-ADVANCE ON THIS, NOT ON A TIMER. `judging` is already `false` when the write
   * starts, so it cannot be used for this. While `recording` is true, `evidence` still lacks the row
   * this answer just produced, and any next-prompt decision computed from it can re-ask the question
   * that was just answered — with its answer on screen. `acknowledge()` refuses while it is true, so
   * forgetting costs a missed advance rather than a fabricated demonstration.
   */
  recording: boolean;
  /**
   * The step currently running, or null when nothing is.
   *
   * 🔴 SET BY THE STEP ITSELF. Nothing advances this on a timer, and there is no ordered list it
   * walks — if a phase is skipped or repeated, that is because the work was. A caption that cycled
   * through plausible stages would be indistinguishable from a working system right up until it
   * described something that never ran.
   */
  phase: ThinkingPhase | null;
  /** The phase has run long enough to be worth saying out loud. See THINKING_VISIBLE_AFTER_MS. */
  thinking: boolean;
  error: string | null;
  /** Why this canvas has the objectives it has — stated, so "nothing to teach" and "we could not
   *  read the file" stay different facts. */
  outcome: CanvasKnowledge["outcome"];
  /**
   * This runtime is on a canvas it does not own, because someone asked for it.
   *
   * 🔴 CARRIED TO THE SCREEN, NOT KEPT INTERNAL. A bypassed session that looked identical to a real
   * one is precisely what made the old `?policy=1` untrustworthy: "is ownership working?" could not
   * be answered by using the product. Anything showing this runtime must say when it was forced.
   */
  forced: boolean;
  /** What the canvas is made of and what supported knowledge accounts for — the ownership numbers,
   *  so a forced session can show WHY it would otherwise have been refused. */
  coverage: CanvasKnowledge["coverage"];
  submit: (text: string, via: LearnerInputModality, tookMs?: number) => Promise<void>;
  /**
   * The learner tapped one of the options on a recognition task.
   *
   * 🔴 A SEPARATE ENTRY POINT FROM `submit`, AND NOT FOR TIDINESS. `submit` runs
   * `isAdmissionOfNotKnowing` and `isEchoOfTheCue` before anything else, because a typed answer can
   * fail to be an attempt at all. A tap is ALWAYS an attempt: the learner picked something that was
   * put in front of them. Routed through `submit`, an option whose text overlapped the cue would be
   * filed as "an opportunity passed and nothing was produced" over a real discrimination — a durable
   * false claim, written by a guard doing exactly its job on the wrong kind of input.
   *
   * 🔴 IT TAKES THE OPTION'S TEXT, NEVER ITS INDEX. An index is only true of the layout that produced
   * it, and the layout is rebuilt whenever the pool changes.
   */
  choose: (option: string, tookMs?: number) => Promise<void>;
  /**
   * Are the options on screen yet?
   *
   * 🔴 THE VIEW MAY NOT DECIDE THIS FOR ITSELF. Whether options are painted and whether the row says
   * `recognition` are the same fact, and the row is written here; a renderer holding its own
   * `useState` for the reveal would be a second copy of the answer, free to disagree with the one
   * the evidence used. It is exposed rather than owned by the component for exactly that reason.
   */
  choicesRevealed: boolean;
  /** Show the options. Idempotent, and a no-op on a prompt that has none. */
  revealChoices: () => void;
  admitUnknown: () => Promise<void>;
  /** Read the correction, then let the policy decide again from the same state. */
  acknowledge: () => void;
}

/** A canvas with no sources at all, before anything has been read. Nothing is owned from here. */
const EMPTY_COVERAGE = emptyCoverage(0);

/**
 * EVERY INPUT `ensureKnowledgeForCanvas` READS, AS ONE KEY.
 *
 * 🔴 THIS SHUT THE FRONT DOOR, AND THE MECHANISM IS WORTH STATING EXACTLY. The key used to be the
 * durable sources alone, which was complete while sources were the only thing knowledge could come
 * from. The topic-first constructor added a SECOND input — `canvas.title` — and did not extend the
 * key. For a canvas with no sources the old key is `""` on mount and `""` for ever after, so:
 *
 *     mount, title still empty   → resolve → `topicTerritory` returns at `if (!topic)` → 0 objectives
 *     the title arrives          → key UNCHANGED → the effect never runs again
 *     forever                    → nothing to ask, no lesson either, and no error anywhere
 *
 * A learner typing a topic got a blank canvas. It reproduces on a full reload too, because the
 * canvas loads asynchronously and the effect has already run against the empty one by then.
 *
 * 🔴 AND IT IS SILENT BY CONSTRUCTION, WHICH IS WHY NOTHING CAUGHT IT. The title check sits ABOVE
 * `onPhase("mapping_knowledge")`, so no thinking caption appears; it returns before
 * `constructTerritory`, so no model call, no network request and no spend; and "no objectives" is a
 * legitimate outcome, so no error. Every instrument pointed at it saw a system doing nothing wrong.
 *
 * 🔴 THE TITLE IS DELIBERATELY NOT PART OF THE KEY WHEN SOURCES EXIST. There, knowledge is a reading
 * of the learner's own material and the title is a label on it — re-resolving a document canvas
 * because someone renamed it would repeat the whole extraction for a cosmetic edit.
 *
 * Spend is bounded on the topic side because a rename COMMITS rather than streaming: `SessionControl`
 * holds a local draft and calls `onRename` once, with a trimmed and genuinely changed value. So this
 * changes when the topic changes, which is exactly when the territory should be rebuilt.
 */
export function knowledgeSignature(canvas: LearningCanvas): string {
  const durable = canvas.sources
    .map((source) => source.librarySourceId)
    .filter(Boolean)
    .sort()
    .join(",");
  const inputs = durable ? `sources:${durable}` : `topic:${canvas.title.trim()}`;
  // 🔴🔴 AND WHETHER THE LEARNER HAS COMMITTED, WHICH IS THE ONLY REASON THIS IS NOT PURELY THE
  // INPUTS TO KNOWLEDGE. Pressing send does not change a source or a title, so before this line the
  // key was IDENTICAL either side of it — and the effect it keys is the only thing that ever asks
  // the policy to look. Measured across the real upload flow:
  //
  //     file attached, durable id back   sources:lib-abc   CHANGED   -> resolves
  //     PRESS SEND                       sources:lib-abc   unchanged -> CANNOT look again
  //
  // 🔴 WHAT MAKES THAT FATAL RATHER THAN MERELY REDUNDANT IS THAT THE FIRST LOOK CAN LEGITIMATELY
  // COME BACK EMPTY. Knowledge resolves the moment the durable id arrives, which is not the moment
  // the document is READABLE: `ensureKnowledgeForCanvas` returns `nothingToRead()` for a source
  // whose canonical row has not landed, the hook sets `status: "unavailable"` for zero supported
  // objectives, and with the key unchanged that verdict is permanent for the life of the mount.
  // Reopening the canvas works because a remount resolves again, later, when the parse is readable
  // — which is exactly what QA observed on production and why it looked like a canvas-specific bug.
  //
  // 🔴 A TWO-VALUED COMMITMENT BIT, NOT `canvas.state` ITSELF, AND THE DIFFERENCE IS THE POINT. Raw
  // state would re-resolve on every transition — including ones that say nothing about knowledge —
  // and each of those is a fresh round trip on every stored canvas. This says one thing only: the
  // learner has committed, so it is worth looking again. `targeted_relearn` and the retired
  // evidence stages all read as committed and never re-key against each other.
  //
  // 🔴 IT DOES NOT CLOSE THE RACE, AND MUST NOT BE READ AS IF IT DOES. It buys ONE more attempt, at
  // the moment the learner commits. A parse still unreadable at that point strands them exactly as
  // before. Closing it properly means a resolution that produced nothing stops being final — which
  // is a retry with a bound, and a bigger change than this.
  return `${canvas.state === "empty" || canvas.state === "sources_attached" ? "pre" : "begun"}|${inputs}`;
}

/**
 * @param override What the URL asked for, if anything. `null` is the ordinary case.
 *
 * 🔴 THERE IS NO OPT-IN HERE ANY MORE. Ownership is decided from what the canvas's sources contain
 * — see `policyOwnsCanvas` — so an ordinary visit passes `null` and coverage answers. The two
 * things left are a stop and a bypass, and the bypass DECLARES ITSELF all the way to the screen:
 * a forced session that looked like an owned one would make "did ownership work?" unanswerable by
 * looking, which is exactly what the old `?policy=1` cost.
 */
/**
 * How many extra looks a canvas gets while its parse is still landing, and how long between them.
 *
 * 🔴 SMALL AND FINITE. Each look is a real construction; an unbounded retry would bill for a canvas
 * nobody is watching. Three looks eight seconds apart covers the window measured in production
 * between a source attaching and its knowledge becoming readable, and gives up honestly after that.
 */
const KNOWLEDGE_RETRY_LIMIT = 3;
const KNOWLEDGE_RETRY_DELAY_MS = 8_000;

/**
 * The prompt as it was ACTUALLY MET, which is not always the prompt that was minted.
 *
 * 🔴 ONE PLACE MAKES THIS CORRECTION, AND EVERY WRITE PATH GOES THROUGH IT. A typed answer, a
 * dictated one, an "I don't know" and an echoed cue are four call sites that all record a row; the
 * flag they have to consult is the same one, and four copies of "if they never opened the options,
 * call it independent" is three chances to write the optimistic version by mistake.
 */
function asMet(active: RetrievalPrompt, choicesRevealed: boolean): RetrievalPrompt {
  return active.choices && !choicesRevealed ? asUnaidedProduction(active) : active;
}

export function usePolicyRuntime(
  canvas: LearningCanvas,
  override: PolicyOverride,
  /**
   * Which teaching controller to run, when a URL asked for one. `null` is the ordinary case.
   *
   * 🔴 A SECOND PARAMETER RATHER THAN A SECOND MEANING FOR `override`. `PolicyOverride` answers
   * whether this runtime may run at all and whether ownership is being bypassed; this answers which
   * controller runs when it does. Folding them together would make "run the baseline arm" and "skip
   * the ownership check" the same switch, and one arm would silently be running on canvases the
   * other was refused — which is not a comparison, it is two different populations.
   */
  strategyOverride: TeachingStrategyId | null = null,
  /**
   * What the learner said to open this sitting, when this canvas began from an utterance.
   *
   * 🔴 PASSED THROUGH UNREAD BY THIS HOOK. See `TeachingContext.opening` for why the controller
   * gets the words rather than a flag: deciding here whether they "sound like" a teach request
   * would put a classifier in front of the model, which is the thing #689 removed.
   */
  opening: string | null = null,
  /**
   * The judge decided a submission was not an attempt at the question — hand the text back so the
   * canvas can answer it as conversation.
   *
   * 🔴 A CALLBACK RATHER THAN THIS HOOK CALLING `converse` ITSELF. The policy runtime owns the
   * teaching loop and knows nothing about the conversational lane; giving it one would be a second
   * route into `askCanvasChat` and a second place that decides what a turn means.
   */
  notAnAttempt: ((said: string) => void) | null = null,
): PolicyRuntime {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const enabled = policyAllowed(override);
  const forced = policyForced(override);
  /**
   * 🔴 DERIVED ON EVERY RENDER, NEVER STORED, WHICH IS THE WHOLE OF "THE ARM MUST NOT SILENTLY SWITCH
   * HALFWAY THROUGH". Held in `useState` it would survive re-renders and die on a reload, so a
   * learner who refreshed mid-canvas could finish under a controller that did not start them — while
   * every evidence row stayed stamped with whichever arm was live when it was written. The
   * comparison would then contain sessions that are a blend of both, labelled as one, and nothing in
   * the data could find them. `resolveStrategy` is a pure function of `(override, uid, canvasId)`,
   * so it answers the same thing in every tab, after every reload, for ever.
   *
   * 🔴 RANDOMISATION IS DATED, NOT A GLOBAL BOOLEAN. A configured activation instant admits only
   * canvases created from that point forward, so switching the experiment on cannot change the
   * controller of an older canvas whose evidence is already labelled. With no valid instant the
   * function returns false and nobody is enrolled.
   */
  const assignment = resolveStrategy({
    canvasId: canvas.id,
    learnerId: uid,
    override: strategyOverride,
    randomise: teachingExperimentEligible(canvas.createdAt, teachingExperimentStartedAt),
  });
  const { assignedBy, strategy } = assignment;

  const reportedAssignment = useRef<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    const key = `${canvas.id}:${assignedBy}:${strategy}`;
    if (reportedAssignment.current === key) return;
    reportedAssignment.current = key;
    canvasCapture("canvas_strategy_assigned", { id: canvas.id, state: canvas.state }, {
      assigned_by: assignedBy,
      strategy,
    });
  }, [assignedBy, canvas.id, canvas.state, strategy, uid]);

  const [status, setStatus] = useState<PolicyRuntime["status"]>(enabled ? "loading" : "unavailable");
  const [knowledge, setKnowledge] = useState<CanvasKnowledge>({
    coverage: EMPTY_COVERAGE,
    objectives: [],
    outcome: "no-durable-source",
    ownership: { coverage: EMPTY_COVERAGE, owns: false, refusal: "source-not-read" },
  });
  const [evidence, setEvidence] = useState<LearnerEvidence[]>([]);
  const [prompt, setPrompt] = useState<RetrievalPrompt | null>(null);
  const [feedback, setFeedback] = useState<PolicyRuntime["feedback"]>(null);
  const [judging, setJudging] = useState(false);
  /**
   * This answer's evidence is written but not yet read back.
   *
   * 🔴 A DIFFERENT QUESTION FROM `judging`, AND THE GAP BETWEEN THEM WAS THE BUG. `judging` covers
   * the evaluator call and is already `false` when the write begins, so between the verdict
   * appearing and the re-read landing there was NO signal at all — and in exactly that window,
   * `evidence` still lacks the row this very answer produced.
   *
   * 🔴 WHY IT IS NOT A FLICKER. `task` is null while feedback is on screen, so the learner cannot
   * answer anything — until `acknowledge()` clears it. If that runs inside this window, the next
   * task is built from a `decision` computed WITHOUT the answer just given. Because `actedOn`
   * reorders and never filters, that resolves to the same objective whenever it is the only one
   * still owed something. The learner is told they were right and immediately asked the identical
   * question with the answer on screen — and nothing stops them answering it. That submission is
   * real: it writes a durable demonstration of working memory against a prompt whose answer was
   * visible. §M3's echo, arriving through a race rather than through a policy.
   */
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<ThinkingPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped when the learner reads a correction, so the same state can produce a fresh prompt. */
  const [round, setRound] = useState(0);
  /** 🔴 SESSION-LOCAL, NEVER PERSISTED. Reading a correction says nothing about what the learner
   *  can now do, so it is not evidence and must not be stored as any. It exists only to stop the
   *  same card being served twice in a row — see `decideNext`'s `actedOn`.
   *
   *  🔴 AN ORDERED LOG NOW, NOT A SET, AND IT STAYS SESSION-LOCAL. §39's working-memory window is
   *  measured in intervening MATERIAL, so "what has happened since this one?" has to be answerable
   *  — and a Set cannot answer it. Appended once per acknowledgement, including repeats of the same
   *  objective: coming back to something three times is three positions in the log, and only the
   *  work after the most recent one has displaced anything.
   *
   *  🔴 IT MUST NEVER BE PERSISTED. Written to a row it would become a durable record of what a
   *  learner worked and in what order — learner state, sitting outside the evidence log, claiming
   *  something no judge ever said. It exists for the length of one canvas session and dies with it. */
  const [actedOn, setActedOn] = useState<readonly string[]>(() => []);
  /**
   * Objectives whose CORRECTION has actually been put on the screen this session.
   *
   * 🔴 SESSION-LOCAL, NEVER PERSISTED, for the same reason as `actedOn`: receiving a correction is
   * not a demonstration, so it must never be written as evidence.
   *
   * 🔴 AND IT IS NOT `actedOn`, THOUGH BOTH ARE FILLED IN THE SAME PLACE. `acknowledge()` runs when
   * the learner clears the FEEDBACK screen after answering, which is before any correction has been
   * displayed — so `actedOn` is already set at the moment the correction is first owed. This set is
   * added to ONLY when the thing being acknowledged was the correction itself, which is what makes
   * it able to answer "have they been told?" rather than "have we been here?".
   */
  const [correctionsShown, setCorrectionsShown] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * Objectives whose reasoning has been worked through in front of the learner this sitting.
   *
   * 🔴 SESSION STATE, NOT LEARNER STATE, AND IT LIVES HERE FOR THE SAME REASON `correctionsShown`
   * DOES. A worked example writes no evidence row by design — being shown something is not evidence
   * of knowing it — so nothing durable would tell the next turn that one had just been shown, and
   * the obvious failure is showing it again. It dies with the sitting, which is correct: what
   * survives to tomorrow is what the learner produced, not what we put on the screen.
   */
  const [modelled, setModelled] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * Has the learner asked to see the options on the recognition screen in front of them?
   *
   * 🔴🔴 THE FIELD INVARIANT 11 TURNS ON: "a task must record the assistance that was ACTUALLY
   * AVAILABLE when answered", not the assistance the controller planned to give. The controller
   * decides to ask at `recognition`; what the learner then meets is a question with the options one
   * press away. If they produce the answer without pressing, the honest row says `independent` — and
   * `asUnaidedProduction` is where that correction is made, off this flag.
   *
   * 🔴 IT RESETS WITH THE PROMPT, NEVER WITH THE DECISION. A decision can be recomputed for reasons
   * that have nothing to do with the learner (evidence reloading, a strategy re-run); the prompt id
   * changes exactly when the question in front of them does.
   */
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  /**
   * The same acts as `actedOn`, with WHAT was done and WHEN.
   *
   * 🔴 A SECOND LIST RATHER THAN A RICHER `actedOn`, AND THE DUPLICATION IS DELIBERATE. `actedOn` is
   * read by `decideNext` and by `interveningActs`, both of which want identity keys in order and
   * nothing else; widening it would mean editing the structured policy so the model controller could
   * see more, which that arm's own header forbids. The two are appended in the same statement, so
   * they cannot drift.
   *
   * 🔴 SESSION-LOCAL, NEVER PERSISTED, for exactly the reason `actedOn` is: written to a row it
   * would become a durable record of what a learner worked and in what order — learner state living
   * outside the evidence log, asserting something no judge ever said.
   */
  const [recentActs, setRecentActs] = useState<readonly TeachingAct[]>(() => []);
  /** Frozen per evidence change rather than read per render: the policy takes `now`, and a clock
   *  that moved on every render would make the decision unstable for no reason. */
  const [decidedAt, setDecidedAt] = useState(() => new Date());
  /** 🔴 SESSION-LOCAL, NEVER PERSISTED. Where the learner is looking is not a fact about what they
   *  know; storing it would put a UI preference inside the learner model where the next reader
   *  could not tell it from evidence. */
  const [focus, setFocus] = useState<FocusScope>(WHOLE_CANVAS);

  /** Bumped to ask for one more look when the parse had not landed yet. See the retry below. */
  const [resolveNonce, setResolveNonce] = useState(0);
  const retriesRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const knowledgeInputs = knowledgeSignature(canvas);

  useEffect(() => {
    if (!enabled || !uid) {
      setStatus("unavailable");
      return;
    }
    let live = true;
    setStatus("loading");
    setError(null);
    // 🔴 NINETY SECONDS WITH NO TRANSITION AND NO FAILURE MUST NOT BE REPRESENTABLE — owner, §33.
    //
    // The owner's own canvas `8c49587e` is sitting in exactly that state right now: "Mapping what
    // you know", for ever, territory NULL, zero rows, and NO CONSOLE ERROR. There were two ways in
    // and this effect had neither closed.
    //
    //   1. A THROW. This IIFE had no `catch`. Anything rejecting inside `ensureKnowledgeForCanvas` —
    //      a network blip, a Supabase error, a malformed response — skipped every `setPhase(null)`
    //      and `setStatus(...)` below it, leaving `loading` and the caption on screen for ever.
    //   2. A PROMISE THAT NEVER SETTLES. A construction is one `fetch` with no timeout of its own,
    //      so a connection that is accepted and never answered produces no error to catch at all.
    //      No `catch` in the world reaches that one; only a deadline does.
    //
    // 🔴 THE DEADLINE ABORTS THE WORK, IT DOES NOT JUST STOP WAITING FOR IT. A timeout that raced a
    // promise and moved on would leave the request running, still billable, and still able to
    // resolve later and write knowledge for a canvas the learner has given up on. The signal is
    // threaded all the way to the model call, so "we stopped waiting" and "it stopped" are the same
    // event.
    const deadline = new AbortController();
    const expiry = setTimeout(() => deadline.abort(), KNOWLEDGE_DEADLINE_MS);
    void (async () => {
      let resolved: Awaited<ReturnType<typeof ensureKnowledgeForCanvas>>;
      try {
        resolved = await ensureKnowledgeForCanvas(uid, canvas, {
          bypassOwnership: forced,
          onPhase: (step) => {
            if (live) setPhase(step);
          },
          signal: deadline.signal,
        });
      } catch (cause) {
        // 🔴 A FAILURE THE LEARNER CAN SEE AND ACT ON, WHICH IS THE WHOLE REQUIREMENT. Not a silent
        // return, and not a retry loop: reloading is a thing they can already do, and a caption
        // that never changes is the one outcome that leaves them with nothing.
        //
        // It says the canvas is not lost, because it is not. Every earlier open's knowledge is
        // durable and unaffected; what failed is this attempt to add to it.
        if (!live) return;
        clearTimeout(expiry);
        setPhase(null);
        setStatus("unavailable");
        setError(
          deadline.signal.aborted
            ? "Nemesis is taking too long to map this material. Your canvas is safe. Reload to try again."
            : cause instanceof Error && cause.message
              ? `Nemesis could not map this material: ${cause.message}`
              : "Nemesis could not map this material. Your canvas is safe. Reload to try again.",
        );
        return;
      }
      clearTimeout(expiry);
      if (!live) return;
      setKnowledge(resolved);
      const supported = supportedObjectives(resolved.objectives);
      // 🔴 OWNERSHIP NO LONGER DECIDES WHETHER A QUESTION MAY APPEAR — THIS IS STEP 7b.
      //
      // The refusal that used to live here (`!resolved.ownership.owns && !forced` → inactive) was
      // whole-page scaffolding: because ownership was all-or-nothing, a canvas holding one glossary
      // table and forty pages of prose had to be refused entirely, and §12 measured the result as
      // owning 0 of 6 production canvases. The Canvas now owns the surface and hosts the task
      // beside the prose, so a partly-supported canvas gets BOTH.
      //
      // `resolved.ownership` is still computed, still carried out on the return value, and still
      // what `forced` discloses against. Deleting the computation — rather than the gate — would
      // have thrown away the one fact that tells a bypassed session from an ordinary one.
      //
      // 🔴 THE REMAINING REFUSAL IS THE ONE THAT IS STILL TRUE. Nothing supported means nothing to
      // ask, on any canvas, owned or not. Hosting an empty task shell over a document is the
      // failure this guard exists to prevent, and it is why `supported.length` was never the same
      // question as ownership.
      if (supported.length === 0) {
        // 🔴 "NOT READABLE YET" AND "NOTHING TO ASK" ARE OPPOSITE FACTS THAT ARRIVE IDENTICALLY.
        // This file's own header documents the failure: knowledge resolves the moment a durable id
        // lands, which is NOT the moment the parse is readable, so an early look legitimately comes
        // back empty — and with the resolve key unchanged that verdict was permanent for the life of
        // the mount. Reopening the canvas fixed it, which is why it read as canvas-specific.
        //
        // MEASURED IN PRODUCTION on a grounded topic canvas: three pages attached, 35 knowledge
        // objects and 69 objectives written, and the learner still looking at "hasn't found anything
        // to ask you about yet" until they pressed Try again — which is `window.location.assign`,
        // i.e. the remount. The data was there the whole time.
        //
        // 🔴 A BOUNDED RETRY AGAINST A NAMED CONDITION, NOT A TIMER WALKING PHASES. It fires only
        // while `no-durable-source` says the parse has not landed, and only a few times. A canvas
        // that genuinely has nothing to teach settles on `unavailable` exactly as before, because
        // that outcome is not this one.
        if (resolved.outcome === "no-durable-source" && retriesRef.current < KNOWLEDGE_RETRY_LIMIT) {
          retriesRef.current += 1;
          setPhase(null);
          retryTimer.current = setTimeout(() => {
            if (live) setResolveNonce((current) => current + 1);
          }, KNOWLEDGE_RETRY_DELAY_MS);
          return;
        }
        setPhase(null);
        setStatus("unavailable");
        return;
      }
      retriesRef.current = 0;
      setPhase("finding_gap");
      const rows = await loadEvidence(uid, supported.map((entry) => entry.objective));
      if (!live) return;
      setEvidence(rows);
      setDecidedAt(new Date());
      setPhase(null);
      setStatus("ready");
    })();
    return () => {
      live = false;
      // The timer is cleared here as well as on both settled paths: unmounting mid-construction
      // must not leave a timer that fires into a component nobody is looking at.
      clearTimeout(expiry);
    };
    // 🔴 Keyed on the KNOWLEDGE INPUTS, not on `canvas`. The canvas object is replaced on every
    // block edit and on every keystroke of a rename draft; depending on it would re-resolve
    // knowledge continuously. Keying on the sources ALONE is what shut the front door — see
    // `knowledgeSignature`: a topic is an input too, and a key that could not see it meant a
    // topic-first canvas resolved once, against a title that had not arrived yet, and never again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, forced, knowledgeInputs, resolveNonce, uid]);

  const supported = useMemo(() => supportedObjectives(knowledge.objectives), [knowledge]);

  // 🔴 THE SCOPE NARROWS THE CANDIDATES, THEN THE POLICY CHOOSES FREELY INSIDE IT. Selecting a
  // territory sets `focus_scope`; it does not set an operation, a difficulty or a kind of card
  // (§11). Filtering the list `decideNext` arbitrates over is the whole of the constraint — reaching
  // any further in would be a curriculum wearing a Minimap's clothes (§14.7).
  const inFocus = useMemo(() => applyFocus(supported, focus), [focus, supported]);

  /**
   * EVERY INPUT THE CONTROLLER READS, AS ONE KEY.
   *
   * 🔴🔴 THIS IS WHAT REPLACED A `useMemo`, AND IT IS THE PRICE OF THE SECOND ARM. While the decision
   * was a memo it could not disagree with the state it was computed from: React recomputed it in the
   * same render as any input change. A controller that reaches a model cannot be a memo, so the
   * decision is now state, and state can be STALE — it can hold a choice made from evidence that has
   * since moved. That is the same class of defect as the `recording` race this file already
   * documents at length ("records the echo as a demonstration"), arriving from the other direction:
   * there, evidence lagged the answer; here, the decision lags the evidence.
   *
   * 🔴 SO THE DECISION CARRIES THE FINGERPRINT OF WHAT PRODUCED IT AND IS REFUSED WHEN THEY DISAGREE.
   * Same construction as `knowledgeSignature` and `mintedFor` above. A decision from a superseded
   * input set is dropped rather than shown — which costs a turn, visibly, instead of asking a
   * question about a learner state that no longer exists.
   *
   * 🔴 `evidence.length` IS NOT ENOUGH ON ITS OWN AND THE ROW IDS ARE IN THE KEY FOR A REASON. Two
   * reads can return the same COUNT with different rows — a re-read after a write that replaced
   * nothing, or a focus change that swapped which objectives are in scope. Counting alone would
   * declare those identical and let a stale decision through.
   */
  const decisionInputs = useMemo(
    () =>
      [
        strategy,
        decidedAt.getTime(),
        inFocus.map((entry) => entry.objective.identityKey).join(","),
        evidence.map((row) => row.id).join(","),
        actedOn.join(","),
        [...correctionsShown].sort().join(","),
        [...modelled].sort().join(","),
      ].join("|"),
    [actedOn, correctionsShown, decidedAt, evidence, inFocus, modelled, strategy],
  );

  const [decided, setDecided] = useState<{ inputs: string; outcome: StrategyOutcome } | null>(null);
  /**
   * A teaching controller is running right now.
   *
   * 🔴🔴 THE GAP BETWEEN TWO QUESTIONS HAD NO NAME, SO THE CANVAS CALLED IT "NOTHING TO ASK".
   * Reported by the owner, 2026-08-19: "Nemesis hasn't found anything to ask you about yet" showing
   * BETWEEN questions. `canvasPresentation` falls through to `quiet` when nothing else is true, and
   * `working` was `busy.kind !== null || policy.phase !== null || policy.status === "loading"` —
   * none of which holds while the controller is deciding the next move. `status` is already `ready`
   * (knowledge loaded), no phase is named (choosing a move narrates nothing), and `busy` belongs to
   * the session rather than the policy. So progress rendered as a dead end, complete with a "Try
   * again" button for something that was working.
   *
   * 🔴 A FLAG ON THE ACTUAL CALL, NOT A TIMER AND NOT `decision === null`. `decision` is also null
   * when the controller has genuinely finished and chosen nothing, which is the real `quiet` and
   * must stay reachable — that state is the one #690's note is about. This says the narrower thing:
   * a request is in flight.
   */
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (status !== "ready") {
      setDecided(null);
      setDeciding(false);
      return;
    }
    let live = true;
    setDeciding(true);
    // 🔴 BOTH ARMS GO THROUGH THIS EFFECT, INCLUDING THE ONE THAT CANNOT BLOCK. Running
    // `nemesis_policy` synchronously in a memo and `llm_teacher` here would put the two controllers
    // at different points in the React lifecycle — settling in different frames, against different
    // reads of the same state — and "only the teaching controller changes" would be false in the one
    // place the experiment cannot tolerate it.
    const abort = new AbortController();
    void (async () => {
      let outcome: StrategyOutcome;
      try {
        // 🔴 `controllerFor`, NOT `strategyFor`, AND THAT IS THE PRODUCT-VERSUS-EXPERIMENT LINE. The
        // raw arm refuses rather than recovering, which is right for measuring an arm and wrong for
        // a learner: a refusal is now a blank canvas rather than a wasted experimental turn. The
        // rescue is loud — recorded as `nemesis_policy_fallback`, carrying the refusal that caused
        // it — so a turn the model failed to decide can never be counted as a turn the structured
        // arm was chosen for. See `strategy-registry.ts`.
        outcome = await controllerFor(strategy, {
          actedOn,
          // 🔴 ACTIVE TIME, NOT WALL CLOCK. `canvas.activeMs` already excludes idle, and the
          // distinction is the difference between "they studied for 25 minutes" and "they left the
          // tab open for 25 minutes". `availableMs` is null because nothing in this runtime knows
          // how long the sitting has — which the controller is told in words, so an absent bound
          // cannot read as an unlimited one.
          attention: { activeMs: Math.max(0, Math.round(canvas.activeMs)), availableMs: null },
          correctionsShown,
          evidence,
          modelled,
          now: decidedAt,
          objectives: inFocus,
          opening,
          recentActs,
          signal: abort.signal,
          uid,
        });
      } catch {
        // 🔴 A CONTROLLER THAT THREW IS A TURN THE LEARNER DID NOT GET, AND IT IS RECORDED AS ONE
        // RATHER THAN VANISHING. This is reachable on the ordinary path: the cleanup below aborts an
        // in-flight model call every time evidence moves underneath it, and an aborted fetch
        // rejects. Left uncaught it would be an unhandled rejection AND — the part that matters —
        // would skip the refusal accounting, so the instrument that tells a working baseline from a
        // broken one would fall silent in exactly the conditions that break it.
        if (!live) return;
        canvasCapture("canvas_strategy_refused", canvas, { reason: "model-unreachable", strategy });
        labTrace("controller", `${strategy} could not be reached`, () => ({ refusal: "model-unreachable", strategy }));
        setDecided({ inputs: decisionInputs, outcome: { decision: null, refusal: "model-unreachable", strategy } });
        setDeciding(false);
        return;
      }
      if (!live) return;
      // 🔴 OBSERVABILITY ONLY — inert unless Nemesis Lab is open (lib/lab/trace.ts). This is the
      // moment the whole teaching question is answered: which controller ran, what it was allowed to
      // see, which objective it chose and why. A debug panel reconstructing it from the outside
      // would be guessing at exactly the step the Lab exists to make legible.
      labTrace(
        "controller",
        outcome.decision ? `${outcome.strategy} → ${outcome.decision.action.type}` : `${outcome.strategy} decided nothing`,
        () => ({
          action: outcome.decision?.action ?? null,
          knowledge: outcome.decision?.knowledge ?? null,
          movedOn: outcome.movedOn ?? [],
          objective: outcome.decision?.objective ?? null,
          objectivesConsidered: inFocus.map((entry) => ({
            capability: entry.objective.capability,
            identityKey: entry.objective.identityKey,
            statement: entry.knowledge.statement,
            type: entry.knowledge.type,
          })),
          // 🔴 `rationale` IS WHERE "WHY" LIVES, AND IT IS ARM-SPECIFIC BY CONSTRUCTION — the
          // structured policy accounts for its choice differently from the model. Reported as the
          // controller states it, never flattened into one sentence the two arms would have to share.
          cognitiveMode: outcome.decision?.cognitiveMode ?? null,
          exposition: outcome.decision?.exposition ?? null,
          rationale: outcome.decision?.rationale ?? null,
          refusal: outcome.refusal ?? null,
          state: outcome.decision?.state ?? null,
          strategy: outcome.strategy,
          // 🔴 THE CONTEXT THE CONTROLLER WAS ACTUALLY GIVEN, so the Lab can put the OTHER arm in
          // front of the identical inputs (§12) and re-run the same arm repeatedly (§13) without
          // reconstructing anything. `signal` is deliberately not carried: an AbortSignal is not
          // data, and a replay supplies its own.
          context: {
            actedOn,
            attention: { activeMs: Math.max(0, Math.round(canvas.activeMs)), availableMs: null },
            correctionsShown: [...correctionsShown],
            evidence,
            modelled: [...modelled],
            now: decidedAt.toISOString(),
            objectives: inFocus,
            recentActs,
            uid,
          },
        }),
        Date.now() - decidedAt.getTime(),
      );
      // 🔴🔴 OBJECTIVES THE CONTROLLER PASSED OVER ARE RECORDED AS WORKED, AND WITHOUT THIS THE
      // WHOLE "MOVE ON" MECHANISM WOULD BE A NO-OP THE LEARNER COULD FEEL. `controllerFor` sets an
      // objective aside for the length of ONE call; if nothing here remembers it, the next turn
      // offers the identical objective, the controller declines it again, and the learner watches a
      // canvas spend model calls skipping the same material for ever — the drill trap rebuilt out of
      // the mechanism meant to end it.
      //
      // 🔴 INTO `actedOn`, WHICH IS ALREADY EXACTLY THIS: session-local, never persisted, a record of
      // what the RUNTIME has staged rather than a claim about the learner. Deciding not to spend a
      // minute on something says nothing about whether they know it, so no evidence is written.
      const passedOver = outcome.movedOn ?? [];
      if (passedOver.length > 0) {
        const keys = passedOver.map((entry) => entry.objectiveIdentityKey);
        setActedOn((current) => [...current, ...keys]);
        for (const entry of passedOver) {
          canvasCapture("canvas_objective_passed_over", canvas, {
            action: entry.action,
            because: entry.because,
            objective: entry.objectiveIdentityKey,
            strategy: outcome.strategy,
          });
        }
      }
      if (outcome.refusal) {
        // 🔴 COUNTED, NEVER RECOVERED FROM. There is deliberately no "if the baseline refused, ask
        // the structured policy" here: that would make the two arms one arm and report them as
        // equivalent. A refusal is a turn the learner did not get, and it has to be visible as that.
        canvasCapture("canvas_strategy_refused", canvas, { reason: outcome.refusal, strategy });
      }
      setDecided({ inputs: decisionInputs, outcome });
      setDeciding(false);
    })();
    return () => {
      live = false;
      abort.abort();
      // 🔴 CLEARED ON TEARDOWN TOO, OR A STUCK `true` IS WORSE THAN THE BUG IT FIXES. Every `if
      // (!live) return` inside the async body above leaves without clearing it — that is correct,
      // because a superseded run must not touch state a newer one owns — so the only place that can
      // honestly end this run's claim is its own cleanup. Without this, an aborted decision leaves
      // the canvas reporting "preparing" for ever: a spinner where there used to be a wrong answer.
      setDeciding(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionInputs, status]);

  // 🔴 THE FINGERPRINT GATE. A decision computed from inputs that have since changed is not shown —
  // see `decisionInputs`. Reading it anyway is how the surface asks a question about a learner state
  // that no longer exists, and how `mintedFor` below could mint a prompt for a superseded decision,
  // which is the idempotency key for the evidence it produces.
  const next = decided && decided.inputs === decisionInputs ? decided.outcome.decision : null;

  /**
   * Which controller actually produced the decision on screen.
   *
   * 🔴🔴 NOT `strategy`, WHICH IS THE ARM THIS SESSION WAS ASSIGNED TO, AND THE DIFFERENCE IS THE
   * ONLY THING KEEPING THE FALLBACK HONEST. When the model controller refuses, the structured policy
   * answers in its place and the outcome comes back stamped `nemesis_policy_fallback`. Writing the
   * ASSIGNED arm onto the evidence row would file that turn under `llm_teacher` — a turn the model
   * did not decide, counted as a turn it did — which is precisely the silent-equivalence failure
   * `teaching-strategy.ts` warns about at length, arriving from the other direction.
   *
   * Falls back to the assigned arm only when no decision exists, where nothing is written anyway.
   */
  const decidedStrategy: TeachingStrategyId =
    decided && decided.inputs === decisionInputs ? decided.outcome.strategy : strategy;

  /**
   * The decision, with the exposition corrected to describe WHAT IS ON SCREEN.
   *
   * 🔴 FEEDBACK OUTRANKS THE ACTION UNDERNEATH IT, AND THE DECLARED MODE HAS TO FOLLOW THE SAME
   * PRECEDENCE THE RENDERER ALREADY USES. `PolicyScreen` shows the verdict while `decision` has
   * already moved on to the next objective — so a mode read straight off `decision` would describe
   * a screen the learner is not looking at. On a pass that is the difference between advancing by
   * itself and waiting for a press that §39 says must not be there.
   *
   * The verdict's own exposition is minted at submit time, when the objective that was answered is
   * unambiguous, rather than looked up here from a decision that may have moved.
   */
  const decision = useMemo(
    () =>
      next && feedback
        ? { ...next, cognitiveMode: feedback.exposition.mode, exposition: feedback.exposition }
        : next,
    [feedback, next],
  );

  /**
   * Where the claim on screen came from, in this canvas's own excerpt ids.
   *
   * 🔴 THE PRODUCTION CALL SITE OF `groundCanonicalAnchor`, VIA `citationsForKnowledge`. Extraction
   * records a durable anchor into the SOURCE; the surface can only render a citation into THIS
   * canvas's excerpt list. Nothing converted between them, so five kinds of extracted knowledge
   * reached the learner carrying a perfectly good record of their origin and no way to show it.
   *
   * 🔴 RECOMPUTED FROM `canvas.sources` RATHER THAN STORED ON THE KNOWLEDGE. A canvas-local id is
   * only true of the canvas that minted it and only until its sources change; caching one on an
   * object that outlives both is how a citation starts pointing at the wrong excerpt after a
   * reattach. Resolving on read costs a scan of one list and cannot go stale.
   */
  const citations = useMemo<readonly KnowledgeCitation[]>(
    () => (decision ? citationsForKnowledge(canvas.sources, decision.knowledge) : []),
    [canvas.sources, decision],
  );

  /**
   * WHAT THE LEARNER IS ACTUALLY LOOKING AT — one value, one precedence, read by everything.
   *
   * 🔴🔴 THIS EXISTS BECAUSE ASKING `decision.action.type` "WHAT IS ON SCREEN?" GETS THE WRONG
   * ANSWER, AND THAT COST THE PRODUCT ITS CORRECTIONS. `decision` is what the policy has decided to
   * do NEXT; the renderer shows the verdict on top of it. After a wrong answer the two disagree —
   * the verdict is on screen while `decision.action.type` is already `show_correction`.
   *
   * `acknowledge` asked the decision that question, and its own comment described the consequence
   * exactly: *"recording that as 'the answer has been shown' would make the policy defer at the
   * exact moment the correction is owed — a learner who got something wrong would never be shown
   * the answer at all."* The author knew the hazard and believed the gate excluded the verdict
   * screen. It could not. **Measured end to end: the correction never painted, ever, in a twelve-
   * step session.** Found by Canvas UI reading the code; reproduced here against the real
   * `decideNext` before a line was changed.
   *
   * 🔴 SO THE PRECEDENCE IS WRITTEN ONCE AND CONSUMED, NEVER RE-DERIVED. `exposition` and the
   * correction gate previously each applied their own copy of "feedback outranks the decision", and
   * one of them was right. A single value cannot disagree with itself.
   *
   * 🔴 AND THIS IS THE SEAM FUSION CHANGES. When a verdict is fused with the correction it queues
   * (§39's `Valsartan → Losartan` in one glance), the fused screen genuinely IS showing the
   * correction, and this is the one place that has to say so. Nothing downstream needs editing.
   */
  const presenting: { kind: "verdict"; exposition: Exposition } | { kind: TeachingAction["type"] } | { kind: "nothing" } =
    feedback
      ? { exposition: feedback.exposition, kind: "verdict" }
      : decision
        ? { kind: decision.action.type }
        : { kind: "nothing" };

  /**
   * What is on screen for the learner to take in, right now — the authoritative §39 value.
   *
   * 🔴 SEPARATE FROM `decision` BECAUSE A VERDICT CAN OUTLIVE ONE. Answer the last objective on a
   * canvas correctly and `decideNext` returns null while the verdict is still up: read through the
   * decision, that is "the policy said nothing", which resolves to *requires reading* and puts a
   * Continue on a passed association. Read here, it is the verdict's own transient exposition.
   *
   * 🔴 AND IT IS THE ONE A RENDERER SHOULD USE. `declaredCognitiveMode(decision)` still works and
   * still agrees with this wherever a decision exists — it is kept so the consumer written before
   * this property landed did not need editing — but it cannot see the case above.
   */
  const exposition: Exposition = presenting.kind === "verdict"
    ? presenting.exposition
    : (decision?.exposition ?? NO_EXPOSITION);

  // ── One prompt per decision ────────────────────────────────────────────────
  //
  // 🔴 THE PROMPT ID IS THE IDEMPOTENCY KEY FOR THE EVIDENCE IT PRODUCES, so it must be minted
  // exactly once per decision and then held. Minting it at submit time would give a double click
  // two ids and two rows for one performance — and `demonstrationCount` is what the policy reads
  // to decide whether something has been shown repeatedly, so the learner would be credited with
  // practice they never did. A fresh random id per decision is also why a genuinely new attempt
  // after a reload lands rather than being swallowed as a duplicate.
  //
  // 🔴 THIS IS NOW THE LAST PLACE "ONE SUBMISSION → ONE PROMPT" CAN BREAK, AND IT IS THE ONE PLACE
  // NO TEST CAN SEE IT. The fan-out below holds the other half by construction: a prompt carries a
  // SET of targets, so however many objectives one answer touches, they share its id because they
  // share its prompt.
  //
  // What is not structural is up here. `decideNext` returns exactly one objective today, so one
  // decision is one key and one key is one prompt. The moment a `PolicyDecision` carries a set —
  // which is what `BRAIN-003` exists to make possible — the tempting edit is to build a key per
  // objective, and that mints a prompt per objective, and each prompt gets its own
  // `crypto.randomUUID()`. One 20-second explanation is then four performances of 20 seconds each.
  //
  // That failure arrives from ABOVE the layer that guards against it, so nothing in
  // `objective-task.ts` can catch it and no test asserts on it — there is no multi-objective
  // decision to test with yet. THE KEY MUST IDENTIFY THE SUBMISSION, NEVER AN OBJECTIVE WITHIN IT:
  // a decision covering four objectives is ONE key, and `retrievalPromptFor` gives way to
  // `promptTargeting` with all four targets on the single prompt it returns.
  const decisionKey = decision
    ? `${decision.objective.identityKey}:${decision.action.type}:${decision.state.evidenceCount}:${round}`
    : null;
  const mintedFor = useRef<string | null>(null);

  useEffect(() => {
    // 🔴 TWO KINDS OF ASK MINT A PROMPT NOW, AND THE GUARD NAMES BOTH RATHER THAN LOOSENING. A
    // condition like "anything that is not an exposition" would mint a prompt for `defer` the day
    // somebody added a field to it, and the prompt id is the idempotency key for evidence.
    const action = decision?.action ?? null;
    // 🔴 ONE LIST DECIDES WHICH ACTIONS ASK FOR SOMETHING, AND IT IS NOT THIS FILE'S. `performanceOf`
    // is exhaustive over the union in teaching-policy.ts, so a new asking action is a compile error
    // there rather than a screen here that silently mints no prompt — which is precisely how a lane
    // gets built, merged, and never reached. The condition this replaced named its two actions by
    // hand and had to be edited in three places for each new one.
    if (!decision || !decisionKey || !action || !performanceOf(action)) {
      setPrompt(null);
      return;
    }
    if (mintedFor.current === decisionKey) return;
    mintedFor.current = decisionKey;
    if (action.type === "complete") {
      // 🔴 THE SAME BUILDER THE CONTROLLER ASKED BEFORE CHOOSING, SO A NULL HERE IS A REAL DEFECT
      // RATHER THAN A REFUSAL. `actionFor` in strategy-llm-teacher.ts calls `completionAvailable`
      // and refuses when it says no, so by the time a decision arrives the answer is yes. If it ever
      // is not, the honest response is to say so out loud — a silent fall back to the ordinary
      // question would put an `independent` task on screen under a decision that said "completion",
      // and the row would record whichever of the two the caller happened to trust.
      const built = completionPromptFor(decision, crypto.randomUUID());
      if (!built) {
        setPrompt(null);
        setError("Nemesis could not build that task from this material, so nothing was asked. Continue to move on.");
        return;
      }
      setPrompt(built);
      return;
    }
    if (action.type === "recognise") {
      // 🔴 THE OPTIONS COME OFF THE ACTION, NEVER REBUILT HERE. The controller decided to ask at
      // `recognition` because THIS set existed; a second construction could return a different set,
      // or none, and the row would then record a demand the learner never met.
      setPrompt(recognitionPromptFor(decision, crypto.randomUUID(), action.choices));
      return;
    }
    // 🔴 THE DECISION CARRIES BOTH, AND BOTH ARE HANDED OVER. A prompt for an `explain` objective is
    // worded from the objective and judged against the KNOWLEDGE — the two ends of the causal edge —
    // so passing the objective alone would word the question correctly and then mark the answer
    // against a single model sentence. `PolicyDecision` already holds the pair; nothing is loaded.
    //
    // 🔴 AND THE RUNG IS THE THIRD THING IT CARRIES — SEE `scaffold-decision.ts`. The guard above
    // narrows `decision.action` to the `retrieve` variant, which is REQUIRED to state a `rung`
    // (teaching-policy.ts's own `TeachingAction` doc: "Every branch that returns `retrieve` states
    // it explicitly"). `retrievalPromptFor`'s third parameter is optional and silently defaults to
    // `"independent"` when omitted — so leaving this argument off does not fail loudly, it just
    // means every retrieval this runtime ever stages is unaided, however many times a learner has
    // already missed it and however far `chooseNextTeachingAction` actually narrowed the ask. A
    // fully built, fully tested scaffolding decision with nothing downstream ever reading it.
    // 🔴 THE NARROWING IS EXPLICIT RATHER THAN IMPLIED BY EXHAUSTION. Every other asking action has
    // returned above, so this line only ever sees `retrieve` — but a reader (and the compiler) should
    // not have to prove that by elimination, and the day a seventh action is added the honest failure
    // is this branch refusing to compile rather than quietly wording someone else's task.
    if (action.type !== "retrieve") return;
    setPrompt(retrievalPromptFor(decision, crypto.randomUUID(), action.rung));
  }, [decision, decisionKey]);

  const promptId = prompt?.id ?? null;
  useEffect(() => {
    setChoicesRevealed(false);
  }, [promptId]);

  /**
   * A worked example reached the learner.
   *
   * 🔴🔴 THE ONLY PLACE THIS ACTION IS EVER RECORDED, WHICH IS WHY IT FIRES ON DISPLAY RATHER THAN ON
   * ACKNOWLEDGEMENT. `learner_evidence` holds claims about what a person has SHOWN, and reading a
   * demonstration shows nothing — so there is no honest row to write and the durable question "did
   * being walked through the working produce later unaided recall?" has to be answered by joining
   * this event against the evidence rows that follow it. Firing on Continue would count only the
   * examples people finished, which is a different and much less useful number.
   *
   * 🔴 KEYED ON `decisionKey`, SO ONE DEMONSTRATION IS ONE EVENT. The decision recomputes whenever
   * evidence reloads; the key changes when the thing on screen does.
   */
  const reportedModel = useRef<string | null>(null);
  useEffect(() => {
    if (!decision || !decisionKey || decision.action.type !== "worked_example") return;
    if (reportedModel.current === decisionKey) return;
    reportedModel.current = decisionKey;
    canvasCapture("canvas_worked_example_shown", canvas, {
      objective: decision.objective.identityKey,
      strategy: decidedStrategy,
    });
  }, [canvas, decidedStrategy, decision, decisionKey]);

  const revealChoices = useCallback(() => {
    if (!prompt?.choices || choicesRevealed) return;
    setChoicesRevealed(true);
    canvasCapture("canvas_choices_revealed", canvas, {
      objective: decision?.objective.identityKey ?? null,
      options: prompt.choices.options.length,
      strategy: decidedStrategy,
    });
  }, [canvas, choicesRevealed, decidedStrategy, decision, prompt]);

  const refresh = useCallback(
    async (objectives: readonly StoredObjective[]) => {
      if (!uid) return;
      const rows = await loadEvidence(uid, objectives);
      setEvidence(rows);
      setDecidedAt(new Date());
    },
    [uid],
  );

  /**
   * Write everything one submission produced, then re-read.
   *
   * 🔴 IT TAKES THE WHOLE PERFORMANCE, NOT A ROW. One answer covering four objectives is four rows
   * sharing one response identity, and they succeed or fail as one thing as far as the learner is
   * concerned — so the error is reported once, about the answer, rather than four times about rows
   * they never knew existed.
   *
   * 🔴 THE WRITES ARE SEQUENTIAL AND NOT ATOMIC, WHICH IS A REAL AND ACCEPTED LIMITATION. A failure
   * partway leaves the earlier rows written. That never over-claims — the rows that landed are
   * things the judge genuinely established — and because every row's `(objective, responseId)` pair
   * is stable, re-submitting the same answer re-attempts all of them and the ones already stored
   * are no-ops, so a retry converges rather than duplicating. The clean fix is a batched upsert in
   * `learner-store.ts`, which is Brain's file; requested rather than reached into.
   */
  const record = useCallback(
    async (built: readonly Parameters<typeof recordEvidence>[1][]) => {
      // 🔴 NOTHING TO WRITE IS NOT A FAILURE TO WRITE, AND RUNTIME-006 MADE THIS REACHABLE.
      //
      // `written` used to start as `built.length > 0`, so an empty array fell straight into the
      // error below and told the learner *"That answer was judged, but Nemesis could not save it"* —
      // both halves false when the judge was never reached. It was unreachable before, because
      // every path returned one row per target. `noJudgement()` now legitimately produces zero rows
      // for any prompt, and it is a value a caller is invited to construct and hand down here.
      //
      // So the guard lives at the writer rather than at the one call site that currently avoids it:
      // an outage writes nothing AND claims nothing. No error, and no refresh — nothing changed, so
      // re-reading would be a round trip that can only tell us what we already know.
      if (built.length === 0) return;

      // 🔴 RAISED BEFORE THE FIRST WRITE, LOWERED ONLY AFTER THE RE-READ — see `recording`. It spans
      // the whole window in which `evidence` disagrees with what the learner just did, and it is a
      // `finally` because the failure paths are part of that window too: a flag left raised would
      // freeze the surface, and one dropped early would reopen the race it exists to close.
      setRecording(true);
      try {
        let written = true;
        labTrace("evidence", `writing ${built.length} row(s)`, () => ({ rows: built }));
        for (const row of built) {
          // Sequential rather than concurrent: they conflict on the same index, and a burst of
          // parallel upserts for one answer is exactly the shape that makes a duplicate look like a
          // race rather than the no-op it is meant to be.
          if (!(await recordEvidence(uid, row))) written = false;
        }
        if (!written) {
          labTrace("evidence", "🔴 the write FAILED, so nothing was recorded", () => ({ rows: built }));
          setError("That answer was judged, but Nemesis could not save it. It won't count yet.");
          // 🔴 NO REFRESH ON FAILURE. Re-reading here would let the policy decide its next move from
          // a half-written performance, teaching from a learner model that is missing exactly the
          // rows the write dropped.
          return;
        }
        // 🔴 THE POLICY RUNS AGAIN FROM RE-READ EVIDENCE, NOT FROM WHAT WE JUST SENT. Applying the
        // new row to local state would work right up until a write was rejected, and then the canvas
        // would teach from a learner model the database does not hold. Reading it back is what makes
        // "the log is the truth" true at runtime and not only in the type comments.
        await refresh(supported.map((entry) => entry.objective));
      } finally {
        setRecording(false);
      }
    },
    [refresh, supported, uid],
  );

  /** An opportunity that produced nothing — a reveal, a giving-up, a typed "I don't know".
   *
   *  🔴 `tookMs` TRAVELS DOWN THIS PATH TOO. Someone who typed "I don't know" spent time doing it,
   *  and that is an observation about the attempt worth keeping — dropping it here would make the
   *  admission look like an opportunity nobody watched. It stays absent when nothing typed it. */
  const admitNothing = useCallback(
    async (
      said: string | null,
      tookMs?: number,
      responseModality?: LearnerInputModality,
      /**
       * Which kind of non-attempt this was, for analytics only.
       *
       * 🔴 THE EVIDENCE IS IDENTICAL AND THE EVENT MUST NOT BE. An opportunity that produced no
       * demonstration is one durable fact however it came about — that is the whole point of
       * `unobtainedEvidence`. But someone who ECHOED the cue did not tell us they did not know, and
       * filing them under `canvas_unknown_admitted` would put a statement in the analytics that the
       * learner never made. Same row, different account of how we got there.
       */
      event: "canvas_unknown_admitted" | "canvas_cue_echoed" = "canvas_unknown_admitted",
    ) => {
      const active = prompt;
      if (!active || !decision || !uid) return;
      canvasCapture(event, canvas, { objective: decision.objective.identityKey });
      setFeedback(null);
      await record(
        unobtainedEvidence({
          canvasId: canvas.id || null,
          occurredAt: new Date().toISOString(),
          // 🔴 THE ASSISTANCE THEY ACTUALLY HAD, NOT THE ONE THAT WAS PLANNED. Saying "I don't know"
          // to a question whose options were never opened is an unaided miss, and filing it at the
          // `recognition` rung would understate what was asked of them.
          prompt: asMet(active, choicesRevealed),
          responseText: said,
          responseModality,
          // 🔴 THE ARM THAT CHOSE THIS OPPORTUNITY, ON THE NON-ATTEMPT PATH TOO. Someone giving up
          // on a question is an outcome the experiment cares about at least as much as a judged
          // answer, and a row without an arm is a row the comparison cannot see.
          teachingStrategy: decidedStrategy,
          ...(tookMs !== undefined ? { tookMs } : {}),
        }),
      );
    },
    [canvas, choicesRevealed, decision, decidedStrategy, prompt, record, uid],
  );

  const submit = useCallback(
    async (text: string, via: LearnerInputModality, tookMs?: number) => {
      const said = text.trim();
      const active = prompt;
      if (!said || !active || !decision || !uid || judging) return;
      setError(null);

      // 🔴 SAYING "I DON'T KNOW" IS NOT A WRONG ANSWER, AND THE JUDGE HAS NO WAY TO SAY SO. The
      // dedicated control for this was removed from the recall surface — it competed with the
      // question, and someone who does not know can simply type it. But the evaluator's verdicts
      // are all judgements of an ATTEMPT, so an admission would come back `incorrect` and the
      // learner would be recorded as having got it wrong when they told us they had nothing. Same
      // path as the old button: an opportunity given, no demonstration obtained, no verdict.
      if (isAdmissionOfNotKnowing(said)) {
        await admitNothing(said, tookMs, via);
        return;
      }

      // 🔴 GIVING BACK THE CUE IS NOT AN ATTEMPT EITHER, AND THE JUDGE CANNOT SEE IT. Asked "what is
      // the brand for losartan?" and answered `losartan`, the learner produced the side they were
      // HANDED and asserted nothing about the direction they were asked. Measured in production, the
      // real judge read that as `partial`, confidence 0.30 — and it was not wrong to: the answer has
      // maximum lexical overlap with the question, because the token is literally inside it. Every
      // string, substring and embedding comparison scores it highly.
      //
      // The judge is asked "how good is this answer". The question nobody asked is whether an ATTEMPT
      // was made at all — which is structural, so it belongs here, before the judge, beside the other
      // non-attempt. Recorded as `partial` it becomes a durable claim that someone partly knows
      // something they showed nothing about: absence of evidence stored as evidence.
      if (
        isEchoOfTheCue({
          cue: decision.objective.cue,
          expectedAnswer: active.expectedAnswer,
          response: said,
        })
      ) {
        await admitNothing(said, tookMs, via, "canvas_cue_echoed");
        return;
      }

      setJudging(true);
      setPhase("reading_answer");
      const response = { text: said, via, ...(tookMs !== undefined ? { tookMs } : {}) };
      // 🔴 HELD IN A NAMED VALUE SO THE LAB CAN REPLAY THE JUDGE ON EXACTLY WHAT IT WAS GIVEN.
      // Rebuilding this from the pieces at replay time would be a second construction of the task,
      // free to differ from the one that produced the verdict under investigation.
      const judgeInput = objectiveAsTask(decision.objective, active, response);
      const result = await evaluateLearningResponse(uid, canvas, judgeInput);
      setJudging(false);
      setPhase(null);

      if (!result.value) {
        // 🔴 A JUDGE WE COULD NOT REACH IS NOT A LEARNER WHO FAILED. Writing `not_demonstrated`
        // here would charge someone for our outage — the same absence-as-evidence defect the whole
        // design exists to avoid — so nothing is recorded and the prompt stays put for another go.
        // The cost is honest and bounded: a flaky judge means no progress, never wrong progress.
        //
        // 🔴 THIS BRANCH IS `noJudgement()` — AND IT IS NO LONGER THE ONLY THING HOLDING THE LINE.
        // Until RUNTIME-006 the invariant lived entirely in this early return: pass `[]` further
        // down and every target would have been written as "asked, showed nothing". `Judgement` now
        // carries the distinction, so a future caller that deletes this guard cannot silently get
        // the wrong behaviour — it has to say which case it is in. The return stays because the
        // UI differs too: `record()` reports a save failure, which is not what happened here.
        canvasCapture("canvas_judge_failed", canvas, { objective: decision.objective.identityKey });
        // The distinction the whole design turns on: a judge nobody could reach is NOT a learner
        // who failed. From outside, both look like an answer that went nowhere.
        labTrace("judge", "the judge could not be reached, so nothing was recorded", () => ({
          answer: said,
          error: result.error,
          objective: decision.objective.identityKey,
        }));
        // 🔴 SAYS WHAT IS TRUE HERE, NOT WHAT THE SHARED STRING SAYS. The evaluator's own message
        // ends "Your response was saved" — true on the six-stage path, where the answer is written
        // to the canvas before the judge is called, and FALSE here, where evidence is written only
        // from a verdict. Passing it through would tell someone their work was kept when it was not.
        setError("Nemesis couldn't read that answer, so nothing was recorded. Try again.");
        return;
      }

      const evaluation = result.value;

      // 🔴🔴 THE JUDGE DECLINED TO GRADE THIS, SO NOTHING IS GRADED AND NOTHING IS RECORDED.
      //
      // Reported by the owner, 2026-08-19: with a question on screen he typed "what is on the news
      // today?" and Nemesis answered "Not quite. Here's the gap." and wrote a durable row —
      // `incorrect`, confidence 0.95, evidence `contradicted`, errorType `conceptual`. Asking about
      // the news became proof he misunderstood sulfur bonding. Two older rows say "what?" — someone
      // saying they did not follow — filed the same way.
      //
      // 🔴 THE INVARIANT IS NOT WEAKENED. `composerIntent` still says ANSWER, still outranks
      // everything, and is untouched; a real attempt still cannot be misrouted to chat. The one
      // component that already reads the sentence has simply been given a way to say "this was not
      // aimed at the question", and that is the ONLY way out. See `Verdict.not_an_attempt`.
      //
      // 🔴 NO ROW, NOT EVEN AN EMPTY ONE. `unanswered` exists for "we asked and learned nothing" and
      // is the wrong shape here: the learner was never asked about what they typed, so there is no
      // opportunity to record. Absence of a question is not absence of an answer.
      if (evaluation.verdict === "not_an_attempt") {
        labTrace("judge", "not an attempt: routed to conversation, nothing recorded", () => ({
          answer: said,
          objective: decision.objective.identityKey,
          question: active.prompt,
        }));
        canvasCapture("canvas_submission_not_an_attempt", canvas, {
          objective: decision.objective.identityKey,
        });
        setJudging(false);
        // 🔴 THE QUESTION STAYS ON SCREEN. They did not answer it and they did not dismiss it; the
        // canvas has no business moving on, and coming back to find it gone would be the product
        // deciding their aside was a surrender.
        notAnAttempt?.(said);
        return;
      }

      labTrace(
        "judge",
        `${evaluation.verdict} on "${decision.objective.identityKey}"`,
        () => ({
          answer: said,
          confidence: evaluation.confidence,
          errorType: evaluation.errorType ?? null,
          evaluation,
          misconceptions: evaluation.misconceptions ?? null,
          objective: decision.objective.identityKey,
          question: active.prompt,
          expectedAnswer: active.expectedAnswer,
          judgeInput,
          concepts: canvas.concepts,
          statement: decision.knowledge.statement,
          verdict: evaluation.verdict,
          via,
        }),
      );
      // 🔴 THE VERDICT'S MODE IS MINTED FROM THE OBJECTIVE THAT WAS ANSWERED, AND FROM NOTHING
      // ABOUT THE ANSWER — §39. `evaluation` is right here and is deliberately not consulted:
      // "correctness does not determine advancement; cognitive mode does". Passing the verdict in
      // would rebuild `feedbackPassed`, which is the inference Canvas UI came one commit from
      // shipping — a Continue that appears exactly when the learner was wrong.
      setFeedback({
        answer: said,
        evaluation,
        via,
        exposition: expositionFor({
          capability: decision.objective.capability,
          kind: "verdict",
          knowledgeType: decision.knowledge.type,
        }),
      });
      canvasCapture("canvas_response_judged", canvas, {
        confidence: evaluation.confidence,
        objective: decision.objective.identityKey,
        stage: "policy",
        // 🔴 ON THE EVENT AS WELL AS ON THE ROW, AND THE TWO ANSWER DIFFERENT QUESTIONS. The row is
        // the durable record a comparison is computed from; the event is what makes a live funnel
        // splittable by arm without waiting for anyone to query the database. Neither is derivable
        // from the other: PostHog cannot see `learner_evidence`, and the evidence log deliberately
        // holds no interaction events.
        strategy,
        verdict: evaluation.verdict,
        via,
      });
      await record(
        evidenceForSubmission({
          canvasId: canvas.id || null,
          occurredAt: new Date().toISOString(),
          // 🔴 THE JUDGE ASSESSED THE OBJECTIVE IT WAS ASKED ABOUT, AND THAT IS WHAT IS NAMED HERE.
          // This surface stages one objective per question, so one verdict covers one target. When
          // a multi-objective judge exists it returns one of these per objective it actually
          // assessed, and the fan-out routes them unchanged — nothing here has to spread a verdict
          // across a set, which is the one thing that would record demonstrations nobody made.
          //
          // 🔴 `judged(...)` RATHER THAN A BARE ARRAY — RUNTIME-006. Reaching this line is itself
          // the claim that we have an account of the performance. The unreachable-judge case is
          // `noJudgement()` and writes nothing; it is handled above, before anything is built.
          // 🔴 `.filter(Boolean)` RATHER THAN `!`. `outcomeFor` returns null only for
          // `not_an_attempt`, which returned above — but an assertion here would be a promise about
          // a branch in another file, and the next verdict that declines to produce an outcome would
          // land as a runtime null inside the durable write rather than as a compile error.
          judgement: judgementOf([outcomeFor(decision.objective, evaluation)].filter((o) => o !== null)),
          // 🔴🔴 THIS IS WHERE QUESTION-BEFORE-OPTIONS BECOMES HONEST RATHER THAN COSMETIC. A learner
          // who typed the answer with nothing on screen but the question PRODUCED it, and the row has
          // to say so — otherwise the strongest performance the surface can elicit is filed as the
          // weakest evidence the ladder has, and the policy comes straight back to probe for a
          // production that has already been given.
          prompt: asMet(active, choicesRevealed),
          responseText: said,
          responseModality: via,
          // 🔴 WHICH CONTROLLER CHOSE THIS QUESTION. The experiment's grouping key, written at the
          // one point where the arm is unambiguous. Everything downstream of here — the judge, the
          // verdict, the row shape — is identical between arms by construction, which is what makes
          // this single field the whole of the difference.
          teachingStrategy: decidedStrategy,
          ...(tookMs !== undefined ? { tookMs } : {}),
        }),
      );
    },
    [admitNothing, canvas, choicesRevealed, decision, decidedStrategy, judging, notAnAttempt, prompt, record, uid],
  );

  /**
   * One option tapped on a recognition task.
   *
   * 🔴 NO JUDGE, AND THIS IS THE ONE PLACE THAT IS RIGHT. `submit`'s whole design is that the
   * evaluator decides — and its own reason for that is about FREE TEXT: string comparison "would call
   * a correct answer wrong for a capital letter and cannot tell a wrong answer from a specific
   * competing one". Neither applies to a tap. There is nothing to spell, and which competing belief
   * was picked was decided before the question was shown. Sending this to a model would spend a call
   * to re-derive a fact already on the prompt, and could disagree with it.
   *
   * 🔴 IT NEVER PASSES THROUGH `isAdmissionOfNotKnowing` OR `isEchoOfTheCue`. Both exist because a
   * typed answer can fail to be an attempt; a tap cannot. See `choose` on `PolicyRuntime`.
   */
  const choose = useCallback(
    async (option: string, tookMs?: number) => {
      const active = prompt;
      const choices = active?.choices;
      if (!active || !choices || !decision || !uid || judging || recording) return;
      // 🔴 A TAP IS ONLY MEANINGFUL ONCE THE OPTIONS ARE ON SCREEN. The view does not paint them
      // before that, so this is unreachable through the UI — and it is exactly the kind of
      // unreachable that stops being unreachable, at which point a row would claim the learner
      // picked from a list they were never shown.
      if (!choicesRevealed) return;
      setError(null);
      // 🔴 READ ONCE. The ground is needed three times below (the verdict sentence, the analytics
      // split, the outcome) and re-reading would be three places that can be handed different sets.
      const selection = readSelection(choices, option);
      const outcome = outcomeForSelection(decision.objective, selection);
      if (!outcome) {
        // 🔴 NO ACCOUNT OF THIS PERFORMANCE EXISTS, SO NOTHING IS WRITTEN — `noJudgement()` in
        // everything but name. The tapped text is not among the options on record, which means the
        // set on screen is not the set being read: a stale render, or a pool rebuilt underneath. The
        // learner did nothing wrong and no row may say they did.
        canvasCapture("canvas_option_unreadable", canvas, { objective: decision.objective.identityKey });
        return;
      }
      const correct = selection.kind === "correct";
      // 🔴 THE VERDICT'S MODE COMES FROM THE OBJECTIVE, NOT FROM WHETHER THEY WERE RIGHT — §39,
      // identical to the typed path three functions down. A mode read off correctness would rebuild
      // the Continue that appears exactly when the learner was wrong.
      setFeedback({
        answer: option,
        evaluation: {
          // 🔴 CERTAIN, AND THAT IS NOT A FABRICATION. `confidence` is how sure the reading of an
          // ANSWER is, and reading a tap is exact: the option that was pressed is the option that was
          // pressed. It is display-only either way. What goes on the durable row is
          // `outcomeForSelection`'s outcome, which deliberately carries no confidence at all, because
          // there no judge spoke and absent means not observed.
          confidence: 1,
          demonstrated: correct ? [decision.objective.label] : [],
          missing: correct ? [] : [decision.objective.label],
          misconceptions: [...(outcome.misconceptions ?? [])],
          verdict: outcome.verdict,
          // 🔴 STRUCTURAL, AND IT NEVER TELLS THEM THEY WERE RIGHT OR WRONG IN WORDS. The headline
          // above it already carries the verdict; this line says what the option they pressed IS, and
          // it is derived from the ground rather than written per question, so it cannot claim
          // anything the option set does not already assert.
          feedback: selection.kind === "distractor" && selection.ground.kind === "held_misconception"
            ? "That is the same answer you gave before."
            : "That one is the answer to something else here.",
        },
        exposition: expositionFor({
          capability: decision.objective.capability,
          kind: "verdict",
          knowledgeType: decision.knowledge.type,
        }),
        // 🔴 `null`, NOT `"typed"`. They tapped. See `PolicyRuntime["feedback"]`.
        via: null,
      });
      canvasCapture("canvas_option_picked", canvas, {
        // 🔴 THE GROUND, NEVER THE OPTION TEXT. Analytics is a shared surface and an option's text is
        // the learner's own material; the ground is the structural fact ("they picked a belief they
        // already held") and it is what a funnel can actually be split by.
        ground: selection.kind === "distractor" ? selection.ground.kind : "correct",
        objective: decision.objective.identityKey,
        options: choices.options.length,
        strategy: decidedStrategy,
      });
      await record(
        evidenceForSubmission({
          canvasId: canvas.id || null,
          judgement: judgementOf([outcome]),
          occurredAt: new Date().toISOString(),
          prompt: active,
          // 🔴🔴 THE OPTION THEY PICKED, VERBATIM, AND THIS IS THE WHOLE REASON THE FEATURE IS WORTH
          // BUILDING. `responseText` is *"what the learner actually wrote or said, verbatim… kept raw
          // so a better evaluator can re-read it"*, and for a recognition task it is the identity of
          // the distractor. Without it the durable record would say only "wrong", which is precisely
          // the objection multiple choice has always deserved and which this answers.
          responseText: option,
          // 🔴 NO `responseModality`. Absent means not observed, and a tap genuinely is not typed,
          // spoken or written. `typed` would be a false claim in the one column that records how an
          // answer arrived, and the column is constrained to those three values in the database — so
          // the honest value is also the only one that would not need a migration to be wrong.
          teachingStrategy: decidedStrategy,
          ...(tookMs !== undefined ? { tookMs } : {}),
        }),
      );
    },
    [canvas, choicesRevealed, decision, decidedStrategy, judging, prompt, record, recording, uid],
  );

  /** Kept as a capability with no control on the recall surface: the caller decides whether to
   *  offer a button for it, and the meaning is identical either way. */
  const admitUnknown = useCallback(async () => {
    if (judging) return;
    setError(null);
    await admitNothing(null);
  }, [admitNothing, judging]);

  const acknowledge = useCallback(() => {
    // 🔴 REFUSED WHILE THE ANSWER IS STILL SETTLING, AND THE DIRECTION OF ERROR IS DELIBERATE.
    //
    // A caller is expected to wait for `recording` to clear — but this must not depend on every
    // caller remembering, because the cost of forgetting is not symmetric. Acknowledging early
    // clears the feedback and lets a task be built from a `decision` that predates this answer,
    // which can put the same question back with its answer on screen and record the echo as a
    // demonstration: invisible, durable, and a false claim about a learner.
    //
    // Refusing costs an auto-advance that does not happen — visible, recoverable, and immediately
    // obvious to whoever is testing. A missed advance is a much smaller failure than a fabricated
    // demonstration, so the guard lives here as well as in the caller.
    if (recording) return;
    const seen = decision?.objective.identityKey;
    setFeedback(null);
    setRound((current) => current + 1);
    // 🔴 APPENDED, NOT ADDED TO A SET. A repeat is a new position in the log, which is what makes
    // "since the LAST time this was acted on" answerable. Deduplicating here would silently freeze
    // the working-memory window at whatever the first visit's position was.
    if (seen) setActedOn((current) => [...current, seen]);
    // 🔴 THE SAME EVENT, RECORDED TWICE IN ONE STATEMENT SO THE TWO LISTS CANNOT DISAGREE. What this
    // adds over `actedOn` is the action and the clock, which is what "time already spent on this
    // objective" and "recent teaching actions" are computed from — see `attention-budget.ts`.
    if (seen && decision) {
      const act: TeachingAct = {
        action: decision.action.type,
        atMs: Date.now(),
        objectiveIdentityKey: seen,
      };
      setRecentActs((current) => [...current, act]);
    }
    // 🔴🔴 ONLY WHEN WHAT WAS ACKNOWLEDGED WAS THE CORRECTION ITSELF — AND THIS LINE USED TO GET
    // THAT WRONG IN THE ONE CASE IT WAS WRITTEN TO EXCLUDE.
    //
    // It read `decision?.action.type === "show_correction"`, under a comment that named the exact
    // failure: *"this runs for the feedback screen too, and recording that as 'the answer has been
    // shown' would make the policy defer at the exact moment the correction is owed — a learner who
    // got something wrong would never be shown the answer at all."*
    //
    // The hazard was understood; the test for it was wrong. `decision` is the QUEUED action, and
    // after a wrong answer it is ALREADY `show_correction` while the verdict is still painted. So
    // acknowledging the verdict — by Continue or by auto-advance, both call this — recorded the
    // correction as shown before it had ever been on screen, and the policy then deferred it.
    //
    //     answer wrongly -> verdict -> acknowledge -> correction suppressed -> next question
    //
    // Measured against the real `decideNext`, twelve steps, two objectives: **the correction never
    // painted at all.** Confirmed identical on `79bf80ad`, so it predates the auto-advance work.
    //
    // 🔴 `presenting`, NOT A SECOND COPY OF THE PRECEDENCE. The bug was two places each deciding
    // "what is on screen" and one of them being wrong. There is now one answer and both read it.
    if (seen && presenting.kind === "show_correction") {
      setCorrectionsShown((current) => new Set(current).add(seen));
    }
    // 🔴 THE ONLY RECORD A WORKED EXAMPLE LEAVES ANYWHERE, AND IT IS DELIBERATELY NOT DURABLE. The
    // learner demonstrated nothing by reading it, so there is no honest row to write; what the next
    // turn needs is simply "we already did that here", which is a fact about this sitting.
    if (seen && presenting.kind === "worked_example") {
      setModelled((current) => new Set(current).add(seen));
    }
    setDecidedAt(new Date());
  }, [decision, recording]);

  // 🔴 THE ONLY THING THAT DECIDES WHETHER AN INDICATOR APPEARS IS HOW LONG THE WORK ACTUALLY TOOK.
  // Everything in the recall path normally finishes well inside this window, so a learner drilling
  // facts sees no loading state at all — not a fast one, none. It surfaces only when there is
  // genuinely something to wait for.
  const thinking = useDelayedFlag(phase !== null, THINKING_VISIBLE_AFTER_MS);

  // ── What the Canvas can host right now ──────────────────────────────────────
  //
  // 🔴 A TASK EXISTS ONLY WHEN THERE IS SOMETHING TO ANSWER, AND FEEDBACK IS NOT THAT. While a
  // verdict is on screen the learner is reading, not answering — hosting a task through it would
  // put the next question up before they had seen what the last one showed, and the composer would
  // start routing answers to a prompt that had replaced the one they were looking at.
  //
  // 🔴 IT ALSO CARRIES THE BRAIN'S OWN PAIR OUT UNTOUCHED. `operation` and `knowledgeType` are the
  // policy's decision; the runtime hands them to the surface so a presentation can differ by
  // cognitive demand (§9, §14.6) without re-deriving what the demand IS.
  //
  // 🔴🔴 RECOGNITION HOSTS A TASK TOO, AND LEAVING IT OUT WAS THE SECOND HALF OF THE SWALLOWED-ANSWER
  // DEFECT. `awaitingAnswer` has always covered `retrieve` AND `recognise`; this built a task only
  // for `retrieve`, so during a multiple-choice question `answerSink` resolved to `none` — and a
  // learner who typed instead of tapping had their text routed to `begin()` on a pre-content canvas
  // and to `onAsk` everywhere else. Either way the judge never saw it and no row was written.
  //
  // The comment this replaces reasoned *"the options ARE the answer, so the composer does not
  // receive one"*. The options are AN answer surface; the composer is the primary one, and §2 of the
  // owner's directive is that every modality converges on one pipeline. Someone who reads four
  // options and types the answer in their own words has produced MORE than a tap, not less — and the
  // row still files at `rung: "recognition"`, `scaffoldingLevel: OPTIONS_ON_SCREEN`, because that
  // number says how much help was on the table, never whether the learner needed it.
  //
  // 🔴 TAPPING IS UNCHANGED. `CanvasPolicyView` still renders the options and still calls
  // `runtime.choose`, which deliberately does not consult the judge. This adds a second way in, it
  // does not move the first.
  const task: HostedTask | null = useMemo(() => {
    if (status !== "ready" || feedback || !decision || !prompt) return null;
    // 🔴 RESOLVED IN FAVOUR OF `performanceOf`, WHICH IS THE MORE GENERAL FORM. Both lanes found
    // this defect independently; the other named `retrieve` and `recognise` explicitly, this asks
    // the action whether it wants a performance at all, so the next action type that does cannot
    // be forgotten here.
    // 🔴🔴 EVERY ASK HOSTS A TASK NOW, AND UNTIL THIS LINE A RECOGNITION SCREEN HOSTED NONE. That was
    // not a styling gap: `answerSink` reads this to decide who receives a typed answer, so a learner
    // sitting in front of a recognition question who typed the answer instead of tapping had it
    // routed as a general question about the material. It is also what makes "question first,
    // options on request" possible at all — there has to be somewhere for the produced answer to go.
    if (!performanceOf(decision.action)) return null;
    const knowledgeType = decision.knowledge.type;
    const operation = prompt.operation;
    return {
      knowledgeType,
      operation,
      task: {
        answered: false,
        id: prompt.id,
        index: 0,
        kind: "question",
        placeholder: "Type your answer…",
        prompt: prompt.prompt,
        total: 1,
      },
      tempo: tempoFor({ knowledgeType, operation }),
    };
  }, [decision, feedback, prompt, status]);

  const territories = useMemo(() => availableTerritories(supported), [supported]);
  const claims = useMemo(() => knowledge.objectives.map((entry) => entry.knowledge), [knowledge]);

  /**
   * 🔴🔴 "THE ARM MUST NOT SILENTLY SWITCH HALFWAY THROUGH", MADE CHECKABLE RATHER THAN PROMISED.
   *
   * `resolveStrategy` is deterministic, so in principle this can never fire — which is exactly why
   * it is worth watching. The ways it COULD fire are all real and all silent: a URL override added
   * to a session already in progress, randomisation switched on while sessions are live, or a future
   * editor moving the assignment into `useState` and reintroducing the defect the derivation exists
   * to prevent. Any of those produces perfectly ordinary rows split across two controllers under one
   * label, and no metric computed afterwards can detect it.
   *
   * 🔴 IT REPORTS AND DOES NOT BLOCK. Refusing to teach on a mismatch would turn a reporting problem
   * into an outage for the learner, who has done nothing wrong and whose evidence is still valid —
   * what is compromised is one session's membership in an experiment, not the session.
   */
  const conflict = useMemo(
    () => conflictingStrategy({ canvasId: canvas.id, evidence, running: strategy }),
    [canvas.id, evidence, strategy],
  );
  const reportedConflict = useRef<string | null>(null);
  useEffect(() => {
    if (!conflict) return;
    // Once per (canvas, pair), not once per render: this sits downstream of `evidence`, which is
    // re-read after every answer.
    const seen = `${canvas.id}:${conflict}:${strategy}`;
    if (reportedConflict.current === seen) return;
    reportedConflict.current = seen;
    canvasCapture("canvas_strategy_conflict", canvas, { running: strategy, stored: conflict });
  }, [canvas, conflict, strategy]);

  // 🔴 DERIVED FROM `presenting`, WHICH IS ALREADY THE ONE ANSWER TO "WHAT IS ON SCREEN". Reading
  // `decision.action.type` directly here would be a fourth copy of a precedence this file has already
  // paid for getting wrong once: while a verdict is up, `decision` has moved on to the next action,
  // and a question that is still being read about would report itself as unanswered.
  //
  // 🔴 AND WHICH ACTIONS COUNT AS ASKING IS `performanceOf`'s ANSWER, NOT A SECOND LIST HERE. This
  // read `presenting.kind === "retrieve" || presenting.kind === "recognise"` and would have gone
  // stale the moment a third ask existed — a learner sitting in front of a completion task would
  // have had their typing routed as a question about the material, which is the same defect the
  // recognition ask hit before it. `learning-canvas.tsx` reads this property for that routing.
  const awaitingAnswer =
    presenting.kind !== "verdict" &&
    presenting.kind !== "nothing" &&
    decision !== null &&
    performanceOf(decision.action) !== null &&
    prompt !== null;

  return {
    acknowledge,
    admitUnknown,
    awaitingAnswer,
    choicesRevealed,
    choose,
    citations,
    claims,
    coverage: knowledge.coverage,
    decision,
    error,
    evidence,
    exposition,
    feedback,
    focus,
    // 🔴 FORCED MEANS "RUNNING WITHOUT OWNERSHIP", NOT "SOMEONE TYPED force". On a canvas the
    // policy owns anyway, the parameter changed nothing and there is nothing to disclose.
    forced: forced && !knowledge.ownership.owns,
    judging,
    outcome: knowledge.outcome,
    ownership: knowledge.ownership,
    phase,
    prompt,
    recording,
    revealChoices,
    setFocus,
    status,
    strategy,
    submit,
    task,
    territories,
    deciding,
    thinking,
  };
}
