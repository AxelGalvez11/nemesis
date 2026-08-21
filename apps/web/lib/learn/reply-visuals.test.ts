import assert from "node:assert/strict";
import { test } from "node:test";

import { hasReplyVisuals, MAX_REPLY_VISUALS, replySegments, replyVisuals } from "./reply-visuals";

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
    assert.ok(visual.visual.kind === "structure", tag);
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

// ── ALL NINE KINDS, REACHABLE FROM A CONVERSATION ────────────────────────────────────────────
//
// Owner, 2026-08-20: *"i thought we integrated the new chem draw and math plot abilities but it
// says it still cant."* It could not, and it was right to say so. A reply could reach exactly one
// of the nine kinds `SemanticVisual` renders — a molecule, through `[smiles: …]`. Asked for a plot
// it correctly reported a capability it did not have.
//
// A molecule fits in a bracketed token. A plot does not: it is labelled series of coordinate pairs,
// and flattening that into a line inside a JSON string is a parser waiting to disagree with itself.
// So structure travels as DATA on the turn and only POSITION travels in the prose.

const PLOT = {
  kind: "quantitative",
  learningGoal: "See how it grows",
  series: [{ label: "y = x²", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }] }],
  xLabel: "x",
  yLabel: "y",
};

test("🔴🔴 a [figure n] marker mounts the nth visual, exactly where it was written", () => {
  // The whole reason position travels separately rather than the renderer appending figures at the
  // end — which is "describe it, then show four pictures", and is not what was asked for.
  const visuals = replyVisuals([PLOT]);
  assert.equal(visuals.length, 1, "a valid plot was refused");
  const segments = replySegments("The curve steepens: [figure 1] and that is the whole story.", visuals);
  assert.deepEqual(segments.map((s) => s.kind), ["prose", "visual", "prose"]);
  assert.match((segments[0] as { text: string }).text, /The curve steepens/);
  assert.match((segments[2] as { text: string }).text, /the whole story/);
});

test("🔴 every one of the nine kinds can reach a reply", () => {
  // Calibration: this is the test that would have caught the reported bug. Before this change
  // `replyVisuals` did not exist and only `structure` had a door.
  const nine = [
    { kind: "equation", latex: "x^2", learningGoal: "g" },
    { kind: "relationship", learningGoal: "g", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] },
    PLOT,
    { kind: "structure", learningGoal: "g", notation: "smiles", value: "CCO" },
    { kind: "table", learningGoal: "g", columns: [{ key: "k", label: "K" }], rows: [{ cells: { k: "v" } }] },
    { kind: "timeline", learningGoal: "g", unit: "years", events: [{ at: 1, atLabel: "1", label: "One" }, { at: 2, atLabel: "2", label: "Two" }] },
    { kind: "construction", learningGoal: "g", points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }, { id: "C", x: 0, y: 1 }], segments: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }] },
    { kind: "vectors", learningGoal: "g", bodyLabel: "block", vectors: [{ label: "F", magnitude: 10, degrees: 0 }] },
    { kind: "code", language: "python", learningGoal: "g", source: "print(1)" },
  ];
  // 🔴 ONE AT A TIME, BECAUSE THE BOUND IS REAL. Passing all nine at once tests the cap, not the
  // kinds — which is exactly how the first version of this test failed, and correctly: it reported
  // "only equation, relationship, quantitative, structure got through" and the cause was
  // `replyVisuals` slicing to MAX_REPLY_VISUALS BEFORE validating. That was a live bug, now fixed.
  for (const visual of nine) {
    assert.equal(replyVisuals([visual]).length, 1, `${visual.kind} cannot reach a reply`);
  }
});

