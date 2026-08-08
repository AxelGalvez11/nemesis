/**
 * The join between Docling's figures and our pixels, tested on hand-built models.
 *
 * 🔴 THE CASE THAT MATTERS IS THE SWAP, NOT THE MATCH. A missed figure costs a
 * description; a swapped figure produces a confident paragraph about the wrong
 * picture, and nothing downstream can tell it is wrong. So two adjacent figures
 * that must keep their own partners is the test this file exists for — the
 * exact-overlap case is only there to prove the machinery runs at all.
 *
 * Everything here is constructed geometry. No pdf.js, no corpus, no fixtures:
 * the corpus measurement lives in `scripts/bakeoff-figure-match.mts`, and a unit
 * test that needed a real PDF could not state its own expected answer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { DocBlock, DocRect, DocumentModel } from "@nemesis/shared";

import { containment, matchFigureImages, MIN_CONTAINMENT } from "./figure-match";
import type { CapturedFigure } from "./structure";

function rect(x: number, y: number, width: number, height: number): DocRect {
  return { height, width, x, y };
}

/**
 * Areas are products of fractions, so `containment` lands a few ULPs either side
 * of a round number — a perfectly contained rect measured 1.0000000000000018.
 * Asserting exact equality would be testing IEEE 754, not the geometry.
 */
function approx(actual: number, expected: number, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    message ?? `expected ~${expected}, got ${actual}`,
  );
}

/** One figure block. `rect: null` models a figure the reader could not place. */
function figure(unit: number, ref: string, box: DocRect | null): DocBlock {
  return {
    figure: { ref },
    headingPath: [],
    id: `${unit}-${ref}`,
    kind: "figure",
    text: "",
    unit,
    ...(box ? { rect: box } : {}),
  } as DocBlock;
}

function model(blocks: DocBlock[]): DocumentModel {
  const units = [...new Set(blocks.map((b) => b.unit))].sort((a, b) => a - b);
  return {
    blocks,
    format: "pdf",
    units: units.map((index) => ({ index, kind: "page" as const })),
  } as DocumentModel;
}

/** A stand-in for decoded pixels. Identity is all the matcher cares about. */
function pixels(tag: string): CapturedFigure {
  return { height: 10, png: new Uint8Array([tag.charCodeAt(0)]), width: 10 };
}

test("containment: identical rectangles agree completely", () => {
  assert.equal(containment(rect(0.1, 0.1, 0.4, 0.4), rect(0.1, 0.1, 0.4, 0.4)), 1);
});

test("containment: disjoint rectangles score zero", () => {
  assert.equal(containment(rect(0, 0, 0.2, 0.2), rect(0.5, 0.5, 0.2, 0.2)), 0);
  // Touching edges are not overlap.
  assert.equal(containment(rect(0, 0, 0.2, 0.2), rect(0.2, 0, 0.2, 0.2)), 0);
});

test("containment: a zero-area rectangle cannot match anything", () => {
  assert.equal(containment(rect(0.1, 0.1, 0, 0.4), rect(0.1, 0.1, 0.4, 0.4)), 0);
});

test("containment: a caption-extended box still scores 1.0 against the image alone", () => {
  // The reason this is containment-over-the-smaller and not IoU: Docling's box
  // includes a two-line caption, ours is the image draw operation. IoU would
  // score this 0.67 and reject a correct pair at any sensible threshold.
  const doclingWithCaption = rect(0.2, 0.2, 0.6, 0.6);
  const imageOnly = rect(0.2, 0.2, 0.6, 0.4);
  approx(containment(doclingWithCaption, imageOnly), 1);
  assert.ok(containment(doclingWithCaption, imageOnly) >= MIN_CONTAINMENT);
});

test("containment: is scale-blind, so a tiny rect inside a big one scores 1.0", () => {
  // 🔴 PINNED DELIBERATELY. This is the metric's one sharp edge: a decorative
  // icon drawn inside a large picture box is a PERFECT score. Any guard added
  // against that has to be an area test, because no threshold can see it.
  const big = rect(0.1, 0.1, 0.8, 0.8);
  const icon = rect(0.4, 0.4, 0.02, 0.02);
  approx(containment(big, icon), 1);
  // 1,600x the area difference and the score cannot tell. Stated as an
  // assertion so the blind spot is impossible to remove by accident.
  assert.ok((icon.width * icon.height) / (big.width * big.height) < 0.001);
});

test("containment: partial overlap is measured against the smaller area", () => {
  // Overlap 0.1 x 0.2 = 0.02; smaller area is 0.2 x 0.2 = 0.04.
  approx(containment(rect(0, 0, 0.3, 0.2), rect(0.2, 0, 0.2, 0.2)), 0.5);
});

