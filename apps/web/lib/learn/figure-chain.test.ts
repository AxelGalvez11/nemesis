// §46.6, END TO END, as one chain rather than five files that each pass alone.
//
// 🔴 THIS IS THE TEST THAT SAYS THE FEATURE EXISTS. Every link below has its own unit tests, and
// this repo's standing lesson is that those are not enough: six structural fields have died at a
// boundary AFTER passing their own parser's tests, and the shape that keeps recurring is "a tested
// reader over an empty table" — a component that works perfectly against a fixture nothing
// upstream produces. So this runs the real modules in the real order:
//
//   a batched vision reply
//     → parseFigureDescriptions   (splits it per image)
//     → parseFigureLabels         (names and positions)
//     → figureKnowledge           (a spatial KnowledgeObject)
//     → objectivesForKnowledge    (one `locate` objective per label)
//     → the occlusion selection   (which part is covered, from the objective's own identity)
//
// If any link silently produces nothing, this fails — which is exactly what the individual tests
// cannot tell you.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFigureDescriptions } from "../pdf/vision";
import { descriptionWithoutLabels, parseFigureLabels, type FigureLabel } from "./figure-labels";
import { figureKnowledge } from "./figure-knowledge";
import { normalizeForIdentity } from "./knowledge-identity";
import { objectiveIdentityBasis, objectivesForKnowledge } from "./learning-objective";

const REPLY = [
  "1. A cross-section of a four-stroke diesel cylinder on the compression stroke.",
  "LABELS: piston@0.5,0.72; glow plug@0.66,0.2; intake valve@0.32,0.18",
  "2. The university crest.",
].join("\n");

// 🔴 `"model"` IS THE TRUTHFUL VALUE, NOT A PLACEHOLDER. The picture comes from the document, but
// the LABELS are a vision model's reading of that picture — nothing in the document's text says
// "the piston is here". `UnanchoredProvenance` documents that as "Nemesis knows this from model
// knowledge, with no external source behind it", which is exactly the claim being made, and it is
// what stops a label rendering as a citation to an excerpt that does not exist.
const PROVENANCE = ["model"] as const;

function chain() {
  const entries = parseFigureDescriptions(REPLY, 2);
  assert.ok(entries, "the batched reply no longer splits per image");
  const labels = parseFigureLabels(entries[0] ?? "");
  const knowledge = figureKnowledge({
    caption: descriptionWithoutLabels(entries[0] ?? ""),
    imageRef: "figure-3.png",
    labels,
    provenance: PROVENANCE,
  });
  return { entries, knowledge, labels };
}

test("🔴 §46.6: a labelled figure becomes spatial knowledge with one objective per part", () => {
  const { knowledge, labels } = chain();
  assert.ok(knowledge, "a three-part diagram produced no knowledge object");
  assert.equal(knowledge.type, "spatial");
  assert.equal(knowledge.figure?.imageRef, "figure-3.png");
  assert.equal(knowledge.figure?.labels.length, 3);

  const objectives = objectivesForKnowledge(knowledge);
  assert.equal(objectives.length, 3, "one objective per named part, never one for the whole diagram");
  for (const objective of objectives) {
    assert.equal(objective.capability, "locate", "a diagram is located, not recalled");
  }

  // 🔴 THE THREE ARE DISTINCT KNOWLEDGE-WISE AND DISTINCT IDENTITY-WISE. A learner who can place
  // the piston may have no idea where the glow plug is; one shared identity would credit all three
  // the moment any one was answered.
  const identities = new Set(objectives.map((objective) => objective.identityKey));
  assert.equal(identities.size, 3, "the parts share an objective identity — evidence would be laundered between them");

  // Each objective's answer is the label VERBATIM, because that string is what a judge receives as
  // the reference answer and what a correction shows the learner.
  assert.deepEqual(
    objectives.map((objective) => objective.answer).sort(),
    labels.map((label) => label.text).sort(),
  );

  // 🔴 AND THE PROMPT MUST NOT NAME THE PART IT IS COVERING.
  for (const objective of objectives) {
    assert.equal(
      objective.cue.toLowerCase().includes(objective.answer.toLowerCase()),
      false,
      `the cue prints the answer: "${objective.cue}"`,
    );
  }
});

test("🔴 §46.6: the covered part is recoverable from the objective alone, so the screen and the evidence agree", () => {
  // This is what `occlusionFor` in canvas-policy-view.tsx does. If the objective could not say
  // which label it was about, the surface would have to choose — and the learner would be marked
  // on a question the evidence attributes to a different part of the picture.
  const { knowledge } = chain();
  assert.ok(knowledge);
  const objectives = objectivesForKnowledge(knowledge);

  for (const objective of objectives) {
    const wanted = objective.parameters.labelKey;
    assert.ok(wanted, "the objective does not record which part it is about");
    const hidden: FigureLabel | undefined = knowledge.figure?.labels.find(
      (label) => normalizeForIdentity(label.text) === wanted,
    );
    assert.ok(hidden, `no label matches ${wanted} — the screen would cover nothing or the wrong part`);
    assert.equal(hidden.text, objective.answer, "the covered label and the expected answer must be the same part");
    // The position is real and inside the picture, or the cover lands off the diagram.
    assert.ok(hidden.x >= 0 && hidden.x <= 1 && hidden.y >= 0 && hidden.y <= 1);
  }
});

