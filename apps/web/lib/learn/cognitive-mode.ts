// How the learner is meant to take in what the policy has put on the Canvas — contract §39.
//
// 🔴 THE POLICY DECLARES THIS; THE CANVAS RENDERS THE CONSEQUENCE. *"Does this correction require
// deliberate reading?"* is a judgement about what KIND of cognitive object is being emitted, which
// only the policy knows: it chose the action, it knows the knowledge type, and it knows whether it
// is exposing an answer or teaching a model. §36's *"the UI is downstream of this state machine"*,
// applied to the one control the product has.
//
//     transient    Valsartan → Losartan        auto-advance, ~1-2s, then the next retrieval
//     deliberate   a paragraph replacing a     Continue — "I have finished inspecting this"
//                  mental model, worked maths
//
// 🔴 AND IT IS NOT DERIVED FROM CORRECTNESS. That is the whole of §39 and it inverts what everyone
// assumed: *"Correctness does not determine advancement; cognitive mode does."* It cuts both ways —
// a CORRECT answer that reveals an explanation worth reading gets a Continue, and an INCORRECT one
// needing a single word revealed does not. So these functions cannot see a verdict: there is no
// verdict parameter anywhere in this file, and adding one would be the defect rather than a feature.
// Canvas UI came within one commit of shipping the opposite — a Continue wired to `feedbackPassed`,
// which appears exactly when the learner was WRONG. Absence of the parameter is what prevents it.
//
// PURE. No React, no I/O, no rendering. What a mode MEANS is the contract's; what it LOOKS like is
// UI's; this file only says which mode an emission is in and for how long it should sit.

import type { CognitiveMode } from "./canvas-continue";
import type { KnowledgeType } from "./knowledge-types";
import type { ObjectiveCapability } from "./learning-objective";

/**
 * Roughly one and a half seconds — the middle of the owner's *"after roughly 1–2 seconds"* (§39).
 *
 * 🔴 IT IS A POLICY NUMBER, WHICH IS WHY IT IS HERE AND NOT IN A COMPONENT. How long an exposure
 * needs depends on how much there is to take in, and that is exactly what the policy knows and the
 * renderer does not. A default chosen in the renderer would be a duration nobody picked applied to
 * material nobody sized — so `Exposition` is shaped to make the renderer unable to supply one.
 *
 * 🔴 IT IS THE WINDOW FOR THE WHOLE TRANSIENT EMISSION, NOT PER SCREEN. Two screens that each spend
 * it is three seconds, which is not "roughly 1–2 seconds", and it is the exact shape §39 bans:
 * `retrieve → fail → mini-lecture → Continue → retrieve`.
 */
export const TRANSIENT_EXPOSURE_MS = 1500;

/**
 * What the policy is presenting for the learner to take in, and how.
 *
 * 🔴 A UNION SO THE CANVAS CANNOT INVENT A DURATION THE POLICY NEVER CHOSE. A record
 * `{ mode; exposureMs? }` compiles with a deliberate exposition carrying a timer and with a
 * transient one carrying none — and the renderer would then need a fallback, which is a number
 * nobody ruled. Here the duration exists exactly where auto-advance exists, and only with a value
 * the policy supplied. Same reasoning as `AnswerSink` in canvas-hosting.ts, for the same defect.
 *
 * 🔴 `"none"` IS A THIRD MEMBER RATHER THAN `null`, AND THE DIFFERENCE IS LOAD-BEARING. `null` at
 * the consumer means *"the policy said nothing"* — `readingRequirementOf` treats that as a defect
 * and resolves it to "requires reading", which is right for an un-emitted property and WRONG for a
 * retrieval or a hold, where the honest answer is that there is nothing to take in at all. A
 * producer that can only say "transient", "deliberate" or nothing would have to pick a lie for
 * every non-exposition. This says the true thing.
 */
export type Exposition =
  | { readonly mode: "transient"; readonly exposureMs: number }
  | { readonly mode: "deliberate" }
  | { readonly mode: "none" };

/** The policy is asking for production, or holding — there is nothing on screen to take in. */
export const NO_EXPOSITION: Exposition = { mode: "none" };

/**
 * Does this exposition move on by itself?
 *
 * 🔴 THE ONE PLACE THE CONSEQUENCE IS WRITTEN. Every caller asking `mode === "transient"` for
 * itself is a caller that can be edited into disagreeing with the others. §39's rule gets exactly
 * one expression, and this is it.
 */
export function advancesItself(exposition: Exposition): boolean {
  return exposition.mode === "transient";
}

/** Which kind of object the policy has chosen to put on screen. */
export type ExpositionKind =
  /** The answer stated plainly, after an attempt that fell short or produced nothing. */
  | "correction"
  /** Confusable items separated, because a named competing model is in the way. */
  | "contrast"
  /** Nemesis's reading of the answer the learner has just given. */
  | "verdict";

