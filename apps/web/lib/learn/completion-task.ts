// The middle rung between "here is the whole solution" and "do it yourself".
//
// 🔴 THE GAP THIS FILLS IS NOT THE ONE THE SCAFFOLD LADDER ALREADY FILLED. `recognition → cued →
// narrowed → independent` changes how much help a RETRIEVAL QUESTION carries. That is a real ladder
// and it stays. What it cannot express is a FADED WORKED EXAMPLE: most of a valid solution on
// screen, one part removed, the learner supplying the part. The literature puts that step between
// studying a model and performing unaided, and Nemesis had no way to stage it.
//
// 🔴 IT IS A REAL PERFORMANCE AND IT IS ASSISTED, WHICH IS TWO FACTS AND NEEDS TWO FIELDS. The
// learner produced something, so it writes an evidence row like any other answer. Part of the
// solution was in front of them, so the row records `scaffoldRung: "completion"` — below `cued`,
// above `recognition` — and `taskForm: "completion"`. Neither field alone is enough: the rung is
// what stops `satisfies(state, "independent")` from ever being true off the back of one, and the
// form is what lets a later reviewer ask whether completions led anywhere.
//
// 🔴 AND IT REFUSES WHERE THERE IS NOTHING TO PART-SUPPLY. Blanking a word out of a one-line
// association is not a faded example, it is the `cued` rung that already exists. Only knowledge the
// extractor gave real internal structure — an ordered run of steps, a directed relation — can have
// a part withheld from it, and everything else gets a named refusal.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. The procedure branch below does not know or care whether the
// steps are a synthesis, a pleading, or a pre-flight check.

import type { KnowledgeObject } from "./knowledge-types";
import type { LearningObjective } from "./learning-objective";
import { consequenceOf } from "./worked-example";

/** Which grounded structure the supplied part was taken from. */
export type CompletionSource = "procedure_steps" | "causal_relation";

/** What sits on the screen where the withheld part belongs. */
export const MISSING_MARKER = "— missing —";

export interface CompletionTask {
  /** The part of a valid solution shown to the learner, in order, with one gap in it. */
  readonly given: readonly string[];
  /** What they are asked to supply. */
  readonly question: string;
  /** The withheld part. 🔴 The piece being SCORED, not the objective's whole answer. */
  readonly expectedAnswer: string;
  /** Concepts the answer has to contain, where the structure names them. */
  readonly requiredConcepts: readonly string[];
  readonly from: CompletionSource;
}

export type CompletionRefusal =
  /** This knowledge has no multi-part structure, so nothing can be withheld from it. */
  | "nothing-to-part-supply"
  /** The type claims a structure the extractor never filled in. */
  | "structure-missing"
  /** Supplying a part would leave the whole solution, or nothing, on screen. */
  | "no-part-to-withhold";

export type CompletionResult =
  | { readonly task: CompletionTask; readonly refusal?: undefined }
  | { readonly task?: undefined; readonly refusal: CompletionRefusal };

export function completionTaskFor(input: {
  knowledge: KnowledgeObject;
  objective: LearningObjective;
}): CompletionResult {
  const { knowledge, objective } = input;

  if (knowledge.type === "procedure") {
    const steps = knowledge.steps ?? [];
    if (steps.length === 0) return { refusal: "structure-missing" };
    // 🔴 A ONE-STEP RUN CANNOT BE FADED. Blank its only step and what is left is the bare question
    // with a horizontal rule above it — the `independent` rung wearing a costume, recorded as
    // though help had been given. Refusing is the only honest answer.
    if (steps.length < 2) return { refusal: "no-part-to-withhold" };
    const step = objective.parameters.stepKey;
    if (step === undefined || step < 1 || step > steps.length) return { refusal: "no-part-to-withhold" };
    const missing = steps[step - 1]!;
    return {
      task: {
        from: "procedure_steps",
        given: steps.map((entry, index) => (index === step - 1 ? MISSING_MARKER : entry.text)),
        question: `One step of ${knowledge.statement} is missing. What belongs in the gap?`,
        expectedAnswer: missing.text,
        requiredConcepts: [],
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
      task: {
        from: "causal_relation",
        // 🔴 THE DIRECTION IS GIVEN AND THE TARGET IS WITHHELD, WHICH IS THE WHOLE FADE. The
        // ordinary question ("what follows from X, and why?") asks for both at once. Here the half
        // that says WHICH WAY is already on screen, so what is left to produce is the half that
        // says WHAT — a strictly smaller piece of the same solution.
        given: [
          `Given: ${relation.cause.text}.`,
          `The material states that this ${consequence} something${bound}.`,
        ],
        question: `Complete it: what does ${relation.cause.text} ${consequence}?`,
        expectedAnswer: `${relation.effect.text}${bound}`,
        requiredConcepts: [relation.effect.text],
      },
    };
  }

  // 🔴 THE REFUSAL IS THE COMMON CASE AND THAT IS CORRECT. Associations, figure labels, class
  // contrasts and open prose relations all have answers that are a single thing; there is no
  // "part" of them that is not the whole.
  return { refusal: "nothing-to-part-supply" };
}

/** Can a completion be staged here at all? Used to tell the controller what it may ask for. */
export function completionAvailable(input: {
  knowledge: KnowledgeObject;
  objective: LearningObjective;
}): boolean {
  return completionTaskFor(input).task !== undefined;
}
