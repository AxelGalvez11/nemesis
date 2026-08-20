// WHICH CONTROLLER DECIDES WHAT THE LEARNER MEETS NEXT — the one seam, and the only thing that
// differs between the two arms of the experiment.
//
//     sources + learner context ──→ teaching strategy ──→ next Canvas action
//
// 🔴 THE POINT OF THIS FILE IS THAT ALMOST NOTHING IS IN IT. The experiment asks a single question —
// does Nemesis's structured cognition beat the same model given a good teaching objective? — and
// that question is only answerable if EVERYTHING ELSE IS BYTE-FOR-BYTE THE SAME. Same Canvas, same
// sources, same parser, same knowledge extraction, same objectives, same question wording, same
// evaluator, same evidence rows, same telemetry, same budget. So the interface is deliberately
// narrow: a controller receives the context and returns a `TeachingDecision`, and every downstream
// step is the code that already existed.
//
// 🔴 A CONTROLLER CHOOSES; IT DOES NOT AUTHOR. `retrievalPromptFor` still words the question,
// `canvas-judge` still marks the answer, `objective-task.ts` still builds the evidence rows. If an
// arm were allowed to write its own question text, the two arms would be putting different sentences
// in front of learners and being marked by a judge reading different inputs — and the difference in
// outcome could no longer be attributed to the controller. That is not a limitation of the design;
// it is the design. A guard asserts it (`strategy-cleanroom.test.ts`).
//
// 🔴 AND THE ARM IS FIXED FOR THE SESSION. See `resolveStrategy`: it is derived from stable inputs
// rather than held in state, because state dies on reload and a mid-canvas re-roll would put two
// controllers' decisions under one experiment label, which silently makes both arms' numbers
// meaningless rather than loudly breaking anything.

import type { AttentionBudget, TeachingAct } from "./attention-budget";
import type { DeclaredMode } from "./canvas-continue";
import type { ResolvedObjective } from "./canvas-knowledge";
import type { Exposition } from "./cognitive-mode";
import type { LearnerEvidence, LearnerObjectiveState } from "./learner-evidence";
import type { TermLookup } from "./learner-friction";
import type { StoredObjective } from "./learner-store";
import type { KnowledgeObject } from "./knowledge-types";
import type { ActionValue } from "./next-action-value";
import type { TeachingAction } from "./teaching-policy";

/**
 * The two controllers.
 *
 * 🔴 THESE STRINGS ARE STORED, so they are a schema. They are the check-constraint values on
 * `learner_evidence.teaching_strategy` and the grouping key of every comparison in
 * `strategy-outcomes.ts`. Renaming one orphans every row already written under the old name — the
 * rows do not become wrong, they become uncountable, which is worse because nothing errors.
 */
export type TeachingStrategyId = "nemesis_policy" | "llm_teacher" | "nemesis_policy_fallback";

export const TEACHING_STRATEGIES: readonly TeachingStrategyId[] = [
  "nemesis_policy",
  "llm_teacher",
  "nemesis_policy_fallback",
];

/**
 * The arms a session may be ASSIGNED to.
 *
 * 🔴 `nemesis_policy_fallback` IS NOT AMONG THEM, AND THAT IS THE WHOLE REASON IT IS A SEPARATE
 * VALUE. Nobody is enrolled into it and no URL can select it. It is what gets STAMPED on a row when
 * the model controller could not decide and the structured policy answered in its place — a fact
 * about one turn, never a cohort. Randomising into it would be randomising into "the other arm
 * broke", which is not a treatment.
 */
export const ASSIGNABLE_STRATEGIES: readonly TeachingStrategyId[] = ["nemesis_policy", "llm_teacher"];

/**
 * The arm every session runs unless something says otherwise.
 *
 * 🔴🔴 THIS MOVED, AND IT IS THE PRODUCT CHANGE THIS FILE EXISTS TO CARRY. It was `nemesis_policy`
 * — a hand-written value function with four bands and eight tuned modifiers — and the owner has
 * ruled: *"Move teaching strategy toward model reasoning rather than continuing to accumulate
 * handcrafted pedagogical constants… Do not preserve an intentionally starved LLM simply to preserve
 * the old experiment."*
 *
 * The structured policy is not deleted and is not weakened. It remains a real arm, selectable by
 * override and by randomisation, and it is what a fallback falls back TO — which is exactly the
 * baseline the comparison needs. What changed is which one a learner meets by default.
 *
 * 🔴 AND THE REASON IT HAD TO MOVE RATHER THAN BOTH BEING FIXED. The drill trap measured in
 * `docs/canvas-teaching-policy-audit.md` §3 — eight consecutive misses, every one answered "ask
 * again", an untouched objective losing every round — cannot be repaired in the structured arm
 * without writing the attention economics a second time as heuristics. That is the duplicated system
 * the owner's own ordering rule puts fourth, and the Bitter Lesson constraint puts last.
 */
