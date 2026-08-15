/**
 * The gate that decides whether a vendor read is good enough to keep.
 *
 * 🔴 THE POINT OF THESE TESTS IS THAT THE GATE CAN STILL SAY NO. The architecture decision above it
 * is settled — Mistral is primary for PDF, PPTX and DOCX, and some loss of Office-native detail is
 * an accepted price for not maintaining three parsers. A gate that never rejected anything would
 * satisfy the letter of that and lose a lecture's teaching in the process; a gate that rejected on
 * a quality score would quietly reinstate the legacy readers as primary. So it does exactly one
 * thing: it refuses a read that is missing content the FILE ITSELF declares.
 *
 * Every number below was measured on a real file, and the two rejection cases are real documents
 * from the owner's own coursework.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { zipSync } from "fflate";

import { buildDocument, type DocumentModel } from "@nemesis/shared";

import { claimOf, judgeMistralRead, MIN_NOTES_CHARS } from "./mistral-quality";

const WEB_ROOT = join(import.meta.dirname, "..", "..");
const bytesOf = (relative: string) => new Uint8Array(readFileSync(join(WEB_ROOT, relative)));

/** A minimal but real PNG header: signature, then an IHDR carrying the size. Same builder as
 *  `image-dimensions.test.ts` — one real fixture shape, not a second copy of it. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A byte-order mark and the magic 42 `isTiff` checks for, padded past `MIN_UNKNOWN_BYTES` —
 *  enough to be counted without decoding a real TIFF strip layout. */
function tiff(bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  out.set([0x49, 0x49, 0x2a, 0x00]); // "II" little-endian + 42
  return out;
}

/** A minimal PPTX zip carrying the given `ppt/media/` entries, real enough for `unzipBounded`
 *  to open and `claimOf` to read exactly as it reads a real deck. */
function pptxZip(media: Record<string, Uint8Array>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(media)) files[`ppt/media/${name}`] = bytes;
  return zipSync(files);
}

/** A model carrying a given amount of prose and a given number of tables. */
function model(input: { chars: number; tables: number }): DocumentModel {
  return buildDocument({
    blocks: [
      { headingPath: [], kind: "paragraph", text: "x".repeat(input.chars), unit: 0 },
      ...Array.from({ length: input.tables }, () => ({
        headingPath: [] as string[],
        kind: "table" as const,
        table: { headerRows: 0, rows: [["a", "b"]] },
        text: "",
        unit: 0,
      })),
    ],
    format: "docx",
    title: null,
    units: [{ index: 0, kind: "body" }],
  });
}

// ── Reading the file's own claim ───────────────────────────────────────────

test("an Office file's own XML states what it contains, and it is read from real bytes", () => {
  // 🔴 REAL FILES, NOT A HAND-BUILT ZIP. The claim is the whole basis of the gate, so it is read
  // the way production reads it — from the actual parts of an actual document.
  const deck = claimOf("pptx", bytesOf("public/reader-sample.pptx"));
  assert.equal(deck.notesSlides, 1, "the sample deck has one slide carrying a note");
  assert.ok(deck.notesChars > 0);

  assert.equal(claimOf("docx", bytesOf("public/reader-sample.docx")).tables, 1);
  assert.equal(claimOf("docx", bytesOf("acceptance/acceptance-source-B1.docx")).tables, 2);
});

test("a PDF claims nothing, so the gate can never reject one", () => {
  // A PDF makes no checkable statement about its own contents, and Mistral measurably beats the
  // local reader there anyway — 16,823 words against 9,098, 60 of the local ones corrupted.
  const claim = claimOf("pdf", bytesOf("lib/notebooks/fixtures/two-column.pdf"));
  assert.deepEqual(claim, { images: 0, notesChars: 0, notesSlides: 0, tables: 0 });
  assert.deepEqual(judgeMistralRead(claim, model({ chars: 1, tables: 0 })), { ok: true });
});

test("unreadable bytes claim nothing rather than failing the parse", () => {
  // A claim of nothing can never reject a read, which is the safe direction: a zip we cannot open
  // is not evidence that the vendor lost something.
  assert.deepEqual(claimOf("docx", new Uint8Array([1, 2, 3, 4])), {
    images: 0,
    notesChars: 0,
    notesSlides: 0,
    tables: 0,
  });
});

// ── The verdict ────────────────────────────────────────────────────────────

