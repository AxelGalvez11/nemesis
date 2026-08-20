// Turning a stored objective into something the learner is actually asked, and reading what came
// back as durable evidence.
//
// 🔴 THIS IS A BOUNDARY, WHICH IN THIS CODEBASE MEANS IT IS WHERE THINGS DIE SILENTLY. Six times
// now, structure computed correctly upstream has been dropped at the point where one shape became
// another, and every one of those passed the tests on both sides. The two crossings here are:
//
//     stored objective ─→ a question the learner sees
//     evaluator verdict ─→ a row in the append-only log
//
// Both are exercised by tests that reintroduce the specific defect, because a test that merely
// checks "a task was produced" or "a row was written" passes through every one of these deaths.

import type { ErrorType, ExpectedEvidence, LearnerInputModality, LearnerResponse, ResponseEvaluation, RetrievalTask } from "./canvas-model";
import type { EvaluationInput } from "./canvas-prompts";
import {
  choiceCandidatesFrom,
  choiceSetsFor,
  type ChoicePoolEntry,
  type ChoiceSelection,
  type ChoiceSet,
} from "./choice-set";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import type { EvidenceVerdict } from "./learner-evidence";
import type { LearningObjective, ObjectiveCapability } from "./learning-objective";
import type { EvidenceToRecord, StoredObjective } from "./learner-store";
import type { ClassContrast } from "./wide-grid-classification";
import { stagedRung } from "./scaffold-prompt";
import type { ObjectiveEvidence, ScaffoldRung } from "./scaffold-rung";
import { completionTaskFor } from "./completion-task";
import { DIRECT_TASK, type TaskForm } from "./task-form";
import type { TeachingStrategyId } from "./teaching-strategy";

/** Which evaluator's judgement this is. Recorded on every row: evidence from a different judge is
 *  a different claim, and after the fact nothing else can tell them apart. */
export const EVALUATOR_VERSION = "canvas-judge/1";

/**
 * One objective a prompt is asking about.
 *
 * 🔴 BOTH IDENTIFIERS, TOGETHER, BECAUSE THEY ANSWER DIFFERENT QUESTIONS AND MUST NOT BE CARRIED
 * SEPARATELY. `rowId` is where the evidence row points — `learner_evidence.objective_id` is a real
 * foreign key. `identityKey` is what a judged outcome names, and what the projection groups by.
 * Holding them in one value is what stops a row being written against one objective while its
 * verdict was decided about another; passing them as two arguments is precisely how that
 * disagreement becomes possible.
 *
 * It is built from a `StoredObjective` and nothing else. An objective that has never been stored
 * cannot be asked about, because the foreign key means its evidence cannot exist.
 */
export interface ObjectiveTarget {
  rowId: string;
  identityKey: string;
}

/**
 * What one learner submission established, per objective.
 *
 * 🔴 SUPPLIED, NEVER DERIVED HERE. Deciding which of the objectives a task targeted were actually
 * demonstrated is a judgement about partial understanding, and `causal-cognition-contract.md` §7
 * puts that outside the runtime: *"Runtime does not decide what partial understanding means."*
 *
 * The tempting shortcuts are both false-evidence generators. Matching the evaluator's prose
 * (`ResponseEvaluation.demonstrated` is free text for a human to read, not identity keys) would
 * credit an objective on a substring coincidence. "The overall verdict was correct, so every target
 * was demonstrated" would stamp a judgement onto edges nobody assessed. Either one writes a claim
 * about a learner that no judge ever made.
 *
 * This is §4's `edgesDemonstrated`/`edgesIncorrect` in normalised form, not a rival contract: those
 * sets are already a per-edge judgement, and `{key, verdict}` says the same thing in a shape that
 * cannot accidentally apply one overall `incorrect` to an edge the learner got right. §4's
 * `edgesMissing` needs no representation at all — it is every target that arrives without an
 * outcome, which is the default rather than something a caller has to remember to send.
 */
export interface SubmissionOutcome {
  objectiveIdentityKey: string;
  verdict: EvidenceVerdict;
  /** How much this judgement settled, when the judge said. Absent means not observed. */
  confidence?: number | null;
  /**
   * Competing beliefs this objective's judgement named.
   *
   * 🔴 PER OUTCOME, BECAUSE ATTRIBUTING A RESPONSE-LEVEL MISCONCEPTION ACROSS SEVERAL TARGETS IS A
   * SEMANTIC DECISION AND NOT THE RUNTIME'S. One wrong belief revealed while explaining a
   * four-link chain belongs to some of those links and not others; spreading it over all of them
   * would record three claims a judge never made. Whoever judges says which objective it belongs
   * to, or it stays where it was named.
   */
  misconceptions?: readonly string[];
  /**
   * WHICH KIND OF FAILURE THIS WAS, when the evaluator established one.
   *
   * 🔴 THE DIAGNOSIS, NOT THE VERDICT, AND THAT IS WHY IT IS A SECOND FIELD. `incorrect` says the
   * performance fell short; this says whether the learner had the right method and slipped, reached
   * for the wrong method entirely, or never had the prerequisite. Those three call for three
   * different next moves, and collapsing them into one verdict throws away the only signal that
   * separates them.
   *
   * 🔴 ABSENT MEANS THE EVALUATOR NAMED NONE — never a default, never inferred from the verdict. A
   * judge that returns `incorrect` without saying why has told us less, and writing a plausible
   * kind here would be this layer authoring a diagnosis nobody made. `canvas-judge.ts` already
   * drops an unrecognised value rather than passing it through, so absent arrives here honestly.
   */
  errorType?: ErrorType | null;
}

/**
 * Whether we have an account of this performance at all — and, if we do, what it established.
 *
 * 🔴 THE TWO EMPTINESSES ARE OPPOSITE OBLIGATIONS, AND A BARE ARRAY CANNOT TELL THEM APART.
 *
 *   | empty because                                   | required behaviour                        |
 *   |-------------------------------------------------|-------------------------------------------|
 *   | we asked, and nothing was shown                 | a row per target: obtained false, verdict null |
 *   | the judge was unreachable or unparseable        | NO ROWS AT ALL, for any target            |
 *
 * A `catch` or a failed parse naturally produces an empty array. With `outcomes: readonly T[]` as
 * the parameter, that empty array walks straight into the fan-out and writes *"we asked and they
 * showed nothing"* across every target — a durable false claim, authored by an outage, charging a
 * learner for our failure. No test catches it, because nothing is broken: it is a REPRESENTATION
 * GAP, and the code does exactly what it says.
 *
 * 🔴 AND THE OLD ARRANGEMENT WAS SOUND ONLY BY LUCK OF THE CALLER. `submit` returned early on
 * `!result.value`, so the bad value never reached here — the invariant lived in an early return one
 * layer up rather than in the type. That holds exactly as long as a judge's failure is
 * distinguishable from its silence, and it stops the moment a multi-objective judge returns a SHORT
 * list for a partial judgement and NOTHING for a failed one. Then both look like `[]` at the call
 * site and the caller has nothing left to branch on.
 *
 * So the distinction moves into the type, the way `AnswerSink` made two answer surfaces
 * unrepresentable rather than merely unlikely.
 *
 * 🔴 `judged: true` MEANS "WE HAVE AN ACCOUNT", NOT "A MODEL RAN". A learner who says *"I don't
 * know"* was never sent to an evaluator, and that is still a complete account of the performance:
 * the opportunity was given and nothing was demonstrated. It is `judged: true` with no outcomes —
 * see `unobtainedEvidence`. The false case is reserved for *we do not know what happened*.
 */
export type Judgement =
  | { judged: true; outcomes: readonly SubmissionOutcome[] }
  | { judged: false };

