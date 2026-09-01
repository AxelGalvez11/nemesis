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
import { readFileSync } from "node:fs";
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

/**
 * 🔴 WORD, WHICH KNEW EVERY PICTURE'S NAME AND NEVER FETCHED ONE. `extractDocxStructure` reads
 * `word/_rels/document.xml.rels`, so each figure block already carried its part —
 * `word/media/image3.png` — and then the zip was discarded. Measured on the owner's corpus: 207
 * placed pictures across 46 real course files, every one named in the model and invisible.
 *
 * The three assertions are the three ways this goes wrong: nothing comes back, the wrong things
 * come back (header crests and numbering bullets live in the same folder), or what comes back
 * cannot be joined to the figure it belongs to.
 */
test("🔴 a Word document hands over the pictures it places, and only those", async () => {
  const { readFileSync } = await import("node:fs");
  const { readDocxDocument } = await import("./office");
  const { attachFigureAssets, figureAssetPath, figuresWithAssets } = await import("./figure-assets");
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/office/figure-report.docx", import.meta.url)));

  const { figures, model } = readDocxDocument(bytes);
  assert.ok(figures.length > 0, "a Word document named its pictures and fetched none of them");

  // 🔴 EXACTLY THE PLACED SET. `word/media/` also holds header crests, footer rules and numbering
  // bullets. Storing those costs money per document and shows the learner a school logo when they
  // asked for a diagram, so the media is filtered by the refs the MODEL carries.
  const placed = new Set(model.blocks.map((b) => b.figure?.ref).filter(Boolean));
  for (const figure of figures) {
    assert.ok(placed.has(figure.entry), `${figure.entry} is stored but nothing in the body places it`);
    assert.ok(figure.bytes.byteLength > 0, `${figure.entry} was stored empty`);
    assert.ok(figure.mime.startsWith("image/"), `${figure.entry} has no readable mime`);
  }

  // The join, which is the half that silently goes wrong: a stored picture nothing points at is
  // indistinguishable from no picture at all.
  const attached = attachFigureAssets(model, new Map(figures.map((f) => [f.entry, {
    bytes: f.bytes.byteLength, contentKey: f.contentKey, mime: f.mime,
    path: figureAssetPath("uid", f.contentKey, f.mime),
  }])));
  assert.equal(figuresWithAssets(attached), figures.length, "a stored Word picture reached no figure block");
});

/**
 * 🔴 THE VENDOR LANE, WHICH WAS THE LAST ONE STILL DROPPING PIXELS. A vendor returns a figure's
 * COORDINATES and refuses its bytes, so `parseWithVendor` renders the figures itself from the
 * original file — it is the only thing in the whole process that ever decodes a vendor-parsed
 * PDF's diagrams. It used them to describe the figures and then dropped them.
 *
 * Measured on the owner's library, 2026-08-31: after the native lane learned to keep its pictures,
 * `PHCY_1202_..._pharmacokinetics_part_1.pdf` was the ONLY file still at zero showable figures out
 * of 27 — because it is Mistral-parsed. One lane fixed and one not is what makes a feature look
 * unreliable rather than absent.
 */
