// Most of these are REFUSALS, and that is the point.
//
// A missing label costs one question nobody asks. A wrong label puts a box over the wrong part of
// a diagram and then marks the learner incorrect for reading the picture correctly — Nemesis
// confidently teaching a falsehood about material in front of the learner's eyes. So every case
// the parser is not certain of drops out rather than being repaired into something plausible.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFigureDescriptions } from "../pdf/vision";

import {
  descriptionWithoutLabels,
  isOccludable,
  labelForRound,
  MIN_LABELS_FOR_SPATIAL,
  parseFigureLabels,
} from "./figure-labels";

test("a labelled diagram yields each name and where it sits", () => {
  const labels = parseFigureLabels(
    "A cross-section of a four-stroke cylinder.\nLABELS: piston@0.5,0.7; intake valve@0.32,0.18; glow plug@0.66,0.2",
  );
  assert.deepEqual(labels, [
    { text: "piston", x: 0.5, y: 0.7 },
    { text: "intake valve", x: 0.32, y: 0.18 },
    { text: "glow plug", x: 0.66, y: 0.2 },
  ]);
});

test("a figure with no LABELS line yields nothing, and that is an ordinary answer", () => {
  // Photographs, logos and charts without named parts are the majority of figures. Producing no
  // labels for them is correct, not a failure — the prompt asks the model to omit the line.
  assert.deepEqual(parseFigureLabels("A photograph of a lecture hall."), []);
  assert.deepEqual(parseFigureLabels(""), []);
});

test("🔴 a coordinate outside the image is DROPPED, never clamped", () => {
  // Clamping would move the label to the edge and keep it — a box placed somewhere the model did
  // not say anything is, presented to the learner as though it did.
  const labels = parseFigureLabels("LABELS: valid@0.5,0.5; too far right@1.4,0.5; negative@0.2,-0.1");
  assert.deepEqual(labels, [{ text: "valid", x: 0.5, y: 0.5 }]);
});

test("🔴 a malformed coordinate is dropped rather than guessed", () => {
  const labels = parseFigureLabels("LABELS: nocoords; onlyone@0.4; words@abc,def; good@0.1,0.9");
  assert.deepEqual(labels, [{ text: "good", x: 0.1, y: 0.9 }]);
});

test("🔴 the same name twice is kept once — the second box would print the answer", () => {
  // Occluding one of two boxes carrying the same word leaves the answer visible on the diagram.
  // The learner is then asked to recall something still in front of them, and the evidence records
  // a demonstration that never happened.
  const labels = parseFigureLabels("LABELS: rotor@0.2,0.2; Rotor@0.8,0.8; stator@0.5,0.5");
  assert.deepEqual(labels, [
    { text: "rotor", x: 0.2, y: 0.2 },
    { text: "stator", x: 0.5, y: 0.5 },
  ]);
});

test("a sentence is not a label", () => {
  const long = "the piston travels downward drawing the air charge into the cylinder through the intake";
  assert.deepEqual(parseFigureLabels(`LABELS: ${long}@0.5,0.5`), []);
});

test("a label containing an @ keeps its own text", () => {
  // `lastIndexOf` rather than `indexOf`: the coordinates are always last.
  assert.deepEqual(parseFigureLabels("LABELS: flow @ 20psi@0.4,0.6"), [
    { text: "flow @ 20psi", x: 0.4, y: 0.6 },
  ]);
});

test("the description survives with the labels line removed", () => {
  const entry = "A cross-section of a cylinder.\nLABELS: piston@0.5,0.7";
  assert.equal(descriptionWithoutLabels(entry), "A cross-section of a cylinder.");
  assert.equal(descriptionWithoutLabels("No labels here."), "No labels here.");
});

test("🔴 one label is not spatial knowledge", () => {
  // A picture with a single caption is an illustration. Occluding the only label leaves nothing to
  // reason from, so the question collapses to "what is this picture called" — an association, and
  // the association lane already serves that.
  assert.equal(MIN_LABELS_FOR_SPATIAL, 2);
  assert.equal(isOccludable([{ text: "piston", x: 0.5, y: 0.5 }]), false);
  assert.equal(
    isOccludable([
      { text: "piston", x: 0.5, y: 0.5 },
      { text: "valve", x: 0.2, y: 0.2 },
    ]),
    true,
  );
  assert.equal(isOccludable([]), false);
});

test("🔴 which label is hidden is a function of the round, so a session can be replayed", () => {
  // Random would repeat a label often enough to be noticed AND would make the evidence
  // unreplayable — nobody could work out afterwards what the learner was actually shown.
  const labels = [
    { text: "a", x: 0.1, y: 0.1 },
    { text: "b", x: 0.2, y: 0.2 },
    { text: "c", x: 0.3, y: 0.3 },
  ];
  assert.equal(labelForRound(labels, 0)?.text, "a");
  assert.equal(labelForRound(labels, 1)?.text, "b");
  assert.equal(labelForRound(labels, 2)?.text, "c");
  assert.equal(labelForRound(labels, 3)?.text, "a", "the whole diagram is covered before anything repeats");
  // Nonsense rounds resolve rather than throwing on a learner mid-question.
  assert.equal(labelForRound(labels, -1)?.text, "a");
  assert.equal(labelForRound(labels, Number.NaN)?.text, "a");
  assert.equal(labelForRound([], 0), null);
});

test("🔴 the labels survive the REAL reply parser, not just a hand-made string", () => {
  // 🔴 THE ROUND-TRIP RULE. Six structural fields in this repo have died at a boundary AFTER
  // passing their own parser's tests, which is why a field is not considered to exist until it has
  // been carried through the real chain. Here that chain is: one batched Gemini reply →
  // `parseFigureDescriptions` (splits it per image) → `parseFigureLabels` (reads one entry).
  // Testing only the second would pass while the numbered-list splitter ate the LABELS line.
  const reply = [
    "1. A cross-section of a four-stroke diesel cylinder showing the compression stroke.",
    "LABELS: piston@0.5,0.72; glow plug@0.66,0.2; intake valve@0.32,0.18",
    "2. The university crest.",
    "3. A line chart of cylinder pressure against crank angle.",
  ].join("\n");

  const entries = parseFigureDescriptions(reply, 3);
  assert.ok(entries, "the batched reply no longer splits into one entry per image");
  assert.equal(entries.length, 3);

  const diagram = parseFigureLabels(entries[0] ?? "");
  assert.deepEqual(
    diagram.map((label) => label.text),
    ["piston", "glow plug", "intake valve"],
    "the LABELS line did not survive the entry splitter",
  );
  assert.ok(isOccludable(diagram), "a three-part diagram must be teachable spatially");

  // The crest answered 'none' upstream; the chart has no named parts. Both correctly yield
  // nothing, and neither is a failure — most figures in real material are one of these.
  assert.deepEqual(parseFigureLabels(entries[1] ?? ""), []);
  assert.deepEqual(parseFigureLabels(entries[2] ?? ""), []);
  assert.equal(isOccludable(parseFigureLabels(entries[2] ?? "")), false);

  // And the prose handed to existing callers must not carry the machine-readable line: that string
  // is shown to learners and written into the document model.
  assert.equal(
    descriptionWithoutLabels(entries[0] ?? ""),
    "A cross-section of a four-stroke diesel cylinder showing the compression stroke.",
  );
});
