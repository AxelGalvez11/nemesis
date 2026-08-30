// Run: npx tsx --test packages/shared/src/thinking-stance.test.ts   (cwd = repo root)
//
// These test the CONTENT of the rules, not that a string exists, for the reason
// ai-writing-tells.test.ts gives: a prompt block is the kind of thing that gets
// "tidied" by someone who does not know which clauses were doing work, and
// nothing else in the codebase would notice. Every clause asserted below was
// chosen by the owner on 2026-08-27 and is the answer to a specific failure.
import assert from "node:assert/strict";
import { test } from "node:test";

import { THINKING_STANCE, THINKING_STANCE_MAX_CHARS } from "./thinking-stance.ts";
import { WRITING_VOICE } from "./writing-voice.ts";

test("🔴 explaining comes FIRST, because that is most of the job", () => {
  // Owner 2026-08-28, correcting the first draft: the default must be helpful, nice, and aimed at
  // making concepts simple. A stance that opens on how to disagree teaches the model that
  // disagreeing is the posture. Order is content here, so the order is asserted.
  const explain = THINKING_STANCE.indexOf("HOW TO EXPLAIN");
  const hold = THINKING_STANCE.indexOf("HOW TO HOLD A POSITION");
  assert.ok(explain === 0, "the stance must OPEN on how to explain");
  assert.ok(explain < hold, "explaining must come before holding a position");
});

test("the tone is warm, which is a rule and not a decoration", () => {
  // Straight from ChatGPT Study Mode's published instructions, which OpenAI wrote with teachers and
  // pedagogy experts: "Be warm, patient, and plain-spoken."
  assert.match(THINKING_STANCE, /warm, patient and plain-spoken/);
});

test("cognitive load is managed: simplest true version first, depth on request", () => {
  // The owner's "the default should be making concepts simple to understand", and OpenAI's named
  // behaviour "managing cognitive load". Both halves matter: leading simple is useless if the
  // depth is then unreachable.
  assert.match(THINKING_STANCE, /simplest true version/);
  assert.match(THINKING_STANCE, /go deeper when they want more/);
  assert.match(THINKING_STANCE, /One idea at a time/);
  assert.match(THINKING_STANCE, /concrete case before the general/);
});

test("it builds on what the learner already knows", () => {
  // "Build on existing knowledge" is rule 2 of five in Study Mode, and it is the one most often
  // dropped when a prompt gets shortened.
  assert.match(THINKING_STANCE, /Tie what is new to something they have already shown they know/);
});

test("🔴🔴 it must never withhold an answer to make a teaching point", () => {
  // THE RULE THAT SEPARATES NEMESIS FROM STUDY MODE AND LEARNING MODE. Both of those are opt-in
  // modes whose headline instruction is "DO NOT DO THE USER'S WORK FOR THEM". Nemesis has no modes,
  // so that rule as a default would make the general assistant useless: someone asking what time
  // their lecture starts would get Socratic questioning. Deleting this paragraph turns Nemesis into
  // a worse copy of a product it deliberately is not.
  assert.match(THINKING_STANCE, /ANSWER THE QUESTION/);
  assert.match(THINKING_STANCE, /withholding an answer to make a teaching point/);
  assert.match(THINKING_STANCE, /never turn a small question into a lesson/);
});

test("checking understanding and one-question-at-a-time survive", () => {
  // "Check and reinforce" is rule 4 of Study Mode's five; "never ask more than one question at a
  // time" is its own separate instruction there, and it is what stops a check becoming an
  // interrogation.
  assert.match(THINKING_STANCE, /say it back in their own words/);
  assert.match(THINKING_STANCE, /never ask more than one thing at a time/);
});

test("corrections are charitable and immediate", () => {
  // Study Mode: "Correct mistakes - charitably! - in the moment." The charity is the part that
  // keeps firmness from reading as contempt.
  assert.match(THINKING_STANCE, /correct it kindly and in the moment/);
});

test("it refuses to fold under social pressure", () => {
  // The whole reason the file exists. A model that caves when contradicted hands
  // a student a wrong answer they then revise from, and nothing in the product
  // would ever report it.
  assert.match(THINKING_STANCE, /Change your answer when they give you a reason/);
  assert.match(THINKING_STANCE, /keep it when they only push/);
  assert.match(THINKING_STANCE, /my mistake/);
});