test("🔴 a vendor-parsed PDF keeps the pixels the vendor made us decode ourselves", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseWithVendor } = await import("./parse-document");
  const { attachFigureAssets, figureAssetPath, figuresWithAssets } = await import("./figure-assets");
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/embedded-raster.pdf", import.meta.url)));

  // A stub vendor, so this proves the LANE keeps its figures rather than proving a network works.
  const outcome = await parseWithVendor(
    bytes, "lecture.pdf", "application/pdf", "pdf",
    { lookAtFigures: true },
    {
      readWithLlama: async () => ({ durationMs: 1, ok: false, reason: "not-configured" }) as never,
      readWithMistral: async () => ({
        durationMs: 1,
        ok: true,
        response: {
          model: "mistral-ocr-latest",
          // 🔴 THE FIGURE HAS TO COME BACK, OR THE FIGURE-LOSS GATE REJECTS THE READ AND THIS TEST
          // PROVES NOTHING. Calibrated: with `images: []` the stub is refused outright
          // (`vendor_quality_rejected`, missing: "figures"), which is the gate working correctly —
          // a vendor read that dropped the page's only diagram must never be accepted. The box
          // below is the fixture's real one: `readPdfStructure` puts its figure at x 0.098,
          // y 0.141, w 0.327, h 0.253 of a 612x792 page, which is exactly (60,112)-(260,312).
          //
          // 🔴 AND THE MARKDOWN DELIBERATELY DOES NOT REFERENCE THE IMAGE. Adding `![img-0](img-0)`
          // makes this test fail, and the cause is a real defect elsewhere rather than anything
          // about figure storage: a markdown-named image is skipped by `locatedFigures`, so its
          // figure block comes from the markdown parse and carries NO rect, and the geometric
          // accounting then reports the painted region as never having arrived. That read falls
          // back to the native lane, so nothing is lost — but the vendor read that was paid for is
          // discarded. Tracked separately; do not "fix" it by weakening the gate.
          pages: [{
            dimensions: { dpi: 72, height: 792, width: 612 },
            images: [{ bottom_right_x: 260, bottom_right_y: 312, id: "img-0", top_left_x: 60, top_left_y: 112 }],
            index: 0,
            markdown: "# Bending stress\n\nStress varies across the depth of the section.",
          }],
          usage_info: { pages_processed: 1 },
        },
      }) as never,
    },
  );

  assert.ok(outcome, "the stubbed vendor read was rejected outright");
  const kept = ((outcome as { figures?: { entry: string; contentKey: string; mime: string }[] }).figures ?? []);
  assert.ok(kept.length > 0, "the vendor lane decoded the figures to describe them and then threw the pixels away");

  // 🔴🔴 AND THE PIXELS MUST BE JOINABLE TO THE MODEL THAT GETS STORED, WHICH IS THE HALF THAT
  // SHIPPED BROKEN. Returning the figures is not the feature; pointing the document at them is.
  // The pixels are named by OUR structural read (`0:img_p0_1`) and the stored model is the
  // VENDOR'S (`img-0`, or no name at all), so a ref join silently matches nothing. Verified on
  // production 2026-09-01: the first version of this stored 14 objects for the owner's
  // pharmacokinetics lecture and left it at 0 showable figures out of 27 — pictures in the bucket
  // that no document pointed at, which looks exactly like storing nothing.
  const stored = (outcome as { document: { model?: import("@nemesis/shared").DocumentModel } }).document.model;
  assert.ok(stored, "the vendor read produced no model to attach anything to");
  const attached = attachFigureAssets(stored!, new Map(kept.map((f) => [f.entry, {
    bytes: 1, contentKey: f.contentKey, mime: f.mime,
    path: figureAssetPath("uid", f.contentKey, f.mime),
  }])));
  assert.equal(
    figuresWithAssets(attached),
    kept.length,
    "the stored pixels reached no figure in the vendor's model — stored, and unreachable",
  );
});

test("🔴 vision and the asset join use ONE pairing, and a nameless vendor figure still gets both", () => {
  // 🔴 TWO PAIRINGS OF THE SAME TWO MODELS CAN DISAGREE, AND THE FAILURE IS THE WORST KIND. A
  // figure would be DESCRIBED as one picture and SHOW another — confidently, with a citation.
  // That is worse than showing no picture at all, and nothing downstream could detect it.
  //
  // A second geometric matcher was written for the asset join and deleted in favour of the one the
  // vision pass already computes (`matchFigureImages`, whose output is keyed by the TARGET model's
  // figures — exactly what an asset join needs). This asserts the duplicate has not come back.
  const source = readFileSync(new URL("./parse-document.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /figure-alignment|alignFiguresToModel/, "a second figure matcher is back");
  assert.match(source, /capturedFigures\(matchedFigures\)/, "the asset join stopped reusing the vision pairing");

  // 🔴 AND REFS ARE MINTED BEFORE EITHER PASS. `placedFigures` skips a figure block with no ref, so
  // an unnamed vendor figure can be paired with nothing — and `figure-look` then reports it as
  // `skipped: "unsupported"`, which reads as "a format we cannot open" when the truth is that we
  // had nothing to look it up by. Mistral names an image only when its markdown references it.
  assert.match(source, /withFigureRefs\(modelFromMistral/, "Mistral figures can arrive nameless");
  assert.match(source, /withFigureRefs\(modelFromLlama/, "LlamaParse figures can arrive nameless");
});
