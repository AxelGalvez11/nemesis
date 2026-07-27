import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSkillMessage,
  CHAT_SKILLS,
  MAX_ACTIVE_SKILLS,
  selectChatSkills,
  SKILL_CHAR_BUDGET,
  SKILL_CHAR_SHARE,
  type ChatSkill,
} from "./chat-skills";

const idsFor = (text: string) => selectChatSkills(text).map((skill) => skill.id);

test("flashcard requests get the flashcard skill", () => {
  assert.deepEqual(idsFor("make me flashcards on beta blockers"), ["flashcard-craft"]);
  assert.deepEqual(idsFor("add these to my deck"), ["flashcard-craft"]);
  assert.deepEqual(idsFor("write a cloze for this sentence"), ["flashcard-craft"]);
});

test("calculations get the quantitative skill", () => {
  assert.deepEqual(idsFor("calculate the infusion rate"), ["quantitative-check"]);
  assert.deepEqual(idsFor("how much vancomycin for a 70 kg patient?"), ["quantitative-check"]);
});

test("source questions get the evidence skill", () => {
  assert.deepEqual(idsFor("what does the evidence say about statins?"), ["evidence-honesty"]);
  assert.deepEqual(idsFor("cite your sources"), ["evidence-honesty"]);
});

test("ordinary chat gets no skill, so ordinary turns cost nothing extra", () => {
  assert.deepEqual(idsFor("hey"), []);
  assert.deepEqual(idsFor("thanks, that helped"), []);
  assert.deepEqual(idsFor("who was the first president?"), []);
  assert.deepEqual(buildSkillMessage([]), "");
});

test("a message hitting several skills is capped", () => {
  const ids = idsFor("calculate the dose, cite the guideline, and make flashcards");
  assert.equal(ids.length, MAX_ACTIVE_SKILLS);
  assert.deepEqual(ids, ["flashcard-craft", "quantitative-check"]);
});

test("the char budget is never exceeded", () => {
  const fat: ChatSkill[] = [
    { id: "a", instructions: "x".repeat(SKILL_CHAR_BUDGET - 10), match: /go/, name: "A" },
    { id: "b", instructions: "y".repeat(100), match: /go/, name: "B" },
  ];
  const chosen = selectChatSkills("go", fat);
  assert.deepEqual(chosen.map((skill) => skill.id), ["a"]);
  assert.ok(buildSkillMessage(chosen).length <= SKILL_CHAR_BUDGET);
});

test("every catalog skill fits the budget on its own and is well formed", () => {
  for (const skill of CHAT_SKILLS) {
    assert.ok(skill.instructions.length <= SKILL_CHAR_BUDGET, `${skill.id} exceeds the budget alone`);
    assert.ok(skill.instructions.startsWith("SKILL — "), `${skill.id} is missing its header`);
    assert.ok(skill.name.length > 0);
    assert.ok(!skill.match.global, `${skill.id} uses a global regex — .test() would be stateful`);
  }
});

// The budget check in selectChatSkills is a silent `continue`, so a packet
// written past its share does not error — it just stops appearing whenever
// another skill matched first, which reads as "the model ignored it".
test("no skill is big enough to be silently dropped when paired with another", () => {
  for (const skill of CHAT_SKILLS) {
    assert.ok(
      skill.instructions.length <= SKILL_CHAR_SHARE,
      `${skill.id} is ${skill.instructions.length} chars — over the ${SKILL_CHAR_SHARE} share, so it would vanish when paired`,
    );
  }
  // Prove it with the worst real pair rather than trusting the arithmetic.
  const widest = [...CHAT_SKILLS].sort((a, b) => b.instructions.length - a.instructions.length).slice(0, MAX_ACTIVE_SKILLS);
  const total = widest.reduce((sum, skill) => sum + skill.instructions.length, 0);
  assert.ok(total <= SKILL_CHAR_BUDGET, `the two widest skills total ${total}, over the ${SKILL_CHAR_BUDGET} budget`);
});

test("test requests get the test-writing skill", () => {
  assert.deepEqual(idsFor("make me a practice test on the renal unit"), ["test-craft"]);
  assert.deepEqual(idsFor("write some practice questions for my exam"), ["test-craft"]);
  assert.deepEqual(idsFor("can I get board-style mcqs on this"), ["test-craft"]);
  // "quiz me" asks for two different things at once — questions worth answering
  // AND being asked them one at a time — so it takes both slots. Updated
  // 2026-07-24 when socratic-tutoring landed; it used to be test-craft alone.
  assert.deepEqual(idsFor("quiz me on antibiotics"), ["test-craft", "socratic-tutoring"]);
});

test("slide and note deliverables select persistence skills", () => {
  assert.deepEqual(idsFor("create a slide deck on mitosis"), ["slides-builder"]);
  assert.deepEqual(idsFor("make me lecture notes for organic chemistry"), ["notes-builder"]);
});