test("the pushback is aimed at the claim, not the person", () => {
  // This single clause is what separates firm from cynical. Deleting it leaves a
  // model that disagrees to demonstrate rigour, which is the other failure mode
  // the owner named and is worse than the first for a learner's trust.
  assert.match(THINKING_STANCE, /Argue with the claim, never with the person/);
  assert.match(THINKING_STANCE, /no scoring points/);
});

test("it must not manufacture objections", () => {
  // Owner's "not cynical". Without this, the cheapest way to look rigorous is to
  // find something wrong with everything, and a student learns to discount every
  // objection including the correct ones.
  assert.match(THINKING_STANCE, /only when you have a real reason/);
  assert.match(THINKING_STANCE, /Say when reasoning does not hold even if nobody asked/);
});

test("a false premise is challenged BEFORE the question is answered", () => {
  // Answering a question built on a mistake as though the mistake were not there
  // is the quiet version of agreeing with it.
  assert.match(THINKING_STANCE, /built on something false/);
  assert.match(THINKING_STANCE, /before you answer it/);
});

test("it gives a verdict rather than hiding behind both sides", () => {
  // 🔴 THE NON-OBVIOUS HALF OF ANTI-SYCOPHANCY. "Here are both sides" never risks
  // being disagreed with. Owner decision 2026-08-27: verdict plus reasoning, then
  // what the other side has going for it.
  assert.match(THINKING_STANCE, /give a verdict and your reasoning/);
  assert.match(THINKING_STANCE, /refusing to have a view/i);
});

test("certainty is labelled, not implied", () => {
  assert.match(THINKING_STANCE, /settled, genuinely contested, or something you are unsure of/);
});

test("the attempt is asked for ONCE, and only when someone is learning", () => {
  // Retrieval before reveal is the best-evidenced move in the file. It is also the
  // one that makes people hate Socratic tutors, so the cap and the gate are load
  // bearing: a model told to make people think will otherwise interrogate someone
  // who asked what time their lecture is.
  assert.match(THINKING_STANCE, /rather than just look it up/);
  assert.match(THINKING_STANCE, /ask what they think once before you tell them/);
  assert.match(THINKING_STANCE, /Never ask twice/);
  assert.match(THINKING_STANCE, /never ask when they only want the fact/);
});

test("a correction carries the right answer and the reason the wrong one appealed", () => {
  assert.match(THINKING_STANCE, /why the wrong version was tempting/);
  assert.match(THINKING_STANCE, /teaches nothing/);
});

test("it names no discipline", () => {
  // §41. The same stance has to serve a law student and a welder, so a worked
  // example from any one field would quietly scope the product.
  for (const field of ["medicine", "medical", "drug", "chemistry", "biology", "law", "engineering"]) {
    assert.ok(
      !new RegExp(field, "i").test(THINKING_STANCE),
      `the stance must not name a discipline, found "${field}"`,
    );
  }
});

test("🔴 it carries no em dash", () => {
  // Owner rule 2026-08-25. A prompt that models the banned character teaches it by
  // example, which is how the last sweep found 49 of them inside prompts that
  // banned them.
  assert.ok(!THINKING_STANCE.includes("—"), "the stance contains an em dash");
});

test("it fits the ceiling", () => {
  // Paid for on every message on every surface, forever.
  assert.ok(
    THINKING_STANCE.length <= THINKING_STANCE_MAX_CHARS,
    `stance is ${THINKING_STANCE.length} chars, over the ${THINKING_STANCE_MAX_CHARS} ceiling`,
  );
});

test("it does not repeat the writing voice", () => {
  // They ride the same turns and are both always on, so anything said in both is
  // bought twice and, worse, gets half-reverted by whoever comes to edit one.
  const voiceSentences = WRITING_VOICE.split(". ")
    .map((sentence) => sentence.trim().toLowerCase())
    .filter((sentence) => sentence.length > 40);
  for (const sentence of voiceSentences) {
    assert.ok(
      !THINKING_STANCE.toLowerCase().includes(sentence),
      `duplicated from WRITING_VOICE: "${sentence.slice(0, 60)}..."`,
    );
  }
});

test("the rules are instructions, not a bulleted lecture", () => {
  assert.ok(!/^\s*[-*•]/m.test(THINKING_STANCE), "starts a line with a bullet marker");
  assert.ok(!THINKING_STANCE.includes("**"), "contains markdown bold");
});
