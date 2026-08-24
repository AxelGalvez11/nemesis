// The questions a CONVERSATION can ask, as the same clickable chips a course asks with.
//
// 🔴🔴 A SECOND SOURCE OF QUESTIONS, NOT A SECOND TEST. `test-run.ts` builds a run from a canvas's
// OBJECTIVES — grounded distractors, evidence, answer-position balancing — and its own header says
// it mints nothing, on purpose: a parallel question generator would be a second place for "is this
// a fair question" to be decided, and the two would drift. That rule is about the objectives path
// and it still holds there, untouched.
//
// This file exists because that path cannot reach the case the owner asked for. On 2026-08-24 the
// rigid teaching lane was removed: a named topic is now taught in the conversation, and a
// conversation has no objectives, no evidence and no pool. So `buildTestRun` correctly refuses with
// "nothing-taught" — an honest answer, and a useless one when the learner has just been taught the
// thing in chat and says "quiz me". The material IS the conversation, so the questions come from
// the same turn that taught it.
//
// 🔴 THE DIFFERENCE IS DECLARED, NOT HIDDEN. A run built here is a CHECK on what was just said, not
// an assessment against tracked objectives — nothing it produces is written to `learner_evidence`,
// and its identity keys are namespaced `chat:` so they can never be mistaken for an objective's.
// What it does earn is the same thing every run earns: the misses become cards, because
// `cardsFromMisses` needs only the prompt and the right answer, both of which are already in hand.
//
// 🔴 EVERY BOUND HERE IS A REFUSAL, BECAUSE THE MODEL WROTE THIS. Two options with both marked
// correct, an empty prompt, forty options — each is dropped rather than repaired. A question the
// learner cannot answer correctly is worse than one that never appeared, since the score is a claim
// about them.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. Nothing here reads a word of any subject (CLAUDE.md).
//
// PURE. No React, no I/O, no clock.

import type { ChoiceOption } from "./choice-set";
import { MAX_QUESTIONS, type TestQuestion, type TestRun } from "./test-run";

/** The most options one question may offer. Beyond this a chip row stops being scannable. */
export const MAX_OPTIONS = 5;

/** The fewest. Two is a real discrimination; one is a statement with a button under it. */
export const MIN_OPTIONS = 2;

const MAX_PROMPT = 300;
const MAX_OPTION_TEXT = 200;

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One question the model wrote, or null.
 *
 * 🔴 EXACTLY ONE CORRECT OPTION. Zero makes the question unanswerable and every pick a miss; two
 * makes the learner wrong for choosing a right answer. Both are silent when scored, which is why
 * this is checked here rather than trusted.
 *
 * 🔴 THE ORDER THE MODEL WROTE IS THE ORDER SHOWN. `objective-task.ts` balances answer position
 * across a pool it can see whole; there is no pool here, so there is nothing honest to balance
 * against — and shuffling would need a clock or a random, both banned in this lane. The prompt asks
 * the model to vary the seat instead, which is the only place that decision can live.
 */
function readQuestion(value: unknown, index: number): TestQuestion | null {
  if (!record(value)) return null;
  const prompt = text(value.prompt, MAX_PROMPT);
  if (!prompt) return null;

  const raw = Array.isArray(value.options) ? value.options : null;
  if (!raw || raw.length < MIN_OPTIONS || raw.length > MAX_OPTIONS) return null;

  const options: ChoiceOption[] = [];
  let correct = 0;
  for (const entry of raw) {
    if (!record(entry)) return null;
    const optionText = text(entry.text, MAX_OPTION_TEXT);
    if (!optionText) return null;
    const isCorrect = entry.correct === true;
    if (isCorrect) correct += 1;
    // 🔴 NO `ground` IS SET, AND THE OMISSION IS THE HONEST ONE. `DistractorGround` records WHY a
    // wrong option is wrong — a named competing belief the pool actually holds. A model-written
    // distractor has no such provenance, and inventing a ground would put an unearned claim into
    // the one field built to carry earned ones.
    options.push({ correct: isCorrect, text: optionText });
  }
  if (correct !== 1) return null;

  return {
    // 🔴 NAMESPACED, SO A CHAT CHECK CAN NEVER BE READ AS AN OBJECTIVE. The index keeps two
    // identically-worded questions apart, which matters only for `cardsFromMisses`'s dedup.
    objectiveIdentityKey: `chat:${index}:${prompt.toLowerCase().replace(/\s+/g, " ")}`,
    options,
    prompt,
  };
}

/**
 * The check a turn asked for, or null when the model supplied nothing usable.
 *
 * Null is not an error: the caller falls back to the objectives path, and if that refuses too it
 * says so in words. A malformed question is dropped and the rest of the run survives — the same
 * policy `replyVisuals` follows, and for the same reason.
 */
export function readChatCheck(value: unknown): TestRun | null {
  if (!Array.isArray(value)) return null;
  const questions: TestQuestion[] = [];
  for (const entry of value) {
    if (questions.length >= MAX_QUESTIONS) break;
    const question = readQuestion(entry, questions.length);
    if (question) questions.push(question);
  }
  return questions.length > 0 ? { questions } : null;
}
