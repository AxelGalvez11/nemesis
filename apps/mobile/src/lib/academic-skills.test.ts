import { assert, assertEquals, assertStringIncludes} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  academicSkillInstruction,
  detectAcademicSkill,
  GENERATED_NOTES_FOLDER,
  GENERATED_SLIDES_FOLDER,
} from "./academic-skills.ts";

Deno.test("academic skills distinguish interactive quizzing from test creation", () => {
  assertEquals(detectAcademicSkill("Quiz me on limits"), "quiz");
  assertEquals(detectAcademicSkill("I need you to test me on limits"), "quiz");
  assertEquals(detectAcademicSkill("Create a full practice test on limits"), "test-builder");
  assertEquals(detectAcademicSkill("I need a test on limits"), "test-builder");
  assert(academicSkillInstruction("Quiz me on limits").includes("Ask exactly one question at a time"));
  assert(academicSkillInstruction("Quiz me on limits").includes("Do not include the answer"));
});

Deno.test("teaching gives the explanation instead of behaving like a quiz", () => {
  assertEquals(detectAcademicSkill("Teach me the chain rule"), "teach");
  const instruction = academicSkillInstruction("Explain the chain rule");
  assert(instruction.includes("Build understanding before recall"));
  assert(instruction.includes("Do not withhold the explanation"));
});

Deno.test("artifact builders require the correct destination tools", () => {
  assertEquals(detectAcademicSkill("Make Anki flashcards from this"), "flashcard-builder");
  assertEquals(detectAcademicSkill("20 flashcards on mitosis"), "flashcard-builder");
  assert(academicSkillInstruction("Make Anki flashcards from this").includes("add_flashcards"));

  assertEquals(detectAcademicSkill("Create lecture slides about mitosis"), "slides-builder");
  assertEquals(detectAcademicSkill("Slides on mitosis"), "slides-builder");
  const slides = academicSkillInstruction("Create lecture slides about mitosis");
  assert(slides.includes("create_slide_deck"));
  assert(slides.includes(GENERATED_SLIDES_FOLDER));

  assertEquals(detectAcademicSkill("Prepare study notes on mitosis"), "notes-builder");
  assert(academicSkillInstruction("Prepare study notes on mitosis").includes(GENERATED_NOTES_FOLDER));
});

// --- Attaching a lecture without saying what to make from it ---------------------
// Attaching a deck is not a question. Answering it as one produces a summary, which
// is the least useful thing to do with a lecture the student already has.

Deno.test("material with no request: extract the signal, then OFFER the three artifacts", () => {
  const out = academicSkillInstruction("", true);
  assertStringIncludes(out, "learning objectives");
  assertStringIncludes(out, "study notes, flashcards, a practice test, or all three");
  // It must ask, not build. Creating a deck nobody asked for is worse than one question.
  assertStringIncludes(out, "do not create any of them until they answer");
});

Deno.test("material with no request still forbids summarising it back", () => {
  const out = academicSkillInstruction("", true);
  assertStringIncludes(out, "rather than summarising");
});

Deno.test("a NAMED artifact is built, never re-offered — asking again is a stall", () => {
  const out = academicSkillInstruction("make flashcards from this", true);
  assertStringIncludes(out, "Flashcard Builder");
  assertEquals(out.includes("or all three"), false);
});

Deno.test("quizzing beats the offer when material is attached", () => {
  // "quiz me on this deck" is a request, and it must not be answered with a menu.
  const out = academicSkillInstruction("quiz me on this", true);
  assertStringIncludes(out, "Academic skill: Quiz");
  assertEquals(out.includes("or all three"), false);
});

Deno.test("with no material attached nothing changes", () => {
  assertEquals(academicSkillInstruction("what is a half life?"), academicSkillInstruction("what is a half life?", false));
  assertEquals(academicSkillInstruction("what is a half life?", false).includes("or all three"), false);
});
