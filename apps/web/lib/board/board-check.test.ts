// The board can put a test in front of the learner, and it cannot put a broken one there.
//
// Owner, 2026-09-04: *"it still cannot make tests (it drops tests in chat)"*. Every assertion here
// is either a way a learner asks to be tested, or a pack the model wrote that must be refused
// rather than shown.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { asksToBeTaughtToo, CHECK_SYSTEM, readBoardCheck, readCheckAsk } from "./board-check";
import { readBoardMakeAsk } from "./board-deliverables";
import { readFileSync } from "node:fs";
import { MIN_QUESTIONS } from "@/lib/learn/test-run";

const QUESTION = {
  prompt: "A promise is given for something already done. What follows?",
  options: [
    { text: "There is no consideration, because it is past", correct: true },
    { text: "The promise binds, because it was written down" },
    { text: "The promise binds, because both parties agreed" },
  ],
};

const pack = (count: number) => ({ check: Array.from({ length: count }, () => QUESTION) });

describe("a learner asking to be tested is heard", () => {
  it("hears the ordinary phrasings, in any field", () => {
    for (const said of [
      "quiz me",
      "Quiz me on this",
      "test me on the lecture",
      "make me a practice test",
      "create a quiz from these notes",
      "give me some questions on this",
      "write practice questions about the second half",
      "check my understanding",
    ]) {
      assert.equal(readCheckAsk(said), true, `not heard: ${said}`);
    }
  });

  it("leaves a question about testing alone, because answering it is the whole job", () => {
    for (const said of [
      "how do I test a hypothesis",
      "what makes a good exam question",
      "why does this test fail on the second run",
      "explain unit tests",
      "make sure your notes cover the appeal",
    ]) {
      assert.equal(readCheckAsk(said), false, `stolen: ${said}`);
    }
  });

  it("a test ask beats the note reader, so asking to be tested never files a study note", () => {
    assert.equal(readBoardMakeAsk("make me a practice test on this"), "check");
    assert.equal(readBoardMakeAsk("quiz me"), "check");
    // And the chat's own reader still answers for everything else.
    assert.equal(readBoardMakeAsk("make me flashcards on this"), "flashcards");
    assert.equal(readBoardMakeAsk("write me notes on this"), "note");
    assert.equal(readBoardMakeAsk("what is consideration?"), null);
  });
});

describe("a turn that asks for both gets both", () => {
  it("hears the lesson inside a test ask, so the questions never replace it", () => {
    for (const said of [
      "explain the postal rule then quiz me",
      "teach me the Krebs cycle and test me on it",
      "walk me through this and then give me some questions",
      "summarise chapter 4 and quiz me",
    ]) {
      assert.equal(readCheckAsk(said), true, `not a test ask: ${said}`);
      assert.equal(asksToBeTaughtToo(said), true, `the lesson was missed in: ${said}`);
    }
  });

  it("a bare test ask is a test and nothing else", () => {
    for (const said of ["quiz me", "test me on the lecture", "make me a practice test"]) {
      assert.equal(asksToBeTaughtToo(said), false, `spurious lesson read into: ${said}`);
    }
  });
});