/**
 * What the judge established. Use for any account of a performance, including "nothing was shown".
 *
 * 🔴 THE EMPTY CASE IS MEANINGFUL AND MUST STAY REACHABLE. `judgementOf([])` is not a degenerate
 * call — it is the honest record of an opportunity that produced no demonstration, and it writes a
 * row per target saying so. Collapsing it into `noJudgement()` would delete the difference between
 * "we asked and learned nothing" and "we never found out", which is the whole point of this type.
 */
export function judgementOf(outcomes: readonly SubmissionOutcome[]): Judgement {
  return { judged: true, outcomes };
}

/**
 * No account of this performance exists. Writes NOTHING, for any target.
 *
 * 🔴 AN OUTAGE IS NOT A LEARNER FAILURE. A judge we could not reach says nothing about the person
 * who answered, so the durable record must stay silent rather than record a `not_demonstrated` they
 * did not earn. The cost is honest and bounded: a flaky judge means no progress, never wrong progress.
 */
export function noJudgement(): Judgement {
  return { judged: false };
}

/**
 * The one thing the learner is being asked right now.
 *
 * `id` is minted by the caller ONCE per policy decision and is the idempotency key for whatever
 * evidence comes back — see `evidenceForSubmission`.
 *
 * 🔴 THE TARGET IS A SET, AND THE ONE-OBJECTIVE CASE IS JUST A SET OF ONE. This is the whole of
 * RUNTIME-003. A learner explaining a mechanism demonstrates several things in one answer, and the
 * natural implementation of that — loop the objectives, build a prompt for each — gives every
 * objective its own prompt id, which is its own response identity, which turns ONE performance into
 * N. Latency is then counted N times and `demonstrationCount` inflates N-fold.
 *
 * Carrying the set on the prompt makes that unrepresentable rather than merely discouraged: there
 * is one prompt because there is one thing to build, and every row written from it shares its id
 * without anyone having to arrange for that.
 */
export interface RetrievalPrompt {
  id: string;
  /** Every objective this one question is asking about. Never empty. */
  targets: readonly ObjectiveTarget[];
  /** The sentence the canvas prints. */
  prompt: string;
  /** What a complete answer would be. 🔴 Never shown before the learner has committed. */
  expectedAnswer: string;
  /**
   * What the judge is told a complete answer must contain.
   *
   * 🔴 IT IS NOT `{ referenceAnswer }` FOR EVERY TASK, AND THAT WAS THE DEFECT. `objectiveAsTask`
   * used to build the expected evidence itself, from the one field it had, so every task — a
   * one-word term and a multi-step account alike — was judged against a single model sentence. For
   * an association that is right: there is one correct term and the reference answer IS it. For an
   * account of a mechanism it is close to meaningless, because a learner can be entirely correct in
   * words that share almost nothing with the sentence the document used, and a judge given only
   * that sentence has been quietly turned into a similarity check.
   *
   * 🔴 BUILT AT THE ONE PROMPT CONSTRUCTION SITE, AND REQUIRED. Derived at the judging boundary it
   * would be one edit away from disagreeing with what the prompt actually asked; made optional it
   * would default to absent, and absent means "nothing was expected", which is never true of a
   * question this code built.
   */
  expectedEvidence: ExpectedEvidence;
  task: RetrievalTask;
  /**
   * The cognitive operation this prompt demands.
   *
   * 🔴 CARRIED BY THE PROMPT SO BOTH OUTCOMES RECORD IT. An answered attempt and an admission of
   * not knowing are evidence about the same demand, and the demand is a property of what was
   * ASKED rather than of what came back. Reading it off the objective at write time would work on
   * the judged path and quietly be unavailable on the other.
   */
  operation: ObjectiveCapability;
  /**
   * How much assistance was available while this was attempted. 0 is the prompt and nothing else.
   *
   * 🔴 AN OBSERVATION ABOUT THE OPPORTUNITY, NEVER A JUDGEMENT ABOUT THE LEARNER. It counts what
   * the runtime offered, not whether anyone needed it.
   */
  scaffoldingLevel: number;
  /**
   * Which rung of §33's ladder this prompt sets.
   *
   * 🔴 A PROPERTY OF THE QUESTION, KNOWN BEFORE THE ANSWER, WHICH IS WHY IT LIVES HERE AND NOT ON
   * THE OUTCOME. The runtime chose to ask for unaided production, or to show options, or to leave a
   * blank — that decision is already made when the prompt is built. Deriving it afterwards from
   * what came back would make it an interpretation of the response, and an interpretation cannot be
   * stored as an observation.
   *
   * 🔴 REQUIRED, NOT OPTIONAL. An optional rung defaults to absent, and absent means "we do not
   * know at what demand this was produced" — which would be a lie about a prompt this code built
   * and therefore knows the answer to. Rows legitimately lacking a rung are the historical ones,
   * written before the field existed; a new prompt has no excuse.
   */
  rung: ScaffoldRung;
  /**
   * The options on screen, when this prompt is answered by picking rather than by producing.
   *
   * 🔴 ABSENT MEANS THERE ARE NO OPTIONS, WHICH IS EVERY PROMPT THIS RUNTIME BUILT BEFORE
   * RECOGNITION EXISTED AND MOST OF THEM NOW. It is not "options unknown": a free-response prompt
   * genuinely has none, and that is what makes the field's absence readable rather than a default.
   *
   * 🔴 PRESENT EXACTLY WHEN `rung` IS `recognition` — the two are set together by
   * `recognitionPromptFor` and by nothing else, for the reason `stagedRung` exists. A prompt claiming
   * the recognition rung with no options would record a demand the learner never met, which is the
   * lie §33's ladder spent a whole file closing; a prompt carrying options at `independent` would
   * claim unaided production for a question that showed the answer.
   */
  choices?: ChoiceSet;
  /**
   * Which KIND of task this is, alongside how much help it carries.
   *
   * 🔴 NOT THE SAME QUESTION AS `rung`, AND KEEPING THEM APART IS WHAT MAKES BOTH HONEST. `rung`
   * says how much of THIS ANSWER was on screen. This says what was being asked at all: the
   * material's own question, or a faded solution with a gap in it. A completion is a real production
   * AND an assisted one, and one ordered field cannot say both.
   *
   * 🔴 REQUIRED, for the reason `rung` is required. Absent would mean "nobody recorded the form",
   * which is true of historical rows and false of anything this runtime mints from now on.
   */
  form: TaskForm;
  /**
   * The part of a valid solution already on screen, in order, when the task is a completion.
   *
   * 🔴 ABSENT MEANS NOTHING WAS SUPPLIED. It is the renderer's whole input for the faded example —
   * a completion whose `given` never reached the Canvas would be an ordinary question recorded as
   * an assisted one, which is the precise direction of lie the rung ladder exists to prevent.
   */
  given?: readonly string[];
}

/**
 * Retrieval with nothing to lean on — the only demonstration this runtime currently stages.
 *
 * 🔴 RECORDED RATHER THAN LEFT ABSENT, BECAUSE IT WAS GENUINELY OBSERVED. No assist was on offer,
 * and that is a fact about the attempt, not a missing measurement. When a scaffolded interaction
 * ships it sets its own value and every row already written keeps meaning exactly what it meant.
 *
 * 🔴 AND IT IS NOT A LEVEL SYSTEM YET. One state exists; inventing a scale before the runtime can
 * distinguish its steps would produce numbers nothing measured.
 */
export const UNSUPPORTED_RETRIEVAL = 0;

/**
 * Word the question.
 *
 * 🔴 THE CUE COMES FROM THE OBJECTIVE, NOT FROM THE PAIR'S LEFT SIDE. Reaching into
 * `knowledge.pair.left` here would be correct for exactly one of the two objectives a pair mints
 * and silently wrong for the other: both directions would print the identical question while
 * carrying opposite identity keys. The reverse direction would then look "still unknown" in every
 * report — true, but only because it was never actually asked. `objectivesForKnowledge` resolves
 * roles to sides once; this reads that result.
 *
 * The wording is deliberately plain and carries no subject-matter vocabulary. `outputRole` is
 * whatever the source called its own column — "brand", "holding", "part number" — so naming it
 * reads correctly for a law student and a mechanical engineer without anything here knowing what
 * any of those words mean.
 */
