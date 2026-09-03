import assert from "node:assert/strict";
import { test } from "node:test";

import { lessonMessages } from "./canvas-prompts";

// 🔴 WHY THIS FILE EXISTS. `canvas-vocabulary.ts` gates hard on purpose — at most two marks a block,
// one per 25 words — and `learning-canvas.tsx` has wired a marked term through to `defineSelection`
// since #463. None of that was broken. What was broken is that the prompt ALSO told the model to
// stay quiet: it ended "leave the list empty when the block introduces no new vocabulary, most
// blocks should". Two layers of restraint multiply. Measured on production 2026-09-03: 12 of 266
// blocks written in 30 days carried any terms at all, and `learner_lookups` held one row.
//
// So the thing worth pinning is not "the prompt mentions terms" — it always did. It is that the
// prompt does not tell the model to name them sparingly. That is a property of the composed string
// and it is asserted below against the composed string, never against this file's own source.

/** The system prompt a lesson is written under, as the model receives it. */
const lessonPrompt = () =>
  lessonMessages({ level: null, sources: [], topic: "anything" })
    .map((message) => message.content)
    .join("\n\n");

/**
 * Does this text tell the model to leave the list empty as the normal case?
 *
 * 🔴 A MATCHER, TESTED ON BOTH ANSWERS, because a guard nobody has watched fail is a comment. The
 * calibration below runs it over the exact sentence that shipped the defect and over the sentence
 * that replaced it, so a change that makes this matcher stop matching fails here rather than
 * silently passing for ever.
 */
function discouragesNaming(text: string): boolean {
  const flat = text.toLowerCase().replace(/\s+/gu, " ");
  return (
    /most blocks should/u.test(flat) ||
    /leave the list empty when the block introduces no new vocabulary[^.]*most/u.test(flat) ||
    /name (?:terms |vocabulary )?sparingly/u.test(flat) ||
    /prefer an empty (?:terms )?list/u.test(flat)
  );
}

test("🔴 CALIBRATION: the matcher fires on the sentence that caused this, and not on its replacement", () => {
  const shipped =
    '"terms" names the vocabulary THIS block introduces that a learner at this level probably has not met yet: ' +
    'each entry is {"term":"…","conceptId":"k1"}. Name at most 3 per block, fewest first, and leave the list empty ' +
    "when the block introduces no new vocabulary, most blocks should.";
  assert.equal(discouragesNaming(shipped), true, "the matcher must catch the sentence that shipped the defect");
  assert.equal(
    discouragesNaming("Name every term a learner who did not know it would be unable to follow."),
    false,
    "and must not fire on an ordinary ask",
  );
});

test("🔴 the lesson prompt does not tell the model to name vocabulary sparingly", () => {
  assert.equal(
    discouragesNaming(lessonPrompt()),
    false,
    "the gate in canvas-vocabulary.ts does the refusing; the generator must not refuse as well",
  );
});

test("the lesson prompt still asks for terms, in the shape the parser reads", () => {
  const prompt = lessonPrompt();
  assert.match(prompt, /"terms"/u, "the field must be asked for by name");
  assert.match(prompt, /"term"\s*:/u, "and its entry shape given, or the parser drops every entry");
  assert.match(prompt, /conceptId/u);
});

test("🔴 and it still forbids naming ordinary words, which is what keeps the layer from becoming noise", () => {
  assert.match(lessonPrompt(), /do not name ordinary words/iu);
});

test("🔴 a term must be required to appear in the block, or the mark cannot be located", () => {
  // `usableTerms` in canvas-parse.ts drops any term absent from the block's content, so a prompt
  // that stopped requiring this would silently lose most entries at the parse rather than loudly.
  assert.match(lessonPrompt(), /MUST appear in that block's content/iu);
});
