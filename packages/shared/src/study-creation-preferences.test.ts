import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isStudyCreationPreferenceReply,
  studyCreationKind,
  studyCreationKindFromPreferencePrompt,
  studyCreationPreferencePrompt,
} from "./study-creation-preferences.ts";

Deno.test("creation requests never ask a configuration question — everything defaults to Auto", () => {
  // Owner 2026-08-03 (learning loop): Nemesis "should not ask the user to
  // configure this unless they explicitly want to". Bare and detailed
  // requests alike go straight to generation; typed preferences ride the
  // request text into the model turn.
  assertEquals(studyCreationPreferencePrompt("Make flashcards on biochemistry"), null);
  assertEquals(studyCreationPreferencePrompt("Make 20 cloze flashcards on biochemistry"), null);
  assertEquals(studyCreationPreferencePrompt("Create a test on contract law"), null);
  assertEquals(studyCreationPreferencePrompt("Create a 20-question hard test on beam bending"), null);
});

Deno.test("programming tests and interactive quizzing are not saved-test creation", () => {
  assertEquals(studyCreationKind("Generate unit tests for this parser"), null);
  assertEquals(studyCreationKind("Write a test for this function"), null);
  assertEquals(studyCreationKind("Quiz me on biochemistry"), null);
  assertEquals(studyCreationKind("I need you to test me on biochemistry"), null);
  assertEquals(studyCreationKind("Test my understanding of glycolysis"), null);
  assertEquals(studyCreationKind("How do I make good flashcards?"), null);
});

Deno.test("creation requests are still recognised by kind", () => {
  assertEquals(studyCreationKind("Make flashcards on the Krebs cycle"), "flashcards");
  assertEquals(studyCreationKind("Create a practice test on torts"), "test");
});

Deno.test("a reply to the OLD question in existing history still continues that save", () => {
  // Conversations from before the question was retired still contain it, so a
  // short answer under one must keep reading as a continuation, not as a
  // brand-new request. Literal strings, since the prompt is never built anymore.
  const oldTestPrompt =
    "Before I build the test: what do you want for how many questions, the difficulty (easy, medium, hard, or mixed), and the question types (multiple choice, true/false, or a mix)?";
  const oldFlashcardPrompt =
    "Before I build the flashcards: do you want cloze, basic front/back, basic + reversed, or a mix?";
  assertEquals(studyCreationKindFromPreferencePrompt(oldTestPrompt), "test");
  assertEquals(studyCreationKindFromPreferencePrompt(oldFlashcardPrompt), "flashcards");
  assertEquals(isStudyCreationPreferenceReply("20 hard, with a mix", oldTestPrompt), true);
  assertEquals(isStudyCreationPreferenceReply("never mind", oldTestPrompt), false);
  assertEquals(isStudyCreationPreferenceReply("20 hard", "What topic?"), false);
});