export function objectivePromptText(objective: LearningObjective): string {
  const role = objective.parameters.outputRole;
  return role
    ? `What is the ${role} for ${objective.cue}?`
    : `Given ${objective.cue}, what goes with it?`;
}

/**
 * Word the question for a capability that asks the learner to reason FORWARD from something.
 *
 * 🔴 IT ASKS FOR THE CONSEQUENCE AND THE REASON IN ONE BREATH, WHICH IS THE POINT, and it is word
 * for word what `TASK_INTENT.predict` already tells the judge the task is: *"say what follows, and
 * why"*. "What follows from X?" alone is answerable with a single term and would be a recall
 * question wearing a prediction's name — the learner names the effect, the judge sees the effect,
 * and nothing about whether they hold the mechanism has been observed. The ", and why" is what makes
 * the answer capable of being wrong in an INTERESTING way: a learner who knows the endpoint and not
 * the route produces exactly the response this question is built to catch.
 *
 * 🔴 AND IT NAMES NO RELATION VERB, for the same reason the label does not. The source may have said
 * the cause produces, raises, blocks or prevents its effect; asking "what does X cause?" over an
 * edge the document said X PREVENTS puts a false premise in the question itself.
 */
export function predictionPromptText(objective: LearningObjective): string {
  return `What follows from ${objective.cue}, and why?`;
}

/**
 * Word the question for a capability that asks the learner to tell one thing from its NEIGHBOURS.
 *
 * 🔴 THE NEIGHBOUR IS NAMED IN THE QUESTION, AND WITHOUT IT THIS IS A RECALL PROMPT. "Which group
 * is X in?" is answered by looking one fact up; the learner who has memorised the label and has no
 * idea what separates it from the class next door answers it perfectly. Naming what it must be told
 * apart FROM is what makes that learner's gap visible, and it is the same move `predict` makes by
 * refusing to stop at "what follows".
 *
 * 🔴 AND IT ASKS "WHAT TELLS YOU", NOT "WHAT IS THE DIFFERENCE". The grid never stated the
 * distinguishing feature — it is spread across the columns that are neither subject nor class — so
 * a question presupposing one named difference would be asserting something the source did not say.
 * "What tells you" is answerable from whatever the learner actually holds.
 *
 * 🔴 AT MOST TWO NEIGHBOURS ARE NAMED. An axis with nine classes would otherwise print a sentence
 * that is a list rather than a question, and a learner reading it would be doing recognition over
 * the options instead of retrieval.
 */
export function discriminationPromptText(objective: LearningObjective, contrast: ClassContrast): string {
  const neighbours = contrast.siblings.slice(0, 2).map((sibling) => sibling.label);
  const against = neighbours.length > 1 ? `${neighbours[0]} or ${neighbours[1]}` : neighbours[0];
  const axis = contrast.axis?.trim();
  if (!against) return objectivePromptText(objective);
  return axis
    ? `By ${axis}, what is ${objective.cue}, and what tells you it is that rather than ${against}?`
    : `Which group does ${objective.cue} belong to, and what tells you it is that rather than ${against}?`;
}

/**
 * Word the question for a capability that asks the learner for the ORDER of something.
 *
 * 🔴 IT ASKS WHAT COMES NEXT, NEVER FOR THE LIST. "What are the steps?" is answered by producing
 * them in any order, and a learner who has every step in the wrong sequence passes it — which is
 * precisely the learner a procedure question exists to find. "What comes immediately after this?"
 * cannot be answered without holding the order.
 *
 * 🔴 AND IT NEVER PRINTS THE OTHER STEPS. A prompt listing them and asking for their arrangement is
 * recognition: the retrieval has already been done for the learner, and all that remains is sorting.
 */
export function sequencePromptText(objective: LearningObjective): string {
  return objective.parameters.stepKey === 1
    ? `What is the first step in ${objective.cue}?`
    : `What comes immediately after: ${objective.cue}?`;
}

/** A source assertion re-expressed as connected understanding, rather than repeated verbatim. */
export function explanationPromptText(objective: LearningObjective): string {
  return `Explain this relationship in your own words: ${objective.cue}`;
}

/** The figure carries the spatial cue; the words must not reveal the covered label. */
export function locatePromptText(objective: LearningObjective): string {
  return objective.cue;
}

/** The pair of identifiers a prompt needs to ask about one stored objective. */
export function targetFor(objective: StoredObjective): ObjectiveTarget {
  return { identityKey: objective.identityKey, rowId: objective.rowId };
}

/**
 * The question this objective asks at full unaided demand, before any rung transforms it.
 *
 * 🔴 EXTRACTED SO THERE IS ONE WORDING WITH TWO READERS, NEVER TWO WORDINGS. `retrievalPromptFor`
 * built this inline; `choice-set.ts` now needs the same sentence, because an option already printed
 * in the question is not a distractor and can only be recognised by comparing against the actual
 * text. A second construction of "the question for this objective" would drift, and the drift would
 * be invisible: the option filter would be checking a sentence the learner never saw.
 *
 * 🔴 BRANCHED ON THE CAPABILITY, NEVER ON THE KNOWLEDGE TYPE — unchanged from where this came from,
 * and see that comment for why.
 */
export function baseQuestionFor(resolved: {
  objective: LearningObjective;
  knowledge: KnowledgeObject;
}): string {
  const { knowledge, objective } = resolved;
  const predicting = objective.capability === "predict";
  const explaining = objective.capability === "explain";
  const locating = objective.capability === "locate" && Boolean(knowledge.figure?.assetPath);
  const discriminating = objective.capability === "discriminate" && Boolean(knowledge.contrast);
  const sequencing = objective.capability === "sequence";
  return predicting
    ? predictionPromptText(objective)
    : explaining
      ? explanationPromptText(objective)
    : locating
      ? locatePromptText(objective)
    : sequencing
      ? sequencePromptText(objective)
      : discriminating && knowledge.contrast
        ? discriminationPromptText(objective, knowledge.contrast)
        : objectivePromptText(objective);
}

/**
 * The task name this objective's answers are filed under.
 *
 * 🔴 EXTRACTED FOR THE SAME REASON AS THE WORDING, AND IT MATTERS MORE HERE BECAUSE IT IS STORED. A
 * recognition prompt over a discrimination objective must file as `compare`, exactly as the unaided
 * one does; a second copy of this mapping would eventually file one of them as `name` and every
 * attempt at telling two classes apart would be recorded as producing a term. That is this codebase's
 * named failure of mapping a wider vocabulary DOWN, and it has already happened once.
 */
export function taskNameFor(resolved: {
  objective: LearningObjective;
  knowledge: KnowledgeObject;
}): RetrievalTask {
  const { knowledge, objective } = resolved;
  if (objective.capability === "predict") return "predict";
  if (objective.capability === "explain") return "explain";
  if (objective.capability === "locate" && knowledge.figure?.assetPath) return "locate";
  if (objective.capability === "sequence") return "reconstruct";
  if (objective.capability === "discriminate" && knowledge.contrast) return "compare";
  return "name";
}

/**
 * Mint one prompt asking about one or more objectives.
 *
 * 🔴 THE ONLY WAY A PROMPT IS BUILT, AND THAT IS THE POINT. Everything that asks the learner
 * something goes through here, so "one submission, one prompt, one response identity" is a property
 * of there being one place to build one — not a rule each new caller has to be told about.
 *
 * 🔴 IT DOES NOT WORD THE QUESTION. What to ask about a set of objectives is a cognitive decision:
 * the sentence that makes a learner reconstruct a mechanism is not derivable from the objectives by
 * anything in this layer, and inventing one here would be the runtime deciding what a task demands.
 * The caller supplies the wording; this owns identity, targeting and the observations.
 */
