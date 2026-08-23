import assert from "node:assert/strict";
import { test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { UserQuestion } from "@/lib/learn/clarify-question";

// 🔴 `globalThis.React` BECAUSE `tsx` COMPILES `.tsx` WITH THE CLASSIC JSX RUNTIME — the same shim
// `answer-is-not-a-start.test.ts` carries, and for the same reason. Next builds with the automatic
// runtime; both produce the same elements, so this is a difference in how the test HARNESS
// compiles, not in what the component does.
(globalThis as unknown as { React: typeof React }).React = React;

// 🔴 STATIC MARKUP, SO WHAT IS PROVED IS WHAT IS ON SCREEN BEFORE ANY INTERACTION — the same thing
// `answer-is-not-a-start.test.ts` does and for the same reason: the first paint is where a missing
// affordance actually costs a learner. The click paths are one function (`send`) shared by the
// options, the box and the button, which is the property that makes the static check meaningful.

const DEPTH: UserQuestion = {
  id: "course-depth",
  invitesWritten: true,
  options: [
    { description: "The major ideas.", id: "survey", label: "Overview" },
    { description: null, id: "academic", label: "Academic" },
  ],
  prompt: "How deep should this course go?",
};

const noop = () => undefined;

async function render(question: UserQuestion) {
  const { CanvasClarification } = await import("./canvas-clarification");
  return renderToStaticMarkup(
    createElement(CanvasClarification, { onAnswer: noop, onDismiss: noop, question }),
  );
}

test("the question and every option reach the screen", async () => {
  const html = await render(DEPTH);
  assert.ok(html.includes("How deep should this course go?"));
  assert.ok(html.includes("Overview"));
  assert.ok(html.includes("Academic"));
  assert.ok(html.includes("The major ideas."));
});

test("🔴 an option with no description gets no empty line under it", async () => {
  // `clarify-question.ts` drops a blank description rather than echoing the label into it, so an
  // absent one here means the label really was self-explaining.
  const html = await render({ ...DEPTH, options: [DEPTH.options[1]!, DEPTH.options[0]!] });
  assert.ok(html.includes("Academic"));
});

test("🔴 the Other row is there, so writing an answer is visibly an option", async () => {
  const html = await render(DEPTH);
  assert.ok(html.includes("Other"), "there is no way to answer outside the options");
  assert.ok(html.includes("Type your own answer here"), "the write-in box has no prompt");
});

test("🔴🔴 Submit is ABSENT until something is written, never greyed out", async () => {
  // Tapping an option IS the submission, so a card that always shows Submit makes every choice two
  // clicks and makes the button read as the only way to answer. And a disabled control asks the
  // learner to work out what would switch it on — this codebase's most-repeated defect is a button
  // that does nothing.
  const html = await render(DEPTH);
  assert.ok(!html.includes("Submit"), "Submit is on screen with nothing to submit");
  assert.ok(!html.includes("disabled"), "a dead control is on screen");
});

test("🔴 allowOther:false takes the row away and leaves the options standing", async () => {
  const html = await render({ ...DEPTH, invitesWritten: false });
  assert.ok(!html.includes("Type your own answer here"));
  assert.ok(html.includes("Overview"), "the options went with it");
});

test("🔴 there is a way out that is not answering", async () => {
  // `no-screen-is-a-dead-end.test.ts` states the rule. Closing is not answering: the turn is
  // dropped rather than guessed at, and the learner's next sentence starts a fresh one.
  const html = await render(DEPTH);
  assert.ok(html.includes("Dismiss this question"), "the card cannot be closed");
});