export const DEFAULT_STRATEGY: TeachingStrategyId = "llm_teacher";

/** Which arm answers when the assigned one cannot. 🔴 Named here rather than at the call site so
 *  "what happens when the model is unreachable" has exactly one answer in the codebase. */
export const FALLBACK_STRATEGY: TeachingStrategyId = "nemesis_policy";

/** The id a fallback decision is RECORDED as. 🔴 Never `nemesis_policy`: a turn the model failed to
 *  decide must not be counted as a turn the structured arm was chosen for. */
export const FALLBACK_RECORDED_AS: TeachingStrategyId = "nemesis_policy_fallback";

export function isTeachingStrategy(value: unknown): value is TeachingStrategyId {
  return typeof value === "string" && (TEACHING_STRATEGIES as readonly string[]).includes(value);
}

/**
 * How a controller accounts for the decision it made.
 *
 * 🔴 A DISCRIMINATED UNION RATHER THAN A SHARED `because: string`, BECAUSE THE TWO ARMS KNOW
 * GENUINELY DIFFERENT THINGS ABOUT THEIR OWN CHOICE AND FLATTENING THEM WOULD DESTROY THE ONE
 * ARTEFACT THAT MAKES THE EXPERIMENT DEBUGGABLE. `nemesis_policy` can name the band it scored in and
 * every modifier that contributed — system state, assertable in a test. `llm_teacher` has a sentence
 * a model wrote, which is a claim about its own reasoning and must never be read as system state.
 * One `string` field holding both would invite exactly that confusion, and the comparison would end
 * up quoting a model's self-description as though it were a measurement.
 */
export type DecisionRationale =
  /** The value function's trace: the band, and every modifier that moved the score. */
  | { by: "nemesis_policy"; selection: ActionValue }
  /**
   * What the model said it was doing, and how much it was choosing from.
   *
   * 🔴 `because` IS MODEL PROSE AND NOTHING MAY BRANCH ON IT. It is carried so a human reviewing a
   * session can read what the teacher thought it was doing; it is not parsed, not matched, and
   * never turned into a signal. `candidates` is the real observation — how many objectives were on
   * offer when it chose — because a controller picking one of two is doing less work than one
   * picking one of forty, and the comparison has to be able to see that.
   */
  | { by: "llm_teacher"; because: string; candidates: number }
  /**
   * The structured policy answered because the model controller could not.
   *
   * 🔴🔴 A THIRD VARIANT RATHER THAN REUSING `nemesis_policy`'s, BECAUSE THE ROW HAS TO BE
   * EXCLUDABLE. The experiment's whole risk, spelled out at length under `StrategyRefusal`, is a
   * silent fallback making the two arms one arm and reporting them as equivalent. Shipping the model
   * controller as the default means the product now NEEDS a fallback — a learner must not meet a
   * blank canvas because an upstream provider blinked — so the fallback exists and is loud instead
   * of absent. It carries the refusal that caused it, so "how often did the model arm fail" is a
   * count and not a guess.
   */
  | { by: "nemesis_policy_fallback"; after: StrategyRefusal; selection: ActionValue };

/**
 * The next Canvas action — what a controller returns, and the only thing the Canvas consumes.
 *
 * 🔴 ONE SHAPE FOR BOTH ARMS, WHICH IS WHY THIS IS NOT CALLED `PolicyDecision` ANY MORE. The old
 * name said the structured policy produced it; two controllers do now, and a type named after one of
 * them is an invitation to add a second rendering path "just for the other one". There is one Canvas
 * and there must stay one, so there is one decision type and the arm shows up only in `rationale`.
 */
