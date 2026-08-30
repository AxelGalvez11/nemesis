// Run: npx tsx --test packages/shared/src/learning-style.test.ts   (cwd = repo root)
//
// Same contract as thinking-stance.test.ts: these test the CONTENT of the rules, because a prompt
// block is the kind of thing that gets shortened by someone who does not know which clauses were
// doing work. Every carve-out below is the answer to a way one of these settings becomes hated.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_LEARNING_STYLE,
  GUIDED_INSTRUCTION,
  LEARNING_STYLES,
  learningStyleInstruction,
  learningStyleReminder,
  readLearningStyle,
  SOCRATIC_INSTRUCTION,
  type LearningStyle,
} from "./learning-style.ts";
import { THINKING_STANCE } from "./thinking-stance.ts";

test("🔴 the default is DIRECT, so nobody is Socratised for asking a question", () => {
  // The whole reason this is a preference. Both source products are opt-in; shipping either as the
  // default would mean a person who typed a question to get an answer gets interrogated instead.
  assert.equal(DEFAULT_LEARNING_STYLE, "direct");
  assert.equal(learningStyleInstruction("direct"), "");
});

test("🔴 an unused style costs exactly nothing", () => {
  // The empty string is the point: a direct turn must be byte-identical to what shipped before this
  // feature existed, so the cache prefix is unchanged and no teaching instruction can reach somebody
  // who never asked for one.
  assert.equal(learningStyleInstruction(DEFAULT_LEARNING_STYLE).length, 0);
});

test("an unreadable or older stored value falls back to direct", () => {
  for (const stored of [null, "", "  ", "study", "SOCRATIC", "true", "off"]) {
    assert.equal(readLearningStyle(stored), "direct", `"${stored}" must not select a teaching protocol`);
  }
  assert.equal(readLearningStyle("guided"), "guided");
  assert.equal(readLearningStyle(" socratic "), "socratic");
});

test("guided carries Study Mode's actual moves", () => {
  // From the published instructions: start from what they know, one question at a time, let them
  // attempt before revealing, check they can restate it, vary the activity.
  assert.match(GUIDED_INSTRUCTION, /do not do the work for them/i);
  assert.match(GUIDED_INSTRUCTION, /what they already know/);
  assert.match(GUIDED_INSTRUCTION, /a single question that moves them one step/);
  assert.match(GUIDED_INSTRUCTION, /attempt it before you reveal/);
  assert.match(GUIDED_INSTRUCTION, /in their own words/);
  assert.match(GUIDED_INSTRUCTION, /teach it back to you/);
});

test("🔴 guided still answers a plain lookup, which Study Mode does not", () => {
  // OUR carve-out. Study Mode applies its rule to everything, so it will Socratise a request for a
  // date. Nemesis is a general assistant too, and a study setting that breaks the calendar is a
  // setting people switch off and never switch on again.
  assert.match(GUIDED_INSTRUCTION, /plain lookup/);
  assert.match(GUIDED_INSTRUCTION, /calendar/);
});

test("socratic asks ONE question, and one it is possible to answer", () => {
  // 🔴 THE ANSWERABILITY CLAUSE IS THE HARD PART OF THE METHOD. "Ask questions" is easy and
  // produces the locked-door failure; "ask one they can answer from what they have" is the real
  // constraint and the thing most likely to be edited out as wordy.
  assert.match(SOCRATIC_INSTRUCTION, /End every turn with a question, not with an explanation/);
  assert.match(SOCRATIC_INSTRUCTION, /Ask exactly one/);
  assert.match(SOCRATIC_INSTRUCTION, /never send a list of them/);
  assert.match(SOCRATIC_INSTRUCTION, /answerable from what they already know/);
  assert.match(SOCRATIC_INSTRUCTION, /locked door/);
});

test("🔴🔴 socratic is DISTINCT from guided, not a second name for it", () => {
  // Measured against a live model 2026-08-28: the first draft of these two produced near-identical
  // answers over three turns, and on the stuck case GUIDED was the one that asked a question back.
  // Two settings that behave the same are one setting plus a lie in the menu. What separates them
  // has to be a checkable behaviour rather than an adjective: socratic ENDS ON A QUESTION and
  // withholds the derivation while a step remains; guided explains and then checks.
  assert.match(SOCRATIC_INSTRUCTION, /even when explaining would be faster, ask instead/);
  assert.match(SOCRATIC_INSTRUCTION, /Do not supply a derivation, a formula or a final number/);
  assert.match(SOCRATIC_INSTRUCTION, /ask the next question rather than completing the thought/);
  // And guided must never adopt that rule, or the two collapse together again.
  assert.ok(
    !/End every turn with a question/.test(GUIDED_INSTRUCTION),
    "guided must not adopt socratic's defining rule",
  );
});

