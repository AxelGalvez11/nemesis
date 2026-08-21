import { assert, assertEquals, assertStringIncludes} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACADEMIC_SKILL_CATALOG,
  academicSkillInstruction,
  chooseAcademicSkill,
  GENERATED_NOTES_FOLDER,
  GENERATED_SLIDES_FOLDER,
} from "./academic-skills.ts";

// 🔴 WHAT THIS FILE STOPPED TESTING. It used to assert that "Quiz me on limits" detected as `quiz`,
// "20 flashcards on mitosis" as `flashcard-builder`, and so on — pinning nine regexes and a
// precedence ladder in `detectAcademicSkill`. That function's own comment explained that "test me"
// had to be checked before the ambiguous noun "test", which is the sound a word list makes when it
// is losing; and a student who wrote "I have no clue, bruh" got `general` and was answered as
// though they had asked a factual question.
//
// The model picks the skill now (@nemesis/shared, chat-intent.ts), and the phrasings are exercised
// against the live model by apps/web/scripts/chat-intent-acceptance.mts. What is tested here is
// what this module still decides: one skill per turn, in catalog order, and the teaching contracts
// themselves.

Deno.test("every skill in the catalog says when it applies, so the model can pick it", () => {
  for (const entry of ACADEMIC_SKILL_CATALOG) {
    assert(entry.when.trim().length > 10, `${entry.id} does not say when it applies`);
    // A condition says what the student WANTS. A keyword list quotes what they type, and quoting
    // is what it looks like when the old defect has moved into a string.
    assertEquals(/["'`]/.test(entry.when), false, `${entry.id} quotes the student's words`);
  }
  // `general` is the fallback, never something the model asks for, so it is deliberately absent.
  assertEquals(ACADEMIC_SKILL_CATALOG.some((entry) => entry.id === "general"), false);
});

Deno.test("ids are unique, or the model cannot address one of them", () => {
  const ids = ACADEMIC_SKILL_CATALOG.map((entry) => entry.id);
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test("the model's choice is honoured, and an unknown id costs craft rather than the answer", () => {
  assertEquals(chooseAcademicSkill(["quiz"]), "quiz");
  assertEquals(chooseAcademicSkill(["telepathy"]), "general");
  assertEquals(chooseAcademicSkill([]), "general");
});

// Exactly one skill rides a phone turn, so catalog order breaks ties. A turn that is genuinely both
// an artifact request and a quiz is an artifact request: the deliverable is the thing that would
// otherwise be lost.
Deno.test("catalog order breaks a tie", () => {
  assertEquals(chooseAcademicSkill(["quiz", "flashcard-builder"]), "flashcard-builder");
  assertEquals(chooseAcademicSkill(["teach", "quiz"]), "quiz");
});

Deno.test("quizzing withholds the answer; teaching gives it", () => {
  const quiz = academicSkillInstruction(["quiz"]);
  assertStringIncludes(quiz, "Ask exactly one question at a time");
  assertStringIncludes(quiz, "Do not include the answer");

  const teach = academicSkillInstruction(["teach"]);
  assertStringIncludes(teach, "Build understanding before recall");
  assertStringIncludes(teach, "Do not withhold the explanation");
});

Deno.test("artifact builders require the correct destination tools", () => {
  assertStringIncludes(academicSkillInstruction(["flashcard-builder"]), "add_flashcards");
  const slides = academicSkillInstruction(["slides-builder"]);
  assertStringIncludes(slides, "create_slide_deck");
  assertStringIncludes(slides, GENERATED_SLIDES_FOLDER);
  assertStringIncludes(academicSkillInstruction(["notes-builder"]), GENERATED_NOTES_FOLDER);
  assertStringIncludes(academicSkillInstruction(["test-builder"]), "add_practice_test");
});

// --- Attaching a lecture without saying what to make from it ---------------------
// Attaching a deck is not a question. Answering it as one produces a summary, which
// is the least useful thing to do with a lecture the student already has.

Deno.test("material with no request: extract the signal, then OFFER the three artifacts", () => {
  const out = academicSkillInstruction([], true);
  assertStringIncludes(out, "learning objectives");
  assertStringIncludes(out, "study notes, flashcards, a practice test, or all three");
  // It must ask, not build. Creating a deck nobody asked for is worse than one question.
  assertStringIncludes(out, "do not create any of them until they answer");
});

Deno.test("material with no request still forbids summarising it back", () => {
  assertStringIncludes(academicSkillInstruction([], true), "rather than summarising");
});

Deno.test("a NAMED artifact is built, never re-offered — asking again is a stall", () => {
  const out = academicSkillInstruction(["flashcard-builder"], true);
  assertStringIncludes(out, "Flashcard Builder");
  assertEquals(out.includes("or all three"), false);
});

Deno.test("quizzing beats the offer when material is attached", () => {
  const out = academicSkillInstruction(["quiz"], true);
  assertStringIncludes(out, "Academic skill: Quiz");
  assertEquals(out.includes("or all three"), false);
});

Deno.test("with no material attached nothing changes", () => {
  assertEquals(academicSkillInstruction(["teach"]), academicSkillInstruction(["teach"], false));
  assertEquals(academicSkillInstruction(["teach"], false).includes("or all three"), false);
});

// 🔴 STILL DETERMINISTIC, BECAUSE IT IS NOT A READING. This matches the exact prefix of a question
// NEMESIS ITSELF wrote, so it is the software remembering what it asked. A short reply to it
// continues the original save rather than reading as a brand-new request.
Deno.test("a reply to our own preference question continues that save", () => {
  const prior =
    "Before I build the test: what do you want for how many questions, the difficulty (easy, medium, hard, or mixed), and the question types (multiple choice, true/false, or a mix)?";
  assertStringIncludes(academicSkillInstruction([], false, prior), "Test Builder");
});
