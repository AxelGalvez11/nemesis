// Can the learner USE the relation when the case is not the one they were taught?
//
// 🔴 THE QUESTION NEMESIS COULD NOT ASK. Everything the runtime stages today puts the learner back
// in front of the case the source stated — recall it, predict from it, explain it, tell it apart,
// place it in order. All of that is evidence about the material as written. None of it separates a
// learner who has the relationship from one who has the sentence. A transfer probe changes the case
// and keeps the relation, so reciting the remembered answer is WRONG and only using the relation is
// right.
//
// 🔴 IT IS A TASK FORM, NOT A NEW CAPABILITY, AND THE IDENTITY CONTRACT IS WHY. `objectiveIdentityBasis`
// keys an objective on knowledge + capability + parameters. Minting a `transfer` capability would
// create a SECOND objective over the same relation, with its own identity key, its own learner
// state, and no connection to the evidence already gathered — so a learner who had produced the
// prediction ten times would read as never having met the transfer objective, and the controller
// would see two rows where there is one thing to know. Same objective, harder task, recorded with
// `taskForm: "transfer"`. Existing evidence keeps its exact meaning and nothing is re-keyed.
//
// 🔴 THE RUNG STAYS `independent`, AND THAT IS NOT AN OVERSIGHT. The rung records how much of THIS
// TASK'S ANSWER was on screen, and a transfer probe supplies none of it: the question names a
// condition, never the consequence being asked for. It is HARDER than the ordinary question, which
// is exactly why it must not be expressed as a sixth rung above `independent` — `entails` would then
// have a transfer pass silently establishing an ordinary pass the learner never gave.
//
// 🔴 AND THE REFERENCE ANSWER IS DERIVED, NEVER INVENTED. This file makes no model call. The only
// case it constructs is the one the source's own relation already determines: the material asserts a
// direction, so the opposite condition has the opposite consequence, and that inference is written
// out below per relation kind. Where the direction cannot be inverted soundly — `causes` and
// `contributes_to`, where absence of the cause says nothing about absence of the effect — or where
// the source hedged it, the action REFUSES. A plausible case with a made-up answer, judged against
// itself, is the exact failure the grounding rule exists to prevent.

import type { CausalRelation, CausalRelationKind, KnowledgeObject } from "./knowledge-types";
import { consequenceOf } from "./worked-example";

/** What was altered about the case. One value today; the field exists so a reviewer can check. */
export type TransferChange = "the direction of the condition";

export interface TransferTask {
  /** The changed case, as the learner reads it. */
  readonly question: string;
  /** What a defensible answer says, derived from the asserted relation. */
  readonly expectedAnswer: string;
  /** The thing the answer has to be about, so a vague answer cannot pass. */
  readonly requiredConcepts: readonly string[];
  readonly changed: TransferChange;
  readonly from: "causal_relation";
}

export type TransferRefusal =
  /** This knowledge asserts no directed relation, so there is no invariant to carry to a new case. */
  | "no-invariant-to-carry"
  /** The type claims a relation the extractor never filled in. */
  | "structure-missing"
  /** The relation does not survive inversion: absence of a cause implies nothing about the effect. */
  | "relation-not-invertible"
  /** The source hedged or negated it, so the inverted case is not something the material supports. */
  | "relation-hedged";

export type TransferResult =
  | { readonly task: TransferTask; readonly refusal?: undefined }
  | { readonly task?: undefined; readonly refusal: TransferRefusal };

/**
 * What follows when the asserted condition is taken away instead of applied.
 *
 * 🔴 `causes` AND `contributes_to` ARE ABSENT ON PURPOSE. "Smoking causes cancer" does not license
 * "not smoking prevents cancer", and a contribution is by definition one of several — inverting
 * either would have Nemesis assert something the source did not, then mark a correct learner wrong
 * for refusing to agree with it.
 */
const WHEN_THE_CONDITION_IS_REMOVED: Partial<Record<CausalRelationKind, (effect: string) => string>> = {
  increases: (effect) => `${effect} is lower than it would otherwise be`,
  decreases: (effect) => `${effect} is higher than it would otherwise be`,
  inhibits: (effect) => `${effect} is no longer held down, so it rises`,
  enables: (effect) => `${effect} cannot happen`,
  prevents: (effect) => `${effect} is free to happen`,
};

export function relationIsInvertible(kind: CausalRelationKind): boolean {
  return WHEN_THE_CONDITION_IS_REMOVED[kind] !== undefined;
}

function hedged(relation: CausalRelation): boolean {
  return relation.negated || relation.qualifierKind === "epistemic";
}

export function transferTaskFor(input: { knowledge: KnowledgeObject }): TransferResult {
  const { knowledge } = input;
  if (knowledge.type !== "causal") return { refusal: "no-invariant-to-carry" };

  const relation = knowledge.relation;
  if (!relation || !relation.cause.text || !relation.effect.text) return { refusal: "structure-missing" };
  if (hedged(relation)) return { refusal: "relation-hedged" };

  const inverted = WHEN_THE_CONDITION_IS_REMOVED[relation.relation];
  if (!inverted) return { refusal: "relation-not-invertible" };

  const condition =
    relation.qualifierKind === "conditional" && relation.qualifier ? ` (still ${relation.qualifier})` : "";

  return {
    task: {
      changed: "the direction of the condition",
      from: "causal_relation",
      // 🔴 THE EFFECT IS NOT NAMED IN THE QUESTION, AND THAT IS LOAD-BEARING. Naming it would put
      // half the ordinary recall answer on screen, and the row would then claim unaided production
      // of something that was printed for them. "What follows" makes the learner supply the effect
      // AND the direction, which is why this task is harder than the one it is a transfer of.
      question: `Suppose ${relation.cause.text} is reduced or absent instead${condition}. What follows, and why?`,
      expectedAnswer:
        `${inverted(relation.effect.text)}, because the material states that ` +
        `${relation.cause.text} ${consequenceOf(relation)} ${relation.effect.text}.`,
      requiredConcepts: [relation.effect.text],
    },
  };
}

/** Can a transfer probe be staged here at all? Used to tell the controller what it may ask for. */
export function transferAvailable(input: { knowledge: KnowledgeObject }): boolean {
  return transferTaskFor(input).task !== undefined;
}
