import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSkillMessage,
  CHAT_SKILLS,
  MAX_ACTIVE_SKILLS,
  selectChatSkills,
  SKILL_CHAR_BUDGET,
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

test("skills join into one message in catalog order", () => {
  const chosen = selectChatSkills("make flashcards and calculate the dose");
  const message = buildSkillMessage(chosen);
  assert.ok(message.indexOf("writing flashcards") < message.indexOf("quantitative work"));
});
