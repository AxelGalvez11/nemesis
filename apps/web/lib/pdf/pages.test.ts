import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_VISION_PAGES,
  pageTextLength,
  parsePageTranscripts,
  finishPdfPages,
  planPdfRead,
  splicePages,
  thinPages,
  unreadPages,
} from "./pages";
import { READ_TOKEN_FLOOR, scorePagesRead } from "./page-read";

const words = (n: number) => "word ".repeat(n).trim();

// ── Which pages were never read ──────────────────────────────────────────────

test("a page with no text at all is unread", () => {
  assert.deepEqual(unreadPages(["", words(200), ""]), [0, 2]);
});

test("a page of only layout whitespace is unread", () => {
  assert.equal(pageTextLength("   \n\n \t "), 0);
  assert.deepEqual(unreadPages(["   \n\n \t "]), [0]);
});

// The page that made the case for a floor rather than a zero test: it extracts
// "Breastfeeding Considerations: Enoxaparin LexiDrug" and nothing else, while the
// answer a student is examined on sits inside the screenshot below it.
test("a heading over a full-page screenshot is unread, not read", () => {
  const heading = "Breastfeeding Considerations: Enoxaparin LexiDrug";
  assert.ok(scorePagesRead([heading])[0]!.signals.tokens < READ_TOKEN_FLOOR);
  assert.deepEqual(unreadPages([heading]), [0]);
});

test("a page carrying real text is left alone", () => {
  assert.deepEqual(unreadPages([words(400)]), []);
});

test("a document that reads fine costs nothing", () => {
  assert.deepEqual(unreadPages([words(50), words(60), words(70)]), []);
});

// ── The cap ──────────────────────────────────────────────────────────────────

test("no more pages than the per-document ceiling are sent", () => {
  const many = Array.from({ length: 100 }, () => "");
  assert.equal(unreadPages(many).length, MAX_VISION_PAGES);
});

test("when the cap bites, the emptiest pages win", () => {
  // Forty pages with a heading each, plus one with nothing: the blank one is the
  // bigger loss and must not be crowded out by pages that at least say something.
  const pages = [...Array.from({ length: MAX_VISION_PAGES }, () => "Heading"), ""];
  const picked = unreadPages(pages);
  assert.equal(picked.length, MAX_VISION_PAGES);
  assert.ok(picked.includes(MAX_VISION_PAGES), "the page with no text at all must be read");
});

test("the pages that are sent stay in document order", () => {
  const pages = [...Array.from({ length: 50 }, () => "")];
  const picked = unreadPages(pages);
  assert.deepEqual(picked, [...picked].sort((a, b) => a - b));
});

// The cap bounds what is SENT, never what is counted. Reporting a capped-out page
// as one the text layer covered would hide the loss the cap exists to bound — and
// "read from text" is exactly the lie this whole file was written to stop telling.
test("every picture-page is counted, including the ones the cap excluded", () => {
  const pages = Array.from({ length: 50 }, () => "");
  assert.equal(thinPages(pages).length, 50);
  assert.equal(unreadPages(pages).length, MAX_VISION_PAGES);
});

test("a document under the cap sends every page it counts", () => {
  const pages = ["", words(300), ""];
  assert.deepEqual(thinPages(pages), unreadPages(pages));
});

// ── Reading the reply back ───────────────────────────────────────────────────

test("each page's transcript lands in its own slot", () => {
  const parsed = parsePageTranscripts("[[page 1]]\nAlpha\n\n[[page 2]]\nBeta", 2);
  assert.deepEqual(parsed, ["Alpha", "Beta"]);
});

// The difference from the figure parser: every page carries its own number, so a
// page the model skipped costs that page and leaves the rest aligned. A miscount
// used to void the whole batch.
test("a skipped page costs that page and nothing else", () => {
  const parsed = parsePageTranscripts("[[page 1]]\nAlpha\n\n[[page 3]]\nGamma", 3);
  assert.deepEqual(parsed, ["Alpha", "", "Gamma"]);
});

test("a reply with no page markers is unusable and says so", () => {
  assert.equal(parsePageTranscripts("Alpha then Beta then Gamma", 3), null);
});

test("a page number outside the batch is ignored, not written past the end", () => {
  const parsed = parsePageTranscripts("[[page 1]]\nAlpha\n[[page 9]]\nStray", 2);
  assert.deepEqual(parsed, ["Alpha", ""]);
});

test("multi-line and spaced markers still parse", () => {
  const parsed = parsePageTranscripts("[[ Page 1 ]]\nLine one\nLine two\n[[page 2]]\nB", 2);
  assert.deepEqual(parsed, ["Line one\nLine two", "B"]);
});