/**
 * The mode of one emission.
 *
 * 🔴 THE INPUTS ARE THE COGNITIVE-DEMAND PAIR AND THE KIND OF OBJECT — NOTHING ELSE. Specifically
 * not the verdict, not the length of the text, and not the component that will render it. Those are
 * the three inputs §39 names as forbidden, and the way to keep them out is for the function not to
 * receive them.
 *
 * 🔴 `contrast` IS ALWAYS DELIBERATE, INDEPENDENT OF KNOWLEDGE TYPE, and it is checked first for
 * that reason. §39's misconception row says **Yes** unconditionally — *"explain why their model is
 * wrong and replace it"* — and a misconception about an association is still a wrong model being
 * replaced, not an answer being exposed. Routing it through the knowledge-type rule below would
 * auto-advance `losartan / valsartan` past the very explanation that separates them.
 *
 * 🔴 IT ALSO PROVES THIS IS NOT `tempoFor` UNDER ANOTHER NAME. That function answers a different
 * question — how much room the THINKING needs when the learner is asked to produce — and returns
 * `instant` for association + recall. Here the same pair returns `deliberate` for a contrast. The
 * two functions already disagree on reachable data, which is why they are two functions.
 *
 * 🔴 EVERYTHING UNCLASSIFIABLE IS DELIBERATE, WHICH IS THE SAFE DIRECTION AND THE SAME ASYMMETRY
 * THE SCAFFOLD LADDER USES. Auto-advancing past material the learner had not finished is
 * unrecoverable and invisible; asking them to press once when they did not need to is visible and
 * costs a press. `tempoFor` set the precedent for exactly this shape of question: a new knowledge
 * type arriving from Brain gets room to think rather than being rushed into a flashcard shell.
 */
export function modeOfExposition(input: {
  readonly kind: ExpositionKind;
  readonly knowledgeType: KnowledgeType;
  readonly capability: ObjectiveCapability;
}): CognitiveMode {
  if (input.kind === "contrast") return "deliberate";

  // 🔴 ROWS 1 AND 2 OF §39's TABLE, AND THEY ARE ONE RULE RATHER THAN TWO. "Simple fact /
  // association" and "vocabulary / drug fact / flashcard-like recall" describe the same cognitive
  // object twice — an association the learner must produce — and both say **No**. What gets exposed
  // is the answer itself: one line, read in about a second.
  //
  // 🔴 THE DISCRIMINATOR IS THE KNOWLEDGE TYPE, NEVER THE VERDICT, AND `partial` IS WHERE THAT
  // LOOKS WRONG AND IS NOT. §39's row 3 — "partial conceptual answer → usually yes" — reads like a
  // contradiction for a half-right association. It is not: row 3 says *conceptual*, and row 2
  // governs a flashcard whatever the verdict was. Half-remembering "Cozaar" is still answered by
  // showing "Cozaar", not by an explanation. Do not add a verdict branch here to "fix" it — that is
  // §39's forbidden input arriving through the back door.
  return input.knowledgeType === "association" && input.capability === "recall"
    ? "transient"
    : "deliberate";
}

/**
 * The exposition the policy declared, read off a decision without reaching into its type.
 *
 * 🔴 THE COMPANION TO `declaredCognitiveMode`, AND IT EXISTS BECAUSE THE MODE ALONE STRANDS THE
 * RENDERER. A Canvas told `transient` still has to know for HOW LONG, and the whole point of the
 * union is that it must not answer that itself. `declaredCognitiveMode` keeps working unchanged for
 * the reading-requirement question; this is what an auto-advance reads.
 *
 * Returns `null` only when the policy has said nothing at all — the same defect-not-default reading
 * `readingRequirementOf` gives it. A decision produced by `decideNext` always carries one.
 */
export function declaredExposition(decision: unknown): Exposition | null {
  if (typeof decision !== "object" || decision === null) return null;
  const found = (decision as { exposition?: unknown }).exposition;
  if (typeof found !== "object" || found === null) return null;
  const { exposureMs, mode } = found as { mode?: unknown; exposureMs?: unknown };
  if (mode === "deliberate") return { mode: "deliberate" };
  if (mode === "none") return NO_EXPOSITION;
  // 🔴 A `transient` WITHOUT A DURATION IS NOT A `transient`. Returning one would hand the renderer
  // the auto-advance and no number, which is the single thing this union exists to prevent — so it
  // reads as "nothing was declared" and resolves to the safe side rather than to a guessed window.
  if (mode === "transient" && typeof exposureMs === "number" && exposureMs > 0) {
    return { exposureMs, mode: "transient" };
  }
  return null;
}

/**
 * The mode, with the duration attached where one is owed.
 *
 * The only constructor for a presented exposition. Values are never assembled by hand at a call
 * site, because a hand-built one is exactly where a renderer's own guess at a duration would enter.
 */
export function expositionFor(input: {
  readonly kind: ExpositionKind;
  readonly knowledgeType: KnowledgeType;
  readonly capability: ObjectiveCapability;
}): Exposition {
  return modeOfExposition(input) === "transient"
    ? { exposureMs: TRANSIENT_EXPOSURE_MS, mode: "transient" }
    : { mode: "deliberate" };
}
