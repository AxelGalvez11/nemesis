import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyPage,
  DOMINANT_IMAGE_COVERAGE,
  maxImageCoverage,
  scanDocument,
  type ImageOpcodes,
  type PageScan,
} from "./pdf-page-scan";

// Stand-ins for pdf.js OPS. The real values are integers; only identity matters.
const PAINT_IMAGE = 85;
const PAINT_INLINE = 86;
const OPS: ImageOpcodes = { save: 10, restore: 11, transform: 12, paintImage: [PAINT_IMAGE, PAINT_INLINE] };

const A4 = { width: 612, height: 792 };

/** Build an operator list from [opcode, args] pairs. */
function ops(entries: [number, unknown?][]) {
  return { fnArray: entries.map((entry) => entry[0]), argsArray: entries.map((entry) => entry[1]) };
}

/** A transform that scales the unit square to `w × h` at the origin. */
const scale = (w: number, h: number): [number, number, number, number, number, number] => [w, 0, 0, h, 0, 0];

test("a full-page image covers the whole page", () => {
  const coverage = maxImageCoverage(ops([[OPS.transform, scale(612, 792)], [PAINT_IMAGE]]), A4, OPS);
  assert.equal(Math.round(coverage * 100), 100);
});

test("coverage above 1 is kept, not clamped away", () => {
  // 🔴 Real: a scanned page bleeding past the page edge measured 122%. That is
  // the MOST scan-like page there is, so it must land on the OCR side of the
  // gate rather than failing a `<= 1` sanity check.
  const coverage = maxImageCoverage(ops([[OPS.transform, scale(700, 900)], [PAINT_IMAGE]]), A4, OPS);
  assert.ok(coverage > 1, `expected >1, got ${coverage}`);
  assert.equal(classifyPage(1, "", coverage).kind, "image-only");
});

test("the graphics stack is respected, so a restore undoes a transform", () => {
  // Without save/restore tracking the second image would inherit the first
  // image's scale and read as full-page.
  const coverage = maxImageCoverage(
    ops([
      [OPS.save],
      [OPS.transform, scale(612, 792)],
      [OPS.restore],
      [OPS.transform, scale(61, 79)],
      [PAINT_IMAGE],
    ]),
    A4,
    OPS,
  );
  assert.ok(coverage < 0.02, `expected a small image, got ${coverage}`);
});

test("the LARGEST image decides, not the last one drawn", () => {
  const coverage = maxImageCoverage(
    ops([
      [OPS.save],
      [OPS.transform, scale(600, 780)],
      [PAINT_IMAGE],
      [OPS.restore],
      [OPS.transform, scale(20, 20)],
      [PAINT_IMAGE],
    ]),
    A4,
    OPS,
  );
  assert.ok(coverage > 0.9, `expected the big image to win, got ${coverage}`);
});

test("every painting operator counts the same", () => {
  for (const opcode of OPS.paintImage) {
    const coverage = maxImageCoverage(ops([[OPS.transform, scale(612, 792)], [opcode]]), A4, OPS);
    assert.equal(Math.round(coverage * 100), 100);
  }
});

test("a page with no images covers nothing, and a zero-sized page cannot divide by zero", () => {
  assert.equal(maxImageCoverage(ops([[OPS.transform, scale(10, 10)]]), A4, OPS), 0);
  assert.equal(maxImageCoverage(ops([[PAINT_IMAGE]]), { width: 0, height: 0 }, OPS), 0);
});

test("ANY text at all makes a page 'embedded', whatever its pictures", () => {
  // 🔴 Presence, never a character count (CLAUDE.md). A page carrying real text
  // must never be OCR'd — mixing guessed words into words the file actually
  // contains is the failure the whole gate exists to avoid.
  assert.equal(classifyPage(1, "4", 0.99).kind, "embedded");
  assert.equal(classifyPage(1, "電気", 0.99).kind, "embedded");
  // Whitespace is not text.
  assert.equal(classifyPage(1, "   \n ", 0.99).kind, "image-only");
});

