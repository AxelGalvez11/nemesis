/**
 * WHICH PAGE did the vision model read that text off?
 *
 * 🔴 THIS TEST EXISTS BECAUSE THE ANSWER WAS "THE ONE BEFORE IT", AND NOTHING SAID SO.
 * `thinPages` returns 0-based array indices, `readPdfPagesWithVision` keys its
 * result map by exactly those indices, and two consumers then adjusted them in
 * opposite directions:
 *
 *   parse-document.ts   `[page - 1, value]`   text landed one page EARLY
 *   extract-coverage.ts `has(index + 1)`      the page read was reported UNREAD
 *
 * When the thin page was the FIRST page the key became -1 — a page that does not
 * exist — and the transcript disappeared from the layout output, the page
 * markdown and the document markdown alike. The call was made, the answer came
 * back, and it was silently dropped while coverage still counted the page.
 *
 * 🔴 THE ASSERTIONS ARE AGAINST A KNOWN PAGE'S KNOWN TEXT, NEVER AGAINST INDEX
 * ARITHMETIC. An off-by-one is the classic defect where a test written from the
 * same misreading passes: `assert(key === page - 1)` is green against the bug.
 * So each case puts a unique marker on a real page, asks vision for a different
 * unique marker, and demands that the second marker come back attached to the
 * page that had no text — by reading the text of that page.
 *
 * The vision provider is stubbed at `fetch`, so this costs nothing and reaches
 * no network, but everything between the stub and the assertion is production
 * code: the real gate, the real batching, the real page-marker parser.
 */

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { buildDocument, documentToText, unitTexts, withVisionText } from "@nemesis/shared";

import { parseDocument } from "./parse-document";

const NATIVE_MARKER = "ALPHAMARKERNATIVE";
const VISION_MARKER = "BRAVOMARKERVISION";

/** Enough words that `planPdfRead` calls the page readable (>= 120 chars). */
const NATIVE_TEXT = `${NATIVE_MARKER} this page carries its own selectable text and must never be sent to a vision model, because every one of its characters is already available to the parser without paying anyone.`;

const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;
after(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = realKey;
});

/**
 * A PDF of `pages.length` pages: a string draws that text, `null` draws nothing
 * at all, which is what a scanned or image-only page looks like to a text
 * extractor — no text layer to pull.
 */
async function buildPdf(pages: readonly (string | null)[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([612, 792]);
    if (text === null) continue;
    // Wrapped by hand: drawText does not wrap, and a single long line would run
    // off the page and take its own characters with it.
    text.split(" ").reduce<{ line: string; y: number }>(
      (state, word) => {
        const candidate = state.line ? `${state.line} ${word}` : word;
        if (candidate.length <= 60) return { ...state, line: candidate };
        page.drawText(state.line, { font, size: 12, x: 50, y: state.y });
        return { line: word, y: state.y - 18 };
      },
      { line: "", y: 700 },
    );
    // The residue of the fold — the last line never reaches the flush above.
    page.drawText(text.split(" ").slice(-4).join(" "), { font, size: 12, x: 50, y: 600 });
  }
  return doc.save();
}

/** Answer any Gemini call with a page transcript, and count what was asked. */
function stubVision(): { calls: () => number } {
  let calls = 0;
  process.env.GEMINI_API_KEY = "stub-key-not-a-credential";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    calls += 1;
    // `[[page 1]]` numbers the SLICE that was sent, not the document — one page
    // is sent per case here, so the slice is always page 1 of itself.
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: `[[page 1]]\n${VISION_MARKER} transcript of the page with no text layer.` }] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { calls: () => calls };
}