export function promptTargeting(input: {
  id: string;
  /** Never empty. A prompt asking about nothing cannot produce evidence about anything. */
  targets: readonly ObjectiveTarget[];
  prompt: string;
  expectedAnswer: string;
  /**
   * 🔴 DEFAULTS TO THE REFERENCE ANSWER ALONE, WHICH IS THE HONEST FLOOR AND NOT A GUESS. Every
   * prompt knows what a complete answer would be — that is `expectedAnswer` and it is required. What
   * a caller may know IN ADDITION is which ideas a complete answer has to contain, and only a caller
   * holding the knowledge object can say. Absent means "nothing beyond the model answer is
   * required", which is exactly true of the association retrievals this defaulted for.
   */
  expectedEvidence?: ExpectedEvidence;
  operation: ObjectiveCapability;
  task: RetrievalTask;
  scaffoldingLevel?: number;
  /**
   * 🔴 DEFAULTS TO `independent` BECAUSE THAT IS WHAT THIS RUNTIME ACTUALLY STAGES, AND THE DEFAULT
   * IS SAFE IN THE DIRECTION THAT MATTERS. Every prompt built today is the question and nothing
   * else — no options, no blank, no narrowing — so `independent` is the observation, not a guess.
   *
   * The risk of a wrong default runs one way: claiming a HIGHER rung than was offered would credit
   * a learner with production they never did. That cannot happen here, because `independent` is the
   * top of the ladder and any scaffolded prompt must therefore pass its own lower rung explicitly.
   * A caller that forgets under-claims its own scaffolding, which costs a re-ask.
   */
  rung?: ScaffoldRung;
  /** The options on screen, when there are any. 🔴 Absent means free response, which is every prompt
   *  this runtime built before recognition existed — see `RetrievalPrompt.choices`. */
  choices?: ChoiceSet;
  /** Which kind of task this is. 🔴 Defaults to `direct` because that is what every caller that
   *  does not say is asking: the material's own question, unchanged. A completion has to say so,
   *  exactly as a scaffolded prompt has to state its own rung. */
  form?: TaskForm;
  /** The part of a solution already on screen — completions only. */
  given?: readonly string[];
}): RetrievalPrompt {
  return {
    expectedAnswer: input.expectedAnswer,
    expectedEvidence: input.expectedEvidence ?? { referenceAnswer: input.expectedAnswer },
    form: input.form ?? DIRECT_TASK,
    id: input.id,
    operation: input.operation,
    prompt: input.prompt,
    rung: input.rung ?? "independent",
    scaffoldingLevel: input.scaffoldingLevel ?? UNSUPPORTED_RETRIEVAL,
    targets: input.targets,
    task: input.task,
    ...(input.choices ? { choices: input.choices } : {}),
    ...(input.given ? { given: input.given } : {}),
  };
}

/**
 * The one prompt that is answered by TAPPING.
 *
 * 🔴 IT DELEGATES TO `promptTargeting` LIKE ITS SIBLING, AND FOR THE SAME REASON: a second
 * construction site is how the two drift, and the field that drifts is the response identity, which
 * is the idempotency key for everything this prompt goes on to write.
 *
 * 🔴 THE SENTENCE IS THE UNAIDED ONE, UNCHANGED. There is deliberately no "pick the correct option"
 * instruction bolted on: the options are visibly tappable and the question is the whole screen, which
 * is the same argument that removed the "answer below" line from the free-response surface. Rewording
 * the question because the answer surface changed would also mean two learners meeting two different
 * sentences about the same objective, which is what `stagedRung` refuses one rung up.
 *
 * 🔴 AND THE SCAFFOLDING LEVEL IS NOT `UNSUPPORTED_RETRIEVAL`. That constant means "the prompt and
 * nothing else"; here the answer is on the screen, which is assistance the runtime genuinely offered.
 * Leaving it at 0 would report an unaided attempt in the one column that measures how much help was
 * on the table.
 */
export function recognitionPromptFor(
  resolved: { objective: StoredObjective; knowledge: KnowledgeObject },
  id: string,
  choices: ChoiceSet,
): RetrievalPrompt {
  return promptTargeting({
    choices,
    expectedAnswer: resolved.objective.answer,
    id,
    operation: resolved.objective.capability,
    prompt: baseQuestionFor(resolved),
    // 🔴 NEVER `independent`, AND NEVER LEFT TO THE DEFAULT. `promptTargeting` defaults to the top of
    // the ladder because that is what every prompt before this one actually staged; a recognition
    // prompt that took the default would credit a tap as unaided production, which is the single most
    // expensive false claim this evidence model can make.
    rung: "recognition",
    scaffoldingLevel: OPTIONS_ON_SCREEN,
    targets: [targetFor(resolved.objective)],
    task: taskNameFor(resolved),
  });
}

/**
 * Retrieval with the answer among options.
 *
 * 🔴 A SECOND POINT ON A SCALE WHOSE STEPS THE RUNTIME CAN NOW DISTINGUISH, WHICH IS THE ONLY REASON
 * IT IS ALLOWED TO EXIST. `UNSUPPORTED_RETRIEVAL`'s own comment refuses to invent a level system
 * before there is a second state to measure — *"inventing a scale before the runtime can distinguish
 * its steps would produce numbers nothing measured"*. There is one now, and this is it. The number
 * says how much was on offer, never whether the learner needed it.
 */
export const OPTIONS_ON_SCREEN = 1;

/**
 * Retrieval with part of a valid solution on screen.
 *
 * 🔴 THE SAME NUMBER AS `OPTIONS_ON_SCREEN`, AND THAT IS NOT A COPY-PASTE. `scaffoldingLevel` counts
 * how much assistance was AVAILABLE, and both tasks put exactly one assist on the table: a set of
 * options in one, a partly worked solution in the other. WHICH assist it was is `scaffoldRung`'s
 * question and `taskForm`'s, and both are recorded. Collapsing the two constants into one shared name
 * would be the mistake — they are equal today and there is no rule saying they must stay equal.
 */
export const SOLUTION_PART_ON_SCREEN = 1;

/**
 * A faded worked example: part of a valid solution, one piece withheld.
 *
 * 🔴 IT REFUSES RATHER THAN FALLING BACK TO THE ORDINARY QUESTION. Returning `retrievalPromptFor`
 * when the knowledge has no structure to fade would put an `independent` task on screen while the
 * decision that produced it said "completion" — and the row would then record whichever of the two
 * the caller happened to trust. A null forces the caller to say so, and `strategy-llm-teacher.ts`
 * turns it into a named refusal the analytics can count.
 */
export function completionPromptFor(
  resolved: { objective: StoredObjective; knowledge: KnowledgeObject },
  id: string,
): RetrievalPrompt | null {
  const built = completionTaskFor(resolved);
  if (!built.task) return null;
  const task = built.task;
  return promptTargeting({
    expectedAnswer: task.expectedAnswer,
    expectedEvidence: {
      referenceAnswer: task.expectedAnswer,
      ...(task.requiredConcepts.length > 0 ? { requiredConcepts: [...task.requiredConcepts] } : {}),
    },
    form: "completion",
    given: task.given,
    id,
    operation: resolved.objective.capability,
    prompt: task.question,
    // 🔴 THE RUNG AND THE FORM ARE SET TOGETHER HERE AND NOWHERE ELSE, for the reason
    // `recognitionPromptFor` sets its pair together: a completion recorded at `independent` would
    // claim unaided production of something that had most of its solution printed above it.
    rung: "completion",
    scaffoldingLevel: SOLUTION_PART_ON_SCREEN,
    targets: [targetFor(resolved.objective)],
    task: taskNameFor(resolved),
  });
}

