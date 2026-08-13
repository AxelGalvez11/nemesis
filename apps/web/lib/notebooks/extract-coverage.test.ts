import assert from "node:assert/strict";
import { test } from "node:test";

import { lossOnUnit, unlocatedRegions, unlocatedUnreadUnits } from "@nemesis/shared";
import { THIN_PAGE_CHARS } from "@/lib/pdf/pages";

import { csvCoverage, extractCut, pdfCoverage, pdfWholeCoverage, pptxCoverage, singleUnitCoverage, xlsxCoverage } from "./extract-coverage";

/** A page with enough text that the extractor counts it as read. */
const full = "x".repeat(THIN_PAGE_CHARS + 50);
/** A page whose content is a picture: a heading and nothing else. */
const thin = "Breastfeeding Considerations: Enoxaparin LexiDrug";
const blank = "";

test("an ordinary text PDF reads as complete", () => {
  const coverage = pdfCoverage({ pageTexts: [full, full, full], readByVision: new Set() });
  assert.equal(coverage.state, "complete");
  assert.equal(coverage.unitsNative, 3);
  assert.equal(coverage.unitsUnread, 0);
});

test("🔴 the real recitation: 7 text pages + 5 scans, and vision is off", () => {
  // The Digoxin PK recitation, measured. With no vision key the five scanned
  // pages are simply not read — and that is exactly what must be reported,
  // rather than "12 pages" with no qualifier.
  const pages = [full, full, blank, blank, blank, blank, full, full, full, full, full, blank];
  const coverage = pdfCoverage({ pageTexts: pages, readByVision: new Set() });
  assert.equal(coverage.units, 12);
  assert.equal(coverage.unitsNative, 7);
  assert.equal(coverage.unitsUnread, 5);
  assert.equal(coverage.state, "partial");
});

test("…and with vision on, the same file reads complete", () => {
  // 🔴 THE SET IS 0-BASED — THE SAME BASIS AS `pageTexts`, AND THESE NUMBERS USED
  // TO BE ONE HIGHER. `readByVision` is `readPdfPagesWithVision`'s own key set
  // and those keys are the indices it was handed, which come from `thinPages`.
  // This file described them as 1-based, `pdfCoverage` dutifully added one, and
  // every page vision actually read was counted UNREAD and filed as lost. These
  // tests passed throughout, because they were written from the same misreading
  // and hand-build a set production never produces. Blanks here are indices
  // 2, 3, 4, 5 and 11.
  const pages = [full, full, blank, blank, blank, blank, full, full, full, full, full, blank];
  const coverage = pdfCoverage({ pageTexts: pages, readByVision: new Set([2, 3, 4, 5, 11]) });
  assert.equal(coverage.unitsNative, 7);
  assert.equal(coverage.unitsVision, 5);
  assert.equal(coverage.unitsUnread, 0);
  assert.equal(coverage.state, "complete");
});

test("🔴 a THIN page that vision read counts as BOTH, not as one or the other", () => {
  // Page 36 of the pregnancy recitation: 49 characters of heading over a
  // screenshot that carries the examinable content. It has real text AND needed
  // the pixels. Forcing it into one lane loses a true fact either way.
  // The thin page is index 1, and the set is 0-based.
  const coverage = pdfCoverage({ pageTexts: [full, thin], readByVision: new Set([1]) });
  assert.equal(coverage.unitsBoth, 0, "a thin page has no usable text of its own");
  assert.equal(coverage.unitsVision, 1);

  const heading = `${full}`;
  const both = pdfCoverage({ pageTexts: [heading], readByVision: new Set([0]) });
  assert.equal(both.unitsBoth, 1, "a page with real text that was ALSO read as pixels is both");
  assert.equal(both.state, "complete");
});

