import assert from "node:assert/strict";
import { test } from "node:test";

import type { KnowledgeObject } from "./knowledge-types";
import { objectivesForKnowledge } from "./learning-objective";

// 🔴🔴 THE QUESTION PRINTED ITS OWN ANSWER.
//
// Found by the production figure-occlusion harness on a real vision reading. This is the cue a
// learner was actually shown, in full:
//
//   In this diagram (This figure is a flowchart titled "CELLULAR ENERGY PATHWAY" that illustrates a
//   three-step metabolic process via horizontal right-pointing arrows. It shows "GLUCOSE" in a light
//   blue box leading to "PYRUVATE" in a light green box, which leads to "ATP" in a yellow box …),
//   what is the covered part?
//
// Every answer the diagram can ask for, listed in the question asking for it. The learner reads
// instead of retrieving, the judge marks it `understood` at 0.9, and a demonstration enters the
// durable record that never happened — which is worse than asking nothing, because the scheduler
// now believes the objective is known and stops asking.
//
// 🔴 THE CODE ALREADY CLAIMED THIS WAS HANDLED. The comment on the cue read *"deliberately does not
// name the part — naming it would print the answer"*, directly above the line interpolating the
// whole caption. It was true when a caption was the document's own short line; it stopped being
// true when captions began coming from vision, which describes a picture by listing what is in it.
// A comment is not a guard.

function diagram(caption: string, labels: string[]): KnowledgeObject {
  return {
    figure: {
      assetPath: "u/1/image1.png",
      caption,
      imageRef: "image1.png",
      labels: labels.map((text, index) => ({ text, x: 0.2 + index * 0.2, y: 0.5 })),
    },
    identityKey: "spatial:v1:abc",
    provenance: ["model"],
    statement: `${caption} labels: ${labels.join(", ")}.`,
    type: "spatial",
  } as unknown as KnowledgeObject;
}

const cuesFor = (knowledge: KnowledgeObject) =>
  objectivesForKnowledge(knowledge).filter((objective) => objective.capability === "locate");

test("🔴 no locate cue may contain the answer it is asking for", () => {
  // The production caption, shortened but with the same shape: prose that names every label.
  const objectives = cuesFor(
    diagram(
      'This flowchart, "CELLULAR ENERGY PATHWAY", shows GLUCOSE leading to PYRUVATE, which leads to ATP.',
      ["GLUCOSE", "PYRUVATE", "ATP"],
    ),
  );
  assert.equal(objectives.length, 3, "one objective per label");
  for (const objective of objectives) {
    assert.doesNotMatch(
      objective.cue,
      new RegExp(String(objective.answer), "i"),
      `the cue for "${objective.answer}" prints it: ${objective.cue}`,
    );
    assert.doesNotMatch(
      objective.label,
      new RegExp(String(objective.answer), "i"),
      `the label for "${objective.answer}" prints it: ${objective.label}`,
    );
  }
});

test("🔴 the fallback cue still asks a real question", () => {
  // Dropping the caption must not leave an empty prompt. The figure is on screen with one part
  // covered, so the bare form is complete — but it has to actually be there.
  const [objective] = cuesFor(diagram("GLUCOSE becomes PYRUVATE.", ["GLUCOSE", "PYRUVATE"]));
  assert.ok(objective);
  assert.match(objective.cue, /covered part/i);
});

// ── what must NOT have changed ──────────────────────────────────────────────

test("a caption that gives nothing away is still used", () => {
  // The caption is real context and dropping it unnecessarily makes every diagram question
  // identical. A document caption that describes without naming is exactly what it is for.
  const [objective] = cuesFor(diagram("Figure 2. The stages of aerobic respiration.", ["GLUCOSE", "PYRUVATE"]));
  assert.ok(objective);
  assert.match(objective.cue, /stages of aerobic respiration/);
});

test("🔴 a label inside a longer word is not a mention", () => {
  // Word boundaries, not substring. "ATP" appears inside "ATPase"; treating that as a leak would
  // discard a caption that never gave the answer away. The asymmetry matters: a false positive
  // costs context, a false negative costs the whole demonstration.
  const [objective] = cuesFor(diagram("Figure 4. ATPase sits in the inner membrane.", ["ATP", "MEMBRANE"]));
  assert.ok(objective);
  assert.match(objective.cue, /ATPase/, "ATPase does not name ATP");
});

test("case and punctuation do not let a mention through", () => {
  // A caption writing "Glucose," and a label reading "GLUCOSE" are the same word.
  const objectives = cuesFor(diagram("The path runs Glucose, then Pyruvate.", ["GLUCOSE", "PYRUVATE"]));
  for (const objective of objectives) {
    assert.doesNotMatch(objective.cue, new RegExp(String(objective.answer), "i"));
  }
});