export interface TeachingDecision {
  objective: StoredObjective;
  knowledge: KnowledgeObject;
  state: LearnerObjectiveState;
  action: TeachingAction;
  /** This objective's own evidence, newest last — what the decision was made from. */
  evidence: LearnerEvidence[];
  /**
   * What the learner is being asked to take in, and for how long — §39.
   *
   * 🔴 CARRIED UP FROM THE ACTION, NEVER RE-DERIVED, AND THAT RULE NOW BINDS BOTH ARMS. It is
   * `expositionOf(action)` in every case: the policy decided it at the point where it decided what
   * to emit, and a controller that chose the same action must present it identically or the two arms
   * are showing learners different screens. A model is never asked what mode to use.
   */
  exposition: Exposition;
  /** The same mode, flat, because that is the shape the Canvas reads structurally. Derived from
   *  `exposition` in the one place both are set, so they cannot disagree. */
  cognitiveMode: DeclaredMode;
  /** How the controller that chose this accounts for it. Arm-specific by construction. */
  rationale: DecisionRationale;
}

/**
 * Why a controller produced no decision when it was asked for one.
 *
 * 🔴🔴 THE SINGLE MOST IMPORTANT TYPE IN THE EXPERIMENT, AND IT EXISTS TO STOP A RESULT THAT WOULD
 * BE WORSE THAN NO RESULT. The `llm_teacher` arm reaches a model, and models fail: unreachable,
 * unparseable, or naming an objective that is not on the canvas. The obvious recovery is *"fall back
 * to the Nemesis policy"* — and it is catastrophic here, because the LLM arm would then quietly BE
 * the Nemesis arm, every metric would report the two as equivalent, and the conclusion drawn would
 * be "structured cognition adds nothing" when what actually happened is that the baseline never ran.
 * A degraded arm must read as degraded.
 *
 * So there is no fallback anywhere in this layer. A controller that cannot decide says so, the
 * reason is counted (`canvas_strategy_refused`), and the Canvas shows nothing rather than something
 * the other arm chose. That costs a wasted turn, visibly. The alternative costs the experiment,
 * invisibly.
 *
 * 🔴 THE REASONS ARE NAMES, NOT MESSAGES, so they can be tallied. Same construction as
 * `canvas_causal_refused`: an empty result and a broken lane look identical at the call site, and
 * only a reason tally tells a quiet canvas from a prompt the model is not following.
 */
export type StrategyRefusal =
  /** The model could not be reached, or returned nothing. Ours, not the learner's. */
  | "model-unreachable"
  /** A reply arrived and was not the shape that was asked for. */
  | "unparseable"
  /** The controller named an objective that is not among the candidates it was given. */
  | "unknown-objective"
  /** The controller named an action outside the vocabulary it was given. */
  | "unknown-action"
  /**
   * The action is real, and this objective's material cannot support it honestly.
   *
   * 🔴 A DIFFERENT FACT FROM `unknown-action`, AND THE TALLY IS WHY. "The model said a word we do
   * not have" is a controller that is not following its instructions; "the model asked for a worked
   * example over a two-column association" is a controller reasoning sensibly about a canvas whose
   * material has no process to model. Merging them would make a healthy arm look broken, and would
   * hide the number that actually matters — how often the grounded builders refuse, which is what
   * says whether these actions are worth offering on this material at all.
   */
  | "ungroundable-action"
  /** There was nothing to choose from. Not a failure — stated so it can be told from one. */
  | "no-candidates";

/**
 * What a controller returns.
 *
 * 🔴 `decision: null` AND `refusal: null` TOGETHER IS THE HONEST "NOTHING IS OWED", AND IT HAS TO BE
 * REPRESENTABLE SEPARATELY FROM A FAILURE. A canvas where every objective has just been demonstrated
 * genuinely has nothing to ask, and the surface already says so. Collapsing that into a refusal
 * would file ordinary success as a fault; collapsing a refusal into it would hide an arm that is not
 * working. They are opposite facts and each has its own field.
 */