describe("a pack the model wrote is validated, never trusted", () => {
  it("reads both reply shapes", () => {
    assert.equal(readBoardCheck(JSON.stringify(pack(3)))?.questions.length, 3);
    assert.equal(readBoardCheck(JSON.stringify(Array.from({ length: 4 }, () => QUESTION)))?.questions.length, 4);
    assert.equal(readBoardCheck(`Here you go:\n\n${JSON.stringify(pack(3))}`)?.questions.length, 3, "prose around the JSON is survivable");
  });

  it("refuses a run shorter than a test, rather than showing one question", () => {
    assert.equal(readBoardCheck(JSON.stringify(pack(MIN_QUESTIONS - 1))), null);
    assert.equal(readBoardCheck("no json here at all"), null);
  });

  it("refuses a question with no single right answer", () => {
    const twoCorrect = { check: [QUESTION, QUESTION, { ...QUESTION, options: [{ text: "a", correct: true }, { text: "b", correct: true }] }] };
    // The bad question is dropped by the chat's validator, which leaves two, which is under the floor.
    assert.equal(readBoardCheck(JSON.stringify(twoCorrect)), null);
  });

  // 🔴 MEASURED ON PRODUCTION, 2026-09-04: two of three live turns came back in a shape the chat's
  // validator refuses outright, and the learner read "The questions came back unusable" over a
  // perfectly good test. The judgement stays in `readChatCheck`; only the wrapper is forgiven.
  it("reads the shapes models actually write, not only the one the prompt asked for", () => {
    const asStrings = {
      questions: [
        { question: "Which chamber must a revenue bill start in?", choices: ["The House", "The Senate", "Either"], answer: "The House" },
        { question: "What ends a filibuster?", choices: ["Cloture", "A pocket veto", "A conference committee"], answer: "Cloture" },
        { question: "Who signs a bill into law?", choices: ["The President", "The Speaker", "The Chief Justice"], correctIndex: 0 },
      ],
    };
    const run = readBoardCheck(JSON.stringify(asStrings));
    assert.equal(run?.questions.length, 3, "a pack with string options and a named answer was refused");
    assert.equal(run?.questions[0]?.options.filter((option) => option.correct).length, 1);
    assert.equal(run?.questions[0]?.options.find((option) => option.correct)?.text, "The House");
    assert.equal(run?.questions[2]?.options.find((option) => option.correct)?.text, "The President", "correctIndex was not read");
  });

  it("refuses a question whose answer names nothing, rather than guessing at one", () => {
    const wrong = {
      check: [
        { prompt: "A?", options: ["one", "two"], answer: "three" },
        { prompt: "B?", options: ["one", "two"], answer: "one" },
        { prompt: "C?", options: ["one", "two"], answer: "two" },
      ],
    };
    // The first question has no correct option, so it is dropped and the run falls under the floor.
    assert.equal(readBoardCheck(JSON.stringify(wrong)), null);
  });

  it("caps a runaway pack instead of putting forty questions on the board", () => {
    const run = readBoardCheck(JSON.stringify(pack(40)));
    assert.ok(run);
    assert.ok(run.questions.length <= 12, `capped, got ${run.questions.length}`);
  });
});

describe("the board has no menus, and nothing opens over it", () => {
  // 🔴🔴 OWNER, 2026-09-04, TWICE IN ONE MESSAGE: *"remove the + from chats in canvas"* and *"i
  // dont want any popups in canvas, everything should be seen and done within the cards"*. The
  // makers are icons on the card's own row now. This guard is what stops the menu coming back the
  // next time a kind is added.
  const board = ["board-composer", "conversation-card", "other-cards", "board-surface", "board-page", "selection-menu", "selection-actions"];
  it("draws no dropdown, popover or dialog anywhere on the board", () => {
    for (const file of board) {
      const source = readFileSync(new URL(`../../components/workspace/board/${file}.tsx`, import.meta.url), "utf8");
      assert.ok(!/DropdownMenu|PopoverTrigger|DialogTrigger/.test(source), `${file}.tsx opens something over the board`);
    }
  });

  it("puts the makers on the card instead", () => {
    const card = readFileSync(new URL("../../components/workspace/board/conversation-card.tsx", import.meta.url), "utf8");
    assert.match(card, /Make flashcards from this/, "the flashcards icon is missing from a chat card");
    assert.match(card, /Make a test from this/, "the test icon is missing from a chat card");
    assert.ok(!card.includes("MakeMenu"), "the + menu is still on the card");
    const source = readFileSync(new URL("../../components/workspace/board/other-cards.tsx", import.meta.url), "utf8");
    for (const label of ["Make a note from this", "Make flashcards from this", "Make a test from this", "Collapse document", "Delete document"]) {
      assert.ok(source.includes(label), `a dropped document cannot ${label.toLowerCase()}`);
    }
  });

  it("writes its prompt without an em dash, like every other prompt in this product", () => {
    assert.ok(!/\u2014/.test(CHECK_SYSTEM), "the prompt bans em dashes and must not carry one");
  });
});
