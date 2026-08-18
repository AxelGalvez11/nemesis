// Showing HOW a piece of reasoning is carried out, built only from what the material actually says.
//
// 🔴 THIS IS NOT `teach`, AND THE DIFFERENCE IS THE WHOLE REASON IT EXISTS. `teach` puts the CLAIM
// in front of the learner — the cue, the answer, the sentence the source wrote. A worked example
// puts the PROCESS in front of them: where you start, what you look up, how the parts compose, what
// you end up saying. The worked-example literature is about the second, and Nemesis had only the
// first: every exposition action it could take stated a conclusion, so a learner who could not yet
// perform the operation had nothing to inspect but the answer they had already failed to produce.
//
// 🔴 IT MAY SHOW THE ANSWER, BECAUSE ITS PURPOSE IS MODELLING RATHER THAN TESTING. That is the one
// place where the rule the rest of this runtime lives by is deliberately suspended, and it is safe
// for exactly one reason: viewing a worked example writes NO evidence row. Nothing downstream can
// mistake having read one for having produced anything — see `assistance-evidence.test.ts`, which
// breaks if a worked example ever lands in `learner_evidence`.
//
// 🔴 AND IT REFUSES RATHER THAN INVENTS. There is no model call in here and there must not be one:
// a "worked example" generated from a two-column association would be a procedure Nemesis made up
// and then taught as though the source had said it. Every line below is assembled from a field the
// extractor actually filled — ordered steps, a causal relation, a class contrast — and knowledge
// with none of those gets a named refusal that the controller can see.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. Nothing here reads the words in the material. A procedure is
// modelled the same way whether its steps are a titration, a motion to dismiss, or a bearing
// replacement, because all this file knows is that the source printed an ordered run.

import type { KnowledgeObject } from "./knowledge-types";
import type { LearningObjective } from "./learning-objective";

/** Which grounded structure a demonstration was assembled from. */
export type WorkedExampleSource = "procedure_steps" | "causal_relation" | "class_contrast";

/** One demonstration of how the operation is performed. */
export interface WorkedExample {
  /** A single learner-facing line saying what is being demonstrated. */
  readonly lead: string;
  /** The demonstration itself, in order. Each line traces to a field of the knowledge object. */
  readonly steps: readonly string[];
  /** What it was built from, so a reviewer can check the grounding without re-deriving it. */
  readonly from: WorkedExampleSource;
}

export type WorkedExampleRefusal =
  /** This kind of knowledge has no process to model — an association, a figure label, loose prose. */
  | "no-process-to-model"
  /** The type claims a structure the extractor never filled in. */
  | "structure-missing";

export type WorkedExampleResult =
  | { readonly modelled: WorkedExample; readonly refusal?: undefined }
  | { readonly modelled?: undefined; readonly refusal: WorkedExampleRefusal };

/** `contributes_to` reads as machine notation on a screen; nothing else about it changes. */
export function relationPhrase(relation: string): string {
  return relation.replace(/_/g, " ");
}

/** The consequence half of a causal relation, worded the way the objective's answer words it. */
export function consequenceOf(relation: { relation: string; negated: boolean }): string {
  const phrase = relationPhrase(relation.relation);
  return relation.negated ? `does not ${phrase}` : phrase;
}

export function workedExampleFor(input: {
  knowledge: KnowledgeObject;
  objective: LearningObjective;
}): WorkedExampleResult {
  const { knowledge, objective } = input;

  if (knowledge.type === "procedure") {
    const steps = knowledge.steps ?? [];
    if (steps.length === 0) return { refusal: "structure-missing" };
    return {
      modelled: {
        from: "procedure_steps",
        lead: `How ${knowledge.statement} goes, start to finish.`,
        steps: steps.map((step) => step.text),
      },
    };
  }

  if (knowledge.type === "causal") {
    const relation = knowledge.relation;
    if (!relation || !relation.cause.text || !relation.effect.text) {
      return { refusal: "structure-missing" };
    }
    const consequence = consequenceOf(relation);
    const bound = relation.qualifier ? ` (${relation.qualifier})` : "";
    return {
      modelled: {
        from: "causal_relation",
        lead: "How a question like this one is worked out.",
        steps: [
          `Start from the condition you are given: ${relation.cause.text}.`,
          `Find what the material ties it to: "${relation.assertion}"`,
          `Read the direction off that relation: ${relation.cause.text} ${consequence} ${relation.effect.text}${bound}.`,
          `State the consequence and the reason together: ${consequence} ${relation.effect.text}${bound}, because that is the relation the material asserts.`,
        ],
      },
    };
  }

  if (knowledge.type === "classification") {
    const contrast = knowledge.contrast;
    if (!contrast || contrast.siblings.length === 0) return { refusal: "structure-missing" };
    const axis = contrast.axis?.trim();
    const neighbours = contrast.siblings.map((sibling) => sibling.label).join(", ");
    return {
      modelled: {
        from: "class_contrast",
        lead: `How ${objective.cue} gets placed.`,
        steps: [
          `Start from the case in front of you: ${objective.cue}.`,
          axis
            ? `Ask the question the material sorts by: ${axis}.`
            : "Ask which of the groups the material sets out this belongs to.",
          `Rule against the neighbours it has to be told apart from: ${neighbours}.`,
          `The material places ${objective.cue} in ${contrast.label}.`,
        ],
      },
    };
  }

  // 🔴 EVERYTHING ELSE REFUSES, AND THAT INCLUDES THE MOST COMMON KNOWLEDGE THERE IS. An
  // association has two sides and no process between them; a figure label has a position and no
  // reasoning; open prose relations have structure a machine can join on but nothing a learner can
  // be walked through. Modelling any of those would mean writing the steps ourselves.
  return { refusal: "no-process-to-model" };
}

/** Can a worked example be built here at all? Used to tell the controller what it may ask for. */
export function workedExampleAvailable(input: {
  knowledge: KnowledgeObject;
  objective: LearningObjective;
}): boolean {
  return workedExampleFor(input).modelled !== undefined;
}