/**
 * The same prompt, recorded as what it turned out to be: answered before the options were shown.
 *
 * 🔴🔴 INVARIANT 11 — "a task must record the assistance that was ACTUALLY AVAILABLE when answered",
 * not the assistance the controller planned to give. A recognition screen that shows its question
 * first and its options only on request has two possible histories, and the runtime knows which one
 * happened: if the learner produced the answer with nothing on screen but the question, the row that
 * says `recognition` is false — it under-credits a real unaided production and would have the policy
 * come back to ask for one that has already been given.
 *
 * 🔴 IT DROPS THE OPTIONS AS WELL AS THE RUNG. Leaving `choices` attached would leave a prompt
 * claiming `independent` while carrying the answer set, which is the pairing `RetrievalPrompt.choices`
 * spends its own comment forbidding.
 */
export function asUnaidedProduction(prompt: RetrievalPrompt): RetrievalPrompt {
  const { choices: _dropped, ...rest } = prompt;
  return { ...rest, rung: "independent", scaffoldingLevel: UNSUPPORTED_RETRIEVAL };
}

/**
 * Every objective on this canvas that could be asked with options, and what those options would be.
 *
 * 🔴 BUILT FROM THE WHOLE POOL IN ONE PASS, AND BOTH HALVES OF THAT MATTER. Distractors come from
 * the canvas's OTHER objectives, so a per-objective builder would have nothing to draw from; and the
 * correct answer's POSITION is balanced across the batch, which degenerates to "always first" if the
 * batch is one. See `choiceSetsFor`.
 *
 * 🔴 THE PROMPT TEXT IS THE REAL ONE, TAKEN FROM `baseQuestionFor`. An option is discarded when it is
 * already printed in the question, and that check is only worth anything against the sentence the
 * learner will actually see.
 *
 * 🔴 CALLED BY BOTH CONTROLLER ARMS, WHICH IS WHY IT LIVES HERE RATHER THAN INSIDE EITHER. The
 * experiment's constraint is that everything except the choosing is byte-for-byte the same; a set of
 * options built one way for the structured arm and another way for the model arm would put different
 * questions in front of two cohorts and the comparison would mean nothing.
 */
export function choiceSetsForPool(input: {
  objectives: readonly { objective: LearningObjective; knowledge: KnowledgeObject }[];
  /** Every row this learner holds for these objectives. Filtered per objective here. */
  evidence: readonly LearnerEvidence[];
}): Map<string, ChoiceSet> {
  const pool: ChoicePoolEntry[] = input.objectives.map((entry) => ({
    evidence: input.evidence.filter(
      (row) => row.objectiveIdentityKey === entry.objective.identityKey,
    ),
    knowledge: entry.knowledge,
    objective: entry.objective,
    prompt: baseQuestionFor(entry),
  }));
  return choiceSetsFor(choiceCandidatesFrom(pool));
}

/**
 * What one tap established.
 *
 * 🔴🔴 THIS IS THE ONE PLACE THIS CODEBASE JUDGES AN ANSWER WITHOUT AN EVALUATOR, AND THE EXEMPTION
 * IS NARROW ENOUGH TO STATE EXACTLY. `evidenceForSubmission`'s rule is *"THE EVALUATOR DECIDES, NOT
 * THE BUTTON"*, and it names the cheap disguise it is aimed at: string equality against the expected
 * answer, which *"would call a correct answer wrong for a capital letter and cannot tell a wrong
 * answer from a specific competing one"*. Neither objection applies to a tap. There is no free text
 * to compare, so spelling cannot be got wrong; and the wrong options were minted FROM named competing
 * models, so which one was picked is not merely known, it is the sharpest thing on the row. A model
 * asked to re-read a tap would be guessing at a fact already established by construction.
 *
 * 🔴 `null` MEANS NO ACCOUNT EXISTS, AND THE CALLER MUST TURN IT INTO `noJudgement()`. It happens
 * when the tapped text is not one of the options on record — a stale render, a rebuilt pool. Nobody
 * answered anything wrongly; we simply do not know what was picked, and writing `incorrect` would
 * charge a learner for our own race.
 *
 * 🔴 A CORRECT TAP IS `understood`, NEVER `strong`. Both project to `correct`, and the difference is
 * kept on `latestVerdict` for a policy to read — so the more modest of the two is the honest one for
 * a demonstration that consisted of pointing. What actually bounds the claim is the RUNG, which
 * `satisfies(state, "independent")` refuses; the verdict is not doing that work and must not pretend
 * to.
 *
 * 🔴 NO `confidence`. That field is how sure an EVALUATOR was of its own reading, and nothing read
 * anything here. A `1` would assert a certainty measurement that never happened, and would then flow
 * into `establishesBelief` as though a judge had spoken.
 */
export function outcomeForSelection(
  objective: { identityKey: string },
  /**
   * The tap, already resolved.
   *
   * 🔴 RESOLVED BY THE CALLER RATHER THAN HERE, SO THE SET IS READ EXACTLY ONCE. The caller needs the
   * ground too — to say something true on the verdict screen, and to split a funnel by it — and two
   * reads of one tap is two places that can be given different option sets after an edit.
   */
  selection: ChoiceSelection,
): SubmissionOutcome | null {
  if (selection.kind === "unrecognised") return null;
  if (selection.kind === "correct") {
    return { objectiveIdentityKey: objective.identityKey, verdict: "understood" };
  }
  // 🔴🔴 `misconception` ONLY WHERE A COMPETING MODEL WAS ALREADY NAMED, AND THIS RESTRAINT IS THE
  // WHOLE DIFFERENCE BETWEEN A DIAGNOSIS AND AN ACCUSATION. Picking the belief a judge has already
  // caught this learner producing re-confirms it — that is a competing model, observed twice, and the
  // policy's `misconception` branch is right to separate the pair. Picking a neighbouring class or a
  // same-shape answer once is an error and may be nothing more; filing it as a held belief would
  // teach against a model nobody has shown, which is the fabrication `strategy-llm-teacher.ts`
  // refuses when it declines to take misconceptions from a model.
  //
  // 🔴 THE TEXT SURVIVES EITHER WAY. `responseText` carries the option that was tapped, verbatim, on
  // every row this writes — so WHICH distractor was chosen is preserved even where no belief is
  // claimed. That is the durable diagnostic; the verdict is only what may be concluded from it today.
  return selection.ground.kind === "held_misconception"
    ? {
        misconceptions: [selection.ground.belief],
        objectiveIdentityKey: objective.identityKey,
        verdict: "misconception",
      }
    : { objectiveIdentityKey: objective.identityKey, verdict: "incorrect" };
}

/**
 * The single-objective retrieval this surface stages today — the one-element case, and nothing more.
 *
 * 🔴 IT DELEGATES RATHER THAN BUILDING ITS OWN SHAPE. A second construction site is how the two
 * drift, and the field that drifts here is the response identity.
 */