test("teaching requests get the teaching skill", () => {
  assert.deepEqual(idsFor("explain beta blockers"), ["teaching"]);
  assert.deepEqual(idsFor("teach me the coagulation cascade"), ["teaching"]);
  assert.deepEqual(idsFor("i don't understand first-pass metabolism"), ["teaching"]);
  assert.deepEqual(idsFor("what's the difference between heparin and warfarin"), ["teaching"]);
  assert.deepEqual(idsFor("why does this cause hyperkalemia"), ["teaching"]);
  assert.deepEqual(idsFor("i'm confused about the sodium channel"), ["teaching"]);
});

// A teaching request about a quantitative topic should get BOTH — the method
// for explaining it and the discipline for the arithmetic in it.
test("teaching pairs with the quantitative skill on a numeric topic", () => {
  assert.deepEqual(idsFor("i'm confused about renal clearance"), ["teaching", "quantitative-check"]);
});

// The reason TEST_CRAFT and TEACHING sit ahead of EVIDENCE_HONESTY in the
// catalog: `study`/`studies` is near-universal vocabulary in a studying app,
// so from behind these two would lose their slot on their own core phrasings.
test("the greedy evidence matcher cannot starve the new skills", () => {
  assert.equal(idsFor("quiz me on what I need to study")[0], "test-craft");
  assert.equal(idsFor("explain what this study found")[0], "teaching");
  // ...and evidence-honesty still rides along in the second slot.
  assert.ok(idsFor("explain what this study found").includes("evidence-honesty"));
});

test("teaching and calculation pair up on a worked-example request", () => {
  assert.deepEqual(idsFor("teach me how to calculate creatinine clearance"), ["teaching", "quantitative-check"]);
});

// Ordinary phrasings that must NOT burn a slot — `explain`-adjacent wording is
// common, and a false match displaces a skill the turn genuinely needed.
test("the new matchers stay off unrelated messages", () => {
  assert.deepEqual(idsFor("thanks, that explanation helped"), []);
  assert.deepEqual(idsFor("what time is my next class"), []);
  assert.deepEqual(idsFor("rename this note"), []);
});

test("skills join into one message in catalog order", () => {
  const chosen = selectChatSkills("make flashcards and calculate the dose");
  const message = buildSkillMessage(chosen);
  assert.ok(message.indexOf("writing flashcards") < message.indexOf("quantitative work"));
});

// ---------------------------------------------------------------------------
// Socratic tutoring (owner 2026-07-24: teach better by "asking one question at a
// time and not showing the answer").
// ---------------------------------------------------------------------------

test("an ask to be quizzed or tutored picks up the tutoring protocol", () => {
  for (const message of [
    "quiz me on beta blockers",
    "test me on the renal chapter",
    "tutor me through this",
    "ask me questions about the Krebs cycle",
    "help me study pharmacokinetics",
    "check my understanding of first-pass metabolism",
    "drill me on antibiotic classes",
    "one question at a time please",
  ]) {
    assert.ok(idsFor(message).includes("socratic-tutoring"), `no tutoring skill for: ${message}`);
  }
});

// The whole reason `excludes` exists. "Explain it clearly" and "do not reveal the
// answer" in one prompt is the same as having neither rule, so the tutoring
// packet bars the teaching one outright rather than trusting the model to
// reconcile them.
test("tutoring and teaching never ride the same turn", () => {
  const ids = idsFor("tutor me — explain the difference between these two drugs");
  assert.ok(ids.includes("socratic-tutoring"));
  assert.ok(!ids.includes("teaching"), "contradictory packets both fired");
});

// ...and the exclusion is one-directional: a plain request to explain still gets
// an explanation. A model that answered "explain how ACE inhibitors work" with a
// question instead of an answer would be useless.
test("asking for an explanation still gets the explaining skill", () => {
  const ids = idsFor("explain how ACE inhibitors work");
  assert.ok(ids.includes("teaching"));
  assert.ok(!ids.includes("socratic-tutoring"));
});

test("quiz me gets BOTH how to write the questions and how to deliver them", () => {
  const ids = idsFor("quiz me on beta blockers");
  assert.ok(ids.includes("test-craft"), "no item-writing rules");
  assert.ok(ids.includes("socratic-tutoring"), "no delivery protocol");
});

// The landmine from the skills batch: selectChatSkills SKIPS an oversized packet
// with a silent `continue`, so a skill written past its share simply vanishes
// whenever it pairs with another — which reads as the model ignoring it.
test("every packet fits its share of the budget", () => {
  for (const skill of CHAT_SKILLS) {
    assert.ok(
      skill.instructions.length <= SKILL_CHAR_SHARE,
      `${skill.id} is ${skill.instructions.length} chars, over the ${SKILL_CHAR_SHARE} share`,
    );
  }
});

test("an exclusion cannot bar a skill that was chosen earlier", () => {
  // Order in the catalog is what decides; only the earlier skill excludes.
  const ids = CHAT_SKILLS.map((skill) => skill.id);
  assert.ok(ids.indexOf("socratic-tutoring") < ids.indexOf("teaching"));
});
