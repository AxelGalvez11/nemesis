/**
 * The accounting that decides whether a vendor read lost a picture.
 *
 * 🔴 THE FIRST TEST IS THE ONE THAT MATTERS, AND IT IS THE ONE THE OBVIOUS IMPLEMENTATION FAILS.
 * `figure-match.ts` already has a rectangle-agreement function — `containment` — and reusing it
 * here is the natural move. It divides by the SMALLER rectangle, so one OCR'd axis label inside
 * a diagram scores 1.00 and the diagram is declared accounted for. These tests pin the opposite
 * denominator, which is the whole reason this module is not a call to that one.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, type DocBlock, type DocRect, type DocumentModel } from "@nemesis/shared";

import { accountForFigures, coveredShare } from "./figure-accounting";
import { WORTH_LOOKING_AREA } from "./figure-routing";

const rect = (x: number, y: number, width: number, height: number): DocRect => ({ height, width, x, y });

/** A page-sized figure region: 40% x 40% of the page, comfortably over the worth-looking line. */
const BIG = rect(0.1, 0.1, 0.4, 0.4);

function model(blocks: readonly Omit<DocBlock, "id">[], units = 2): DocumentModel {
  return buildDocument({
    blocks,
    format: "pdf",
    title: null,
    units: Array.from({ length: units }, (_unused, index) => ({ index, kind: "page" as const, label: `${index + 1}` })),
  });
}

const figureBlock = (unit: number, ref: string, at: DocRect): Omit<DocBlock, "id"> => ({
  figure: { ref },
  headingPath: [],
  kind: "figure",
  rect: at,
  text: "",
  unit,
});

const textBlock = (unit: number, text: string, at: DocRect, kind: DocBlock["kind"] = "paragraph"): Omit<DocBlock, "id"> => ({
  headingPath: [],
  kind,
  rect: at,
  text,
  unit,
});

test("🔴 a label inside a diagram does not account for the diagram", () => {
  // 2% x 2% of the page, entirely inside a 40% x 40% figure — an axis label vision OCR'd out of
  // a picture. `containment` (the smaller-rectangle denominator) scores this 1.00. The share of
  // the REGION it covers is 0.25%.
  const label = rect(0.2, 0.2, 0.02, 0.02);
  const share = coveredShare(BIG, [label]);
  assert.ok(share < 0.01, `a tiny label must cover a tiny share of the region, got ${share}`);
  assert.ok(share > 0, "but it must still be a non-zero share — something did arrive there");
});

test("coverage is a union, never a sum — overlapping blocks cannot exceed the region", () => {
  const left = rect(0.1, 0.1, 0.3, 0.4);
  const right = rect(0.2, 0.1, 0.3, 0.4);
  // Mistral emits a table and its rows over the same rectangle routinely; adding them would
  // report 175% of this region as covered.
  const share = coveredShare(BIG, [left, right]);
  assert.ok(share <= 1, `a share must never exceed 1, got ${share}`);
  assert.ok(Math.abs(share - 1) < 1e-9, `the two together tile the region exactly, got ${share}`);
});

test("a region with nothing over it is absent, and absent is the only count that means loss", () => {
  const vendor = model([textBlock(0, "a heading somewhere else", rect(0.1, 0.7, 0.5, 0.05))]);
  const source = model([figureBlock(0, "img_p0_1", BIG)]);

  const accounting = accountForFigures(vendor, source);
  assert.equal(accounting.regions.length, 1);
  assert.equal(accounting.absent, 1);
  assert.equal(accounting.asFigure, 0);
  assert.equal(accounting.asContent, 0);
  assert.equal(accounting.regions[0]?.fate, "absent");
});

test("🔴 a table screenshot the vendor read as a table survived as content, not as loss", () => {
  // The measured case: 5 of the 9 large regions in the owner's diabetes lecture are pictures of
  // ADA tables, and Mistral returned them as a caption plus a table over the same rectangle.
  // Counting those as lost figures would reject a read that lost nothing.
  const vendor = model([
    textBlock(0, "Table 2.5—Criteria for screening", rect(0.1, 0.1, 0.4, 0.05), "caption"),
    textBlock(0, "", rect(0.1, 0.15, 0.4, 0.35), "table"),
  ]);
  const source = model([figureBlock(0, "img_p0_1", BIG)]);

  const accounting = accountForFigures(vendor, source);
  assert.equal(accounting.absent, 0, "nothing was lost");
  assert.equal(accounting.asContent, 1);
  assert.equal(accounting.asFigure, 0);
});

test("a region the vendor also calls a figure is accounted for as a figure", () => {
  const vendor = model([figureBlock(0, "img-0.jpeg", rect(0.12, 0.12, 0.35, 0.35))]);
  const source = model([figureBlock(0, "img_p0_1", BIG)]);

  const accounting = accountForFigures(vendor, source);
  assert.equal(accounting.asFigure, 1);
  assert.equal(accounting.absent, 0);
});

test("🔴 same page or nothing — a block on another page accounts for nothing", () => {
  // Without the unit test every large region on a real document finds some overlapping
  // rectangle somewhere in the file, and the accounting reports zero loss unconditionally.
  const vendor = model([textBlock(1, "identical geometry, wrong page", BIG)]);
  const source = model([figureBlock(0, "img_p0_1", BIG)]);

  assert.equal(accountForFigures(vendor, source).absent, 1);
});

test("furniture is not accounted for at all — the 3% line is the existing one", () => {
  // A logo repeated on every slide sits below `WORTH_LOOKING_AREA`, which is why this module
  // needs no repetition heuristic. 1% x 1% of a page is far under it.
  const small = rect(0.02, 0.02, 0.01, 0.01);
  assert.ok(small.width * small.height < WORTH_LOOKING_AREA, "sanity: the fixture really is furniture");

  const vendor = model([textBlock(0, "slide text", rect(0.1, 0.5, 0.5, 0.1))]);
  const source = model([figureBlock(0, "logo", small)]);

  const accounting = accountForFigures(vendor, source);
  assert.equal(accounting.regions.length, 0, "furniture is never a region worth accounting for");
  assert.equal(accounting.absent, 0);
});

test("a figure with no rectangle cannot be accounted for either way", () => {
  // Geometry cannot help a block with no geometry. It must not silently count as lost — that
  // would fail a whole parse on a rectangle we never had.
  const vendor = model([textBlock(0, "text", rect(0.1, 0.5, 0.5, 0.1))]);
  const source = model([{ figure: { ref: "no-rect" }, headingPath: [], kind: "figure", text: "", unit: 0 }]);

  assert.equal(accountForFigures(vendor, source).regions.length, 0);
});