test("nothing asked for is nothing to parse", () => {
  assert.deepEqual(parsePageTranscripts("", 0), []);
});

// ── Putting it back together ─────────────────────────────────────────────────

test("a transcript goes where its page was, in order", () => {
  const merged = splicePages(["First page", "", "Third page"], new Map([[1, "The middle, read"]]), [1]);
  assert.match(merged, /First page[\s\S]*The middle, read[\s\S]*Third page/);
});

// A student who exports a note and finds a paragraph they never wrote should be
// able to see that a machine read a picture for them — and so should the model,
// which would otherwise quote a transcription as the lecturer's exact words.
test("a transcribed page is labelled as read from an image", () => {
  const merged = splicePages(["", ""], new Map([[0, "Diagram of hepatic clearance"]]), [0]);
  assert.match(merged, /\[Read from the page image\]/);
  assert.match(merged, /Diagram of hepatic clearance/);
});

test("a page's own heading is kept above its transcript, not blended into it", () => {
  const merged = splicePages(["Breastfeeding Considerations"], new Map([[0, "No reports describe..."]]), [0]);
  const headingAt = merged.indexOf("Breastfeeding Considerations");
  const labelAt = merged.indexOf("[Read from the page image]");
  assert.ok(headingAt >= 0 && labelAt > headingAt, "the lecturer's own words come first");
});

test("a page that needed reading and did not get it leaves a visible gap", () => {
  const merged = splicePages(["", "Real text"], new Map(), [0]);
  assert.match(merged, /\[This page is an image and could not be read\]/);
});

test("pages that were never in question are untouched and unlabelled", () => {
  const merged = splicePages(["Alpha", "Beta"], new Map(), []);
  assert.equal(merged, "Alpha\nBeta");
});

test("with nothing read at all the text is exactly what it was", () => {
  const pages = ["Alpha", "Beta", "Gamma"];
  assert.equal(splicePages(pages, new Map(), []), pages.join("\n"));
});

// ── Which kind of read the document needs ────────────────────────────────────

test("a document that reads fine needs no vision at all", () => {
  assert.equal(planPdfRead([words(300), words(300)]).kind, "text");
});

// Every plan carries the reason each page was routed the way it was, including the
// plan that routes nothing: "no page needed reading" is a claim, and a claim nobody
// can check is how the picture-page hole went unnoticed in the first place.
test("a plan carries the decision behind every page, even when it asks for nothing", () => {
  const plan = planPdfRead([words(300), ""]);
  assert.deepEqual(
    plan.decisions.map((decision) => decision.reason),
    ["text-layer", "no-text-layer"],
  );
  assert.deepEqual(
    plan.decisions.map((decision) => decision.index),
    [0, 1],
  );
  assert.equal(planPdfRead([words(300)]).decisions.length, 1);
});

// The regression the page path could have caused. readPdfWithVision reads a whole
// scan in ONE request with no page cap; slicing would have read 40 pages of a
// 100-page scan and labelled the other 60 unreadable — worse than what it replaced.
test("a document that is ALL pictures is read whole, not sliced", () => {
  assert.equal(planPdfRead(Array.from({ length: 100 }, () => "")).kind, "whole");
});

test("one readable page is enough to make it a page-by-page read", () => {
  const plan = planPdfRead(["", words(300), ""]);
  assert.equal(plan.kind, "pages");
  assert.deepEqual(plan.kind === "pages" ? plan.needed : null, [0, 2]);
});

test("an empty document asks for nothing", () => {
  assert.deepEqual(planPdfRead([]), { kind: "text", decisions: [] });
});

// ── The cap holds on the spliced path too ────────────────────────────────────

// splicePages builds from the RAW per-page text, which capText never touched:
// extractPdfText caps the string it returns, not the array behind it. So reading
// ONE picture-page of a very long document used to hand back the whole thing
// uncapped — and a 2,116-page book in the owner's course has exactly one such page.
test("a spliced document is still capped", () => {
  const pages = Array.from({ length: 400 }, () => words(200));
  pages[0] = "";
  const finished = finishPdfPages(pages, new Map([[0, "Read from the picture"]]), [0], 5_000);
  assert.equal(finished.text.length, 5_000);
  assert.equal(finished.truncated, true);
});

test("a document that fits is not reported as clipped", () => {
  const finished = finishPdfPages(["", "Short"], new Map([[0, "A figure"]]), [0], 5_000);
  assert.equal(finished.truncated, false);
  assert.match(finished.text, /A figure/);
});
