// Making a rung change the QUESTION, not just the label on the row.
//
// 🔴🔴 THIS FILE EXISTS BECAUSE THE LADDER WAS A LIE, AND IT WAS A LIE THAT PASSED EVERY TEST.
// `scaffold-rung.ts` defines five rungs, `scaffold-decision.ts` chooses one from the evidence,
// `promptTargeting` accepts it, and `objective-task.ts` writes it onto every evidence row — and
// then `retrievalPromptFor` words the question from the CAPABILITY ALONE. A `narrowed` retrieval
// and an `independent` one produced byte-identical text. The learner met the same sentence twice
// and the log recorded that the second one had been made easier.
//
// That is this repo's recurring failure shape, named in `docs/canvas-teaching-policy-audit.md` and
// in `nemesis-degraded-vs-complete-standard`: a lane that is implemented, merged, deployed and
// integration-DEAD. It matters now because the owner has asked for `increase difficulty` and
// `decrease difficulty` as real controller decisions. A verb that moves a label and not a question
// would be the same defect with a model's name on it.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. Every transform below reads only the objective's own fields —
// the shape of its prompt and the characters of its answer. Nothing here knows what any word means,
// so it words a narrower question for a law student and a mechanical engineer identically. That is
// the standing product rule, not a stylistic preference.
//
// 🔴 AND IT REFUSES THE TWO RUNGS A SENTENCE CANNOT EXPRESS. `taught` means Nemesis supplies the
// answer, which is `show_correction` and must not be duplicated here as a retrieval that gives itself
// away. A refusal is returned and counted. Guessing would hand a learner a question the rest of the
// system cannot process — see `runtime-support.ts` for the same discipline one layer up.
//
// 🔴🔴 `recognition` IS STILL REFUSED HERE, AND THE REASON HAS CHANGED — READ THIS BEFORE "FIXING"
// IT. This comment used to say the rung needed *"distractors and a surface that does not exist"*.
// Both exist now: `choice-set.ts` builds the options and the Canvas renders them as the
// `recognise` action. What it still is not is a TEXT TRANSFORM. Every rung on `WORDABLE` is the same
// sentence altered — a clause dropped, a hint appended — and `promptAtRung` returns a string because
// that is all those rungs need. A recognition task needs a set of options with a ground on each one,
// which no `string` return can carry, and a caller handed a bare sentence would render a question
// with the answer nowhere on screen while the row claimed the answer had been shown. So the two are
// staged by different builders on purpose: this one narrows a question, `recognitionPromptFor`
// replaces it. `rungIsWordable("recognition")` stays false because it answers "can this file word
// it?", not "can the runtime stage it?".

import type { LearningObjective } from "./learning-objective";
import { rungRank, type ScaffoldRung } from "./scaffold-rung";

/**
 * The rungs this runtime can actually WORD.
 *
 * 🔴 A LEDGER, NOT A FILTER, AND IT IS ORDERED WEAKEST-FIRST LIKE THE LADDER IT NARROWS. A line here
 * is a claim that a real question exists at that demand — not that the enum has the value.
 */
const WORDABLE: readonly ScaffoldRung[] = ["cued", "narrowed", "independent"];

export function rungIsWordable(rung: ScaffoldRung): boolean {
  return WORDABLE.includes(rung);
}

/** Every rung a retrieval may be staged at, weakest first. Exported so a test sweeps it rather than
 *  restating it — a hand-written copy stops matching the day a rung is built. */
export function wordableRungs(): readonly ScaffoldRung[] {
  return WORDABLE;
}

/**
 * One step easier, or `null` when there is no easier question this runtime can ask.
 *
 * 🔴 `null` RATHER THAN CLAMPING AT THE FLOOR. Silently returning `cued` when the learner is already
 * at `cued` would make "decrease difficulty" a no-op that reports success — the controller would
 * believe it had helped, the learner would meet the identical prompt, and nothing would say so. The
 * caller is told there is no easier question and can decide to teach instead, which is the honest
 * next move.
 */
export function easier(rung: ScaffoldRung): ScaffoldRung | null {
  const index = WORDABLE.indexOf(rung);
  // An unwordable rung has no place on this ladder, so there is nothing below it to step to.
  if (index <= 0) return null;
  return WORDABLE[index - 1] ?? null;
}

/** One step harder, or `null` at the top. Same refusal discipline as `easier`. */
export function harder(rung: ScaffoldRung): ScaffoldRung | null {
  const index = WORDABLE.indexOf(rung);
  if (index < 0 || index >= WORDABLE.length - 1) return null;
  return WORDABLE[index + 1] ?? null;
}

/**
 * The initials of an expected answer — what `cued` puts on screen.
 *
 * 🔴 FIRST CHARACTERS ONLY, AND THAT BOUND IS THE WHOLE SAFETY ARGUMENT. A cue must reduce the
 * search without supplying the answer, and one character per word does that for any alphabet and any
 * discipline. Anything longer starts handing over the answer to short ones: a two-letter term with
 * its first letter given is nearly told.
 *
 * 🔴 REFUSES A SHORT ANSWER OUTRIGHT. Below three characters the initial IS most of the answer, so
 * there is no honest cue to give and `null` says so.
 */
