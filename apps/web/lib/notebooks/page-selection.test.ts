import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fromDisplay,
  localShare,
  routeFor,
  routePages,
  THIN_PAGE_CHARS,
  toDisplayPage,
  toLlamaTargetPages,
  toMistralPages,
  type PageSignal,
} from "./page-selection";

const page = (index: number, over: Partial<PageSignal> = {}): PageSignal => ({
  imageCount: 0,
  index,
  textLength: 2_000,
  ...over,
});

// ── Cheap first ──────────────────────────────────────────────────────────────

test("🔴 a page that reads locally is never paid for", () => {
  assert.equal(routeFor(page(0)), "local");
  assert.equal(routeFor(page(0, { textLength: THIN_PAGE_CHARS })), "local");
});

test("a scanned PDF page goes to Mistral", () => {
  assert.equal(routeFor(page(3, { textLength: 0 })), "mistral");
  assert.equal(routeFor(page(3, { textLength: THIN_PAGE_CHARS - 1 })), "mistral");
});

test("an Office page the local reader could not walk goes to LlamaParse, not OCR", () => {
  // There is no image to OCR in a pptx shape tree; there is a layout to resolve.
  assert.equal(routeFor(page(2, { office: true, textLength: 0 })), "llamaparse");
  assert.equal(routeFor(page(2, { complexLayout: true, office: true })), "llamaparse");
});

test("a readable page with a figure pays only for the figure", () => {
  assert.equal(routeFor(page(5, { imageCount: 2 })), "gemini");
});

test("a whole document routes in page order, and most of it is free", () => {
  const routed = routePages([
    page(0),
    page(1, { textLength: 10 }),
    page(2, { imageCount: 1 }),
    page(3),
    page(4, { office: true, textLength: 4 }),
  ]);
  assert.deepEqual(routed.local, [0, 3]);
  assert.deepEqual(routed.mistral, [1]);
  assert.deepEqual(routed.gemini, [2]);
  assert.deepEqual(routed.llamaparse, [4]);
  assert.equal(localShare(routed, 5), 0.4);
});

test("🔴 an ordinary lecture deck costs almost nothing to read", () => {
  // 200 pages of a normal PDF: text everywhere, a handful of figures, two scans.
  const signals = Array.from({ length: 200 }, (_, index) => page(index, {
    imageCount: index % 25 === 0 ? 1 : 0,
    textLength: index === 40 || index === 41 ? 5 : 1_500,
  }));
  const routed = routePages(signals);
  assert.equal(routed.mistral.length, 2);
  assert.equal(routed.gemini.length, 8);
  assert.equal(routed.llamaparse.length, 0);
  assert.ok(localShare(routed, 200) > 0.94, `${localShare(routed, 200)} of pages were free`);
});

// ── Provider dialects ────────────────────────────────────────────────────────
//
// 🔴 THIS IS THE OFF-BY-ONE SUITE. Every one of these conversions succeeds
// silently when it is wrong: the parse completes, the pages come back, and the
// content is attributed to the neighbouring page. Nothing throws.

test("Mistral counts from zero, like us", () => {
  assert.deepEqual(toMistralPages([0, 4, 9], 20), [0, 4, 9]);
  // Sorted, whatever order the caller collected them in.
  assert.deepEqual(toMistralPages([9, 0, 4], 20), [0, 4, 9]);
});

test("wanting every page omits the parameter rather than listing them all", () => {
  // A list of every page is more fragile than no list: if the page count was
  // misread, the document is truncated to whatever we sent.
  assert.equal(toMistralPages([0, 1, 2], 3), null);
  assert.equal(toLlamaTargetPages([0, 1, 2], 3), null);
});

test("wanting no pages is not the same as wanting all of them", () => {
  // 🔴 THE ASYMMETRY THAT BITES. Mistral distinguishes an empty array; LlamaParse
  // does not — an empty `target_pages` string means UNSET, which means every
  // page, which is the most expensive possible reading of "none".
  assert.deepEqual(toMistralPages([], 10), []);
  assert.equal(toLlamaTargetPages([], 10), null, "the caller must not make the request at all");
});

test("LlamaParse takes a zero-based comma-separated string", () => {
  assert.equal(toLlamaTargetPages([0, 3, 7], 30), "0,3,7");
  assert.equal(toLlamaTargetPages([7, 3, 0], 30), "0,3,7");
  // Not 1-based, and not space-separated. Both would parse, and both would be wrong.
  assert.notEqual(toLlamaTargetPages([0], 30), "1");
  assert.notEqual(toLlamaTargetPages([0, 1], 30), "0 1");
});

test("people count from one, and only this function knows it", () => {
  assert.equal(toDisplayPage(0), 1);
  assert.equal(toDisplayPage(41), 42);
  assert.equal(fromDisplay(1), 0);
  assert.equal(fromDisplay(42), 41);
  // A round trip cannot drift.
  for (const index of [0, 1, 7, 199]) {
    assert.equal(fromDisplay(toDisplayPage(index)), index);
  }
  // 🔴 "page 0" must not become -1, which would index the LAST page of an array.
  assert.equal(fromDisplay(0), 0);
  assert.equal(fromDisplay(-5), 0);
});

test("a display number can never be handed to a provider unconverted", () => {
  const wanted = [0, 1];
  const display = wanted.map(toDisplayPage);
  assert.notDeepEqual(toMistralPages(display, 100), toMistralPages(wanted, 100));
  assert.notEqual(toLlamaTargetPages(display, 100), toLlamaTargetPages(wanted, 100));
});

// ── The adapters actually use it ─────────────────────────────────────────────

test("🔴 Mistral is sent only the pages that escalated", async () => {
  const { buildMistralRequest } = await import("./mistral-ocr");
  const body = JSON.parse(buildMistralRequest({
    base64: "AAA",
    mime: "application/pdf",
    model: "mistral-ocr-latest",
    pages: [40, 41],
    totalPages: 200,
  })) as { pages?: number[] };
  assert.deepEqual(body.pages, [40, 41], "two scanned pages must not bill as two hundred");
});

test("a document that IS a scan is read whole, with no page list", async () => {
  const { buildMistralRequest } = await import("./mistral-ocr");
  const every = JSON.parse(buildMistralRequest({
    base64: "AAA",
    mime: "application/pdf",
    model: "mistral-ocr-latest",
    pages: [0, 1, 2],
    totalPages: 3,
  })) as { pages?: number[] };
  assert.equal("pages" in every, false, "asking for every page must omit the parameter");
  // And a caller that knows nothing about pages still gets the old behaviour.
  const unaware = JSON.parse(buildMistralRequest({
    base64: "AAA",
    mime: "application/pdf",
    model: "mistral-ocr-latest",
  })) as { pages?: number[] };
  assert.equal("pages" in unaware, false);
});

test("LlamaParse's target_pages is appended only when there is a selection", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./llamaparse-ocr.ts", import.meta.url), "utf8"));
  assert.match(source, /if \(targetPages\) form\.append\("target_pages", targetPages\)/,
    "an empty target_pages means EVERY page to LlamaParse");
  assert.match(source, /toLlamaTargetPages/, "the conversion must go through the adapter boundary");
});

console.log("page-selection.test.ts OK");