test("the page cap is visible: 40 read, the rest unread", () => {
  // MAX_VISION_PAGES caps a single document at 40 pages. A 300-page scan
  // therefore comes back 40/300 — the exact case that used to present as whole.
  const pages = Array.from({ length: 300 }, () => blank);
  // 0-based: pages 0..39. This said `index + 1` and still counted 40, because
  // 40 of 300 pages match either way — a test that passed for the wrong reason.
  const read = new Set(Array.from({ length: 40 }, (_, index) => index));
  const coverage = pdfCoverage({ pageTexts: pages, readByVision: read });
  assert.equal(coverage.unitsVision, 40);
  assert.equal(coverage.unitsUnread, 260);
  assert.equal(coverage.state, "partial");
});

test("a whole-document vision read accounts for every page", () => {
  const coverage = pdfWholeCoverage(9);
  assert.equal(coverage.unitsVision, 9);
  assert.equal(coverage.state, "complete");
});

test("extractCut records a cut only when something was dropped", () => {
  assert.deepEqual(extractCut(200_000, 120, 120), []);
  assert.deepEqual(extractCut(200_000, 200_000, 245_000), [
    { stage: "extract", limit: 200_000, kept: 200_000, dropped: 45_000 },
  ]);
});

test("a cut PDF is partial even though every page was read", () => {
  const coverage = pdfCoverage({
    pageTexts: [full, full],
    readByVision: new Set(),
    truncation: extractCut(200_000, 200_000, 260_000),
  });
  assert.equal(coverage.unitsUnread, 0);
  assert.equal(coverage.state, "partial", "the tail of the source is gone; that is a gap");
});

// --- Where the loss was, not just how much ----------------------------------

test("🔴 an unread page is recorded WITH ITS PAGE NUMBER, not only as a tally", () => {
  // The whole of PARSER-003 for this lane. The loop already decided page 2 was
  // the unread one and kept only the count, which left a parse verdict able to
  // refuse the document and nothing smaller.
  const coverage = pdfCoverage({ pageTexts: [full, blank, full], readByVision: new Set() });
  assert.equal(coverage.unitsUnread, 1);
  assert.deepEqual(coverage.lostUnits, [{ unit: 1, unread: true }], "0-based, the same index the model uses");
  assert.equal(unlocatedUnreadUnits(coverage), 0, "nothing left unaccounted for");
});

test("🔴 an unreadable table region lands on the page it was found on", () => {
  const coverage = pdfCoverage({
    pageTexts: [full, full, full],
    readByVision: new Set(),
    unreadableRegions: 3,
    unreadableRegionsByUnit: [{ unit: 0, count: 1 }, { unit: 2, count: 2 }],
  });
  assert.equal(coverage.unreadableRegions, 3, "the total is untouched");
  assert.deepEqual(coverage.lostUnits, [
    { unit: 0, unreadableRegions: 1 },
    { unit: 2, unreadableRegions: 2 },
  ]);
  assert.equal(unlocatedRegions(coverage), 0);
  assert.equal(lossOnUnit(coverage, 1), null, "the middle page lost nothing, and says nothing");
});

test("🔴 a page BOTH unread and holding an unreadable region gets ONE merged entry", () => {
  // `buildCoverage` refuses a duplicate unit outright, so an unmerged pair would
  // not merely look untidy — the record would be refused and `orUnaccounted`
  // would swap this document's coverage for a fallback that knows nothing about
  // it. The merge is load-bearing, not cosmetic.
  const coverage = pdfCoverage({
    pageTexts: [blank, full],
    readByVision: new Set(),
    unreadableRegions: 1,
    unreadableRegionsByUnit: [{ unit: 0, count: 1 }],
  });
  assert.deepEqual(coverage.lostUnits, [{ unit: 0, unread: true, unreadableRegions: 1 }]);
  assert.equal(coverage.units, 2, "the real record was built, not the unaccounted fallback");
});

test("🔴 regions the structural read could not place stay visible as unlocated", () => {
  // The direction that matters. Four regions were lost and only one could be put
  // on a page; if the breakdown set the total, the other three would cease to
  // exist and every page would read clean.
  const coverage = pdfCoverage({
    pageTexts: [full, full],
    readByVision: new Set(),
    unreadableRegions: 4,
    unreadableRegionsByUnit: [{ unit: 1, count: 1 }],
  });
  assert.equal(coverage.unreadableRegions, 4);
  assert.equal(unlocatedRegions(coverage), 3);
});

