import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isStudyCreationPreferenceReply,
  studyCreationKind,
  studyCreationKindFromPreferencePrompt,
  studyCreationPreferencePrompt,
} from "./study-creation-preferences.ts";

Deno.test("flashcard creation asks for a format instead of silently choosing one", () => {
  assertEquals(
    studyCreationPreferencePrompt("Make flashcards on biochemistry"),
    "Before I build the flashcards: do you want cloze, basic front/back, basic + reversed, or a mix?",
  );
  assertEquals(studyCreationPreferencePrompt("Make 20 cloze flashcards on biochemistry"), null);
  assertEquals(studyCreationPreferencePrompt("Create basic + reversed cards from this"), null);
});

Deno.test("test creation asks for every missing choice in one turn", () => {
  assertEquals(
    studyCreationPreferencePrompt("Create a test on biochemistry"),
    "Before I build the test: what do you want for how many questions, the difficulty (easy, medium, hard, or mixed), and the question types (multiple choice, true/false, or a mix)?",
  );
  assertEquals(
    studyCreationPreferencePrompt("Create a 20-question hard test on biochemistry"),
    "Before I build the test: what do you want for the question types (multiple choice, true/false, or a mix)?",
  );
  assertEquals(studyCreationPreferencePrompt("Create a 20-question hard multiple-choice test on biochemistry"), null);
});

Deno.test("programming tests and interactive quizzing are not saved-test creation", () => {
  assertEquals(studyCreationKind("Generate unit tests for this parser"), null);
  assertEquals(studyCreationKind("Write a test for this function"), null);
  assertEquals(studyCreationKind("Quiz me on biochemistry"), null);
  assertEquals(studyCreationKind("I need you to test me on biochemistry"), null);
  assertEquals(studyCreationKind("Test my understanding of glycolysis"), null);
  assertEquals(studyCreationKind("How do I make good flashcards?"), null);
});

Deno.test("a reply to the deterministic question continues the original save", () => {
  const prompt = studyCreationPreferencePrompt("Create a test on biochemistry") ?? "";
  assertEquals(studyCreationKindFromPreferencePrompt(prompt), "test");
  assertEquals(isStudyCreationPreferenceReply("20 hard, with a mix", prompt), true);
  assertEquals(isStudyCreationPreferenceReply("never mind", prompt), false);
  assertEquals(isStudyCreationPreferenceReply("20 hard", "What topic?"), false);
});