export interface StrategyOutcome {
  /** Which arm produced this. Recorded on every evidence row the decision goes on to generate. */
  strategy: TeachingStrategyId;
  decision: TeachingDecision | null;
  refusal: StrategyRefusal | null;
  /**
   * Objectives the controller decided to spend this minute away from, before it settled on the
   * decision above.
   *
   * 🔴🔴 THE HALF OF "FIRST-CLASS `advance`" THAT IS EASY TO FORGET AND WOULD STALL THE LOOP. A
   * controller that answers "move on from this one" has made a real decision, and the Canvas still
   * has to put SOMETHING in front of the learner — so the objective is set aside and the controller
   * is asked again. Without this list the runtime would never learn which ones were passed over, ask
   * about them again on the very next turn, and the learner would meet the same skipped material for
   * ever: the drill trap rebuilt out of the mechanism meant to end it.
   *
   * 🔴 IT IS RUNTIME STATE AND NEVER EVIDENCE. Deciding not to spend a minute on something says
   * nothing about whether the learner knows it, so not one row is written from this. It dies with
   * the sitting, exactly like `actedOn`.
   *
   * Empty on every ordinary turn, which is the common case.
   */
  movedOn?: readonly MovedOn[];
}

/** One objective passed over, and why. 🔴 The reason is the controller's own sentence, carried so a
 *  human reviewing a session can see what it was thinking. Nothing branches on it. */
export interface MovedOn {
  objectiveIdentityKey: string;
  /** `advance` or `revisit` — they mean different things and both end this objective's turn. */
  action: "advance" | "revisit";
  because: string;
}

/**
 * Everything a controller may read.
 *
 * 🔴 IDENTICAL FOR BOTH ARMS, AND THAT IS AN EXPERIMENTAL CONSTRAINT RATHER THAN AN INTERFACE
 * CONVENIENCE. If one controller received something the other did not, a difference in outcome could
 * be the extra input rather than the reasoning over it, and there would be no way afterwards to tell
 * which. Both are handed the same objectives, the same evidence, the same clock and the same session
 * state. What differs is entirely what they do with it.
 */
