import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { readDocumentModel, type DocumentModel } from "@nemesis/shared";

import {
  attachFigureAssets,
  figureAssetPath,
  figureBytesTotal,
  figureContentKey,
  figuresWithAssets,
  normalizedFigures,
  readNormalizedFigures,
  storeFigureAssets,
  strippedOfBytes,
  type FigureAssetUploader,
  type NormalizedFigure,
} from "./figure-assets";
import { readPptxSlides } from "./office";
import { parseDocument } from "./parse-document";
import { structureEnvelope } from "./parse-record";
import type { SlideImage } from "./slide-media";

const UID = "11111111-2222-3333-4444-555555555555";

function figure(entry: string, bytes: Uint8Array, mime = "image/png"): NormalizedFigure {
  return { bytes, contentKey: figureContentKey(bytes), entry, height: 20, mime, width: 10 };
}

function slideImage(name: string, mime = "image/png"): SlideImage {
  return { mime, name, recurring: false, slides: [1] };
}

function modelWithFigure(ref: string): DocumentModel {
  return {
    blocks: [
      { figure: { description: "a labelled diagram", ref }, headingPath: [], id: "b0", kind: "figure", text: "", unit: 0 },
      { headingPath: [], id: "b1", kind: "paragraph", text: "prose", unit: 0 },
    ],
    format: "pptx",
    title: "deck",
    units: [{ index: 0, kind: "slide", label: "Slide 1" }],
  } as unknown as DocumentModel;
}

// ── The owner's path rule ───────────────────────────────────────────────────────

test("the learner's id is the first path segment, because RLS decides on the path", () => {
  const path = figureAssetPath(UID, "abc123", "image/png");
  assert.equal(path.split("/")[0], UID, "a bucket policy keyed on the first segment refuses anything else");
  assert.ok(path.endsWith(".png"));
});

test("the path is content-addressed, so the same picture in two decks is one object", () => {
  const a = figureAssetPath(UID, "samehash", "image/png");
  const b = figureAssetPath(UID, "samehash", "image/png");
  assert.equal(a, b);
  assert.notEqual(a, figureAssetPath(UID, "otherhash", "image/png"));
});

test("two learners never share an object path", () => {
  const other = "99999999-2222-3333-4444-555555555555";
  assert.notEqual(figureAssetPath(UID, "same", "image/png"), figureAssetPath(other, "same", "image/png"));
});

// ── Selecting what to store ────────────────────────────────────────────────────

test("figures with identical bytes are stored once", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const figures = normalizedFigures(
    new Map([
      ["ppt/media/image1.png", bytes],
      ["ppt/media/image2.png", new Uint8Array([1, 2, 3, 4])],
    ]),
    [slideImage("ppt/media/image1.png"), slideImage("ppt/media/image2.png")],
  );
  assert.equal(figures.length, 1, "the same diagram under two entry names is one upload");
});

test("a planned figure with no bytes is skipped rather than uploaded empty", () => {
  const figures = normalizedFigures(new Map([["a.png", new Uint8Array()]]), [slideImage("a.png")]);
  assert.equal(figures.length, 0);
});

// ── The bytes/record boundary ──────────────────────────────────────────────────

test("stripping bytes leaves a record with no pixel data in it", () => {
  const assets = strippedOfBytes([figure("a.png", new Uint8Array([9, 9, 9]))], UID);
  const asset = assets.get("a.png");
  assert.ok(asset);
  assert.equal(asset.bytes, 3, "the SIZE survives");
  const serialized = JSON.stringify(asset);
  assert.ok(!serialized.includes("9,9,9"), "the pixels do not");
  assert.ok(serialized.length < 400, "an asset record is a locator, not a payload");
});

test("figures rejected by storage get no path at all", async () => {
  const refusing: FigureAssetUploader = { put: async () => false };
  const stored = await storeFigureAssets(refusing, UID, [figure("a.png", new Uint8Array([1]))]);
  assert.equal(stored.stored, 0);
  assert.equal(stored.failed, 1);
  assert.equal(
    stored.byEntry.size,
    0,
    "🔴 a model that claimed an asset storage refused would 404 on first render",
  );
});

test("an uploader that throws is a failure, not a crash", async () => {
  const throwing: FigureAssetUploader = {
    put: async () => {
      throw new Error("network");
    },
  };
  const stored = await storeFigureAssets(throwing, UID, [figure("a.png", new Uint8Array([1]))]);
  assert.equal(stored.failed, 1);
  assert.equal(stored.stored, 0);
});

test("a partial upload records exactly the figures that landed", async () => {
  const good = figure("good.png", new Uint8Array([1, 2]));
  const bad = figure("bad.png", new Uint8Array([3, 4]));
  // Steered on the bytes, not the path: paths are content hashes, so there is no
  // readable name in them to match on.
  const byOutcome: FigureAssetUploader = { put: async (_path, bytes) => bytes[0] === 1 };
  const stored = await storeFigureAssets(byOutcome, UID, [good, bad]);
  assert.equal(stored.stored, 1);
  assert.equal(stored.failed, 1);
  assert.ok(stored.byEntry.has("good.png"));
  assert.ok(!stored.byEntry.has("bad.png"));
});

// ── Attaching to a model ───────────────────────────────────────────────────────

