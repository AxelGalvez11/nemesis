// A run of questions the learner clicks through, and what missing one earns them.
//
// Owner 2026-08-24: *"The 'tests' are supposed to be in chat chips for users to click through."*
// And on where the result may live: tests stay in the chat and never become an artifact —
// only a deck made FROM the misses is kept.
//
// 🔴🔴 NOT A CONTROL, AND §38 IS THE REASON. The contract bans a button that steers the
// learning machine, naming "quiz me, test me, easier, harder" outright, and then says exactly
// where a test request does belong: *"If the learner wants to say 'test me on this again',
// that is A PHRASE TO THE COMPOSER, not a control."* So nothing here is reachable from a chip
// in the `+` menu, there is no `ComposerCapability` for it, and there must never be one. The
// learner asks in words; this module builds what they asked for.
//
// 🔴🔴 IT MINTS NOTHING. Every question comes from `choiceSetsForPool` — the same objectives,
// the same evidence, the same grounded distractors, the same answer-position balancing the
// policy runtime's recognition path already uses. A parallel question generator would be a
// second place for "is this a fair question" to be decided, and the two would drift. This file
// only SEQUENCES and SCORES; it never decides what a good option is.
//
// 🔴🔴 AND IT NEVER PADS. `choice-set.ts` refuses an objective whose distractors would have to
// be invented, and that refusal is honoured here rather than worked around: an objective with
// no honest set is simply not on the test. A short honest test is a correct outcome; a
// ten-question test where six questions have filler options is worse than no test, because the
// score it produces is a lie the learner will act on. When too few survive, this returns null
// and the caller says so in words.
//
// 🔴 THE SCORE IS NOT THE PRODUCT. `missed` is. A number tells a learner how they did; the list
// of objectives they missed is what becomes a deck, which is the only part of a test that
// outlives the chat.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. Nothing here reads a word of any subject, so a law
// student's test and a mechanical engineer's test are built by one rule (CLAUDE.md).
//
// PURE. No React, no I/O, no clock.

import type { OcclusionPayload } from "@nemesis/shared";

import { type ChoiceOption, type DistractorGround, MIN_OPTIONS } from "./choice-set";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import type { LearningObjective } from "./learning-objective";
import { baseQuestionFor, choiceSetsForPool } from "./objective-task";

/**
 * The fewest honest questions worth calling a test.
 *
 * 🔴 THREE, AND IT IS A FLOOR ON THE RUN, NOT A TARGET FOR IT. Two questions cannot tell a
 * learner anything they did not already know about themselves, and a "test" that turns out to
 * be one question reads as a bug. Above this the run is however long the material honestly
 * supports — see `MAX_QUESTIONS` for the other end, which exists so a long canvas does not
 * produce a forty-question wall nobody finishes.
 */
export const MIN_QUESTIONS = 3;

/** The most questions in one run. A test that outlasts the learner's patience is not a test. */
export const MAX_QUESTIONS = 12;

export interface TestQuestion {
  /**
   * The objective this question tests.
   *
   * 🔴 THIS IS THE WHOLE REASON THE RUN IS WORTH RECORDING. A missed question names an
   * objective, an objective is what a card is made from, and that is the path from "I got this
   * wrong" to "here is a card for it" — see `missedObjectives`.
   */
  readonly objectiveIdentityKey: string;
  readonly prompt: string;
  /** In display order, already balanced so the answer is not always in the same seat. */
  readonly options: readonly ChoiceOption[];
  /**
   * A diagram with one part covered, when the question is about a picture (§46.6).
   *
   * 🔴 OPTIONAL, AND ITS ABSENCE IS THE NORMAL CASE. Owner 2026-08-25: *"DeepSeek should have the
   * image occlusion as part of its testing tools. So similar to the multiple choice chip for
   * tests."* Similar is the operative word — this is the SAME question shape with a picture above
   * it, not a second kind of test with its own scoring, its own progress and its own results path.
   * `scoreAttempt`, `describeAttempt` and `cardsFromMisses` are untouched and cannot tell the
   * difference, which is what stops an occlusion question becoming a mode.
   *
   * 🔴 THE PAYLOAD IS THE STUDY CARD'S OWN, so the picture the learner meets in a check and the
   * picture they meet in the deck afterwards are drawn by one component from one shape.
   */
  readonly figure?: OcclusionPayload;
}

export interface TestRun {
  readonly questions: readonly TestQuestion[];
}

/** Why no honest test could be built, so the caller can say something true. */
export type TestRefusal =
  /** The canvas has no objectives yet — nothing has been taught to test. */
  | "nothing-taught"
  /** Objectives exist, but too few of them support an honest set of options. */
  | "too-few-questions";

export function isTestRefusal(value: TestRun | TestRefusal): value is TestRefusal {
  return typeof value === "string";
}

