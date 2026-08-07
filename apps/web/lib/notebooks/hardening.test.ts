/**
 * Phase 7: what a hostile or merely enormous file does to this parser.
 *
 * Archive bombs by size and by count are covered in `office-unzip.test.ts`. What
 * is here is everything else the roadmap names — the unit cap, malformed
 * containers, files that lie about what they are, and the rule that binds all of
 * them together:
 *
 * 🔴 A BOUND MUST REPORT ITSELF. Refusing to read something is fine. Reading
 * part of it and describing that part as the whole is not, and it is the failure
 * every guard here is written to avoid: "never solve capacity by silently
 * deleting content."
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { describeCoverage, unitsRead } from "@nemesis/shared";

import { pdfCoverage } from "./extract-coverage";
import { extractDocxText } from "./office";
import { kindFor, parseDocument, sniffKind } from "./parse-document";
import { MAX_UNITS_PER_PARSE } from "./parse-worker";
import { readPdfStructure } from "@/lib/pdf/structure";

const SAMPLE_PDF = "public/reader-sample.pdf";
const samplePdf = () => new Uint8Array(readFileSync(SAMPLE_PDF));

// ── The unit cap ───────────────────────────────────────────────────────────

// 🔴 COST TRACKS UNITS, NOT BYTES. A few hundred kilobytes of generated PDF can
// declare a hundred thousand pages, so the upload byte ceiling bounds nothing
// here. Measured on real files: a 33.5 MB deck parses in 50 ms and a 13 MB,
// 2,116-page PDF takes 12.3 seconds.
test("a document past the unit cap is read up to the cap, not refused", async () => {
  const full = await readPdfStructure(samplePdf());
  assert.ok(full.declaredUnits > 1, "the sample needs more than one page to test a cap");

  const capped = await readPdfStructure(samplePdf(), { maxUnits: 1 });
  assert.equal(capped.model.units.length, 1, "only the first unit was read");
  assert.equal(capped.declaredUnits, full.declaredUnits, "and the file's real size is still reported");
  assert.ok(capped.model.blocks.length > 0, "a capped parse is still a real parse");
  assert.ok(
    capped.model.blocks.every((b) => b.unit === 0),
    "no block may reference a unit that was never read",
  );
});

// 🔴 THE DIFFERENCE BETWEEN "5,000 PAGES, ALL READ" AND "5,000 OF 100,000".
// Without this the record would rename the document to its own prefix and call
// it complete — the exact shape of solving capacity by deleting content.
test("units past the cap reach coverage as unread, and the sentence says so", () => {
  const coverage = pdfCoverage({
    pageTexts: Array.from({ length: 5_000 }, () => "This page carries a full paragraph of its own readable text, well past the threshold that separates a page with a text layer from a page that is a photograph of one."),
    readByVision: new Set(),
    unreadBeyondCap: 95_000,
  });
  assert.equal(coverage.units, 100_000);
  assert.equal(unitsRead(coverage), 5_000);
  assert.equal(coverage.unitsUnread, 95_000);
  assert.equal(coverage.state, "partial", "a capped read is never complete");
  assert.match(describeCoverage(coverage) ?? "", /5,000 of 100,000 pages could be read/);
});

test("the four unit buckets still reconcile when the cap applies", () => {
  const coverage = pdfCoverage({
    pageTexts: ["This page carries a full paragraph of its own readable text, well past the threshold that separates a page with a text layer from a page that is a photograph of one.", ""],
    readByVision: new Set([2]),
    unreadBeyondCap: 7,
  });
  assert.equal(
    coverage.unitsNative + coverage.unitsVision + coverage.unitsBoth + coverage.unitsUnread,
    coverage.units,
  );
});

test("the cap is only a cap — a document under it reports nothing missing", () => {
  const coverage = pdfCoverage({
    pageTexts: ["This page carries a full paragraph of its own readable text, well past the threshold that separates a page with a text layer from a page that is a photograph of one."],
    readByVision: new Set(),
    unreadBeyondCap: 0,
  });
  assert.equal(coverage.state, "complete");
});

test("the cap sits above the largest real document and still bounds something", () => {
  assert.ok(MAX_UNITS_PER_PARSE >= 5_000);
  assert.ok(MAX_UNITS_PER_PARSE <= 10_000);
});

// ── Malformed containers ───────────────────────────────────────────────────

// 🔴 FAIL CLOSED, AND FAIL READABLY. A student who uploaded a broken file needs
// to be told it is broken; a stack trace tells them the app is.
test("a truncated Office file is refused with a message, not a crash", () => {
  const half = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
  assert.throws(() => extractDocxText(half), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.length > 0);
    return true;
  });
});

test("a zip that is a zip but holds no Word document says which", () => {
  // A valid empty archive: end-of-central-directory record and nothing else.
  const empty = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
  assert.throws(() => extractDocxText(empty), /Word \(\.docx\)/);
});

test("random bytes claiming to be a Word file are refused", () => {
  const noise = new Uint8Array(4096);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 7 + 13) % 256;
  assert.throws(() => extractDocxText(noise));
});

// ── Files that lie about what they are ─────────────────────────────────────

// A real course folder held two lecture PDFs whose long filenames had been
// truncated past the ".pdf", so the contents have to be the tiebreaker.
test("contents outrank the filename when the name has lost its extension", () => {
  const pdf = samplePdf();
  assert.equal(kindFor("lecture-notes-week-eleven-final-version", ""), null);
  assert.equal(sniffKind(pdf), "pdf");
});

// 🔴 A KNOWN LIMIT, ASSERTED RATHER THAN WISHED AWAY. `kindFor` believes the
// filename first, so a PDF named `.docx` goes to the Word reader and is refused
// there. What must hold is that the refusal is a readable Error about the file,
// never an unhandled crash — sniffing the contents when the named reader fails
// is a real improvement and is recorded as unbuilt.
test("a file whose extension lies fails readably rather than crashing", async () => {
  await assert.rejects(
    () => parseDocument(samplePdf(), "not-really.docx", ""),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Word, PowerPoint or Excel/);
      return true;
    },
  );
});

test("an unsupported type is a verdict, not an exception", async () => {
  const outcome = await parseDocument(new Uint8Array([1, 2, 3, 4]), "notes.xyz", "");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "unsupported");
});

test("an empty file is a verdict, not an exception", async () => {
  const outcome = await parseDocument(new Uint8Array(0), "empty.pdf", "application/pdf");
  assert.equal(outcome.ok, false);
});

// 🔴 A FILE THAT WILL NOT OPEN MUST NOT TAKE THE UPLOAD WITH IT. The structural
// reader is allowed to fail; `parseDocument` falls back rather than throwing,
// because a worse parse beats no parse.
test("a corrupt PDF does not throw out of the parser", async () => {
  const broken = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0xff, 0xfe, 0x00]);
  const outcome = await parseDocument(broken, "broken.pdf", "application/pdf");
  assert.equal(outcome.ok, false, "nothing readable came out, and that is a verdict");
});