export function initialsOf(answer: string): string | null {
  const trimmed = answer.trim();
  if (trimmed.length < 3) return null;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const initials = words.map((word) => [...word][0] ?? "").filter(Boolean);
  if (initials.length === 0) return null;
  // A long list of initials is a spelling exercise, not a cue. Past four words the shape of the
  // answer is what helps, and the letters stop being a hint and start being a puzzle.
  if (initials.length > 4) return null;
  return initials.join("");
}

/**
 * How many words the expected answer has — the other honest thing a cue can disclose.
 *
 * 🔴 THE SHAPE OF AN ANSWER IS NOT ITS CONTENT. Telling a learner they are looking for two words
 * narrows the search and gives away nothing about which two, which is exactly what `narrowed` is
 * for and why this is separate from `initialsOf`.
 */
export function answerWordCount(answer: string): number {
  return answer.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The question, staged at a rung.
 *
 * `base` is what `retrievalPromptFor` already worded at full demand. This never re-words it from the
 * capability — one wording, transformed — because two independent constructions of "the question for
 * this objective" would drift and the learner would meet a different sentence depending on how hard
 * the runtime had decided to make it.
 *
 * Returns `null` when the rung cannot be honestly worded for THIS objective, which is a real and
 * common outcome: a one-word answer has no cue, and a single-clause question has nothing to narrow.
 */
export function promptAtRung(input: {
  base: string;
  objective: LearningObjective;
  rung: ScaffoldRung;
}): string | null {
  if (input.rung === "independent") return input.base;
  if (!rungIsWordable(input.rung)) return null;

  if (input.rung === "narrowed") return narrow(input.base, input.objective);
  return cue(input.base, input.objective);
}

/**
 * Ask for ONE of the two things the full question asks for.
 *
 * 🔴🔴 THE STRUCTURAL FACT THIS IS BUILT ON, AND IT IS THE REASON THIS GENERALISES. Every prompt
 * `objective-task.ts` words at full demand asks for two things joined by "and": *what follows, and
 * why*; *which group, and what tells you*; *what is the {role} for X* over a cue that is itself
 * compound. §33's own example is the same move — a question "pointed at a smaller region than the
 * objective covers, without giving the answer away". Dropping the second conjunct is that move,
 * performed on the sentence rather than on the subject matter, so it needs to know nothing about the
 * field.
 *
 * 🔴 AND IT REFUSES WHEN THERE IS NOTHING TO DROP. A single-clause question is already as narrow as
 * this transform can make it; returning it unchanged would report a narrowing that did not happen.
 */
function narrow(base: string, objective: LearningObjective): string | null {
  const trimmed = base.trim();
  // The join is always ", and " in every prompt this file narrows — see `predictionPromptText`,
  // `discriminationPromptText`. Matching the comma as well as the word is what keeps this from
  // cutting a question whose subject merely contains "and".
  const cut = trimmed.indexOf(", and ");
  if (cut > 0) {
    const head = trimmed.slice(0, cut).trim();
    return head.endsWith("?") ? head : `${head}?`;
  }
  // Nothing to drop, which is the ordinary case: an association's question is a single clause. The
  // other honest narrowing is the answer's SHAPE — how big it is, and nothing about what it is.
  //
  // 🔴 INCLUDING "one word", AND MY FIRST VERSION REFUSED THAT. I required two words on the reasoning
  // that a one-word answer's size is not news. It is: it rules out an explanation, a list and a
  // sentence, which is exactly the search-space reduction §33 asks a narrowed question for. Refusing
  // it made the whole `association|recall` lane — the overwhelming majority of every real canvas —
  // impossible to narrow, so `easier` would have been a verb that almost never worked. A lane that
  // silently declines for most of the corpus is the dead-lane defect this file was written to end.
  const words = answerWordCount(objective.answer);
  if (words < 1) return null;
  return words === 1 ? `${trimmed} (one word)` : `${trimmed} (${words} words)`;
}

/** Put part of the answer on screen. `null` when the answer is too short to cue honestly. */
function cue(base: string, objective: LearningObjective): string | null {
  const initials = initialsOf(objective.answer);
  if (!initials) return null;
  return `${base.trim()} (it starts with ${initials})`;
}

/**
 * Did the runtime actually stage the rung it decided on?
 *
 * 🔴 THE GUARD AGAINST THE DEFECT THIS FILE EXISTS TO END. `promptAtRung` can refuse, and a caller
 * that ignored the refusal would write `scaffoldRung: "cued"` onto a row whose question was never
 * cued — the original lie, restored one layer up. Every caller resolves the rung THROUGH this, so
 * what the row claims is what the learner met.
 */
export function stagedRung(input: {
  base: string;
  objective: LearningObjective;
  wanted: ScaffoldRung;
}): { prompt: string; rung: ScaffoldRung } {
  const at = promptAtRung({ base: input.base, objective: input.objective, rung: input.wanted });
  if (at !== null) return { prompt: at, rung: input.wanted };
  // 🔴 FALLS BACK TO FULL DEMAND, NEVER TO A CLOSER-BUT-STILL-UNWORDABLE RUNG. Walking down the
  // ladder looking for one that words would make the row's rung depend on the answer's spelling in a
  // way nobody could predict from the decision. `independent` is the only rung that can always be
  // worded, it is the top of the ladder, and claiming it under-claims nothing: the learner really
  // did get the unaided question.
  return { prompt: input.base, rung: "independent" };
}

/** Weakest-to-strongest comparison, re-exported so callers do not import two modules to ask one
 *  question about a rung. */
export { rungRank };
