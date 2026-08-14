// Which objective the policy is asked about, and what it said.
//
// 🔴 THE POLICY DECIDES WHAT TO DO ABOUT ONE OBJECTIVE. SOMETHING STILL HAS TO CHOOSE THE
// OBJECTIVE. That choosing is here, kept as small and as boring as it can be, because it is
// exactly where a curriculum would grow back: an ordering that encoded "teach the easy ones
// first", or a rule that walked every objective through the same three steps, would be the
// six-stage machine rebuilt one level up. This picks the first objective that is owed something,
// in a fixed order, and stops.
//
// 🔴 STATELESS, LIKE THE POLICY IT CALLS. Nothing accumulates between calls. Run it twice on the
// same evidence and it returns the same decision; run it after evidence lands and it returns
// whatever that new state deserves. The loop lives outside: decide → ask → evidence → decide.

import type { DeclaredMode } from "./canvas-continue";
import { type Exposition } from "./cognitive-mode";
import { projectLearnerState, type LearnerEvidence, type LearnerObjectiveState } from "./learner-evidence";
import type { KnowledgeObject } from "./knowledge-types";
import type { StoredObjective } from "./learner-store";
import { mostValuable, value, type ActionValue } from "./next-action-value";
import { dependentsOf, prerequisiteMap } from "./objective-prerequisites";
import { runtimeCanStage } from "./runtime-support";
import { chooseNextTeachingAction, expositionOf, type TeachingAction } from "./teaching-policy";
import type { ResolvedObjective } from "./canvas-knowledge";
import { interveningActs } from "./working-memory";

/**
 * The learner met this and it did not go well — what makes work underneath it worth offering.
 *
 * 🔴 `not_demonstrated` IS IN AND `unknown` IS OUT, WHICH IS THE LINE THIS WHOLE FEATURE TURNS ON.
 * "They were asked and produced nothing" is the learner telling us they are stuck; "we have never
 * asked" is Nemesis lacking evidence, and treating the second as stuckness would promote every
 * upstream term in a document before anybody had answered anything.
 */
const STUCK_STATUSES: readonly LearnerObjectiveState["status"][] = [
  "not_demonstrated",
  "incorrect",
  "misconception",
  "partial",
];

export interface PolicyDecision {
  objective: StoredObjective;
  knowledge: KnowledgeObject;
  state: LearnerObjectiveState;
  action: TeachingAction;
  /** This objective's own evidence, newest last — what the decision was made from. */
  evidence: LearnerEvidence[];
  /**
   * What the learner is being asked to take in, and for how long — §39.
   *
   * 🔴 CARRIED UP FROM THE ACTION, NEVER RE-DERIVED. The policy decided it, at the point where it
   * decided what to emit; this is a projection of that decision so the surface can read it without
   * pattern-matching on the action type. A second derivation here would be a second opinion about
   * the same emission, and the two would drift.
   */
  exposition: Exposition;
  /**
   * The same mode, flat, because that is the shape the Canvas reads structurally.
   *
   * 🔴 DERIVED FROM `exposition` IN THE ONE PLACE BOTH ARE SET, so they cannot disagree. It exists
   * because `declaredCognitiveMode` in canvas-continue.ts reads `decision.cognitiveMode` — it was
   * written against this property before it existed, deliberately, so that landing the producer
   * changes nothing on the consumer side. Two fields, one assignment, one source.
   */
  cognitiveMode: DeclaredMode;
  /**
   * What made this the most valuable thing to do, and what it scored against the alternatives.
   *
   * 🔴 THE POLICY TRACE, AND IT IS SYSTEM STATE RATHER THAN MODEL REASONING. `action.because` is a
   * sentence for a person; this is the named terms the selector weighed, which is what a test can
   * assert on and what answers "why this and not that" without anyone reading a float.
   */
  selection: ActionValue;
}

/**
 * The one thing to do next across this canvas's objectives, or null when nothing is owed.
 *
 * Arbitration in two passes, and only two:
 *
 *   1. the first objective the policy wants to ACT on — retrieve, correct, contrast;
 *   2. failing that, the first it wants to HOLD, so a learner who has just been corrected on
 *      everything here is told so rather than shown a blank page.
 *
 * `advance` means nothing is owed, so it is never the answer to "what next" — it is the absence of
 * one. When every objective advances, this returns null and the caller says the honest thing.
 */