test("matchFigureImages: an exactly overlapping figure gets its pixels", () => {
  const target = model([figure(0, "d1", rect(0.1, 0.1, 0.5, 0.5))]);
  const source = model([figure(0, "p1", rect(0.1, 0.1, 0.5, 0.5))]);
  const images = new Map([["0:p1", pixels("a")]]);

  const { images: out, report } = matchFigureImages(target, source, images);
  assert.equal(out.size, 1);
  assert.equal(out.get("0:d1"), images.get("0:p1"));
  assert.deepEqual(report, {
    matched: 1,
    targetFigures: 1,
    unmatched: 0,
    unusedSources: 0,
    withoutRect: 0,
  });
});

test("matchFigureImages: two adjacent figures keep their own partners", () => {
  // 🔴 THE SWAP TEST. Both Docling boxes are caption-extended downward, so the
  // upper box overlaps the LOWER image as well as its own. Document order alone
  // would hand the first target whatever it touched first; best-first must give
  // each target the image it actually contains.
  const target = model([
    figure(0, "top", rect(0.1, 0.05, 0.8, 0.4)), // image at 0.05-0.35, caption to 0.45
    figure(0, "bottom", rect(0.1, 0.5, 0.8, 0.4)), // image at 0.5-0.8, caption to 0.9
  ]);
  const source = model([
    figure(0, "imgTop", rect(0.1, 0.05, 0.8, 0.3)),
    figure(0, "imgBottom", rect(0.1, 0.5, 0.8, 0.3)),
  ]);
  const images = new Map([
    ["0:imgTop", pixels("t")],
    ["0:imgBottom", pixels("b")],
  ]);

  const { images: out, report } = matchFigureImages(target, source, images);
  assert.equal(out.get("0:top"), images.get("0:imgTop"));
  assert.equal(out.get("0:bottom"), images.get("0:imgBottom"));
  assert.equal(report.matched, 2);
  assert.equal(report.unusedSources, 0);
});

test("matchFigureImages: one image cannot be handed to two figures", () => {
  // Two Docling boxes over a single captured image. Whichever wins, the other
  // must stay unmatched rather than share — a shared image is two descriptions
  // of one picture, one of which is a lie about the other figure.
  const target = model([
    figure(0, "a", rect(0.1, 0.1, 0.5, 0.5)),
    figure(0, "b", rect(0.12, 0.12, 0.5, 0.5)),
  ]);
  const source = model([figure(0, "only", rect(0.1, 0.1, 0.5, 0.5))]);
  const images = new Map([["0:only", pixels("o")]]);

  const { images: out, report } = matchFigureImages(target, source, images);
  assert.equal(out.size, 1);
  assert.equal(out.get("0:a"), images.get("0:only"));
  assert.equal(report.matched, 1);
  assert.equal(report.unmatched, 1);
  assert.equal(report.unusedSources, 0);
});

test("matchFigureImages: a figure with no rectangle is counted, never matched", () => {
  const target = model([figure(0, "placed", rect(0.1, 0.1, 0.5, 0.5)), figure(0, "loose", null)]);
  const source = model([figure(0, "p", rect(0.1, 0.1, 0.5, 0.5))]);
  const images = new Map([["0:p", pixels("p")]]);

  const { images: out, report } = matchFigureImages(target, source, images);
  assert.equal(out.size, 1);
  assert.equal(out.has("0:loose"), false);
  assert.equal(report.withoutRect, 1);
  assert.equal(report.targetFigures, 2);
  assert.equal(report.unmatched, 1);
});

test("matchFigureImages: a source with no captured pixels is not a candidate", () => {
  // Our reader placed a figure here but never decoded it — matching to it would
  // consume the target and produce a key with nothing behind it.
  const target = model([figure(0, "d", rect(0.1, 0.1, 0.5, 0.5))]);
  const source = model([figure(0, "p", rect(0.1, 0.1, 0.5, 0.5))]);

  const { images: out, report } = matchFigureImages(target, source, new Map());
  assert.equal(out.size, 0);
  assert.equal(report.matched, 0);
  assert.equal(report.unmatched, 1);
  assert.equal(report.unusedSources, 0);
});

test("matchFigureImages: identical geometry on different pages never matches", () => {
  // A template page repeats its layout. Agreement across pages is a coincidence.
  const target = model([figure(3, "d", rect(0.1, 0.1, 0.5, 0.5))]);
  const source = model([figure(4, "p", rect(0.1, 0.1, 0.5, 0.5))]);
  const images = new Map([["4:p", pixels("x")]]);

  const { images: out, report } = matchFigureImages(target, source, images);
  assert.equal(out.size, 0);
  assert.equal(report.unmatched, 1);
  assert.equal(report.unusedSources, 1);
});