export function retrievalPromptFor(
  resolved: { objective: StoredObjective; knowledge: KnowledgeObject },
  id: string,
  /**
   * Which rung of §33's ladder to stage this retrieval at.
   *
   * 🔴 OPTIONAL HERE, DEFAULTING TO `promptTargeting`'s OWN `independent` DEFAULT — NOT A SECOND
   * DECISION. `chooseNextTeachingAction` (`teaching-policy.ts`) is where the rung is actually chosen,
   * from `scaffold-decision.ts`'s reading of the evidence; the caller that already holds that
   * decision — `TeachingAction.rung`, once a `TeachingDecision` names one — passes it straight
   * through. Absent means the caller has no such decision to pass (an association-recall retrieval
   * has never staged anything below `independent`), which is the honest, safe default for exactly
   * the reason `promptTargeting`'s own comment gives: claiming a HIGHER rung than was offered would
   * credit production that never happened, and `independent` is the top of the ladder.
   */
  rung?: ScaffoldRung,
): RetrievalPrompt {
  const { knowledge, objective } = resolved;
  // 🔴 BRANCHED ON THE CAPABILITY, WHICH IS THE OBJECTIVE'S OWN ACCOUNT OF WHAT IS BEING ASKED —
  // never on the knowledge type. The two agree today because `objectivesForKnowledge` is the only
  // minter, and keying on the type here would put a second, independently-editable copy of that
  // mapping in a file that has no business holding one.
  const predicting = objective.capability === "predict";
  const explaining = objective.capability === "explain";
  const discriminating = objective.capability === "discriminate" && Boolean(knowledge.contrast);
  const base = baseQuestionFor(resolved);
  // 🔴🔴 THE RUNG NOW REACHES THE QUESTION, AND UNTIL THIS LINE IT NEVER DID. `rung` arrived here,
  // was passed to `promptTargeting`, and was written onto every evidence row — while `prompt` was
  // worded from the capability alone. A `narrowed` retrieval and an `independent` one produced
  // BYTE-IDENTICAL text: the learner met the same sentence and the log recorded that the second one
  // had been made easier. That is this repo's recurring failure shape, and it matters now because
  // the controller has `harder` and `easier` as real moves. See `scaffold-prompt.ts`.
  //
  // 🔴 `stagedRung` RESOLVES BOTH TOGETHER SO THEY CANNOT DISAGREE. Some rungs cannot be worded for
  // some objectives — a one-word answer has no honest cue — and in that case it returns the full
  // question AND `independent`, so what the row claims is always what the learner met.
  const staged = stagedRung({ base, objective, wanted: rung ?? "independent" });
  return promptTargeting({
    expectedAnswer: objective.answer,
    // 🔴 THE CLASS LABEL IS REQUIRED; THE REASONING IS NOT. The source printed the label, so a
    // complete answer has to reach it — but it never stated the distinguishing feature, and
    // requiring a concept the document does not contain would fail correct answers. The judge is
    // told what must be there, and reads the rest for depth.
    ...(discriminating && knowledge.contrast
      ? { expectedEvidence: { referenceAnswer: objective.answer, requiredConcepts: [knowledge.contrast.label] } }
      : {}),
    // 🔴 THE EDGE'S OWN TWO ENDS, IN THE SOURCE'S WORDS. A complete account has to reach the effect
    // FROM the cause, so both are required and the judge is told so — which is what lets a correct
    // account phrased in the learner's own vocabulary pass, and a fluent paragraph that never
    // arrives at the effect fail. `referenceAnswer` stays alongside as what the document said.
    ...(predicting && knowledge.relation
      ? {
          expectedEvidence: {
            referenceAnswer: objective.answer,
            requiredConcepts: [knowledge.relation.cause.text, knowledge.relation.effect.text],
          },
        }
      : {}),
    ...(explaining && knowledge.semanticRelations?.length
      ? {
          expectedEvidence: {
            referenceAnswer: objective.answer,
            requiredConcepts: [...new Set(
              knowledge.semanticRelations.flatMap((relation) => relation.roles.map((role) => role.value.text)),
            )],
          },
        }
      : {}),
    id,
    // 🔴 READ OFF THE OBJECTIVE, NOT HARD-CODED TO "recall". This surface only stages retrieval
    // today, so the two are the same value — and writing the literal here is precisely how they
    // would stay the same after a second capability ships, with every prediction filed as a recall.
    operation: objective.capability,
    prompt: staged.prompt,
    targets: [targetFor(objective)],
    // An association asks for a term, not an account. The judge is told this so it checks the
    // production rather than marking a one-word answer down for being short — and a prediction is
    // told the opposite, so a two-word answer to "and why?" is read as the incomplete account it is.
    // 🔴 `compare` IS THE SPEC'S OWN WORD FOR THIS — "set two things against each other, covering
    // both" — so the durable evidence row files a discrimination under the task it actually is.
    // Leaving it as `name` would be this codebase's named failure of mapping a wider vocabulary
    // DOWN: every attempt at telling two classes apart recorded for ever as producing a term.
    // 🔴 `reconstruct` IS THE SPEC'S OWN WORD - "rebuild the structure from memory" - and a
    // procedure's structure IS its order. Filing it as `name` would record every attempt at a
    // sequence as producing a term.
    task: taskNameFor(resolved),
    // 🔴 THE STAGED RUNG, NOT THE REQUESTED ONE. Writing what was asked for rather than what was
    // delivered is the whole defect being closed here: a row must record the demand the learner
    // actually met, or `meanScaffoldingLevel` and every claim built on it describe a session that
    // did not happen.
    rung: staged.rung,
  });
}

/**
 * The evaluation task for one retrieval, in the shape the existing judge already reads.
 *
 * 🔴 `conceptId` IS NULL ON PURPOSE. A canvas concept is a per-canvas grouping; this objective is
 * durable and belongs to no canvas. Passing a fabricated id would make the judge's
 * `alsoWeakConceptIds` check accept a name that means nothing outside this session — and the
 * whole point of the objective layer is that identity does not come from a canvas.
 */
export function objectiveAsTask(
  objective: LearningObjective,
  prompt: RetrievalPrompt,
  response: LearnerResponse,
): Omit<EvaluationInput, "concepts"> {
  return {
    // 🔴 READ OFF THE PROMPT, NEVER REBUILT HERE. What a complete answer must contain was decided
    // when the question was worded; deriving it again at the judging boundary is how a task ends up
    // asking for a mechanism and being marked against a single sentence.
    expectedEvidence: prompt.expectedEvidence,
    objective: { conceptId: null, label: objective.label },
    prompt: prompt.prompt,
    response,
    task: prompt.task,
  };
}

/**
 * What one judged performance means for the durable record.
 *
 * 🔴 THE EVALUATOR DECIDES, NOT THE BUTTON. Nothing here reads "submitted", "checked" or "task
 * completed" — those say an interaction happened, not that a capability was shown. String equality
 * against `expectedAnswer` is the same mistake in a cheaper disguise: it would call a correct
 * answer wrong for a capital letter and cannot tell a wrong answer from a specific competing one.
 *
 * 🔴 AND THE TWO FACTS STAY SEPARATE. `demonstrationObtained` says whether anything usable came
 * back; `verdict` says what it showed and is NULL whenever nothing did. A judged answer always
 * obtained a demonstration — even `incorrect` is a demonstration, of the wrong thing.
 */