test("🔴 a deck whose speaker notes did not arrive is rejected", () => {
  // Real numbers, from the owner's 57-slide pharmacogenomics lecture: the file declares 42,693
  // characters of notes across 46 slides, and Mistral's read of the whole deck came back with
  // 12,194 characters in total. Not tidier — a third of the concepts. Measured separately: its
  // vocabulary was a strict SUBSET of the local reader's, with zero words unique to it.
  const claim = { images: 0, notesChars: 42_693, notesSlides: 46, tables: 0 };
  const verdict = judgeMistralRead(claim, model({ chars: 12_194, tables: 0 }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.missing, "speaker-notes");
});

test("🔴 a Word document whose tables did not arrive is rejected", () => {
  // Also real: a PK activity sheet declaring six tables, of which Mistral returned zero — its
  // markdown pipe tables break apart wherever a cell contains a line break.
  const verdict = judgeMistralRead({ images: 0, notesChars: 0, notesSlides: 0, tables: 6 }, model({ chars: 2_715, tables: 0 }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.missing, "tables");
});

test("🔴 a read that DID bring the content through is accepted — the gate is not a veto", () => {
  // The owner's problem set: two tables declared, two tables returned. This is the case the whole
  // decision is for — near-identical output, and we stop owning the parser.
  assert.deepEqual(
    judgeMistralRead({ images: 0, notesChars: 0, notesSlides: 0, tables: 2 }, model({ chars: 5_254, tables: 2 })),
    { ok: true },
  );

  // A deck whose notes arrived is accepted too, even though the read is shorter than the notes
  // alone — the threshold is for wholesale loss, not for shortfall.
  assert.deepEqual(
    judgeMistralRead({ images: 0, notesChars: 42_693, notesSlides: 46, tables: 0 }, model({ chars: 30_000, tables: 0 })),
    { ok: true },
  );
});

test("a deck with only a token note is not held to the notes rule", () => {
  // 🔴 POWERPOINT WRITES A NOTES PART FOR SLIDES NOBODY TYPED A NOTE ON. Holding every deck to
  // this rule would reject reads over a placeholder, which would make the legacy reader primary
  // again by accident — the exact outcome the owner's decision rules out.
  const claim = { images: 0, notesChars: MIN_NOTES_CHARS - 1, notesSlides: 40, tables: 0 };
  assert.deepEqual(judgeMistralRead(claim, model({ chars: 10, tables: 0 })), { ok: true });
});

test("more tables than declared is fine — only a shortfall is a loss", () => {
  // A table split across pages can legitimately be read as two. Rejecting on inequality rather
  // than shortfall would fail honest reads.
  assert.deepEqual(
    judgeMistralRead({ images: 0, notesChars: 0, notesSlides: 0, tables: 2 }, model({ chars: 100, tables: 3 })),
    { ok: true },
  );
});

// ── the images claim — added with LlamaParse live in production (§46.6) ────────────────────────
// `modelFromLlama` has no branch for a picture at all, so a vendor-routed deck loses every figure
// unconditionally. Before this claim, `judgeMistralRead` had no way to see that: a PPTX light on
// speaker notes and full of diagrams would pass the gate having lost its whole visual-teaching
// content, descriptions and labels alike.

test("a real image in ppt/media/ is counted; a glyph is not", () => {
  const claim = claimOf(
    "pptx",
    pptxZip({
      "image1.png": png(800, 600), // a real figure
      "image2.png": png(16, 16), // an icon — below MIN_IMAGE_EDGE
    }),
  );
  assert.equal(claim.images, 1, "exactly the real picture, not the glyph");
});

test("a TIFF is counted by signature and size, not decoded", () => {
  // Mac-authored decks store figures as uncompressed TIFF — measured 34 of them on the owner's own
  // 124.5 MB immunology deck, none small. `imageMime` does not recognise the extension at all, so
  // this is the path that keeps a TIFF-heavy deck's claim from silently reading as "no pictures".
  const claim = claimOf("pptx", pptxZip({ "image1.tiff": tiff(50_000) }));
  assert.equal(claim.images, 1);
});

test("a TIFF-shaped entry too small to be a real figure is not counted", () => {
  const claim = claimOf("pptx", pptxZip({ "image1.tiff": tiff(200) }));
  assert.equal(claim.images, 0);
});

test("🔴 a deck whose pictures did not arrive is rejected — the LlamaParse gap", () => {
  // The live shape of the defect: a real deck's worth of figures, and a vendor model
  // (`modelFromLlama`) that produced text but not one `kind: "figure"` block.
  const claim = claimOf("pptx", pptxZip({ "image1.png": png(800, 600), "image2.jpg": png(900, 700) }));
  assert.equal(claim.images, 2, "sanity: the fixture really does declare two pictures");
  const verdict = judgeMistralRead(claim, model({ chars: 500, tables: 0 }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.missing, "figures");
});

test("a deck whose figures DID arrive is accepted", () => {
  const claim = claimOf("pptx", pptxZip({ "image1.png": png(800, 600) }));
  const withFigure = buildDocument({
    blocks: [
      { headingPath: [], kind: "paragraph", text: "x".repeat(200), unit: 0 },
      { figure: { ref: "image1.png" }, headingPath: [], kind: "figure" as const, text: "", unit: 0 },
    ],
    format: "pptx",
    title: null,
    units: [{ index: 0, kind: "slide" }],
  });
  assert.deepEqual(judgeMistralRead(claim, withFigure), { ok: true });
  // 🔴 UNDESCRIBED IS STILL PRESENT. The gate asks whether the picture survived as a figure block —
  // exactly what `pptx-model.ts`'s own "a picture nobody looked at is still a picture" rule
  // produces with vision off. Holding the vendor lane to "and described" would reject the same
  // cost-off upload path the local lane is allowed to produce.
});

test("a DOCX never claims images — that claim is PPTX-only until it is measured for DOCX too", () => {
  assert.equal(claimOf("docx", bytesOf("public/reader-sample.docx")).images, 0);
});