/**
 * Build a run from what this canvas has actually taught.
 *
 * 🔴 ORDER IS THE POOL'S ORDER, NOT SHUFFLED. The objectives arrive in the order the policy
 * built them, which is the order the material was taught in, and walking a test in teaching
 * order is what lets a learner feel where they fell off. Randomising would also make the run
 * unreproducible, and `Math.random` is banned in this lane besides.
 */
export function buildTestRun(input: {
  objectives: readonly { objective: LearningObjective; knowledge: KnowledgeObject }[];
  evidence: readonly LearnerEvidence[];
  /** Ceiling for this run. Clamped into [MIN_QUESTIONS, MAX_QUESTIONS]. */
  size?: number;
}): TestRun | TestRefusal {
  if (input.objectives.length === 0) return "nothing-taught";

  const sets = choiceSetsForPool({ evidence: input.evidence, objectives: input.objectives });

  const questions: TestQuestion[] = [];
  for (const entry of input.objectives) {
    const choices = sets.get(entry.objective.identityKey);
    // 🔴 THE REFUSAL IS HONOURED, NOT ROUTED AROUND. `choiceSetsForPool` omits an objective
    // whose options could not be built honestly; the correct response is to leave it off the
    // test, never to reach for a looser generator for the ones it turned down.
    if (!choices || choices.options.length < MIN_OPTIONS) continue;
    questions.push({
      objectiveIdentityKey: entry.objective.identityKey,
      options: choices.options,
      prompt: baseQuestionFor(entry),
    });
  }

  if (questions.length < MIN_QUESTIONS) return "too-few-questions";

  const ceiling = Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, input.size ?? MAX_QUESTIONS));
  return { questions: questions.slice(0, ceiling) };
}

export interface TestScore {
  readonly correct: number;
  readonly total: number;
  /**
   * The objectives the learner got wrong, in the order they were asked.
   *
   * 🔴 OBJECTIVES, NOT QUESTION INDEXES, because the next thing that happens to this list is a
   * deck being made from it, and a deck is written per objective.
   */
  readonly missed: readonly string[];
}

/**
 * Score a finished run.
 *
 * 🔴 AN UNANSWERED QUESTION COUNTS AS MISSED, AND THAT IS DELIBERATE. A learner who abandons
 * a question did not demonstrate the objective, and treating silence as neutral would let a
 * run of skips report a perfect score. `picks` shorter than the run is the same case.
 */
export function scoreTestRun(run: TestRun, picks: readonly (string | null)[]): TestScore {
  let correct = 0;
  const missed: string[] = [];
  run.questions.forEach((question, index) => {
    const picked = picks[index] ?? null;
    const chosen = picked === null ? null : question.options.find((option) => option.text === picked);
    if (chosen?.correct) correct += 1;
    else missed.push(question.objectiveIdentityKey);
  });
  return { correct, missed, total: run.questions.length };
}

/**
 * What a learner is told the moment they tap, before the next question.
 *
 * 🔴 THE GROUND IS THE POINT. A distractor in this codebase is minted from a NAMED competing
 * model, so a wrong tap is a belief stated in advance — and saying which belief they just acted
 * on is worth more than "incorrect". A correct tap gets no lecture; it gets confirmation and
 * the next question.
 */
export function verdictFor(question: TestQuestion, picked: string): {
  correct: boolean;
  /** The option they picked, if it was one of the offered ones. */
  chosen: ChoiceOption | null;
  /** The right answer, always, so the caller never has to search for it again. */
  answer: ChoiceOption | null;
} {
  const chosen = question.options.find((option) => option.text === picked) ?? null;
  const answer = question.options.find((option) => option.correct) ?? null;
  return { answer, chosen, correct: Boolean(chosen?.correct) };
}

/** Deduplicated, order-preserving — a learner who missed one objective twice earns one card. */
export function missedObjectives(score: TestScore): readonly string[] {
  return [...new Set(score.missed)];
}

/**
 * What the learner just did, written so Nemesis can answer it in its own words.
 *
 * 🔴🔴 THERE IS NO RESULTS SCREEN ANY MORE — OWNER, 2026-08-24: *"at the end it shouldn't show
 * anything… it's just up to DeepSeek to report the results in its own words, not some kind of
 * screen. I just want it to say, okay, you got four out of five right, and here's the one you
 * missed and why. I feel like that's more natural."* A card that prints "4 out of 5" and lists the
 * answers is a report the product writes ABOUT the conversation, sitting outside it; the same
 * facts said in the conversation can do what a card cannot — connect the miss to what was taught
 * two turns ago, and be argued with.
 *
 * So the run ends by handing the model this, and the model replies. Which means this string is
 * the ONLY record of what happened, and it has to be complete: the score, every question, what
 * they picked, and what was right. A summary that dropped the wrong answers would leave Nemesis
 * writing "you missed one" with no idea which.
 *
 * 🔴 IT IS FIRST-PERSON BECAUSE IT IS THE LEARNER'S TURN. They answered the questions; this says
 * what they answered. It states facts and nothing else — no score-keeping language, no "well
 * done", no interpretation. Whether four out of five is good is the model's judgement to make
 * with everything else it knows about them, and a phrase baked in here would pre-empt it.
 *
 * 🔴 AND AN UNANSWERED QUESTION SAYS SO, matching `scoreTestRun`, which counts silence as a miss.
 * "I skipped it" and "I got it wrong" are different things to be taught about.
 *
 * PURE. Structural, never subject-matter — nothing here reads a word of any field (CLAUDE.md).
 */