test("pages past the cap are located as the document's tail, not lost in a lump", () => {
  const coverage = pdfCoverage({ pageTexts: [full, full], readByVision: new Set(), unreadBeyondCap: 2 });
  assert.equal(coverage.units, 4);
  assert.equal(coverage.unitsUnread, 2);
  assert.deepEqual(coverage.lostUnits, [{ unit: 2, unread: true }, { unit: 3, unread: true }]);
});

test("a fully read PDF records no locality at all — absent means nothing was lost", () => {
  const coverage = pdfCoverage({ pageTexts: [full, full], readByVision: new Set() });
  assert.equal("lostUnits" in coverage, false, "an empty array would imply we looked and found nothing");
});

test("a stray page number never costs a document its coverage", () => {
  // One out-of-range index must not make `buildCoverage` refuse the record and
  // hand back the unaccounted fallback — the loss simply stays unlocated.
  const coverage = pdfCoverage({
    pageTexts: [full, full],
    readByVision: new Set(),
    unreadableRegions: 2,
    unreadableRegionsByUnit: [{ unit: 0, count: 1 }, { unit: 99, count: 1 }],
  });
  assert.equal(coverage.units, 2, "still the real document");
  assert.deepEqual(coverage.lostUnits, [{ unit: 0, unreadableRegions: 1 }]);
  assert.equal(unlocatedRegions(coverage), 1, "the unplaceable one is still counted");
});

// --- Decks -------------------------------------------------------------------

const deck = (over: Partial<Parameters<typeof pptxCoverage>[0]["counts"]> = {}) => ({
  slides: 37,
  imagesFound: 71,
  imagesReadable: 10,
  imagesUnreadable: 0,
  imagesGlyphs: 4,
  imagesDroppedToCap: 0,
  ...over,
});

test("🔴 the real immunology deck as it behaved BEFORE TIFF decoding", () => {
  // 61 of 71 figures in a format nothing could rasterise. Every slide's text
  // extracted fine, so the old record said nothing at all was wrong.
  const coverage = pptxCoverage({
    counts: deck({ imagesUnreadable: 57, imagesGlyphs: 4 }),
    described: 10,
    visionAvailable: true,
  });
  assert.equal(coverage.units, 37);
  assert.equal(coverage.unitsNative, 37, "a slide is XML — its text always extracts");
  assert.equal(coverage.figures.found, 71);
  assert.equal(coverage.figures.described, 10);
  assert.equal(coverage.figures.reasons["unreadable-format"], 57);
  assert.equal(coverage.state, "partial");
});

test("a deck whose only skips are icons is COMPLETE", () => {
  const coverage = pptxCoverage({
    counts: deck({ imagesFound: 14, imagesGlyphs: 4 }),
    described: 10,
    visionAvailable: true,
  });
  assert.equal(coverage.state, "complete", "a crest and four bullets are not missing content");
  assert.deepEqual(coverage.figures.reasons, { decorative: 4 });
});

test("figures beyond the per-deck cap are named as such", () => {
  const coverage = pptxCoverage({
    counts: deck({ imagesFound: 130, imagesDroppedToCap: 10, imagesGlyphs: 0 }),
    described: 120,
    visionAvailable: true,
  });
  assert.equal(coverage.figures.reasons["over-cap"], 10);
  assert.equal(coverage.state, "partial");
});

test("🔴 a planned figure that was never described is counted, not quietly dropped", () => {
  // Vision off, or the call failed: 12 readable pictures, none described. The
  // arithmetic must not silently absorb them into "decorative".
  const coverage = pptxCoverage({
    counts: deck({ imagesFound: 12, imagesReadable: 12, imagesGlyphs: 0 }),
    described: 0,
    visionAvailable: false,
  });
  assert.equal(coverage.figures.skipped, 12);
  assert.equal(coverage.figures.reasons["vision-unavailable"], 12);
  assert.equal(coverage.state, "partial");
});