test("an asset attaches to the figure whose ref names it", () => {
  const model = modelWithFigure("ppt/media/image3.png");
  const assets = strippedOfBytes([figure("ppt/media/image3.png", new Uint8Array([7]))], UID);
  const attached = attachFigureAssets(model, assets);
  assert.equal(attached.blocks[0]?.figure?.asset?.path, assets.get("ppt/media/image3.png")?.path);
  assert.equal(figuresWithAssets(attached), 1);
});

test("a figure with no stored asset stays absent rather than getting a guessed path", () => {
  const model = modelWithFigure("ppt/media/missing.png");
  const attached = attachFigureAssets(model, strippedOfBytes([figure("other.png", new Uint8Array([7]))], UID));
  assert.equal(attached.blocks[0]?.figure?.asset, undefined, "absent means the pixels were not kept");
  assert.equal(figuresWithAssets(attached), 0);
});

test("attaching does not mutate the model it was given", () => {
  const model = modelWithFigure("a.png");
  attachFigureAssets(model, strippedOfBytes([figure("a.png", new Uint8Array([1]))], UID));
  assert.equal(model.blocks[0]?.figure?.asset, undefined, "the caller's copy is the one already measured");
});

test("non-figure blocks are untouched", () => {
  const model = modelWithFigure("a.png");
  const attached = attachFigureAssets(model, strippedOfBytes([figure("a.png", new Uint8Array([1]))], UID));
  assert.equal(attached.blocks[1]?.text, "prose");
  assert.equal((attached.blocks[1] as { figure?: unknown }).figure, undefined);
});

// ── The thread boundary ────────────────────────────────────────────────────────

test("garbage from postMessage is dropped, never uploaded", () => {
  assert.deepEqual(readNormalizedFigures(undefined), []);
  assert.deepEqual(readNormalizedFigures("figures"), []);
  assert.deepEqual(readNormalizedFigures([null, 3, {}]), []);
  assert.deepEqual(
    readNormalizedFigures([{ bytes: new Uint8Array(), contentKey: "k", entry: "a", mime: "image/png" }]),
    [],
    "an empty picture is not a picture",
  );
  assert.deepEqual(
    readNormalizedFigures([{ bytes: new Uint8Array([1]), contentKey: "k", entry: "a" }]),
    [],
    "no mime means nothing can serve it",
  );
});

test("a well-formed figure survives the boundary intact", () => {
  const sent = [figure("a.png", new Uint8Array([1, 2, 3]))];
  const received = readNormalizedFigures(sent as unknown);
  assert.equal(received.length, 1);
  assert.equal(received[0]?.entry, "a.png");
  assert.equal(received[0]?.bytes.byteLength, 3);
  assert.equal(figureBytesTotal(received), 3);
});

// ── 🔴 THE ROUND TRIP. Six structural fields have died exactly here. ────────────

test("an asset survives the model → JSON → readDocumentModel boundary", () => {
  const attached = attachFigureAssets(
    modelWithFigure("ppt/media/image3.png"),
    strippedOfBytes([figure("ppt/media/image3.png", new Uint8Array([7, 7]))], UID),
  );
  const reread = readDocumentModel(JSON.parse(JSON.stringify(attached)));
  assert.ok(reread, "the model must still validate");
  const asset = reread.blocks[0]?.figure?.asset;
  assert.ok(asset, "🔴 the asset must survive storage and re-reading, or nothing can render a figure");
  assert.equal(asset.path, `${UID}/figures/${figureContentKey(new Uint8Array([7, 7]))}.png`);
  assert.equal(asset.mime, "image/png");
  assert.equal(asset.bytes, 2);
});

test("the stored envelope carries no pixels", () => {
  const attached = attachFigureAssets(
    modelWithFigure("a.png"),
    strippedOfBytes([figure("a.png", new Uint8Array(50_000).fill(3))], UID),
  );
  const envelope = JSON.stringify(structureEnvelope({ model: attached, text: "prose", title: "deck" }));
  assert.ok(
    envelope.length < 4_000,
    `🔴 a 50 KB picture must not reach the parsed-document row; envelope was ${envelope.length} bytes`,
  );
});

// ── Against the real lecture, when it is present ───────────────────────────────

const DECK = "/Users/axelgalvez/Downloads/03. Innate host defenses.pptx";

test("the real 124 MB deck: every stored figure joins to a figure block", { skip: !existsSync(DECK) }, async () => {
  const bytes = new Uint8Array(readFileSync(DECK));
  const deck = readPptxSlides(bytes);
  const figures = normalizedFigures(deck.imageBytes, deck.media.images);
  assert.ok(figures.length > 20, `expected the deck's figures, got ${figures.length}`);

  const outcome = await parseDocument(
    bytes,
    "03. Innate host defenses.pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  assert.ok(outcome.ok, "the deck parses");
  assert.ok(outcome.document.model, "and produces a model");

  const attached = attachFigureAssets(outcome.document.model, strippedOfBytes(figures, UID));
  const withAssets = figuresWithAssets(attached);
  assert.ok(
    withAssets > 0,
    "🔴 THE JOIN KEY. `NormalizedFigure.entry` and `DocFigure.ref` must be the same string; " +
      "if they drift, every figure stores fine and none of them is reachable.",
  );

  const reread = readDocumentModel(JSON.parse(JSON.stringify(attached)));
  assert.ok(reread);
  assert.equal(figuresWithAssets(reread), withAssets, "and they all survive being stored and read back");
});