export interface TeachingContext {
  /** The candidate objectives, already narrowed by focus. Both arms choose only from these. */
  objectives: readonly ResolvedObjective[];
  /**
   * What the learner said to open this sitting, in their own words, when this canvas began from an
   * utterance rather than from a file.
   *
   * 🔴🔴 THIS IS EVIDENCE THE LEARNER SUPPLIED, WHICH IS WHY IT DOES NOT ERODE THE INVARIANT IT
   * LOOKS LIKE IT MIGHT. `teaching-policy.ts` guards *"unknown means Nemesis lacks evidence, not
   * that the learner lacks knowledge"*, and from that it follows that an empty canvas opens by
   * ASKING rather than by teaching. That is right when somebody attaches a document and says
   * nothing: we know nothing about them, and assuming ignorance would be a claim we cannot make.
   * It is wrong when they typed "teach me functional groups", because then we are not inferring
   * anything — they told us. Reported by the owner on 2026-08-19, who asked to be taught organic
   * chemistry and was immediately quizzed on it.
   *
   * 🔴 THE UTTERANCE, NOT A FLAG, AND NOT THE TOPIC. A boolean computed up in the UI ("this looked
   * like a teach request") would put a second classifier in front of the model, which is precisely
   * what #689 deleted. The controller already reads the learner; give it the words and let it
   * decide. The topic alone is no good either: "quiz me on glycolysis" and "teach me glycolysis"
   * reduce to the same topic and mean opposite things.
   *
   * 🔴 NOT PERSISTED, AND SCOPED TO THE SITTING. It describes how this session started, not a fact
   * about the canvas; a stored one would still be steering the controller a week later, long after
   * the learner had met the material.
   */
  opening?: string | null;
  /** Everything this learner holds for these objectives, across every session. */
  evidence: readonly LearnerEvidence[];
  now: Date;
  /** Objectives this session has already acted on, oldest first, one entry per act. */
  actedOn?: readonly string[];
  /** Objectives whose correction has already been displayed in this session. */
  correctionsShown?: ReadonlySet<string>;
  /**
   * Objectives whose reasoning has been WORKED THROUGH in front of the learner this sitting.
   *
   * 🔴 SESSION CONTEXT, NEVER A LEARNER BELIEF, AND THAT LINE IS THE WHOLE REASON IT LIVES HERE
   * RATHER THAN IN `learner_evidence`. A worked example is something Nemesis did, not something the
   * learner demonstrated; a durable row recording it would sit in the table every downstream
   * projection reads as "what this person has shown", and `evidenceCount`, `lastEvidenceAt` and
   * every "met N times" line would start counting screens the learner only read. Invariants 1 and 2
   * hold here by construction: there is nothing durable to misread.
   *
   * 🔴 AND THE CONTROLLER GENUINELY NEEDS IT, which is why it is not simply dropped. Without it the
   * same model can be shown twice in a row — the model has no memory between turns and the snapshot
   * would carry no trace of an action that writes nothing. Exactly the role `correctionsShown`
   * already plays for `show_correction`.
   */
  modelled?: ReadonlySet<string>;
  /**
   * Every term this learner has stopped to look up.
   *
   * 🔴 UNUSED AT THE LIVE CALL SITE TODAY, AND SAID SO RATHER THAN QUIETLY CARRIED. The runtime does
   * not pass it (`use-policy-runtime.ts` builds the context without it), so terminology friction
   * currently contributes nothing in production for EITHER arm. It is on the context because both
   * arms must receive the same inputs whenever it is passed, not because it is live. Whoever wires
   * it up should know they are turning on a signal, not fixing a hole.
   */
  lookups?: readonly TermLookup[];
  /**
   * What this sitting has already staged, oldest first — every act, with its time.
   *
   * 🔴 A SUPERSET OF `actedOn`, AND BOTH ARE HERE ON PURPOSE. `actedOn` is a list of identity keys
   * that `decideNext` reorders by; this carries the same events with WHAT was done and WHEN, which
   * is what "time already spent on the current objective" and "recent teaching actions" are computed
   * from. Replacing `actedOn` with this would have meant editing the structured arm to accommodate
   * the model arm's needs, and that arm's own header forbids exactly that.
   *
   * Absent means nothing has been staged, or the caller does not track it — the same honest default
   * every other optional field here uses.
   */
  recentActs?: readonly TeachingAct[];
  /**
   * How much attention this sitting has, and how much of it is gone.
   *
   * 🔴🔴 THE INPUT WHOSE ABSENCE WAS THE DRILL TRAP. With no cost term a controller cannot weigh
   * "another minute here" against "a minute somewhere else", which is why `advance` was unreachable
   * from any state except `correct`. See `attention-budget.ts`.
   *
   * 🔴 OPTIONAL, AND ITS ABSENCE MEANS UNKNOWN RATHER THAN UNLIMITED. A controller told nothing about
   * time must not conclude it has plenty.
   */
  attention?: AttentionBudget;
  //
  // 🔴 THERE IS DELIBERATELY NO `scope` FIELD HERE, THOUGH COVERAGE IS AN OBJECTIVE OF THE PRODUCT.
  // How much material has been reached is DERIVED from `objectives` and `evidence`, both of which
  // are already on this context — see `teachingSnapshot`. Passing it in as well would be two sources
  // for one fact, and the day they disagree the controller is told a coverage figure that does not
  // describe the list it is choosing from. The narrowing that focus applies is exactly right here:
  // material the learner has scoped themselves out of is not what this minute is competing against.
  /** Who is learning. 🔴 Required by an arm that reaches a model, so the call is metered against
   *  the same budget every other Canvas model call is. Never read by `nemesis_policy`. */
  uid: string | null;
  /** Threaded so "we stopped waiting" and "it stopped" are the same event. */
  signal?: AbortSignal;
}

/**
 * How much of this canvas's material has been reached, and how much of the important part.
 *
 * 🔴 COUNTS, NEVER A PERCENTAGE, AND NEVER A SCORE. A fraction computed here would be one number
 * whose definition is frozen at the moment it was written — the same mistake `strategy-outcomes.ts`
 * refuses by staying a projection. Counts can be divided by whoever needs a rate, under whatever
 * definition they can defend.
 *
 * 🔴 AND THE IMPORTANT COUNTS ARE `null` UNTIL THE IMPORTANCE SIGNAL EXISTS, NOT `0`. "We cannot
 * yet tell what matters in this document" and "none of it matters" are opposite facts. Racing
 * through trivia and calling it coverage is the specific failure the owner named; reporting
 * unweighted coverage as though it were weighted would hide exactly that.
 */