test("figure counts always reconcile, whatever the inputs claim", () => {
  // described can never exceed found, even if a caller says otherwise.
  const coverage = pptxCoverage({
    counts: deck({ imagesFound: 5, imagesGlyphs: 0 }),
    described: 99,
    visionAvailable: true,
  });
  assert.equal(coverage.figures.described + coverage.figures.skipped, coverage.figures.found);
});

// --- Files with no unit structure --------------------------------------------

test("a Word file reports ONE document, never an invented page", () => {
  // 🔴 The tag strip cannot see page boundaries. "Page 1 of 1" for a 40-page
  // dissertation would be a fabricated locator that citations then point at.
  const coverage = singleUnitCoverage({ read: true, method: "native" });
  assert.equal(coverage.unitKind, "document");
  assert.equal(coverage.units, 1);
  assert.equal(coverage.unitsNative, 1);
  assert.equal(coverage.state, "complete");
});

test("a photograph nothing could be read from is FAILED", () => {
  const coverage = singleUnitCoverage({ read: false, method: "vision" });
  assert.equal(coverage.state, "failed");
});

// ── regions smaller than a page ─────────────────────────────────────────────

test("🔴 a text-full page holding an unreadable table is NOT complete", () => {
  // The exact hole this closes. Every page has plenty of native text, so all
  // three land in `unitsNative`, every unit reconciles, and the old record read
  // `complete` — while the densest thing in the document, the part a student
  // actually came for, never reached them. The unit buckets cannot express it,
  // because the failure is smaller than a page.
  const honest = pdfCoverage({
    pageTexts: [full, full, full],
    readByVision: new Set(),
    unreadableRegions: 1,
  });
  assert.equal(honest.state, "partial");
  assert.equal(honest.unreadableRegions, 1);
  assert.equal(honest.unitsNative, 3, "the pages really were read; only a region was not");
  assert.equal(honest.unitsUnread, 0);

  // Same pages, nothing unreadable: still complete. The guard must not make
  // every PDF partial, or it says nothing at all.
  const clean = pdfCoverage({ pageTexts: [full, full, full], readByVision: new Set() });
  assert.equal(clean.state, "complete");
  assert.equal(clean.unreadableRegions, undefined, "absent rather than a zero nobody asked about");
});

test("unreadable regions and unread pages are different facts and both survive", () => {
  const coverage = pdfCoverage({
    pageTexts: [full, blank],
    readByVision: new Set(),
    unreadableRegions: 2,
  });
  assert.equal(coverage.unitsUnread, 1, "the blank page");
  assert.equal(coverage.unreadableRegions, 2, "and two regions we could not rebuild");
  assert.equal(coverage.state, "partial");
});

// ── PARSER-002: the grid coverages carry the kinds, not just the sum ────────

test("xlsxCoverage passes the workbook's unsupported kinds through, not just their sum", () => {
  const coverage = xlsxCoverage({
    sheets: 2,
    unsupported: [
      { kind: "chart", count: 1 },
      { kind: "unsupported-number-format", count: 4 },
    ],
  });
  assert.equal(coverage.unreadableRegions, 5, "the sum still derives, for every reader that only checks the count");
  assert.deepEqual(coverage.unreadableKinds, [
    { kind: "chart", count: 1 },
    { kind: "unsupported-number-format", count: 4 },
  ]);
  assert.equal(coverage.state, "partial");
});

test("xlsxCoverage with nothing unsupported carries neither field", () => {
  const coverage = xlsxCoverage({ sheets: 3, unsupported: [] });
  assert.equal("unreadableRegions" in coverage, false);
  assert.equal("unreadableKinds" in coverage, false);
  assert.equal(coverage.state, "complete");
});

test("csvCoverage carries the delimiter refusal as a kind, not a bare count", () => {
  const coverage = csvCoverage({ rows: 40, unsupported: [{ kind: "ambiguous-delimiter", count: 1 }] });
  assert.equal(coverage.unreadableRegions, 1);
  assert.deepEqual(coverage.unreadableKinds, [{ kind: "ambiguous-delimiter", count: 1 }]);
  assert.equal(coverage.state, "partial", "read, but not fully understood");
});