test("no text and a dominant image is a scan; no text and small graphics is not", () => {
  // Measured on real course PDFs: 88% = a scan (Digoxin recitation p3-6);
  // 44%, 32%, 16% and 6% = slides built from graphics (Pharmacy Lingo p1-7).
  assert.equal(classifyPage(3, "", 0.88).kind, "image-only");
  assert.equal(classifyPage(6, "", 0.44).kind, "no-text");
  assert.equal(classifyPage(1, "", 0.16).kind, "no-text");
  assert.equal(classifyPage(2, "", 0.06).kind, "no-text");
  // The boundary itself counts as a scan.
  assert.equal(classifyPage(1, "", DOMINANT_IMAGE_COVERAGE).kind, "image-only");
});

test("a HYBRID document is counted, never given one verdict", () => {
  // 🔴 The common real case: a recitation PDF with 7 text pages and 5 scanned
  // pages in one file. "Scanned" and "not scanned" are both wrong for it.
  const pages: PageScan[] = [
    classifyPage(1, "Digoxin pharmacokinetics", 0),
    classifyPage(2, "Case one", 0),
    classifyPage(3, "", 0.88),
    classifyPage(4, "", 0.88),
    classifyPage(5, "", 0.88),
  ];
  const scan = scanDocument(pages);
  assert.deepEqual(scan.imageOnly, [3, 4, 5]);
  assert.deepEqual(scan.withoutText, []);
  assert.equal(scan.fullyScanned, false, "a document with text pages is not fully scanned");
});

test("a document with no text layer anywhere is fully scanned", () => {
  const scan = scanDocument([classifyPage(1, "", 0.95), classifyPage(2, "", 0.91)]);
  assert.equal(scan.fullyScanned, true);
  assert.deepEqual(scan.imageOnly, [1, 2]);
});

test("a document of blank pages is NOT called scanned", () => {
  // Nothing to read, and claiming a scan would send OCR after nothing.
  const scan = scanDocument([classifyPage(1, "", 0), classifyPage(2, "", 0.1)]);
  assert.equal(scan.fullyScanned, false);
  assert.deepEqual(scan.imageOnly, []);
  assert.deepEqual(scan.withoutText, [1, 2]);
});

test("an empty document is not fully scanned", () => {
  assert.equal(scanDocument([]).fullyScanned, false);
});

// --- Through real pdf.js, on a real (generated) PDF ---------------------------
// The unit tests above pin the geometry. This one pins the WIRING: that the
// operator list pdf.js actually produces, with the opcodes this pdf.js version
// actually has, still yields the same verdicts. A rename inside pdf.js would
// slip past every test above.

test("the hybrid fixture is read as one text page and one image page", async () => {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const require_ = createRequire(import.meta.url);
  const pdfjs = await import(require_.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
  const OPS = pdfjs.OPS as unknown as Record<string, number>;
  const need = (name: string): number => {
    const value = OPS[name];
    assert.equal(typeof value, "number", `pdf.js no longer has OPS.${name}`);
    return value as number;
  };
  const opcodes: ImageOpcodes = {
    save: need("save"),
    restore: need("restore"),
    transform: need("transform"),
    paintImage: ["paintImageXObject", "paintInlineImageXObject", "paintImageXObjectRepeat", "paintImageMaskXObject"]
      .map((name) => OPS[name])
      .filter((value): value is number => typeof value === "number"),
  };

  const bytes = readFileSync(new URL("../../public/reader-sample-scan.pdf", import.meta.url));
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const size = page.getViewport({ scale: 1 });
    const text = ((await page.getTextContent()).items as { str?: string }[]).map((item) => item.str ?? "").join("");
    const coverage = maxImageCoverage(await page.getOperatorList(), { width: size.width, height: size.height }, opcodes);
    pages.push(classifyPage(number, text, coverage));
  }

  const scan = scanDocument(pages);
  assert.equal(pages[0]?.kind, "embedded", "page 1 carries text and must never be offered to OCR");
  assert.equal(pages[1]?.kind, "image-only", "page 2 is a full-page image");
  assert.deepEqual(scan.imageOnly, [2]);
  assert.equal(scan.fullyScanned, false, "a hybrid document is not 'a scan'");
});