export interface MaterialScope {
  /** Objectives the runtime can stage on this canvas, after focus. The denominator. */
  total: number;
  /** Of those, how many have any evidence at all. */
  touched: number;
  /** Of those, how many reached a demonstration Nemesis stands behind. */
  demonstrated: number;
  /** How many the source's own structure marks as central. `null` when importance is unread. */
  importantTotal: number | null;
  /** Of the important ones, how many reached a demonstration. `null` when importance is unread. */
  importantDemonstrated: number | null;
}

/**
 * A teaching controller.
 *
 * 🔴 ASYNC FOR BOTH ARMS EVEN THOUGH ONE OF THEM CANNOT BLOCK. `nemesis_policy` is a pure synchronous
 * function and wrapping it in a promise buys it nothing — but if the structured arm ran through a
 * `useMemo` while the model arm ran through an effect, the two would sit in different points of the
 * React lifecycle, settle at different times relative to the evidence they were computed from, and
 * the sentence "only the teaching controller changes" would be false. One signature, one call site,
 * one lifecycle.
 */
export interface TeachingStrategy {
  readonly id: TeachingStrategyId;
  decide(context: TeachingContext): Promise<StrategyOutcome>;
}

// ── Which arm this session runs ──────────────────────────────────────────────

/**
 * What a URL asked for, if anything.
 *
 * 🔴 SEPARATE FROM `PolicyOverride`, WHICH ANSWERS A DIFFERENT QUESTION. That one says whether the
 * teaching runtime may run at all and whether ownership is being bypassed; this says which
 * controller runs when it does. Folding them into one parameter would make "run the LLM arm" and
 * "skip the ownership check" the same switch, and a comparison in which one arm silently ran on
 * canvases the other was refused is not a comparison.
 */
export function strategyOverrideFrom(value: string | null): TeachingStrategyId | null {
  // 🔴 EXACT NAMES ONLY, AND THEY ARE THE STORED NAMES. A friendly alias — `llm`, `ai`, `baseline` —
  // would be a second vocabulary for the same thing, and the moment one appears in a bug report
  // nobody can tell which arm was actually running. What the URL says is what the row says.
  //
  // 🔴 AND ONLY THE ASSIGNABLE ONES. `nemesis_policy_fallback` is a stored value, so
  // `isTeachingStrategy` accepts it — but it describes something that HAPPENED to a turn, and a URL
  // asking to run "the fallback arm" would produce rows claiming the model failed on turns where it
  // was never asked.
  if (!isTeachingStrategy(value)) return null;
  return (ASSIGNABLE_STRATEGIES as readonly string[]).includes(value) ? value : null;
}

/** How this session came to be running the arm it is running. Recorded, so a result can be filtered
 *  to the assignments that were actually randomised. */
export type StrategyAssignedBy = "override" | "randomised" | "default";

export interface StrategyAssignment {
  strategy: TeachingStrategyId;
  assignedBy: StrategyAssignedBy;
}

/**
 * Whether a canvas belongs to the randomised rollout cohort.
 *
 * The activation instant is part of the experiment definition. Comparing it with the canvas's
 * durable creation time lets a rollout begin without switching an older in-progress canvas from
 * the controller that already produced its evidence. Invalid or absent dates fail closed.
 */
export function teachingExperimentEligible(
  canvasCreatedAt: string,
  experimentStartedAt: string | null,
): boolean {
  if (!experimentStartedAt) return false;
  const canvasTime = Date.parse(canvasCreatedAt);
  const experimentTime = Date.parse(experimentStartedAt);
  return Number.isFinite(canvasTime) && Number.isFinite(experimentTime) && canvasTime >= experimentTime;
}

/**
 * A stable 32-bit hash. 🔴 FNV-1a rather than anything cryptographic: this picks an experiment arm,
 * so what it needs is determinism and an even spread, not unpredictability. A hash nobody can
 * reproduce would make it impossible to check afterwards which arm a learner should have been in.
 */
