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

// 🔴 WHAT MOVED OUT OF THIS FILE. It used to assert that "make me flashcards on beta blockers"
// selected flashcard-craft, that "i'm confused about the sodium channel" selected teaching, and
// about forty more phrasings. Those were testing a regex per skill, and the regex is gone: the
// model picks now (chat-intent.ts), because a word list could never see "I have no clue, bruh" as
// a student who needs teaching. The phrasings live in `scripts/chat-intent-acceptance.mts`, which
// runs them against the real model.
//
// What is left here is what this module still decides on its own: the limits. Those are facts about
// our prompt budget and about which packets contradict each other — not readings of a message — and
// every one of them was a real bug at some point.

const idsFor = (requested: string[]) => selectChatSkills(requested).map((skill) => skill.id);

test("the model's choice is honoured, in catalog order", () => {
  assert.deepEqual(idsFor(["teaching"]), ["teaching"]);
  assert.deepEqual(idsFor(["evidence-honesty", "quantitative-check"]), ["quantitative-check", "evidence-honesty"]);
});

test("no skills asked for means no skills ride, so an ordinary turn costs nothing extra", () => {
  assert.deepEqual(idsFor([]), []);
  assert.deepEqual(buildSkillMessage([]), "");
});

// A model naming a skill that does not exist costs the turn some craft. Failing the turn over it
// would cost the answer, which is strictly worse.
test("an id that is not in the catalog is dropped, never thrown", () => {
  assert.deepEqual(idsFor(["teaching", "telepathy"]), ["teaching"]);
  assert.deepEqual(idsFor(["nothing-real"]), []);
  // The four artifact builders went with the tools they called. A model still asking for one is
  // asking for something the product cannot do, and it must cost the turn nothing.
  assert.deepEqual(idsFor(["flashcard-craft", "test-craft", "slides-builder", "notes-builder"]), []);
});

test("more skills than the cap are trimmed to the cap", () => {
  const ids = idsFor(["teaching", "quantitative-check", "evidence-honesty"]);
  assert.equal(ids.length, MAX_ACTIVE_SKILLS);
  assert.deepEqual(ids, ["teaching", "quantitative-check"]);
});

test("the char budget is never exceeded", () => {
  const fat: ChatSkill[] = [
    { id: "a", instructions: "x".repeat(SKILL_CHAR_BUDGET - 10), name: "A", when: "a" },
    { id: "b", instructions: "y".repeat(100), name: "B", when: "b" },
  ];
  const chosen = selectChatSkills(["a", "b"], fat);
  assert.deepEqual(chosen.map((skill) => skill.id), ["a"]);
  assert.ok(buildSkillMessage(chosen).length <= SKILL_CHAR_BUDGET);
});

test("every catalog skill fits the budget on its own and is well formed", () => {
  for (const skill of CHAT_SKILLS) {
    assert.ok(skill.instructions.length <= SKILL_CHAR_BUDGET, `${skill.id} exceeds the budget alone`);
    assert.ok(skill.instructions.startsWith("SKILL: "), `${skill.id} is missing its header`);
    assert.ok(skill.name.length > 0);
    assert.ok(skill.when.length > 0, `${skill.id} must say when it applies, or the model cannot pick it`);
  }
});

test("ids are unique, or the model cannot address one of them", () => {
  const ids = CHAT_SKILLS.map((skill) => skill.id);
  assert.equal(new Set(ids).size, ids.length);
});

// The budget check in selectChatSkills is a silent `continue`, so a packet written past its share
// does not error — it just stops appearing whenever another skill was chosen first, which reads as
// "the model ignored the instruction".
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

test("skills join into one message in catalog order", () => {
  const message = buildSkillMessage(selectChatSkills(["evidence-honesty", "quantitative-check"]));
  assert.ok(message.indexOf("quantitative work") < message.indexOf("sourcing you can defend"));
});

// The whole reason `excludes` exists. "Explain it clearly" and "do not reveal the answer" in one
// prompt is the same as having neither rule, so the tutoring packet bars the teaching one outright
// rather than trusting the model to reconcile them. A model that asks for both gets the tutoring
// reading, which is the right one for a turn that is genuinely both.
test("tutoring and teaching never ride the same turn", () => {
  const ids = idsFor(["socratic-tutoring", "teaching"]);
  assert.ok(ids.includes("socratic-tutoring"));
  assert.ok(!ids.includes("teaching"), "contradictory packets both fired");
});

// ...and the exclusion is one-directional: asking only for teaching still gets an explanation.
test("asking only for teaching gets teaching", () => {
  assert.deepEqual(idsFor(["teaching"]), ["teaching"]);
});

test("an exclusion cannot bar a skill that was chosen earlier", () => {
  const ids = CHAT_SKILLS.map((skill) => skill.id);
  assert.ok(ids.indexOf("socratic-tutoring") < ids.indexOf("teaching"));
  assert.ok(ids.indexOf("syllabus-intake") < ids.indexOf("lecture-intake"));
});

test("a syllabus excludes the lecture miner", () => {
  const ids = idsFor(["syllabus-intake", "lecture-intake"]);
  assert.ok(ids.includes("syllabus-intake"));
  assert.ok(!ids.includes("lecture-intake"), "one packet would mine concepts while the other offered a calendar import");
});

// Owner 2026-07-28: "syllabus and calendar events should not be outputted into chat, the chat
// should just say 'ive put the events into the calendar'". The skill used to ask for a compact
// TABLE of every date and a quoted source line per row, which is exactly the dump complained about.
test("the syllabus skill reports a COUNT, never a list of the dates", () => {
  const skill = CHAT_SKILLS.find((entry) => entry.id === "syllabus-intake");
  assert.ok(skill, "syllabus-intake must exist");
  assert.match(skill.instructions, /Do NOT list the dates in your reply/);
  assert.match(skill.instructions, /how many dated items you found and the range/);
  assert.match(skill.instructions, /I've put the events into your calendar/);
  // The consent gate stays: asking first is what stops thirty events landing unannounced, and a
  // count is still something a student can approve.
  assert.match(skill.instructions, /Want me to add these to your calendar\?/);
  // The source line is not lost — it moves into the event's own note.
  assert.match(skill.instructions, /in that event's note/);
});

// A student who already said what they want must not be asked again. The intake packet's own last
// line carries that rule, since ordering can no longer be relied on to enforce it: the model may
// ask for lecture-intake and flashcard-craft in either order.
// 🔴 THE CLOSING OFFER WENT WITH THE TOOLS THAT SERVED IT. Intake used to end every upload with
// "Want me to turn this into notes, flashcards, a practice test, or all three?" — three things the
// chat can no longer make. An offer the model cannot keep is worse than no offer: the student says
// "all three" and gets an apology, or a claim that something was saved.
test("the lecture intake packet no longer offers what it cannot build", () => {
  const skill = CHAT_SKILLS.find((entry) => entry.id === "lecture-intake");
  assert.ok(skill, "lecture-intake must exist");
  assert.doesNotMatch(skill.instructions, /or all three/);
  assert.match(skill.instructions, /Do NOT end by offering/);
});

console.log("chat-skills.test.ts OK");
