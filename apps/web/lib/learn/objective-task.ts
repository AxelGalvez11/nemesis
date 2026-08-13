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

import type { LearnerResponse, ResponseEvaluation, RetrievalTask } from "./canvas-model";
import type { EvaluationInput } from "./canvas-prompts";
import type { EvidenceVerdict } from "./learner-evidence";
import type { LearningObjective, ObjectiveCapability } from "./learning-objective";
import type { EvidenceToRecord, StoredObjective } from "./learner-store";
import type { ObjectiveEvidence, ScaffoldRung } from "./scaffold-rung";

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

/** The pair of identifiers a prompt needs to ask about one stored objective. */
export function targetFor(objective: StoredObjective): ObjectiveTarget {
  return { identityKey: objective.identityKey, rowId: objective.rowId };
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
}): RetrievalPrompt {
  return {
    expectedAnswer: input.expectedAnswer,
    id: input.id,
    operation: input.operation,
    prompt: input.prompt,
    rung: input.rung ?? "independent",
    scaffoldingLevel: input.scaffoldingLevel ?? UNSUPPORTED_RETRIEVAL,
    targets: input.targets,
    task: input.task,
  };
}

/**
 * The single-objective retrieval this surface stages today — the one-element case, and nothing more.
 *
 * 🔴 IT DELEGATES RATHER THAN BUILDING ITS OWN SHAPE. A second construction site is how the two
 * drift, and the field that drifts here is the response identity.
 */
export function retrievalPromptFor(objective: StoredObjective, id: string): RetrievalPrompt {
  return promptTargeting({
    expectedAnswer: objective.answer,
    id,
    // 🔴 READ OFF THE OBJECTIVE, NOT HARD-CODED TO "recall". This surface only stages retrieval
    // today, so the two are the same value — and writing the literal here is precisely how they
    // would stay the same after `explain` ships, with every explanation recorded as a recall.
    operation: objective.capability,
    prompt: objectivePromptText(objective),
    targets: [targetFor(objective)],
    // An association asks for a term, not an explanation. The judge is told this so it checks the
    // production rather than marking a one-word answer down for being short.
    task: "name",
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
    expectedEvidence: { referenceAnswer: prompt.expectedAnswer },
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
  return prompt.targets.map((target) =>
    rowForTarget({
      canvasId: input.canvasId,
      occurredAt: input.occurredAt,
      outcome: byKey.get(target.identityKey) ?? null,
      prompt,
      responseText: input.responseText,
      target,
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
 */
function objectiveEvidenceFor(outcome: SubmissionOutcome | null): ObjectiveEvidence {
  if (!outcome?.verdict) return "not_addressed";
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
  responseText: string | null;
  canvasId: string | null;
  occurredAt: string;
  tookMs?: number;
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
    objectiveEvidence: objectiveEvidenceFor(outcome),
    operation: prompt.operation,
    // The rung the TASK set, identical on every row this submission writes: the learner answered
    // one question at one demand, whatever it turned out to establish.
    scaffoldRung: prompt.rung,
    // 🔴 THE WHOLE MEASURED DURATION ON EVERY ROW, NEVER DIVIDED AMONG THEM. The learner spent that
    // long producing this answer; they did not spend a quarter of it on each link. Splitting it
    // would be an interpretation, and a wrong one — the observation is the performance's.
    responseLatencyMs: input.tookMs,
    responseText: input.responseText,
    scaffoldingLevel: prompt.scaffoldingLevel,
    taskId: prompt.id,
    // 🔴 NULL WHENEVER NOTHING WAS SHOWN, AND NEVER `incorrect`. An objective the answer did not
    // address was not contradicted — nothing came back about it at all. Recording absence as a
    // wrong answer is absence of evidence stored as negative evidence, and the learner is then
    // taught against a mistake they never made.
    verdict: outcome?.verdict ?? null,
    ...(outcome?.confidence == null ? {} : { confidence: outcome.confidence }),
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
): SubmissionOutcome {
  return {
    confidence: evaluation.confidence,
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
  canvasId: string | null;
  occurredAt: string;
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
    ...(input.tookMs !== undefined ? { tookMs: input.tookMs } : {}),
  });
}
