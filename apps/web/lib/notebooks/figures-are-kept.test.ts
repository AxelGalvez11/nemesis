/**
 * A parse that LOOKED at a picture keeps the picture.
 *
 * 🔴 THE DEFECT THIS EXISTS FOR, MEASURED ON PRODUCTION 2026-08-31: 20 parsed PDFs, 13 images in
 * the whole visual-assets bucket, and **ZERO** stored figures. Not one, ever. The store, the
 * content-addressed paths, the RLS, the signed-URL helper and the join key were all built and
 * correct; only PPTX ever produced a `NormalizedFigure`, and only on the background worker lane.
 * So every PDF and Word lecture in the product could describe its diagrams in words and had no
 * way to show one — which is the whole of "pull images that it has stored into chat".
 *
 * 🔴 WHY NOTHING CAUGHT IT. `figure-assets.test.ts` proves the store works when it is handed
 * figures. The worker route's tests prove it uploads what it is given. Nobody asserted that
 * anything ever HANDS IT ANY. A feature can be complete at every layer and dead end to end, and
 * the missing test is always the one about the seam.
 *
 * So these assertions are about the SEAM: the pixels a parse decoded must leave the parse.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { capturedFigures, figureContentKey } from "./figure-assets";

/** One tiny distinct PNG-ish buffer per call, so content keys differ the way real figures do. */
function pixels(seed: number): Uint8Array {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, seed, seed + 1, seed + 2]);
}

test("🔴 a decoded PDF figure leaves the parse as storable pixels, keyed by its ref", () => {
  const images = new Map([
    ["/Figure0", { height: 240, png: pixels(1), width: 320 }],
    ["/Figure1", { height: 100, png: pixels(9), width: 150 }],
  ]);

  const figures = capturedFigures(images);

  assert.equal(figures.length, 2, "a figure the parser decoded did not survive the parse");
  // 🔴 THE REF IS THE JOIN KEY. `attachFigureAssets` matches these against `DocFigure.ref` to write
  // the asset onto the model. A different string here means the upload succeeds, the object exists,
  // and no figure in the document ever points at it — a picture stored and unreachable.
  assert.deepEqual(figures.map((f) => f.entry), ["/Figure0", "/Figure1"]);
  assert.deepEqual(figures.map((f) => f.mime), ["image/png", "image/png"]);
  assert.deepEqual(figures.map((f) => [f.width, f.height]), [[320, 240], [150, 100]]);
  assert.equal(figures[0]!.contentKey, figureContentKey(pixels(1)));
});

test("🔴 the same diagram on eight slides is stored once", () => {
  // A course template's header, or a diagram the lecturer returns to, appears on many pages. The
  // path is content-addressed, so every repeat is a round trip to write the identical object.
  const repeated = pixels(4);
  const figures = capturedFigures(new Map([
    ["/Figure0", { height: 10, png: repeated, width: 10 }],
    ["/Figure1", { height: 10, png: repeated, width: 10 }],
    ["/Figure2", { height: 10, png: pixels(7), width: 10 }],
  ]));

  assert.equal(figures.length, 2, "an identical picture was uploaded twice");
  assert.deepEqual(figures.map((f) => f.entry), ["/Figure0", "/Figure2"]);
});

test("🔴 an empty decode is dropped rather than stored as a zero-byte picture", () => {
  // Storage accepts a zero-length object without complaint, and every later render shows it as a
  // broken frame. Refusing it here is the difference between "no picture" and "a broken picture".
  const figures = capturedFigures(new Map([
    ["/Figure0", { height: 0, png: new Uint8Array(0), width: 0 }],
    ["/Figure1", { height: 5, png: pixels(2), width: 5 }],
  ]));

  assert.deepEqual(figures.map((f) => f.entry), ["/Figure1"]);
});

test("🔴 a zero dimension is recorded as unknown, never as a real size of zero", () => {
  // `imageSize` and the PDF reader both report 0 when they could not measure. A stored 0×0 would
  // make a renderer reserve no space and a chooser rank the picture as tiny.
  const [figure] = capturedFigures(new Map([["/F", { height: 0, png: pixels(3), width: 0 }]]));
  assert.equal(figure!.width, null);
  assert.equal(figure!.height, null);
});

/**
 * 🔴 THE SEAM ITSELF, ON A REAL FILE. Everything above tests the converter in isolation, and the
 * converter was never the bug — the bug was that nothing called it. This drives `parseDocument`
 * over a PDF that genuinely embeds a raster image and asserts the pixels come back out AND land on
 * the right figure.
 *
 * 🔴 THE FIXTURE IS A NEW ONE, BECAUSE THE TWO THAT EXISTED COULD NOT HAVE CAUGHT THIS.
 * `text-with-figure.pdf` and `image-only-page.pdf` both DRAW their figure with vector operators,
 * so `readPdfStructure` finds a figure block and no decodable image — 1 figure, 0 pixels, on both.
 * A test written against either would have passed against a converter that never ran.
 * `embedded-raster.pdf` carries a real 80x80 DeviceRGB image XObject, above `MIN_FIGURE_PIXELS`.
 *
 * `lookAtFigures` is what turns capture on, and it is true only on the background worker lane (the
 * interactive upload leaves it off, because decoding and describing forty figures inside a request
 * a student is waiting through is the wrong trade). So this also pins WHICH lane keeps pictures.
 */
test("🔴 parsing a real PDF with an embedded picture returns the picture, joined to its figure", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseDocument } = await import("./parse-document");
  const { attachFigureAssets, figureAssetPath, figuresWithAssets } = await import("./figure-assets");
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/embedded-raster.pdf", import.meta.url)));

  const looked = await parseDocument(bytes, "lecture.pdf", "application/pdf", {
    lookAtFigures: true,
    vendorAllowed: false,
  });
  assert.ok(looked.ok || looked.reason === "no-text", `the fixture did not parse: ${JSON.stringify(looked)}`);
  const kept = (looked as { figures?: { entry: string; contentKey: string; mime: string }[] }).figures ?? [];
  assert.equal(kept.length, 1, "a PDF decoded for vision still threw its pixels away");

  // 🔴 THE JOIN, WHICH IS THE HALF THAT SILENTLY GOES WRONG. Storing a picture nothing points at
  // is indistinguishable from storing nothing: the bucket fills up and every figure still renders
  // empty. `figureImages` is keyed `unit:ref` because a PDF's XObject names are per-page, so a
  // converter that flattened the key would attach page 1's diagram to page 5's figure.
  const document = (looked as { document: { model?: import("@nemesis/shared").DocumentModel } }).document;
  assert.ok(document.model, "no structural model to attach an asset to");
  const attached = attachFigureAssets(document.model!, new Map(kept.map((figure) => [figure.entry, {
    bytes: 1,
    contentKey: figure.contentKey,
    mime: figure.mime,
    path: figureAssetPath("uid", figure.contentKey, figure.mime),
  }])));
  assert.equal(figuresWithAssets(attached), 1, "the stored picture reached no figure in the document");

  const ignored = await parseDocument(bytes, "lecture.pdf", "application/pdf", { vendorAllowed: false });
  assert.ok(ignored.ok || ignored.reason === "no-text");
  assert.equal(
    ((ignored as { figures?: unknown[] }).figures ?? []).length,
    0,
    "the interactive lane decoded figures it was told not to look at",
  );
});