export function evidenceForSubmission(input: {
  prompt: RetrievalPrompt;
  /** What the learner submitted. Null when a control produced the outcome and nothing was typed. */
  responseText: string | null;
  /** Raw input provenance. It follows the performance unchanged to every objective row. */
  responseModality?: LearnerInputModality;
  /**
   * How long the attempt took, when anything measured it.
   *
   * 🔴 ABSENT IS A REAL AND DIFFERENT CASE, never a zero. Someone who typed an answer spent time
   * doing it; someone who revealed through a control typed nothing, so nothing was measured, and a
   * 0 would assert an instant answer that never happened.
   */
  tookMs?: number;
  /**
   * Whether there is an account of this performance, and what it established per objective.
   * Judged elsewhere; routed here.
   *
   * 🔴 AN OUTCOME NAMING AN OBJECTIVE THE PROMPT DID NOT TARGET IS DISCARDED. That is evidence
   * about a question nobody was asked — the same defect as the judge's `alsoWeakConceptIds`
   * naming a concept the canvas never declared. A judge that volunteers a fifth relationship the
   * learner asserted is telling us something true and possibly valuable, but it is not a
   * demonstration of anything this task put to them, and storing it here would put a claim in the
   * durable record that no prompt supports.
   *
   * 🔴 AND `{ judged: false }` WRITES NOTHING AT ALL — see `Judgement`. It is not "no outcomes".
   */
  judgement: Judgement;
  canvasId: string | null;
  occurredAt: string;
  /**
   * Which teaching controller chose the opportunity this answer came out of.
   *
   * 🔴 PASSED IN, NEVER DERIVED HERE, AND NOT OPTIONAL-WITH-A-DEFAULT. This boundary cannot know
   * which controller ran — it receives a prompt and a judgement, and both look identical whichever
   * arm produced them, which is the entire point of the design. A default of `nemesis_policy` would
   * therefore be a guess that is right most of the time and silently wrong for exactly the rows the
   * experiment exists to count. `null` is the honest value for a caller that has no arm, and it is
   * what the legacy path passes.
   */
  teachingStrategy: TeachingStrategyId | null;
}): EvidenceToRecord[] {
  const { judgement, prompt } = input;

  // 🔴 THE FIRST THING, AND IT RETURNS RATHER THAN FALLING THROUGH. No account of the performance
  // exists, so there is nothing true to write about any target. Every line below this would author
  // a claim about a learner from our own failure to reach a judge.
  if (!judgement.judged) return [];

  const byKey = new Map(judgement.outcomes.map((outcome) => [outcome.objectiveIdentityKey, outcome]));
  // 🔴 TOTAL OVER THE TARGETS, NOT OVER THE OUTCOMES, AND THAT ASYMMETRY IS THE DESIGN. Iterating
  // the judge's list would write a row only where it happened to speak, so an objective it stayed
  // silent about would leave NO row — indistinguishable from never having been asked. Every
  // objective this task put to the learner gets a row saying what happened to it, including
  // "nothing was shown about this", which is a different and much more useful fact than absence.
  // 🔴 A PROPERTY OF THE ACCOUNT, NOT OF ANY ONE TARGET, which is why it is computed once out here.
  // An account naming nothing says the opportunity was spent and nothing came of it — for every
  // target. Computed per row it would be the same value each time, and one edit away from being
  // derived from the row instead, which is the mistake it exists to prevent.
  const accountNamedNothing = judgement.outcomes.length === 0;
  return prompt.targets.map((target) =>
    rowForTarget({
      accountNamedNothing,
      canvasId: input.canvasId,
      occurredAt: input.occurredAt,
      outcome: byKey.get(target.identityKey) ?? null,
      prompt,
      responseText: input.responseText,
      responseModality: input.responseModality,
      target,
      teachingStrategy: input.teachingStrategy,
      ...(input.tookMs !== undefined ? { tookMs: input.tookMs } : {}),
    }),
  );
}

/**
 * What one outcome says about the objective it was routed to.
 *
 * 🔴 `null` IS `not_addressed`, AND THAT MAPPING IS THE KEYSTONE. The fan-out is total over the
 * TARGETS rather than over the judge's outcomes precisely so that an objective the judge stayed
 * silent about still gets a row — and this is the value that makes such a row mean something other
 * than failure. Without it the row exists and says nothing, which is worse than useless: it is
 * indistinguishable from an attempt that produced nothing, and it teaches against a mistake the
 * learner never made.
 *
 * 🔴 DERIVED FROM THE VERDICT, NOT A SECOND JUDGEMENT. `strong` and `understood` are demonstrations
 * of the objective; `partial` is partly one; `incorrect` and `misconception` both contradict it,
 * differing in whether a competing model was identified — a distinction `verdict` already carries
 * and that this deliberately does not duplicate.
 *
 * 🔴🔴 AND `null` IS TWO DIFFERENT FACTS, WHICH IS WHERE THE LIVE DEFECT WAS. It used to return
 * `not_addressed` for both, and the difference is exactly the one `ObjectiveEvidence`'s own doc
 * comment insists on:
 *
 *     the account names NOTHING at all   →  the learner met the question and produced nothing
 *     the account names OTHER objectives →  they answered ably; this simply was not in what they said
 *
 * `accountNamedNothing` is that distinction, and it is derived rather than passed: an account with
 * no outcomes covers the whole prompt and reports that the opportunity was spent — which is what
 * `unobtainedEvidence` builds for a reveal, a giving-up or a typed "I don't know", and equally what
 * a judge returns when it read a real answer and found nothing in it. Silence about ONE target among
 * several is the other case, and stays `not_addressed`.
 *
 * Getting this wrong is not a mislabelled column. `projectLearnerState` drops `not_addressed` rows
 * from `attempts` on purpose, so the whole admission path projected to `unknown`, so the policy asked
 * the same question again for ever and the answer was never stated.
 */
function objectiveEvidenceFor(outcome: SubmissionOutcome | null, accountNamedNothing: boolean): ObjectiveEvidence {
  if (!outcome?.verdict) return accountNamedNothing ? "nothing_produced" : "not_addressed";
  switch (outcome.verdict) {
    case "strong":
    case "understood":
      return "demonstrated";
    case "partial":
      return "partial";
    case "incorrect":
    case "misconception":
      return "contradicted";
  }
}

/**
 * One target's row.
 *
 * 🔴 THE ONE PLACE A ROW IS BUILT, SO THE FACTS THAT BELONG TO THE PERFORMANCE CANNOT DIVERGE
 * BETWEEN ROWS. Response identity, latency, operation, scaffolding and the text submitted are
 * properties of the ANSWER, so they are read off the prompt and response here and are identical on
 * every row this submission writes. Building rows at several call sites is how one of them
 * eventually gets a fresh id or a divided latency.
 */
