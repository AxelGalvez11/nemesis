// The acceptance set for automatic model selection — the prompts a student
// actually types, and the class each one has to land in.
//
// 🔴 EVERY CASE IS A NATURAL PROMPT. None of them sets an effort level, names a
// model, or passes a difficulty flag, because no student can do any of those
// things and no client is allowed to. That is the point of the file: the only
// input is what somebody typed.
//
// 🔴 EVERY BEHAVIOUR APPEARS IN AT LEAST TWO UNRELATED FIELDS. Nemesis serves
// law, nursing, mechanical engineering, history and the trades, and a router
// that reads a pharmacology question as hard and the structurally identical
// contract-law question as easy is broken in a way a single-field test set
// cannot show. Where a case is paired, the pair is right beside it.
//
// Shared by three suites: the canonical unit test, the edge mirror's drift test,
// and the routing matrix that turns a class into a model for every plan.

import type { WorkClass, WorkReason } from "./work-class.ts";

export interface WorkCase {
  prompt: string;
  workClass: WorkClass;
  reason: WorkReason;
  /** Why this case exists, in one line. */
  note: string;
}

export const WORK_CASES: readonly WorkCase[] = [
  // ── small talk and identity ───────────────────────────────────────────────
  { note: "the owner's own example", prompt: "Who are you?", reason: "greeting", workClass: "simple" },
  { note: "a bare opener", prompt: "hi", reason: "greeting", workClass: "simple" },
  { note: "closing a turn costs nothing", prompt: "thanks!", reason: "greeting", workClass: "simple" },
  {
    note: "🔴 this exact question searched the public web under the old engine",
    prompt: "what can you do",
    reason: "greeting",
    workClass: "simple",
  },

  // ── workspace reads ───────────────────────────────────────────────────────
  { note: "the owner's own example", prompt: "What is on my calendar today?", reason: "brief_request", workClass: "simple" },
  { note: "same shape, different surface", prompt: "show me my flashcard decks", reason: "brief_request", workClass: "simple" },

  // ── straightforward actions, two fields ───────────────────────────────────
  { note: "law", prompt: "Make me flashcards on tort law", reason: "brief_request", workClass: "simple" },
  { note: "mechanical engineering — identical shape", prompt: "Make me flashcards on hydraulics", reason: "brief_request", workClass: "simple" },

  // ── explanations and learning, two fields ─────────────────────────────────
  {
    note: "the owner's own example — short, but it asks to be shown the working",
    prompt: "Explain this concept from my lecture",
    reason: "default",
    workClass: "standard",
  },
  { note: "chemistry", prompt: "Why does this reaction need a catalyst?", reason: "default", workClass: "standard" },
  { note: "law — identical shape", prompt: "Why does this clause need consideration?", reason: "default", workClass: "standard" },

  // ── ordinary research about the world, two fields ─────────────────────────
  //
  // 🔴 THESE ARE THE CASES BREVITY ALONE GOT WRONG. Both are short and neither
  // asks for working-out, so a plain word count demoted them to thinking-off.
  // They are about the world rather than the student's folders, which is what
  // the possessive/imperative test in classifyWork now separates.
  {
    note: "the owner's own example",
    prompt: "Has the Supreme Court ruled on this case yet?",
    reason: "default",
    workClass: "standard",
  },
  { note: "the short form of the same question", prompt: "Has the court ruled yet?", reason: "default", workClass: "standard" },
  {
    note: "engineering — same shape, no legal vocabulary anywhere in it",
    prompt: "Has Euro NCAP updated its side-impact rating?",
    reason: "default",
    workClass: "standard",
  },

  // ── reconciliation: hold two accounts of one thing at once ────────────────
  {
    note: "the owner's own example",
    prompt: "Compare what my professor taught with the current guideline and explain the differences",
    reason: "reconciliation",
    workClass: "complex",
  },
  {
    note: "law — the same sentence, a different discipline",
    prompt: "Compare what my professor taught about negligence with the current case law and explain the differences",
    reason: "reconciliation",
    workClass: "complex",
  },
  {
    note: "mechanical engineering — 'still match' is the relation, not the noun",
    prompt: "Does my lecture's beam-deflection formula still match the current code?",
    reason: "reconciliation",
    workClass: "complex",
  },
  {
    note: "history — a clash between two sources is a reconciliation",
    prompt: "My notes and the textbook disagree about when the treaty was ratified — which is right?",
    reason: "reconciliation",
    workClass: "complex",
  },
  {
    note: "the owner's own example — 'conflicting' is the relation that carries it",
    prompt: "Reorganize my semester and resolve conflicting deadlines",
    reason: "reconciliation",
    workClass: "complex",
  },

  // ── planning across a whole collection ────────────────────────────────────
  {
    note: "nursing — a quantifier plus two things to do",
    prompt: "Go through every lecture in my library and build a revision plan for each one",
    reason: "multi_constraint",
    workClass: "complex",
  },
  {
    note: "trades — identical shape, no clinical vocabulary",
    prompt: "Go through all my welding modules and build a practice schedule for each one",
    reason: "multi_constraint",
    workClass: "complex",
  },

  // ── long enough to be carrying several questions ──────────────────────────
  {
    note: "no marker fires; the length alone says this is not one question",
    prompt:
      "I have three assessments landing in the same fortnight and I am not sure how to sequence the revision, " +
      "because one of them is a written piece that needs sources gathered first, one is a closed-book paper that " +
      "rewards spaced repetition, and the last is a practical where I mostly need supervised hours booked in advance",
    reason: "extended_request",
    workClass: "complex",
  },
];

/**
 * Bodies a client could send to try to buy a better model, paired with a prompt
 * whose honest answer is `simple`.
 *
 * 🔴 THESE ARE NOT HYPOTHETICAL SHAPES. Every one of them was read by the
 * gateway and acted on before 2026-08-06: `reasoning_effort` and its two
 * siblings opened the premium lane, `model: "deepseek-reasoner"` switched
 * thinking on, and a client-supplied `thinking` selector was passed through
 * untouched whenever the server had not already set one.
 */
export const HOSTILE_BODIES: readonly Record<string, unknown>[] = [
  { reasoning_effort: "high" },
  { reasoning: { effort: "high" } },
  { thinking: { effort: "high" } },
  { thinking: { type: "enabled" } },
  { model: "deepseek-v4-pro" },
  { model: "deepseek-reasoner" },
  { model: "deepseek-v4-pro", reasoning_effort: "high", thinking: { type: "enabled" } },
];