test("matchFigureImages: overlap below the threshold is refused, not weakened", () => {
  // 25% of the smaller rect. Below the floor it must stay unmatched; raising the
  // floor above it must not suddenly find a match.
  const target = model([figure(0, "d", rect(0, 0, 0.4, 0.4))]);
  const source = model([figure(0, "p", rect(0.3, 0.3, 0.4, 0.4))]);
  const images = new Map([["0:p", pixels("q")]]);

  const strict = matchFigureImages(target, source, images);
  assert.equal(strict.images.size, 0);
  assert.equal(strict.report.unusedSources, 1);

  const loose = matchFigureImages(target, source, images, { minContainment: 0.05 });
  assert.equal(loose.images.size, 1);
});

test("matchFigureImages: the threshold boundary is inclusive", () => {
  const targetRect = rect(0, 0, 0.4, 0.2);
  const sourceRect = rect(0.2, 0, 0.4, 0.2);
  const target = model([figure(0, "d", targetRect)]);
  const source = model([figure(0, "p", sourceRect)]);
  const images = new Map([["0:p", pixels("e")]]);

  // Derived from the measured score rather than written as a literal: pinning
  // "0.5 matches at 0.5" to a hard-coded number makes the test pass or fail on
  // the last bit of a float, which is not the behaviour under test.
  const score = containment(targetRect, sourceRect);
  approx(score, 0.5);
  assert.equal(matchFigureImages(target, source, images, { minContainment: score }).images.size, 1);
  assert.equal(
    matchFigureImages(target, source, images, { minContainment: score + 1e-6 }).images.size,
    0,
  );
});

test("matchFigureImages: one image drawn twice on a page can serve two figures", () => {
  // Two blocks, one `unit:ref` key: the same XObject painted in two places, which
  // a 2x2 slide grid does routinely. Both regions genuinely hold that image, so
  // handing it to both is correct — deduplicating by key would leave the second
  // region unexamined for no reason.
  const target = model([
    figure(0, "left", rect(0.05, 0.2, 0.4, 0.3)),
    figure(0, "right", rect(0.55, 0.2, 0.4, 0.3)),
  ]);
  const source = model([
    figure(0, "shared", rect(0.05, 0.2, 0.4, 0.3)),
    figure(0, "shared", rect(0.55, 0.2, 0.4, 0.3)),
  ]);
  const images = new Map([["0:shared", pixels("s")]]);

  const { images: out } = matchFigureImages(target, source, images);
  assert.equal(out.size, 2);
  assert.equal(out.get("0:left"), images.get("0:shared"));
  assert.equal(out.get("0:right"), images.get("0:shared"));
});

test("matchFigureImages: a cluster inside one box ties, and the loser's pixels are dropped", () => {
  // 🔴 THE MEASURED FAILURE, IN MINIATURE. Docling calls a region one picture;
  // our reader drew three separate images inside it. All three are FULLY
  // contained, so all three score exactly 1.00 and the threshold cannot rank
  // them. One arbitrary winner is described as if it were the whole figure and
  // the other two are discarded. Asserted so the hazard is visible in a test
  // rather than only in a corpus report.
  const box = rect(0.1, 0.1, 0.8, 0.8);
  const target = model([figure(0, "region", box)]);
  const source = model([
    figure(0, "a", rect(0.15, 0.15, 0.2, 0.2)),
    figure(0, "b", rect(0.4, 0.15, 0.2, 0.2)),
    figure(0, "c", rect(0.65, 0.15, 0.2, 0.2)),
  ]);
  const images = new Map([
    ["0:a", pixels("a")],
    ["0:b", pixels("b")],
    ["0:c", pixels("c")],
  ]);

  for (const ref of ["a", "b", "c"]) {
    const candidate = source.blocks.find((block) => block.figure?.ref === ref)!;
    approx(containment(box, candidate.rect!), 1, `${ref} should be fully contained`);
  }

  const { images: out, report } = matchFigureImages(target, source, images);
  assert.equal(out.size, 1, "exactly one of three equally-contained images is chosen");
  assert.equal(report.unusedSources, 2, "the other two are dropped, not reported as a conflict");
  // Nothing in the result says the choice was a coin flip between three.
  assert.ok(["0:a", "0:b", "0:c"].some((key) => out.get("0:region") === images.get(key)));
});

test("matchFigureImages: an empty target is a clean no-op", () => {
  const source = model([figure(0, "p", rect(0.1, 0.1, 0.5, 0.5))]);
  const { images: out, report } = matchFigureImages(model([]), source, new Map([["0:p", pixels("z")]]));
  assert.equal(out.size, 0);
  assert.deepEqual(report, {
    matched: 0,
    targetFigures: 0,
    unmatched: 0,
    unusedSources: 1,
    withoutRect: 0,
  });
});