test("🔴🔴 a model-written visual goes through the SAME validator the teaching path uses", () => {
  // A conversational door into the drawing system that skipped validation would be a second, weaker
  // standard for the same pictures. `\href` in LaTeX is a security probe, not a typo, and
  // subject-visuals.ts recomputes numeric claims rather than trusting them.
  assert.deepEqual(replyVisuals([{ kind: "equation", latex: "\\href{http://x}{y}", learningGoal: "g" }]), []);
  assert.deepEqual(replyVisuals([{ kind: "quantitative", learningGoal: "g", series: [] }]), []);
  assert.deepEqual(replyVisuals([{ kind: "not-a-kind", learningGoal: "g" }]), []);
  assert.deepEqual(replyVisuals("not an array"), []);
});

test("🔴🔴 a refused visual leaves its marker VISIBLE rather than renumbering the survivors", () => {
  // The honest failure. Silently closing the gap would move every later figure under the wrong
  // sentence — a picture captioned by the paragraph meant for a different picture, which is worse
  // than a stray token the learner can see.
  const visuals = replyVisuals([{ kind: "equation", latex: "\\href{http://x}{y}", learningGoal: "g" }, PLOT]);
  assert.equal(visuals.length, 1);
  const segments = replySegments("First [figure 1] then [figure 2].", visuals);
  // [figure 1] resolves to the surviving plot; [figure 2] points past the end and stays as text.
  assert.deepEqual(segments.map((s) => s.kind), ["prose", "visual", "prose"]);
  assert.match((segments[2] as { text: string }).text, /\[figure 2\]/, "the unresolved marker was silently swallowed");
});

test("🔴 a turn cannot draw an unbounded number of figures", () => {
  const many = Array.from({ length: 12 }, () => PLOT);
  assert.equal(replyVisuals(many).length, MAX_REPLY_VISUALS);
});

test("🔴 [figure n] cannot collide with a citation marker", () => {
  // `[1]` is bare digits and belongs to citationsToMarkdown; this pattern requires the word.
  const segments = replySegments("Reported widely [1] and shown here [figure 1].", replyVisuals([PLOT]));
  assert.match((segments[0] as { text: string }).text, /\[1\]/, "a citation was eaten by the figure parser");
  assert.equal(segments.filter((s) => s.kind === "visual").length, 1);
});

test("🔴 a molecule still travels in the line itself, unchanged", () => {
  // Both channels, because the one-line form was measured to be the one the model actually uses.
  const segments = replySegments("Ethanol: [smiles: CCO]");
  assert.equal(segments.filter((s) => s.kind === "visual").length, 1);
});

test("🔴🔴 a figure with no marker is still shown, after the prose", () => {
  // 🔴 FOUND BY MEASURING, NOT BY READING. Driven in a browser and asked to plot y = x², the model
  // answered "Here's y = x² from x = 0 to 5." and nothing appeared. It had written the introducing
  // sentence and supplied the figure, and simply omitted the [figure 1] marker — so the prose
  // promised a picture that was silently discarded.
  //
  // Position is a preference, not a precondition. Calibration: drop the append loop and this
  // reddens while every other test in this file stays green.
  const visuals = replyVisuals([PLOT]);
  const segments = replySegments("Here's y = x² from x = 0 to 5.", visuals);
  assert.deepEqual(segments.map((s) => s.kind), ["prose", "visual"]);
});

test("🔴 and it is shown ONCE, not twice, when the marker was there all along", () => {
  // The append must skip anything a marker already mounted, or every well-formed answer prints its
  // figures inline and then again at the end.
  const visuals = replyVisuals([PLOT]);
  const segments = replySegments("Look: [figure 1] as you can see.", visuals);
  assert.equal(segments.filter((s) => s.kind === "visual").length, 1);
});

test("🔴 a refused figure is not resurrected by the append", () => {
  // It never reaches `visuals`, so there is nothing to append — the marker stays visible in the
  // prose and no broken figure is mounted at the end either.
  const visuals = replyVisuals([{ kind: "equation", latex: "\\href{http://x}{y}", learningGoal: "g" }]);
  const segments = replySegments("See [figure 1].", visuals);
  assert.deepEqual(segments.map((s) => s.kind), ["prose"]);
});