export function decideNext(input: {
  objectives: readonly ResolvedObjective[];
  evidence: readonly LearnerEvidence[];
  now: Date;
  /**
   * Objectives this session has already acted on, moved to the back of the queue.
   *
   * 🔴 SESSION STATE, AND DELIBERATELY NOT LEARNER STATE. Reading a correction is not a claim that
   * anyone can now do anything, so it must never become evidence — which leaves a gap the policy
   * cannot close on its own: showing a correction produces no new evidence, so the state that asked
   * for it is unchanged, so it asks again. "Got it" re-rendered the identical card for ever.
   *
   * 🔴 AND IT IS A REORDERING, NOT A FILTER. If every objective has been acted on, the last one
   * still comes back rather than the session ending in a blank page — being shown something twice
   * is a much smaller failure than a surface with nothing on it.
   *
   * 🔴 ORDERED, OLDEST FIRST, ONE ENTRY PER ACT — IT USED TO BE A `Set` AND THAT LOST THE ONE FACT
   * §39 NEEDS. Membership answers "has this been seen?"; working memory asks "what has happened
   * SINCE this was seen?", and a Set cannot answer it. The reordering set below is derived from
   * this list rather than passed alongside it, so ordering and membership cannot disagree — two
   * inputs that must agree is exactly the construction that let the failed-objective defect sit
   * unnoticed under a comment promising the opposite.
   */
  actedOn?: readonly string[];
  /**
   * Objectives whose CORRECTION has already been displayed in this session.
   *
   * 🔴 A DIFFERENT SET FROM `actedOn`, AND CONFUSING THE TWO INVERTS THE FIX THEY SERVE.
   * `acknowledge()` adds an objective to `actedOn` when the learner clears the FEEDBACK screen
   * after answering — which happens BEFORE any correction is displayed. A policy reading `actedOn`
   * to mean "they have seen the answer" would therefore defer at the exact moment the correction is
   * owed, and someone who got a question wrong would never be shown the answer at all.
   *
   * 🔴 SESSION STATE AND NEVER LEARNER STATE, for the same reason `actedOn` is: receiving a
   * correction is not a demonstration, so it must not become evidence. That is precisely why the
   * policy cannot recover this from the log and has to be told.
   */
  correctionsShown?: ReadonlySet<string>;
}): PolicyDecision | null {
  const actedInOrder = input.actedOn ?? [];
  // Derived, never passed in beside the list — see `actedOn`.
  const acted = new Set(actedInOrder);
  const corrected = input.correctionsShown ?? new Set<string>();
  // Stable: identity order is preserved inside each group, so this only moves already-seen
  // objectives behind unseen ones and never shuffles the rest.
  const ordered = [
    ...input.objectives.filter(({ objective }) => !acted.has(objective.identityKey)),
    ...input.objectives.filter(({ objective }) => acted.has(objective.identityKey)),
  ];

  const decisions = ordered.map(({ knowledge, objective }) => {
    // 🔴 FILTERED BY OBJECTIVE, NEVER BY CANVAS. The evidence handed in is everything this learner
    // holds for these objectives across every session — a canvas filter here would silently turn
    // the durable learner model back into a session transcript, and every test would still pass.
    const mine = input.evidence.filter((entry) => entry.objectiveIdentityKey === objective.identityKey);
    const state = projectLearnerState(objective.identityKey, mine);
    const action = chooseNextTeachingAction({
      correctionAlreadyShown: corrected.has(objective.identityKey),
      interveningActs: interveningActs(objective.identityKey, actedInOrder),
      knowledgeObject: knowledge,
      learnerState: state,
      now: input.now,
      objective,
      recentEvidence: mine,
    });
    // 🔴 ONE READ OF THE ACTION, TWO SHAPES OF THE SAME ANSWER. `cognitiveMode` is not a second
    // decision — it is `exposition.mode`, assigned here so the two cannot be set independently.
    const exposition = expositionOf(action);
    return {
      action,
      cognitiveMode: exposition.mode,
      evidence: mine,
      exposition,
      knowledge,
      objective,
      state,
    };
  });

  // 🔴🔴 THE SELECTOR IS A VALUE FUNCTION NOW, NOT A LIST OF TIERS — see `next-action-value.ts`.
  // What follows used to be three `find`s in a fixed order, and it had a real ceiling: WITHIN a tier
  // it fell back to whichever identity key sorted first, so an objective the learner had failed
  // three times waited behind one they had failed once, for no reason anybody chose. The learner
  // model had outgrown the thing choosing from it.
  //
  // 🔴 IT SCORES ACTIONS, NEVER THE LEARNER. Nothing is stored, nothing accumulates, and no number
  // here is a measure of a person — the score is recomputed from durable evidence on every call and
  // ranks what is worth DOING. That is what keeps it rewritable without a migration, and what stops
  // it quietly becoming the mastery score the product philosophy forbids.
  //
  // 🔴 AND IT REPRODUCES THE ORDERING THAT WAS ALREADY REASONED ABOUT AND TESTED. An exposition the
  // learner is owed still outranks anything Nemesis wants to ask; never-established still outranks
  // due-for-review. Those are bands now rather than `find` order, and the modifiers are bounded so
  // they cannot cross one. Every test written against the old ordering still passes — which is the
  // evidence this extends the old rule rather than replacing it with something unproven.
  const owed = decisions.filter(
    (decision) => decision.action.type !== "advance" && decision.action.type !== "defer",
  );

  // 🔴 EVERY OWED CANDIDATE IS SCORED, AND THE BEST ONE WINS. The bands in `next-action-value.ts`
  // encode the precedence the previous three-`find` selector encoded; the modifiers discriminate
  // inside a band, which is exactly where the old rule had nothing to say and fell back to hash
  // order. See that file's header for why each band sits where it does.
  // 🔴🔴 I11'S EDGE, BUILT ONCE PER DECISION AND NEVER STORED. `objective-prerequisites.ts` reads
  // the role fields the extractor emitted with provenance and joins them on the key the extractor
  // itself uses — it never scans prose, and it emits no edge whenever it is not certain, because a
  // false edge silently reorders what a learner is taught while a missing one costs nothing.
  //
  // 🔴 DERIVED, NOT PERSISTED, FOR THE SAME REASON THE SCORE IS. A dependency graph in a table
  // becomes a curriculum somebody has to migrate; recomputed from the knowledge on hand, it can be
  // rewritten completely the day a better rule exists.
  const prerequisites = prerequisiteMap(
    decisions.map((decision) => ({
      identityKey: decision.objective.identityKey,
      knowledge: decision.knowledge,
    })),
  );
  const dependents = dependentsOf(prerequisites);
  const stuck = new Set(
    decisions
      // 🔴 ATTEMPTED AND IT DID NOT GO WELL — never "not yet demonstrated". Counting `unknown` would
      // make every upstream term in the document promote every other one on the first render, which
      // is a curriculum ordering wearing a learner model's clothes.
      .filter((decision) => STUCK_STATUSES.includes(decision.state.status))
      .map((decision) => decision.objective.identityKey),
  );
  const blockedBehind = (identityKey: string): number =>
    (dependents.get(identityKey) ?? []).filter((dependent) => stuck.has(dependent)).length;

  const scored = owed.map((decision) => ({
    decision,
    value: value({
      action: decision.action,
      blockedDependents: blockedBehind(decision.objective.identityKey),
      evidence: decision.evidence,
      interveningActs: interveningActs(decision.objective.identityKey, actedInOrder),
      knowledge: decision.knowledge,
      state: decision.state,
    }),
  }));
  const winner = mostValuable(scored, (candidate) => candidate.value);

  // 🔴 A HELD OBJECTIVE IS STILL BETTER THAN A BLANK PAGE. When everything advances or defers there
  // is nothing owed, and the honest answer is the held one rather than an empty surface — being
  // shown something twice is a much smaller failure than a canvas with nothing on it.
  if (winner) return { ...winner.decision, selection: winner.value };
  const held = decisions.find((decision) => decision.action.type === "defer");
  return held ? { ...held, selection: value({
    action: held.action,
    evidence: held.evidence,
    interveningActs: interveningActs(held.objective.identityKey, actedInOrder),
    knowledge: held.knowledge,
    state: held.state,
  }) } : null;
}

export function supportedObjectives(objectives: readonly ResolvedObjective[]): ResolvedObjective[] {
  // 🔴 THE LEDGER, NEVER A LITERAL. This used to read `knowledge.type === "association" &&
  // objective.capability === "recall"` — the identical rule `supportedKnowledge` states one layer
  // up, in a different file, where ownership is decided. Two copies of one rule can disagree, and
  // the failure is silent in the worst direction: a canvas OWNED by the runtime whose every
  // objective is then filtered out of it, which the learner meets as an empty Canvas.
  return objectives.filter(({ knowledge, objective }) => runtimeCanStage(knowledge.type, objective.capability));
}