test("🔴 socratic concedes after two stuck turns", () => {
  // A method that never gives in is indistinguishable from one that cannot help.
  assert.match(SOCRATIC_INSTRUCTION, /stuck on the same step for two turns/);
  assert.match(SOCRATIC_INSTRUCTION, /stop asking/);
});

test("🔴🔴 EVERY style yields when the learner asks outright", () => {
  // The escape hatch neither source product has, and the single thing that decides whether these
  // settings are usable at 1am. Removing it from either instruction turns a tutor into a wall.
  assert.match(GUIDED_INSTRUCTION, /they are stuck, ask for the answer/);
  assert.match(GUIDED_INSTRUCTION, /without complaint/);
  assert.match(SOCRATIC_INSTRUCTION, /if they ask outright for the answer/i);
});

test("the picker offers exactly the three styles, direct first", () => {
  assert.deepEqual(LEARNING_STYLES.map((s) => s.id), ["direct", "guided", "socratic"]);
  for (const style of LEARNING_STYLES) {
    assert.ok(style.hint.length > 0 && style.hint.length < 60, `${style.id} needs a short hint`);
  }
});

test("the hints say what changes, not how good it is", () => {
  // A label that oversells gets switched on once, disappoints, and is never used again.
  for (const style of LEARNING_STYLES) {
    for (const word of ["better", "deeper", "powerful", "best", "improve", "master"]) {
      assert.ok(
        !new RegExp(word, "i").test(style.hint),
        `"${style.hint}" makes a claim the learner cannot check from a menu`,
      );
    }
  }
});

test("the instructions name no discipline", () => {
  // §41, same as the stance.
  for (const text of [GUIDED_INSTRUCTION, SOCRATIC_INSTRUCTION]) {
    for (const field of ["medicine", "medical", "drug", "chemistry", "biology", "law school", "nursing"]) {
      assert.ok(!new RegExp(field, "i").test(text), `must not name a discipline, found "${field}"`);
    }
  }
});

test("🔴 they carry no em dash", () => {
  for (const text of [GUIDED_INSTRUCTION, SOCRATIC_INSTRUCTION]) {
    assert.ok(!text.includes("—"), "a style instruction contains an em dash");
  }
});

test("they are instructions, not bulleted lectures", () => {
  for (const text of [GUIDED_INSTRUCTION, SOCRATIC_INSTRUCTION]) {
    assert.ok(!/^\s*[-*•]/m.test(text), "starts a line with a bullet marker");
    assert.ok(!text.includes("**"), "contains markdown bold");
  }
});

test("a style overrides the stance's default rather than contradicting it silently", () => {
  // 🔴 THE STANCE SAYS "ANSWER THE QUESTION" AND GUIDED SAYS "DO NOT HAND OVER THE ANSWER". That is
  // a real conflict, and it is resolved by the style stating WHY it is allowed to win: the learner
  // asked for it. An instruction that just contradicted the stance would leave the model picking,
  // and it would pick differently on different turns.
  assert.match(THINKING_STANCE, /ANSWER THE QUESTION/);
  assert.match(GUIDED_INSTRUCTION, /THE LEARNER HAS ASKED TO BE TAUGHT RATHER THAN TOLD/);
  assert.match(SOCRATIC_INSTRUCTION, /THE LEARNER HAS ASKED TO BE LED TO ANSWERS/);
});

test("every style id has an instruction decision", () => {
  const all: LearningStyle[] = ["direct", "guided", "socratic"];
  for (const style of all) {
    const text = learningStyleInstruction(style);
    assert.equal(typeof text, "string");
    if (style !== "direct") assert.ok(text.length > 200, `${style} produced no instruction`);
  }
});

test("🔴🔴 the tail reminder exists, is short, and is empty for direct", () => {
  // THE THING THAT MAKES THE SETTING WORK. Without it, measured 2026-08-28, Guided and Socratic
  // produced near-identical answers and Socratic broke its own rule. Deleting it as redundant with
  // the system-prompt instruction would silently turn the picker into a decoration.
  assert.equal(learningStyleReminder("direct"), "");
  for (const style of ["guided", "socratic"] as const) {
    const reminder = learningStyleReminder(style);
    assert.ok(reminder.length > 40, `${style} has no reminder`);
    assert.ok(reminder.length < 260, `${style} reminder is a second copy of the protocol, not a nudge`);
    // It restates the ONE defining behaviour and re-states both escape hatches, because this is the
    // last thing the model reads and an escape hatch it cannot see here is one it will not honour.
    assert.match(reminder, /asked outright/);
    assert.match(reminder, /plain lookup/);
  }
  assert.match(learningStyleReminder("socratic"), /End this turn with a single question/);
  assert.match(learningStyleReminder("guided"), /one step at a time/);
});