test("🔴 vision text is filed on the page it was read from — LAST page thin", async () => {
  const vision = stubVision();
  // Page 1 has text, page 2 does not. Vision is asked for page 2 alone.
  const bytes = await buildPdf([NATIVE_TEXT, null]);
  const outcome = await parseDocument(bytes, "last-page-thin.pdf", "application/pdf");

  assert.equal(outcome.ok, true, "the fixture must parse at all");
  if (!outcome.ok) return;
  const model = outcome.document.model;
  assert.ok(model, "the structural reader must produce a model, or nothing below is exercised");
  assert.equal(vision.calls(), 1, "vision must have been asked for the one page with no text");

  const texts = unitTexts(model);
  assert.equal(texts.length, 2, "both pages must survive as units");

  // 🔴 THE WHOLE POINT, SAID AGAINST PAGES RATHER THAN INDICES: the transcript
  // belongs to the page that had nothing, and the page that had its own words
  // must not have acquired someone else's.
  assert.ok(texts[1]?.includes(VISION_MARKER), "page 2 had no text layer, so page 2 must carry the transcript");
  assert.ok(!texts[0]?.includes(VISION_MARKER), "page 1 had its own text and must NOT have been given page 2's transcript");
  assert.ok(texts[0]?.includes(NATIVE_MARKER), "page 1 must still carry its own words");
});

test("🔴 vision text survives when the FIRST page is the thin one", async () => {
  const vision = stubVision();
  // The case that produced a key of -1 and lost the transcript entirely.
  const bytes = await buildPdf([null, NATIVE_TEXT]);
  const outcome = await parseDocument(bytes, "first-page-thin.pdf", "application/pdf");

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const model = outcome.document.model;
  assert.ok(model, "the structural reader must produce a model");
  assert.equal(vision.calls(), 1);

  // 🔴 REACHABILITY FIRST. The block existed even with the defect present — it
  // was simply attached to unit -1, which no consumer iterates. A test that only
  // counted blocks would have passed while the text was unreachable.
  assert.ok(
    documentToText(model).includes(VISION_MARKER),
    "the transcript must be reachable in the document's own text, not stranded on a page that does not exist",
  );
  assert.ok(
    model.blocks.every((block) => block.unit >= 0 && block.unit < model.units.length),
    "no block may be filed on a page outside the document",
  );

  const texts = unitTexts(model);
  assert.ok(texts[0]?.includes(VISION_MARKER), "page 1 had no text layer, so page 1 must carry the transcript");
  assert.ok(!texts[1]?.includes(VISION_MARKER), "page 2 had its own text and must not carry page 1's transcript");
});

test("🔴 coverage reports the page vision read as read, and does not mourn it as lost", async () => {
  const vision = stubVision();
  const bytes = await buildPdf([NATIVE_TEXT, null]);
  const outcome = await parseDocument(bytes, "coverage.pdf", "application/pdf");

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(vision.calls(), 1);
  const coverage = outcome.document.coverage;

  // The defect here ran the other way — `has(index + 1)` against a 0-based set —
  // so a page vision HAD read was counted unread and filed in `lostUnits`. That
  // is the worst possible direction: it understates what we recovered and marks
  // real content as missing.
  assert.equal(coverage.unitsVision, 1, "the page with no text layer was read by vision and must be counted as such");
  assert.equal(coverage.unitsUnread, 0, "no page went unread — one was native and one was read by vision");
  assert.ok(
    !(coverage.lostUnits ?? []).some((lost) => lost.unit === 1),
    "the page vision read must not be recorded as lost",
  );
});

test("🔴 a page that does not exist is refused outright, not filed silently", () => {
  // The guard itself, exercised directly. With the callers fixed no out-of-range
  // key is produced any more, so this is the ONLY thing that can prove the guard
  // works — reintroducing the caller's defect no longer reaches it.
  const doc = buildDocument({
    format: "pdf",
    title: "two pages",
    units: [
      { index: 0, kind: "body" },
      { index: 1, kind: "body" },
    ],
    blocks: [{ headingPath: [], kind: "paragraph", text: "page one", unit: 0 }],
  });

  // The exact key the old `page - 1` produced for a thin first page.
  assert.throws(() => withVisionText(doc, new Map([[-1, "text from nowhere"]])), RangeError);
  // And one past the end, the mirror mistake.
  assert.throws(() => withVisionText(doc, new Map([[2, "text from nowhere"]])), RangeError);
  // A real page is still accepted, so the guard has not simply refused everything.
  assert.ok(documentToText(withVisionText(doc, new Map([[1, "text from page two"]]))).includes("text from page two"));
});
