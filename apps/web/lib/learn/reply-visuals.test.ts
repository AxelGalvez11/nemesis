import assert from "node:assert/strict";
import { test } from "node:test";

import { hasReplyVisuals, replySegments } from "./reply-visuals";

// 🔴 REPORTED 2026-08-20: *"i asked it to create the chemical structures using the new tools we gave
// it."* It answered "Alcohol: R-OH (hydroxyl group)" in prose.
//
// Nothing was broken. `ChemicalStructure` had been drawing SMILES for weeks — from the TEACHING
// path only, out of knowledge objects — and a conversational reply is a string. The capability was
// real, reachable by code, and unreachable from a conversation.

test("a reply with no fences is one prose segment, unchanged", () => {
  // The ordinary case must be untouched: one path through the renderer, not two.
  const segments = replySegments("Alcohols carry a hydroxyl group.");
  assert.deepEqual(segments, [{ kind: "prose", text: "Alcohols carry a hydroxyl group." }]);
  assert.equal(hasReplyVisuals("Alcohols carry a hydroxyl group."), false);
});

test("🔴🔴 a drawing lands EXACTLY where the model put it", () => {
  // THE reason this is a positional split rather than a `visuals` array on the turn. An array loses
  // where each picture belonged, and the renderer could only put them all at the end — which is
  // "describe it, then show four pictures" and is not what was asked for.
  const segments = replySegments("Ethanol looks like this:\n\n```smiles\nCCO\n```\n\nThe OH is the reactive part.");
  assert.deepEqual(segments.map((s) => s.kind), ["prose", "visual", "prose"]);
  assert.match((segments[0] as { text: string }).text, /Ethanol looks like this/);
  assert.match((segments[2] as { text: string }).text, /The OH is the reactive part/);
});

test("the drawing carries the validated notation, and says a model wrote it", () => {
  const segments = replySegments("```smiles\nCCO\n```");
  const visual = segments.find((s) => s.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visual.visual.kind, "structure");
  assert.equal(visual.visual.notation, "smiles");
  assert.equal(visual.visual.value, "CCO");
  // 🔴 `resolvedFrom` ABSENT IS A REAL FACT. It means "a resolver was asked for this name and
  // returned this string". A model wrote this one from memory, and `canvas-visual.ts` says a
  // surface that could not tell them apart would present a remembered SMILES exactly like a
  // looked-up one.
  assert.equal(visual.visual.resolvedFrom, undefined);
});

test("🔴 `reaction` is accepted as well as the internal name", () => {
  // Asking a model to remember a hyphenated internal spelling is a way to lose drawings to a typo.
  for (const tag of ["reaction", "reaction-smiles"]) {
    const segments = replySegments("```" + tag + "\nCCO>>CC=O\n```");
    const visual = segments.find((s) => s.kind === "visual");
    assert.ok(visual && visual.kind === "visual", tag);
    assert.equal(visual.visual.notation, "reaction-smiles", tag);
  }
});

test("🔴🔴 a fence in another language is LEFT IN THE PROSE, not swallowed", () => {
  // Consuming it would delete a code block from the answer entirely.
  //
  // 🔴 THE CONTENT IS VALID SMILES ON PURPOSE, AND THE FIRST VERSION OF THIS TEST WAS HOLLOW
  // WITHOUT THAT. It used a line of Python, which `validateStructure` refuses anyway — so the test
  // passed whether or not the language tag was ever checked, and breaking the tag guard left it
  // green. `CCO` is a real molecule, so the ONLY thing that can keep this fence in the prose is the
  // parser honouring the language. Calibration: default an unknown tag to "smiles" and this reddens
  // alone.
  const answer = "Here is the string:\n\n```text\nCCO\n```\n\nThat is it.";
  const segments = replySegments(answer);
  assert.deepEqual(segments.map((s) => s.kind), ["prose"]);
  assert.equal((segments[0] as { text: string }).text, answer);
});

test("🔴 and a real code block still survives untouched", () => {
  const answer = "Here is the loop:\n\n```python\nfor x in xs: print(x)\n```\n\nThat is it.";
  assert.deepEqual(replySegments(answer), [{ kind: "prose", text: answer }]);
});

test("🔴🔴 a REFUSED structure also stays in the prose", () => {
  // `chem-notation.ts` refuses on emptiness, length and characters a depiction library must never
  // be handed. Dropping the fence would remove the notation from the answer and leave the sentence
  // before it pointing at nothing.
  const answer = "Look:\n\n```smiles\n\n```\n\nDone.";
  const segments = replySegments(answer);
  assert.deepEqual(segments.map((s) => s.kind), ["prose"]);
  assert.match((segments[0] as { text: string }).text, /Look:/);
  assert.match((segments[0] as { text: string }).text, /Done\./);
});

test("🔴 an over-long string is refused rather than handed to the renderer", () => {
  // The same bound the teaching path enforces, reached through the new door.
  const segments = replySegments("```smiles\n" + "C".repeat(400) + "\n```");
  assert.deepEqual(segments.map((s) => s.kind), ["prose"]);
});

test("several drawings in one answer keep their order and their prose", () => {
  const segments = replySegments("First:\n```smiles\nCCO\n```\nSecond:\n```smiles\nCC=O\n```\nEnd.");
  assert.deepEqual(segments.map((s) => s.kind), ["prose", "visual", "prose", "visual", "prose"]);
  const values = segments.filter((s) => s.kind === "visual").map((s) => (s as { visual: { value: string } }).visual.value);
  assert.deepEqual(values, ["CCO", "CC=O"]);
});

test("a reply that is ONLY a drawing still returns the drawing", () => {
  const segments = replySegments("```smiles\nCCO\n```");
  assert.equal(segments.filter((s) => s.kind === "visual").length, 1);
  assert.equal(hasReplyVisuals("```smiles\nCCO\n```"), true);
});