function hash32(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which arm this session runs — derived, never held in state.
 *
 * 🔴🔴 DERIVED IS THE WHOLE REQUIREMENT: THE ARM MUST NOT SILENTLY SWITCH HALFWAY THROUGH. Held in
 * `useState` it would survive a re-render and die on a reload, so a learner who refreshed mid-canvas
 * could finish under a controller that did not start them — and every evidence row would still be
 * stamped with whichever arm was live when it was written. The comparison would then contain
 * sessions that are a blend of both arms, labelled as one, and nothing in the data could identify
 * them. Recomputing from `(learnerId, canvasId)` gives the same answer on every mount, in every tab,
 * after every reload, for ever.
 *
 * 🔴 AND IT IS THE MECHANISM RANDOM ASSIGNMENT ALREADY NEEDS, which is why it is built this way now
 * rather than later. Turning the experiment on is `randomise: true` and nothing else — no new state,
 * no assignment table, no write on canvas creation. The hash IS the assignment.
 *
 * 🔴 RANDOMISATION IS OFF AND MUST BE TURNED ON DELIBERATELY. With `randomise: false` every learner
 * who has not asked for an arm gets `DEFAULT_STRATEGY`, so shipping the mechanism changes nothing
 * until the dated rollout switch admits a newly created canvas.
 */
export function resolveStrategy(input: {
  /** What the URL asked for. Outranks everything: a developer exercising an arm means that arm. */
  override: TeachingStrategyId | null;
  learnerId: string | null;
  canvasId: string;
  /** True only for a canvas created after the deliberately configured rollout instant. */
  randomise: boolean;
}): StrategyAssignment {
  if (input.override) return { assignedBy: "override", strategy: input.override };
  // 🔴 BOTH IDENTITIES IN THE KEY, NOT JUST THE LEARNER. Keyed on the learner alone, one person
  // would meet the same controller on every canvas for ever — which makes the arm and the person
  // the same variable, so every difference between arms is also a difference between two groups of
  // people. Keyed on the canvas alone, a learner would be handed a different teacher on every piece
  // of material, and no session-level outcome would mean anything. Both together randomise WITHIN a
  // learner as well as across them, which is what makes the per-objective outcomes comparable.
  //
  // 🔴 AND AN ANONYMOUS SESSION IS NOT RANDOMISED. Without a learner id there is nothing to hold an
  // outcome against, so enrolling it would generate arm-labelled rows that can never be joined to a
  // person. It gets the default and is excluded from the experiment by construction.
  if (!input.randomise || !input.learnerId) {
    return { assignedBy: "default", strategy: DEFAULT_STRATEGY };
  }
  // 🔴 `ASSIGNABLE_STRATEGIES`, NOT `TEACHING_STRATEGIES`. The list of arms and the list of values
  // the column may hold stopped being the same set the moment a recorded fallback existed, and
  // randomising over the full list would enrol a third of learners into "the model arm broke".
  const arm =
    ASSIGNABLE_STRATEGIES[hash32(`${input.learnerId}:${input.canvasId}`) % ASSIGNABLE_STRATEGIES.length];
  return { assignedBy: "randomised", strategy: arm ?? DEFAULT_STRATEGY };
}

/**
 * Whether evidence already on this canvas was produced by a different arm.
 *
 * 🔴 THE ENFORCEMENT OF "MUST NOT SILENTLY SWITCH", MADE CHECKABLE RATHER THAN ASPIRATIONAL.
 * `resolveStrategy` is deterministic, so in principle this can never fire — which is exactly why it
 * is worth asserting. The ways it COULD fire are all real: someone adds a URL override mid-session,
 * randomisation is switched on while sessions are live, or a future editor moves the assignment into
 * state and reintroduces the defect this file was written to prevent. Any of those silently mixes
 * two controllers under one label, and the resulting numbers look completely normal.
 *
 * Returns the arm that disagrees, or null when everything on this canvas agrees. The caller reports
 * it; nothing is blocked, because refusing to teach would turn a reporting problem into an outage.
 */
export function conflictingStrategy(input: {
  running: TeachingStrategyId;
  evidence: readonly LearnerEvidence[];
  canvasId: string;
}): TeachingStrategyId | null {
  for (const entry of input.evidence) {
    // 🔴 THIS CANVAS ONLY. Evidence is durable and deliberately not filtered by canvas anywhere else
    // — a learner's history spans sessions, and an objective they met last week under the other arm
    // is not a conflict, it is the point of a durable learner model. What must not happen is one
    // CANVAS producing rows under two controllers.
    if (entry.canvasId !== input.canvasId) continue;
    // Absent means the row predates the strategy layer. Not a conflict — see the migration.
    if (!entry.teachingStrategy) continue;
    if (entry.teachingStrategy !== input.running) return entry.teachingStrategy;
  }
  return null;
}
