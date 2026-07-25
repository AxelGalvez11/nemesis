// Where the correct answer sits — fixed in code, not asked for in a prompt.
//
// Owner 2026-07-24: "making sure the answer isnt always B etc."
//
// This is a real and well-documented failure of language models writing
// multiple-choice questions: the position of the correct option clusters hard.
// Ours is pushed further by the generation prompt itself, which shows the JSON
// shape with `"answer":0` in it — the model copies the example. A student who
// notices that every answer is the first option can score well on a test they
// have not learned anything from, which defeats the entire point of practising.
//
// WHY THIS IS NOT A PROMPT RULE. You cannot reliably instruct a model to produce
// a uniform distribution over positions; it has no memory of the previous
// question's index while writing the next one, and asking for "randomness" gets
// you the model's idea of random, which is the same three or four patterns. The
// repo's standing rule applies (memory: meta stats are computed in real code,
// never LLM-guessed): the model writes the question and picks which option is
// TRUE, and this module decides WHERE that option sits. The prompt still carries
// the rule as well, because a model told to vary positions writes slightly
// better distractors — but the guarantee lives here.
//
// DETERMINISTIC ON PURPOSE. Same questions in, same layout out. That keeps the
// tests real, and means regenerating a test twice does not silently produce two
// differently-scrambled versions of the same paper.
//
// NEVER RUN THIS OVER A TEST SOMEBODY HAS TAKEN. TestAttempt.missed stores
// `picked` as an option INDEX, so moving the options after an attempt exists
// would rewrite history: the student's recorded answers would point at different
// text than the ones they chose. Call it once, at generation, while `attempts` is
// still empty — that is why it lives here and not inside parseTestContent, which
// also reads stored content back.

import type { TestQuestion } from "@/lib/workspace/study-artifact-content";

/** Mentions of an option by LETTER ("option B", "answer C is wrong"). If the
 *  explanation names a position, moving the options would make it a lie, so that
 *  question is left exactly where the model put it. Rare, and better than
 *  silently corrupting the one sentence that teaches the student something. */
const NAMES_AN_OPTION_LETTER = /\b(?:option|choice|answer|letter)\s+[A-F]\b|\b[A-F]\)\s|\(\s*[A-F]\s*\)/i;

/** A tiny deterministic pseudo-random generator (mulberry32). Seeded from the
 *  question text so the layout is a pure function of the paper — no Math.random,
 *  no Date.now, nothing that would make the same test come out twice. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** FNV-1a over the question prompts. Any edit to the paper reshuffles it; the
 *  same paper always lays out identically. */
function seedFrom(questions: TestQuestion[]): number {
  let hash = 0x811c9dc5;
  for (const question of questions) {
    for (let i = 0; i < question.q.length; i += 1) {
      hash ^= question.q.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

/**
 * The sequence of target positions, balanced then shuffled.
 *
 * Balanced first: over `count` questions with `slots` options each, every
 * position gets either floor(count/slots) or ceil(count/slots) of the answers —
 * so the key cannot lean on one letter however the model wrote it.
 *
 * Then shuffled, because a balanced sequence in order is A,B,C,D,A,B,C,D — which
 * is a MORE exploitable pattern than clustering, not less. A student who spots
 * the cycle can answer the whole paper without reading it.
 *
 * Exported for the test: the distribution is the property worth pinning.
 */
export function balancedPositions(count: number, slots: number, random: () => number): number[] {
  if (count <= 0 || slots <= 1) return new Array(Math.max(0, count)).fill(0);
  const positions: number[] = [];
  for (let i = 0; i < count; i += 1) positions.push(i % slots);
  // Fisher-Yates, driven by the seeded generator.
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = positions[i] as number;
    const b = positions[j] as number;
    positions[i] = b;
    positions[j] = a;
  }
  return positions;
}

/**
 * Move each question's correct option to its assigned position.
 *
 * A single swap rather than a reshuffle of all four: the distractors keep the
 * order the model wrote them in, which matters because a well-written set often
 * runs in a deliberate sequence (ascending doses, steps of a pathway). Only the
 * correct option and whichever option is standing in its target seat trade
 * places.
 *
 * Questions whose explanation refers to an option by letter are returned
 * untouched — see NAMES_AN_OPTION_LETTER.
 */
export function balanceAnswerPositions(questions: TestQuestion[]): TestQuestion[] {
  if (questions.length === 0) return questions;
  const random = seededRandom(seedFrom(questions));
  // Slot count from the commonest option count on the paper — nearly always 4.
  const slots = questions.reduce((widest, question) => Math.max(widest, question.options.length), 0);
  const targets = balancedPositions(questions.length, slots, random);

  return questions.map((question, index) => {
    if (question.options.length < 2) return question;
    if (question.why && NAMES_AN_OPTION_LETTER.test(question.why)) return question;
    // A question with fewer options than the widest still gets a position it
    // actually has, so a 3-option item never targets a fourth seat.
    const target = (targets[index] ?? 0) % question.options.length;
    if (target === question.answer) return question;

    const options = [...question.options];
    const correct = options[question.answer] as string;
    const displaced = options[target] as string;
    options[target] = correct;
    options[question.answer] = displaced;
    return { ...question, answer: target, options };
  });
}
