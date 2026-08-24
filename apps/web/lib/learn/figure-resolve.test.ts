// The figure pass: subjects out, stamped assets back, and a model's own asset never surviving.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a model cannot hand the renderer a URL`. The `asset` field
// is how a resolved figure travels, which makes it the one field a model could use to put an
// arbitrary <img src> into a lesson. The strip has to hold in every branch — resolved, unresolved,
// and not-even-asked.

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyResolvedFigures,
  collectFigureSubjects,
  mightResolveFigure,
  type FigureResolution,
} from "./figure-resolve";
import type { CandidateAsset } from "./visual-provenance";

const CHOSEN: CandidateAsset = {
  assetPath: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Mitosis.png",
  caption: "The stages of mitosis.",
  licence: { attribution: "Ali Zifan", licence: "CC-BY-SA-4.0", source: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/File:Mitosis.png" },
  provenance: "reference_image",
};

const LESSON = {
  blocks: [
    { content: "Mitosis has stages.", type: "paragraph", visual: { kind: "figure", learningGoal: "See the stages", subject: "mitosis stages" } },
    { content: "Unrelated.", type: "paragraph" },
  ],
};

test("the cheap test comes first, so an answer with no figure in it pays nothing", () => {
  assert.equal(mightResolveFigure('{"say":"hello"}'), false);
  assert.equal(mightResolveFigure(JSON.stringify(LESSON)), true);
});

test("subjects are collected in traversal order, bounded, from nested blocks", () => {
  const many = {
    blocks: Array.from({ length: 6 }, (_, index) => ({
      visual: { kind: "figure", subject: `subject ${index}` },
    })),
  };
  assert.deepEqual(collectFigureSubjects(many), ["subject 0", "subject 1", "subject 2", "subject 3"]);
  assert.deepEqual(collectFigureSubjects(LESSON), ["mitosis stages"]);
});

test("a resolved subject is stamped with the chosen asset, and nothing else moves", () => {
  const out = applyResolvedFigures(LESSON, [{ asset: CHOSEN, ok: true }]) as typeof LESSON;
  const visual = out.blocks[0]!.visual as Record<string, unknown>;
  assert.deepEqual(visual.asset, CHOSEN);
  assert.equal(visual.subject, "mitosis stages");
  assert.equal(out.blocks[1]!.content, "Unrelated.");
});

test("🔴 a model cannot hand the renderer a URL", () => {
  const smuggled = {
    visual: {
      asset: { assetPath: "https://evil.example/x.png", licence: { licence: "CC-BY-4.0", source: "trust me" }, provenance: "reference_image" },
      kind: "figure",
      subject: "mitosis stages",
    },
  };
  // Resolved: the stamp REPLACES the claim.
  const stamped = applyResolvedFigures(smuggled, [{ asset: CHOSEN, ok: true }]) as typeof smuggled;
  assert.deepEqual(stamped.visual.asset, CHOSEN);
  // Unresolved: the claim is stripped and nothing replaces it.
  const stripped = applyResolvedFigures(smuggled, [{ detail: "nothing", ok: false, reason: "no-candidates" }]) as {
    visual: Record<string, unknown>;
  };
  assert.equal("asset" in stripped.visual, false);
  // Not even asked (no usable subject): still stripped.
  const askless = applyResolvedFigures({ visual: { asset: smuggled.visual.asset, kind: "figure", subject: "" } }, []) as {
    visual: Record<string, unknown>;
  };
  assert.equal("asset" in askless.visual, false);
});

test("an unresolved subject keeps its request and loses only the picture", () => {
  const out = applyResolvedFigures(LESSON, [{ detail: "nothing matched", ok: false, reason: "no-candidates" }]) as typeof LESSON;
  const visual = out.blocks[0]!.visual as Record<string, unknown>;
  assert.equal(visual.kind, "figure");
  assert.equal(visual.subject, "mitosis stages");
  assert.equal("asset" in visual, false);
});

test("results stay in register across a failure in the middle", () => {
  const three = {
    blocks: [
      { visual: { kind: "figure", subject: "one" } },
      { visual: { kind: "figure", subject: "two" } },
      { visual: { kind: "figure", subject: "three" } },
    ],
  };
  const results: FigureResolution[] = [
    { asset: { ...CHOSEN, assetPath: "https://upload.wikimedia.org/one.png" }, ok: true },
    { detail: "nothing", ok: false, reason: "no-candidates" },
    { asset: { ...CHOSEN, assetPath: "https://upload.wikimedia.org/three.png" }, ok: true },
  ];
  const out = applyResolvedFigures(three, results) as typeof three;
  const visuals = out.blocks.map((block) => block.visual as Record<string, unknown>);
  assert.equal((visuals[0]!.asset as CandidateAsset).assetPath, "https://upload.wikimedia.org/one.png");
  assert.equal("asset" in visuals[1]!, false);
  assert.equal((visuals[2]!.asset as CandidateAsset).assetPath, "https://upload.wikimedia.org/three.png");
});