export function describeAttempt(run: TestRun, picks: readonly (string | null)[]): string {
  const score = scoreTestRun(run, picks);
  const lines = run.questions.map((question, index) => {
    const picked = picks[index] ?? null;
    const answer = question.options.find((option) => option.correct)?.text ?? "";
    if (picked === null) return `${index + 1}. "${question.prompt}" — I skipped this one. The answer was "${answer}".`;
    const chosen = question.options.find((option) => option.text === picked);
    if (chosen?.correct) return `${index + 1}. "${question.prompt}" — I answered "${picked}", which was right.`;
    const note = groundNote(chosen?.ground);
    return `${index + 1}. "${question.prompt}" — I answered "${picked}", but the answer was "${answer}".${note}`;
  });
  return [
    `I finished the check you gave me: ${score.correct} out of ${score.total}.`,
    ...lines,
  ].join("\n");
}

/**
 * What KIND of wrong a wrong answer was, when the option carries that on its face.
 *
 * 🔴🔴 THIS IS THE HALF OF THE DELETED RESULTS SCREEN THAT WAS WORTH SAVING. That card rendered
 * `groundedMiss` — a sentence naming which competing model the learner had just acted on — and
 * `choice-set.ts` mints every distractor FROM such a model, which is the entire reason multiple
 * choice is permitted in this product at all (`canvas-model.ts`'s standing objection: *"you cannot
 * detect a misconception from which of four options someone clicked"* is answered by knowing what
 * each option means in advance). Dropping the card without moving this would have thrown that
 * away and left the model guessing why a wrong answer was tempting.
 *
 * 🔴 IT IS A FACT, NOT A VERDICT, BECAUSE THE READER CHANGED. The old sentences addressed the
 * learner — "Not quite. That is the neighbouring case…" — and this text is read by the MODEL, in
 * the learner's voice, before it writes anything. So each note states what the option was without
 * grading it, and leaves the teaching to the reply.
 *
 * 🔴 AND AN UNGROUNDED OPTION ADDS NOTHING. Chat-minted questions (`chat-check.ts`) carry no
 * ground; inventing a category for them would tell the model something nobody established.
 */
export function groundNote(ground: DistractorGround | undefined): string {
  // A `switch` over the union, so a NEW ground added to `choice-set.ts` fails typecheck here
  // rather than falling silently into the empty default — the lesson `groundedMiss` learned.
  switch (ground?.kind) {
    case "held_misconception":
      return " That is a mix-up I have made before.";
    case "neighbouring_class":
      return " That is the neighbouring case this one is usually set against.";
    case "sibling_answer":
      return " That is the answer to a different question of the same shape.";
    default:
      return "";
  }
}

/**
 * The cards a learner earned by missing things.
 *
 * 🔴🔴 NO MODEL CALL, AND THAT IS THE POINT RATHER THAN AN OPTIMISATION. The question they got
 * wrong and the answer they should have given are both already in hand, exactly as they were
 * shown. Asking a model to "write cards about what they missed" would spend money to produce
 * DIFFERENT wording than the thing the learner actually failed, and a card that does not match
 * the moment of failure is a card about a topic rather than about a gap.
 *
 * 🔴 A QUESTION WITH NO CORRECT OPTION PRODUCES NO CARD. That should be impossible — `choice-set.ts`
 * builds one answer per set — but a card with an empty back is worse than a missing card, and
 * silently writing one is how a deck full of blanks reaches a learner.
 */
export function cardsFromMisses(
  run: TestRun,
  missed: readonly string[],
): readonly { front: string; back: string; objectiveIdentityKey: string }[] {
  const wanted = new Set(missed);
  const seen = new Set<string>();
  const cards: { front: string; back: string; objectiveIdentityKey: string }[] = [];
  for (const question of run.questions) {
    if (!wanted.has(question.objectiveIdentityKey) || seen.has(question.objectiveIdentityKey)) continue;
    const answer = question.options.find((option) => option.correct);
    if (!answer?.text.trim()) continue;
    seen.add(question.objectiveIdentityKey);
    cards.push({ back: answer.text, front: question.prompt, objectiveIdentityKey: question.objectiveIdentityKey });
  }
  return cards;
}
