// The chain that has to hold for a learner to ever SEE a diagram:
//
//   DocFigure.asset  →  SourceContext figure unit  →  FigureKnowledge.assetPath  →  signed URL
//
// Every hop here has killed a field before. The model boundary keeps blocks intact but
// rebuilds units by name; `source-context` copies figure fields one at a time; extraction
// reads only what it names. A break at any hop is silent — the diagram is simply never
// asked about, and no test that looks at counts would notice.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readDocumentModel, type DocumentModel } from "@nemesis/shared";

import { sourceContextFromModel } from "@/lib/sources/source-context";

import { needsSigning } from "./figure-asset-url";
import { figureKnowledge } from "./figure-knowledge";
import { knowledgeIdentityKey } from "./knowledge-identity";

const LABELS = [
  { text: "nucleus", x: 0.3, y: 0.4 },
  { text: "membrane", x: 0.7, y: 0.6 },
] as const;

const ASSET = {
  bytes: 2048,
  contentKey: "deadbeefdeadbeefdeadbeefdeadbeef",
  height: 480,
  mime: "image/png",
  path: "11111111-2222-3333-4444-555555555555/figures/deadbeefdeadbeefdeadbeefdeadbeef.png",
  width: 640,
};

function modelWithFigure(asset: typeof ASSET | undefined): DocumentModel {
  return {
    blocks: [
      {
        figure: {
          description: "A cell in cross-section. nucleus, membrane",
          labels: LABELS,
          ref: "ppt/media/image3.png",
          ...(asset ? { asset } : {}),
        },
        headingPath: [],
        id: "b0",
        kind: "figure",
        text: "Figure 1",
        unit: 0,
      },
      { headingPath: [], id: "b1", kind: "paragraph", text: "Cells have parts.", unit: 0 },
    ],
    format: "pptx",
    title: "Cell biology",
    units: [{ index: 0, kind: "slide", label: "Slide 1" }],
  } as unknown as DocumentModel;
}

// ── Hop 1: the model boundary ──────────────────────────────────────────────────

test("an asset survives being stored and read back as a model", () => {
  const reread = readDocumentModel(JSON.parse(JSON.stringify(modelWithFigure(ASSET))));
  assert.ok(reread);
  assert.equal(reread.blocks[0]?.figure?.asset?.path, ASSET.path);
});

// ── Hop 2: model → SourceContext ───────────────────────────────────────────────

test("the figure unit carries the asset out of the model", () => {
  const context = sourceContextFromModel({ model: modelWithFigure(ASSET), sourceId: "s1", sourceKind: "pptx" });
  const figureUnit = context.units.find((unit) => unit.type === "figure");
  assert.ok(figureUnit, "the model has a figure block, so the context must have a figure unit");
  assert.equal(
    figureUnit.figure?.asset?.path,
    ASSET.path,
    "🔴 dropped here and #619 stores megabytes per deck that no learner ever sees",
  );
  assert.equal(figureUnit.figure?.asset?.mime, "image/png");
  assert.equal(figureUnit.figure?.asset?.width, 640);
});

test("a figure parsed before assets existed reports no asset, not a guessed one", () => {
  const context = sourceContextFromModel({ model: modelWithFigure(undefined), sourceId: "s1", sourceKind: "pptx" });
  const figureUnit = context.units.find((unit) => unit.type === "figure");
  assert.ok(figureUnit);
  assert.equal(figureUnit.figure?.asset, undefined);
  assert.equal(figureUnit.figure?.ref, "ppt/media/image3.png", "the parser's own name still identifies it");
});

// ── Hop 3: knowledge ───────────────────────────────────────────────────────────

test("knowledge carries where the picture is stored", () => {
  const object = figureKnowledge({
    assetPath: ASSET.path,
    caption: "A cell in cross-section",
    imageRef: "ppt/media/image3.png",
    labels: [...LABELS],
    provenance: ["model"],
  });
  assert.ok(object);
  assert.equal(object.figure?.assetPath, ASSET.path);
  assert.equal(object.figure?.imageRef, "ppt/media/image3.png", "and still says WHICH figure it is");
});

test("knowledge without a stored picture has no assetPath rather than an empty one", () => {
  const object = figureKnowledge({
    caption: "A cell in cross-section",
    imageRef: "ppt/media/image3.png",
    labels: [...LABELS],
    provenance: ["model"],
  });
  assert.ok(object);
  assert.equal(object.figure?.assetPath, undefined, "absent means there are no pixels — never an empty string");
});

// ── 🔴 THE ONE THAT PROTECTS EVERY SPATIAL RECORD ALREADY WRITTEN ──────────────

test("adding an asset does NOT change knowledge identity", () => {
  const withAsset = figureKnowledge({
    assetPath: ASSET.path,
    caption: "A cell in cross-section",
    imageRef: "ppt/media/image3.png",
    labels: [...LABELS],
    provenance: ["model"],
  });
  const without = figureKnowledge({
    caption: "A cell in cross-section",
    imageRef: "ppt/media/image3.png",
    labels: [...LABELS],
    provenance: ["model"],
  });
  assert.ok(withAsset && without);
  assert.equal(
    withAsset.identityKey,
    without.identityKey,
    "🔴 IDENTITY IS THE STATEMENT, NOT THE STORAGE. If a stored path entered the hash, every " +
      "spatial objective ever minted would re-key the moment its deck was reparsed with assets, " +
      "orphaning the learner's evidence for a diagram they had already demonstrated.",
  );
  assert.equal(
    withAsset.identityKey,
    knowledgeIdentityKey({ statement: withAsset.statement, type: "spatial" }),
    "and it is still derived from exactly type + statement",
  );
});

test("the same diagram stored under two different paths is the same knowledge", () => {
  const a = figureKnowledge({
    assetPath: "userA/figures/aaa.png",
    caption: "A cell in cross-section",
    imageRef: "ppt/media/image3.png",
    labels: [...LABELS],
    provenance: ["model"],
  });
  const b = figureKnowledge({
    assetPath: "userB/figures/bbb.png",
    caption: "A cell in cross-section",
    imageRef: "xl/media/image9.png",
    labels: [...LABELS],
    provenance: ["model"],
  });
  assert.equal(a?.identityKey, b?.identityKey, "two learners meeting one diagram hold one piece of knowledge");
});

// ── Hop 4: the thing that must be signed ───────────────────────────────────────

test("a stored path is recognised as needing signing, a real URL is not", () => {
  assert.equal(needsSigning(ASSET.path), true);
  assert.equal(needsSigning("ppt/media/image3.png"), true, "a parser key is not loadable either");
  assert.equal(needsSigning("https://example.test/a.png"), false);
  assert.equal(needsSigning("data:image/png;base64,AAAA"), false);
  assert.equal(needsSigning("blob:https://example.test/x"), false);
});

// ── 🔴 THE REGRESSION GUARD. This exact line rendered a broken image. ──────────

test("the spatial screen never hands a parser figure key to an image element", () => {
  const view = readFileSync(
    new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    !/src=\{[^}]*\bimageRef\b/.test(view),
    "🔴 `imageRef` is `ppt/media/image3.png` — relative to the page, so the browser requests a " +
      "path this application has never served and the learner answers next to a broken image.",
  );
  assert.ok(
    /path=\{[^}]*assetPath/.test(view),
    "the diagram must be located by its stored asset path",
  );
  assert.ok(
    /if \(!figure\.assetPath\) return null;/.test(view),
    "and a figure with no stored picture must host no visual interaction at all",
  );
});