function rowForTarget(input: {
  target: ObjectiveTarget;
  prompt: RetrievalPrompt;
  outcome: SubmissionOutcome | null;
  /** Whether the account covering this submission named no objective at all — see `objectiveEvidenceFor`. */
  accountNamedNothing: boolean;
  responseText: string | null;
  responseModality?: LearnerInputModality;
  canvasId: string | null;
  occurredAt: string;
  tookMs?: number;
  teachingStrategy: TeachingStrategyId | null;
}): EvidenceToRecord {
  const { outcome, prompt } = input;
  return {
    canvasId: input.canvasId,
    // 🔴 `demonstrationObtained` FOLLOWS THE OUTCOME, NOT THE SUBMISSION. An answer that established
    // three links of four obtained a demonstration of three things and of nothing about the fourth.
    // Setting this `true` for every target because *an* answer arrived would record the learner as
    // having shown something about a link they never mentioned.
    demonstrationObtained: outcome !== null,
    evaluatorVersion: EVALUATOR_VERSION,
    objectiveRowId: input.target.rowId,
    occurredAt: input.occurredAt,
    // 🔴 THE IDEMPOTENCY KEY IS THE TASK, NOT A FRESH UUID. One policy decision produces one
    // prompt, and one prompt is at most one demonstration however many times the submission
    // reaches the server — a double click, a retry, a replayed effect. Minting an id at submit
    // time would defeat the unique index entirely and inflate `demonstrationCount`, which is what
    // the policy reads to decide whether something has been shown repeatedly.
    // 🔴 SHARED BY EVERY ROW THIS SUBMISSION WRITES, AND THAT IS THE INVARIANT RUNTIME-003 EXISTS
    // FOR. One answer is one performance however many objectives it touched, so the id identifies
    // the ANSWER and never the objective. Deriving it from anything target-specific — the row id,
    // the identity key, an index — turns one 20-second explanation into four performances, each
    // claiming the full 20 seconds, and inflates practice volume fourfold.
    responseId: prompt.id,
    // 🔴 THE THREE OBSERVATIONS, AND NOT ONE INTERPRETATION AMONG THEM. No band, no threshold, no
    // "fast"/"slow". A rule like `tookMs > 10_000 → weak` written here would be unreviewable and
    // unrevisable for ever: rows recorded under it mean something different from rows recorded
    // after it changes, and nothing can recover what was actually measured. What it means is the
    // projection's job, and the projection can be rewritten.
    // 🔴 WHAT THIS RESPONSE SAID ABOUT *THIS* OBJECTIVE, WHICH IS THE FAN-OUT'S WHOLE REASON FOR
    // BEING TOTAL OVER THE TARGETS. A target the judge stayed silent about is `not_addressed` — the
    // answer never mentioned it — and that is a different fact from `demonstration_obtained: false`
    // meaning "they tried and produced nothing usable". Both write `false` there, so without this
    // column the two are indistinguishable, and the projection reads the first as a failed attempt.
    objectiveEvidence: objectiveEvidenceFor(outcome, input.accountNamedNothing),
    operation: prompt.operation,
    // The rung the TASK set, identical on every row this submission writes: the learner answered
    // one question at one demand, whatever it turned out to establish.
    scaffoldRung: prompt.rung,
    // 🔴 WHICH KIND OF TASK IT WAS, BESIDE HOW MUCH HELP IT CARRIED. Without it a completion and an
    // ordinary cued question are one row shape, and "did faded examples lead anywhere?" is a
    // question the durable record cannot answer no matter how long it runs. See task-form.ts.
    taskForm: prompt.form,
    // 🔴 THE WHOLE MEASURED DURATION ON EVERY ROW, NEVER DIVIDED AMONG THEM. The learner spent that
    // long producing this answer; they did not spend a quarter of it on each link. Splitting it
    // would be an interpretation, and a wrong one — the observation is the performance's.
    responseLatencyMs: input.tookMs,
    responseModality: input.responseModality,
    responseText: input.responseText,
    scaffoldingLevel: prompt.scaffoldingLevel,
    taskId: prompt.id,
    // 🔴 IDENTICAL ON EVERY ROW THIS SUBMISSION WRITES, like the rung and the latency. One
    // controller chose one opportunity; whatever that one answer turned out to establish across
    // however many objectives, it was all chosen by the same arm. Deriving it per row would be a
    // second reading of one fact, and the two could disagree.
    teachingStrategy: input.teachingStrategy,
    // 🔴 NULL WHENEVER NOTHING WAS SHOWN, AND NEVER `incorrect`. An objective the answer did not
    // address was not contradicted — nothing came back about it at all. Recording absence as a
    // wrong answer is absence of evidence stored as negative evidence, and the learner is then
    // taught against a mistake they never made.
    verdict: outcome?.verdict ?? null,
    ...(outcome?.confidence == null ? {} : { confidence: outcome.confidence }),
    // 🔴 PER OUTCOME, NOT PER SUBMISSION, UNLIKE THE RUNG AND THE LATENCY ABOVE. One answer put to
    // several objectives can fail differently against each — a chain where the learner had the
    // mechanism right and the direction backwards is `careless` on one link and `conceptual` on
    // another. Copying one diagnosis across every row would assert a kind of failure the judge
    // named about a different objective.
    //
    // 🔴 AND IT IS SPREAD-WHEN-PRESENT, SO AN OBJECTIVE THE JUDGE STAYED SILENT ABOUT STAYS SILENT.
    // A target with no outcome is one nothing was established about; giving it a kind of failure
    // would invent a diagnosis for a question the answer never touched.
    ...(outcome?.errorType == null ? {} : { errorType: outcome.errorType }),
    ...(outcome?.misconceptions ? { misconceptions: outcome.misconceptions } : {}),
  };
}

/**
 * One verdict about one objective, as the outcome the fan-out routes.
 *
 * 🔴 IT TAKES THE OBJECTIVE IT JUDGED, AND THAT ARGUMENT IS THE WHOLE SAFEGUARD. The convenient
 * version of this function reads the keys off `prompt.targets` and stamps the evaluation's verdict
 * onto all of them — which is right for the one-objective retrieval staged today and silently
 * catastrophic the moment a prompt targets four, because it would record a learner as having
 * demonstrated three links they never mentioned. There is deliberately no helper that can spread
 * one verdict across a set: a judgement covers what it was made about, and the caller has to say
 * what that was.
 *
 * When a genuine multi-objective judge exists it returns several of these, one per objective it
 * actually assessed, and the fan-out routes them unchanged.
 */
export function outcomeFor(
  objective: { identityKey: string },
  evaluation: ResponseEvaluation,
): SubmissionOutcome | null {
  // 🔴🔴 A NON-ATTEMPT PRODUCES NO OUTCOME AT ALL, AND THE RETURN TYPE SAYS SO. `not_an_attempt` is
  // the judge declining to grade a sentence that was not aimed at the question — see `Verdict`. It
  // is not a sixth grade and it must never reach `EvidenceVerdict`, because the durable record has
  // no way to express "this was not an answer" and would have to store it as one.
  //
  // 🔴 `null` RATHER THAN A ZERO-CONFIDENCE ROW. A row saying "we asked and learned nothing" is a
  // real thing this codebase already writes — `unanswered` below is exactly that — and it is the
  // WRONG thing here: the learner was never asked what they typed about, so there is no
  // opportunity to record as having produced nothing. Absence of a question is not absence of an
  // answer.
  if (evaluation.verdict === "not_an_attempt") return null;

  return {
    confidence: evaluation.confidence,
    // 🔴 `?? null` RATHER THAN OMITTED, SO "THE JUDGE NAMED NONE" IS CARRIED RATHER THAN LOST. This
    // is the field the whole chain existed to move: it was computed here, shown on screen, and
    // dropped at this exact line for as long as it has existed.
    errorType: evaluation.errorType ?? null,
    misconceptions: evaluation.misconceptions,
    objectiveIdentityKey: objective.identityKey,
    verdict: evaluation.verdict,
  };
}

/**
 * An opportunity that produced nothing usable.
 *
 * 🔴 NOT A WRONG ANSWER, AND THE DIFFERENCE IS THE POINT OF TWO COLUMNS. Giving up, revealing, and
 * a reply the judge returned but could not be read all mean the same thing: we still do not know.
 * Recording any of them as `incorrect` is absence of evidence stored as negative evidence.
 */
export function unobtainedEvidence(input: {
  prompt: RetrievalPrompt;
  responseText: string | null;
  responseModality?: LearnerInputModality;
  canvasId: string | null;
  occurredAt: string;
  /** Which controller chose the opportunity that produced nothing. 🔴 A non-attempt is an outcome
   *  the experiment cares about as much as a judged one — an arm whose questions people give up on
   *  is telling us something, and a row without an arm is a row the comparison cannot see. */
  teachingStrategy: TeachingStrategyId | null;
  /**
   * How long the attempt took, when anything measured it.
   *
   * 🔴 ABSENT IS A REAL AND DIFFERENT CASE. Someone who typed "I don't know" spent time doing it,
   * and that is worth keeping. Someone who revealed the answer through a control typed nothing, so
   * nothing was measured — and a 0 there would assert an instant answer that never happened.
   */
  tookMs?: number;
}): EvidenceToRecord[] {
  // 🔴 EVERY TARGET, BECAUSE THE OPPORTUNITY WAS GIVEN FOR ALL OF THEM. Someone who says "I don't
  // know" to a question covering four links was asked about four links and showed nothing about
  // any of them. Writing the admission against only the first would leave the other three reading
  // as never asked — and "we have never asked" and "we asked and nothing came back" call for
  // different teaching, which is the distinction the two columns exist to keep.
  //
  // It is the same fan-out as a judged answer with no outcomes at all, which is exactly what it is.
  //
  // 🔴 `judgementOf([])`, NOT `noJudgement()`, AND THE DIFFERENCE IS THE WHOLE OF RUNTIME-006. Nobody
  // sent this to an evaluator, so "judged" reads oddly — but we have a COMPLETE account of what
  // happened: the opportunity was given and nothing was demonstrated. That is a fact about the
  // performance and it is worth recording against every target. `noJudgement()` means the opposite,
  // that we do not know what happened, and using it here would silently delete the record of
  // someone telling us they did not know.
  return evidenceForSubmission({
    canvasId: input.canvasId,
    judgement: judgementOf([]),
    occurredAt: input.occurredAt,
    prompt: input.prompt,
    responseText: input.responseText,
    responseModality: input.responseModality,
    teachingStrategy: input.teachingStrategy,
    ...(input.tookMs !== undefined ? { tookMs: input.tookMs } : {}),
  });
}