test("🔴 §46.6: evidence needs no new path — a spatial objective is an ordinary LearningObjective", () => {
  // The whole reason this slice does not add an evidence writer: the existing composer, evaluator
  // and `recordEvidence` key off `objective.identityKey`, and these objectives carry one like any
  // other. A separate spatial evidence path would have been a second learner model, which §36
  // forbids for voice and forbids here for the same reason.
  const { knowledge } = chain();
  assert.ok(knowledge);
  const [objective] = objectivesForKnowledge(knowledge);
  assert.ok(objective);
  assert.match(objective.identityKey, /\S/);
  assert.equal(objective.knowledgeIdentityKey, knowledge.identityKey);
  assert.ok(objective.identityVersion > 0);
  assert.match(objective.label, /\S/);
});

test("🔴 §46.6: the figures that are NOT diagrams produce nothing, and that is the common case", () => {
  const entries = parseFigureDescriptions(REPLY, 2);
  assert.ok(entries);
  // The crest: no LABELS line, so no labels, so no knowledge.
  assert.equal(
    figureKnowledge({
      caption: descriptionWithoutLabels(entries[1] ?? ""),
      imageRef: "figure-4.png",
      labels: parseFigureLabels(entries[1] ?? ""),
      provenance: PROVENANCE,
    }),
    null,
  );
  // A single label is an illustration, not spatial knowledge.
  assert.equal(
    figureKnowledge({
      caption: "A photograph of an engine.",
      imageRef: "figure-5.png",
      labels: [{ text: "engine", x: 0.5, y: 0.5 }],
      provenance: PROVENANCE,
    }),
    null,
  );
  // 🔴 AND PROVENANCE IS REQUIRED. An unset provenance is not "unknown", it is a claim whose origin
  // nobody stated — which is what the contract forbids showing a learner.
  assert.equal(
    figureKnowledge({
      caption: "A cylinder.",
      imageRef: "figure-6.png",
      labels: [{ text: "piston", x: 0.4, y: 0.4 }, { text: "valve", x: 0.6, y: 0.2 }],
      provenance: [],
    }),
    null,
  );
});

test("🔴 §46.6: the same diagram met twice is the same knowledge", () => {
  // Content-derived identity is what lets a second canvas recognise a figure the first one taught.
  // Keyed on the parts, not on the prose around them, so two vision passes that word the caption
  // differently still converge.
  const first = figureKnowledge({
    caption: "A cross-section of a cylinder.",
    imageRef: "deck-a/figure-3.png",
    labels: [{ text: "piston", x: 0.5, y: 0.7 }, { text: "glow plug", x: 0.66, y: 0.2 }],
    provenance: PROVENANCE,
  });
  const again = figureKnowledge({
    caption: "A cross-section of a cylinder.",
    // A different file, and different coordinates from a different rendering of the same picture.
    imageRef: "deck-b/img12.png",
    labels: [{ text: "glow plug", x: 0.64, y: 0.22 }, { text: "piston", x: 0.51, y: 0.71 }],
    provenance: PROVENANCE,
  });
  assert.ok(first && again);
  assert.equal(first.identityKey, again.identityKey, "the same diagram met twice must be one knowledge object");
});

test("🔴 adding labelKey did NOT move any existing objective's identity", () => {
  // 🔴 THE RISKIEST LINE IN THIS SLICE. `labelKey` had to enter `objectiveIdentityBasis` so a
  // diagram's parts stop sharing one key. My first version appended `|label=-` unconditionally,
  // which changes the basis STRING — and therefore the hash — for every association and causal
  // objective ever minted. Nothing would have thrown: every row in `learner_evidence` would simply
  // have pointed at an objective that no longer exists, and every learner would silently start
  // again. These are the exact pre-existing bases, asserted literally.
  assert.equal(
    objectiveIdentityBasis({
      capability: "recall",
      knowledgeIdentityKey: "association:v1:abc",
      parameters: { inputRole: "generic", outputRole: "brand" },
    }),
    "objective|association:v1:abc|recall|in=generic,out=brand|dir=-",
    "an association's identity basis changed — every learner's evidence for it is orphaned",
  );
  assert.equal(
    objectiveIdentityBasis({
      capability: "predict",
      knowledgeIdentityKey: "causal:v1:def",
      parameters: { inputRole: "cause", outputRole: "effect" },
    }),
    "objective|causal:v1:def|predict|in=cause,out=effect|dir=-",
    "a causal edge's identity basis changed — every learner's evidence for it is orphaned",
  );
  assert.equal(
    objectiveIdentityBasis({
      capability: "recall",
      knowledgeIdentityKey: "association:v1:ghi",
      parameters: { direction: "left_to_right" },
    }),
    "objective|association:v1:ghi|recall|in=-,out=-|dir=left_to_right",
  );

  // And a spatial one DOES carry its part, or the three labels collapse back into one key.
  assert.equal(
    objectiveIdentityBasis({
      capability: "locate",
      knowledgeIdentityKey: "spatial:v1:jkl",
      parameters: { labelKey: "glow plug" },
    }),
    "objective|spatial:v1:jkl|locate|in=-,out=-|dir=-|label=glow plug",
  );
});
