import assert from "node:assert/strict";
import { test } from "node:test";

import { citeLocator, walkBlocks } from "@nemesis/shared";

import { PAGE_READ_SCORER_VERSION, READ_TOKEN_FLOOR, scorePagesRead } from "./page-read";
import {
  buildPdfParsedDocument,
  PAGE_READ_RECORD_CAP,
  parsePdfDocument,
  PDF_PARSER_VERSION,
  printedLabelFor,
  readPdfFacts,
  splitTextLayerBlocks,
  type PdfReadRecord,
} from "./pdf-parse";

const words = (n: number) => "word ".repeat(n).trim();

/** A read record with the fields every test needs and nothing else. */
const record = (over: Partial<PdfReadRecord> & { pageTexts: readonly string[] }): PdfReadRecord => ({
  contentHash: "sha256:abc",
  pageCount: over.pageTexts.length,
  truncated: false,
  ...over,
});

// ── The ordinary document ────────────────────────────────────────────────────

test("a readable document becomes one page unit per page, numbered from 1", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(50), words(60), words(70)] }));
  assert.equal(doc.kind, "pdf");
  assert.equal(doc.parserVersion, PDF_PARSER_VERSION);
  assert.equal(doc.contentHash, "sha256:abc");
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.index),
    [1, 2, 3],
  );
  assert.ok(doc.units.every((unit) => unit.locator.kind === "page"));
  assert.ok(doc.units.every((unit) => unit.transcribed === undefined));
  assert.ok(doc.units.every((unit) => unit.blocks.every((block) => block.method === "textLayer")));
  assert.equal(doc.coverage.unitsFound, 3);
  assert.equal(doc.coverage.unitsRead, 3);
  assert.deepEqual(doc.coverage.unitsUnread, []);
});

test("a blank line splits a page into blocks, numbered in reading order", () => {
  const page = `${words(30)}\n\n${words(30)}\n \n${words(30)}`;
  const doc = buildPdfParsedDocument(record({ pageTexts: [page] }));
  const blocks = doc.units[0]?.blocks ?? [];
  assert.equal(blocks.length, 3);
  assert.deepEqual(
    blocks.map((block) => block.ordinal),
    [0, 1, 2],
  );
  assert.ok(blocks.every((block) => block.kind === "paragraph"));
});

test("a page with no blank line stays one block, and its line breaks survive", () => {
  const page = `Title line\n${words(40)}`;
  const doc = buildPdfParsedDocument(record({ pageTexts: [page] }));
  assert.equal(doc.units[0]?.blocks.length, 1);
  assert.ok(doc.units[0]?.blocks[0]?.text.includes("\n"));
});

// A heading has no measurement behind it without geometry, and every rule that
// would produce one (short line, capitals, no full stop) is an assumption about
// Latin script. This test is the guard on that promise, not a description of a
// limitation.
test("nothing is promoted to a heading, whatever the line looks like", () => {
  const doc = buildPdfParsedDocument(
    record({ pageTexts: [`INTRODUCTION\n\n${words(40)}\n\n1. Scope\n\n第一章`] }),
  );
  assert.ok(doc.units[0]?.blocks.every((block) => block.kind === "paragraph"));
  assert.ok(doc.units[0]?.blocks.every((block) => block.depth === undefined));
});

test("no block carries a box, because no position was ever measured", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(50), ""] }));
  assert.ok([...walkBlocks(doc)].every(({ block }) => block.box === undefined));
});

test("every block id is unique across the document", () => {
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: [`${words(30)}\n\n${words(30)}`, words(40)],
      transcripts: new Map([[1, "read from the picture"]]),
      wholeTranscript: null,
    }),
  );
  const ids = [...walkBlocks(doc)].map(({ block }) => block.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── Pages nobody read ────────────────────────────────────────────────────────
//
// The path that actually runs today: vision is unconfigured, so the transcript map
// is empty and every picture-page is simply unread.

test("with no transcripts at all, every picture-page is named as unread", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(50), "", words(60), ""] }));
  // Page NUMBERS, not indices — a locator is 1-based, and this list is what makes
  // the gap nameable rather than merely countable.
  assert.deepEqual(doc.coverage.unitsUnread, [2, 4]);
  assert.equal(doc.coverage.unitsFound, 4);
  assert.equal(doc.coverage.unitsRead, 2);
  assert.ok(doc.units.every((unit) => unit.transcribed === undefined));
});

// The page that made the case for a floor rather than a zero test: it extracts its
// heading and nothing a reader came for.
test("a heading over a full-page screenshot counts as unread, not read", () => {
  const heading = "Breastfeeding Considerations: Enoxaparin LexiDrug";
  assert.ok(scorePagesRead([heading])[0]!.signals.tokens < READ_TOKEN_FLOOR);
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(60), heading] }));
  assert.deepEqual(doc.coverage.unitsUnread, [2]);
  assert.equal(doc.coverage.unitsRead, 1);
  // Its scraps are still kept — unread is a claim about coverage, not a reason to
  // throw away the words the page did have.
  assert.equal(doc.units[1]?.blocks[0]?.text, heading);
  assert.equal(doc.units[1]?.blocks[0]?.method, "textLayer");
});

test("read plus unread always accounts for every page", () => {
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: ["", words(50), "", "", words(60)],
      transcripts: new Map([[2, "a transcript"]]),
    }),
  );
  assert.equal(
    doc.coverage.unitsRead + (doc.coverage.unitsUnread?.length ?? 0),
    doc.coverage.unitsFound,
  );
});

test("a partial read never presents as complete", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(50), "", ""] }));
  assert.notEqual(doc.coverage.unitsRead, doc.coverage.unitsFound);
  assert.ok(doc.coverage.notes?.some((note) => note.includes("not read")));
});

// ── The routing decision, kept ───────────────────────────────────────────────
//
// Whether a page was read is a decision with money and accuracy behind it, and it
// used to leave no trace: the report said how many pages were unread and nothing
// about why. These four tests are the promise that "why" survives the parse.

test("the reason each unread page was routed to a picture read is kept with the parse", () => {
  const garbled = " ".repeat(60);
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(60), "", garbled] }));
  assert.equal(doc.meta?.pageReadScorer, PAGE_READ_SCORER_VERSION);
  const kept = JSON.parse(String(doc.meta?.pageReadUnread)) as Record<
    string,
    { reason: string; score: number }
  >;
  // Keyed by PAGE NUMBER, matching unitsUnread and every locator in the document.
  assert.deepEqual(Object.keys(kept), ["2", "3"]);
  assert.equal(kept["2"]?.reason, "no-text-layer");
  assert.equal(kept["3"]?.reason, "garbled-text-layer");
  assert.ok(kept["3"]!.score >= 0 && kept["3"]!.score < 1);
  assert.deepEqual(doc.coverage.unitsUnread, [2, 3]);
});

// A page of rubbish is the case a length test cannot see: it has more characters
// than most real pages and says nothing at all.
test("a page whose text layer is long and unusable is counted as unread", () => {
  const doc = buildPdfParsedDocument(
    record({ pageTexts: [words(60), " ".repeat(80)] }),
  );
  assert.deepEqual(doc.coverage.unitsUnread, [2]);
  assert.equal(doc.coverage.unitsRead, 1);
  assert.ok(doc.coverage.notes?.some((note) => note.includes("broken font map")));
});

test("the coverage report counts the pages by reason, in words", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(60), "", ""] }));
  const note = (doc.coverage.notes ?? []).find((line) => line.includes(PAGE_READ_SCORER_VERSION));
  assert.ok(note, "the scorer names its build on every parse");
  assert.match(note!, /1 page\(s\): carried its own words/);
  assert.match(note!, /2 page\(s\): had no text layer at all/);
});

test("a document every page of which read fine carries no routing record at all", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(50), words(60)] }));
  assert.equal(doc.meta, undefined);
  assert.ok(doc.coverage.notes?.some((note) => note.includes(PAGE_READ_SCORER_VERSION)));
});

// ── Transcribed pages ────────────────────────────────────────────────────────

test("a transcript lands on the page it was read from, not one off it", () => {
  // The one bug this module is most likely to have: readPdfPagesWithVision keys by
  // 0-based index and a locator is 1-based. A middle page catches a shift in either
  // direction; page 0 would not.
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: [words(50), "", words(60), words(70)],
      transcripts: new Map([[1, "what the picture said"]]),
    }),
  );
  const transcribed = doc.units.filter((unit) => unit.transcribed);
  assert.equal(transcribed.length, 1);
  assert.equal(transcribed[0]?.locator.index, 2);
  assert.equal(transcribed[0]?.blocks[0]?.text, "what the picture said");
  assert.equal(transcribed[0]?.blocks[0]?.method, "vision");
  assert.deepEqual(doc.coverage.unitsUnread, []);
  assert.equal(doc.coverage.unitsRead, 4);
});

test("a page's own words and the machine's reading of it stay separate blocks, in that order", () => {
  const heading = "Table 4. Renal dosing";
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: [heading],
      transcripts: new Map([[0, "CrCl 30-50: reduce by half"]]),
    }),
  );
  const blocks = doc.units[0]?.blocks ?? [];
  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((block) => block.method),
    ["textLayer", "vision"],
  );
  assert.deepEqual(
    blocks.map((block) => block.ordinal),
    [0, 1],
  );
  // No prose marker is written into the text: the provenance is the method column.
  assert.ok(!blocks[1]?.text.includes("["));
});

test("a transcription claims no confidence it never measured", () => {
  const doc = buildPdfParsedDocument(
    record({ pageTexts: [""], transcripts: new Map([[0, "read from pixels"]]) }),
  );
  assert.equal(doc.units[0]?.blocks[0]?.confidence, undefined);
});

test("an empty transcript is not a read", () => {
  const doc = buildPdfParsedDocument(
    record({ pageTexts: [words(50), ""], transcripts: new Map([[1, "   "]]) }),
  );
  assert.deepEqual(doc.coverage.unitsUnread, [2]);
  assert.equal(doc.units[1]?.transcribed, undefined);
});

test("pages left out by the read limit are told apart from pages that came back empty", () => {
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: ["", "", "", words(60)],
      // Two of the three picture-pages were sent; one of those returned nothing.
      requested: [0, 1],
      transcripts: new Map([[0, "read"]]),
    }),
  );
  assert.deepEqual(doc.coverage.unitsUnread, [2, 3]);
  const notes = doc.coverage.notes ?? [];
  assert.ok(notes.some((note) => note.includes("never sent")));
  assert.ok(notes.some((note) => note.includes("came back with nothing")));
});

// ── The whole-document read ──────────────────────────────────────────────────

test("an undivided transcript is recorded at document level, never sliced into pages", () => {
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: ["", "", ""],
      wholeTranscript: "Page one words. Page two words. Page three words.",
    }),
  );
  assert.equal(doc.units.length, 4);
  const last = doc.units[3];
  assert.equal(last?.locator.kind, "document");
  assert.equal(last?.locator.index, undefined);
  assert.equal(last?.transcribed, true);
  assert.equal(last?.blocks[0]?.method, "vision");
  assert.equal(citeLocator(last!.locator), "this document");
  // The document WAS read, in full — just not attributably page by page.
  assert.equal(doc.coverage.unitsRead, 3);
  assert.deepEqual(doc.coverage.unitsUnread, []);
  assert.ok(doc.coverage.notes?.some((note) => note.includes("no page boundaries")));
});

// The two records answer different questions and a big scan is where they visibly
// disagree: every page failed its text layer, and no page went unread, because the
// pixels were read instead.
test("a scan read whole says every page failed its text layer and none went unread", () => {
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: Array.from({ length: 60 }, () => ""),
      wholeTranscript: "Everything the scanner saw, in one pass.",
    }),
  );
  assert.deepEqual(doc.coverage.unitsUnread, []);
  assert.equal(doc.coverage.unitsRead, 60);
  const kept = JSON.parse(String(doc.meta?.pageReadUnread)) as Record<string, unknown>;
  assert.equal(Object.keys(kept).length, PAGE_READ_RECORD_CAP);
  // The note about the cap must be true as written: it talks about the pages the
  // text layer did not carry, which is 60, and never about unitsUnread, which is 0.
  const capped = (doc.coverage.notes ?? []).find((note) => note.includes("have their reason kept"));
  assert.ok(capped, "the cap is admitted");
  assert.match(capped!, new RegExp(`first ${PAGE_READ_RECORD_CAP} of the 60 pages`));
  assert.ok(!capped!.includes("unitsUnread"));
});

test("no phantom document unit appears when there was no whole-document read", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(50), words(60)] }));
  assert.ok(doc.units.every((unit) => unit.locator.kind === "page"));
  const blank = buildPdfParsedDocument(record({ pageTexts: ["", ""], wholeTranscript: "   " }));
  assert.equal(blank.units.length, 2);
  assert.deepEqual(blank.coverage.unitsUnread, [1, 2]);
});

// ── Printed page numbers ─────────────────────────────────────────────────────

test("a page whose printed number differs from its position carries that label", () => {
  assert.equal(printedLabelFor(["i", "ii", "1"], 1), "i");
  assert.equal(printedLabelFor(["i", "ii", "1"], 2), "ii");
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: [words(40), words(40), words(40)],
      facts: {
        pageLabels: ["i", "ii", "1"],
        info: { title: null, producer: null, creator: null },
      },
    }),
  );
  assert.equal(doc.units[0]?.locator.printedLabel, "i");
  assert.equal(citeLocator(doc.units[0]!.locator), "page i");
  // Page 3 prints as "1": the reader sees 1, so the citation must say 1.
  assert.equal(doc.units[2]?.locator.printedLabel, "1");
  assert.equal(citeLocator(doc.units[2]!.locator), "page 1");
});

test("a label identical to the page's position is not stored twice", () => {
  assert.equal(printedLabelFor(["1", "2", "3"], 2), undefined);
  assert.equal(printedLabelFor([" 2 "], 1), "2");
  assert.equal(printedLabelFor(["", null], 1), undefined);
});

test("a PDF with no page labels simply has none", () => {
  assert.equal(printedLabelFor(null, 1), undefined);
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(40)] }));
  assert.equal(doc.units[0]?.locator.printedLabel, undefined);
  assert.equal(citeLocator(doc.units[0]!.locator), "page 1");
});

// ── Titles, meta, truncation ─────────────────────────────────────────────────

test("the PDF's own title wins over the one guessed from its first line", () => {
  const doc = buildPdfParsedDocument(
    record({
      pageTexts: [words(40)],
      guessedTitle: "A line that happened to be first",
      facts: {
        pageLabels: null,
        info: { title: "The Real Title", producer: "Acrobat", creator: null },
      },
    }),
  );
  assert.equal(doc.title, "The Real Title");
  assert.equal(doc.meta?.producer, "Acrobat");
});

test("with no title in the file, the guess from the text stands", () => {
  const doc = buildPdfParsedDocument(
    record({ pageTexts: [words(40)], guessedTitle: "A line that happened to be first" }),
  );
  assert.equal(doc.title, "A line that happened to be first");
  assert.equal(doc.meta, undefined);
});

test("truncation is reported, not recomputed", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(10)], truncated: true }));
  assert.equal(doc.coverage.truncated, true);
});

test("a page count that disagrees with the pages extracted is said out loud", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(40)], pageCount: 3 }));
  assert.equal(doc.coverage.unitsFound, 3);
  assert.equal(doc.units.length, 1);
  assert.ok(doc.coverage.notes?.some((note) => note.includes("but text was extracted for 1")));
});

test("visual and table counts are zero, and the zero is explained", () => {
  const doc = buildPdfParsedDocument(record({ pageTexts: [words(40)] }));
  assert.deepEqual(doc.visuals, []);
  assert.deepEqual(doc.tables, []);
  assert.equal(doc.coverage.visualsFound, 0);
  assert.equal(doc.coverage.tablesFound, 0);
  assert.ok(doc.coverage.notes?.some((note) => note.includes("pages, not pictures")));
  assert.ok(doc.coverage.notes?.some((note) => note.includes("No block carries a box")));
});

test("the mapping is deterministic", () => {
  const input = record({
    pageTexts: [words(40), ""],
    transcripts: new Map([[1, "read"]]),
    guessedTitle: "Title",
  });
  assert.deepEqual(buildPdfParsedDocument(input), buildPdfParsedDocument(input));
});

test("a blank line splits the page whichever line ending it uses", () => {
  assert.deepEqual(splitTextLayerBlocks("one\r\n\r\ntwo"), ["one", "two"]);
  assert.deepEqual(splitTextLayerBlocks("one\n\ntwo"), ["one", "two"]);
  assert.deepEqual(splitTextLayerBlocks("one\r\ntwo"), ["one\r\ntwo"]);
});

test("splitting text is total on the empty page", () => {
  assert.deepEqual(splitTextLayerBlocks(""), []);
  assert.deepEqual(splitTextLayerBlocks("  \n \n "), []);
  const doc = buildPdfParsedDocument(record({ pageTexts: [""] }));
  assert.deepEqual(doc.units[0]?.blocks, []);
});

// ── The shell, against a real PDF ────────────────────────────────────────────
//
// The mapping above is tested without a PDF on purpose. This one proves the two
// facts the mapping cannot: that pdf.js hands back the printed labels a file
// declares, and that the shell survives a real parse without the caller's bytes
// being detached under it.

const buildFixturePdf = async (): Promise<Uint8Array> => {
  const { PDFDocument, PDFName, PDFNumber, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Fixture Document");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 3; index++) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`Page ${index + 1} of the fixture, with enough words on it to clear the floor`, {
      x: 40,
      y: 700,
      size: 12,
      font,
    });
    page.drawText(words(30), { x: 40, y: 660, size: 12, font });
  }
  // Front matter numbered i, ii, then a body that restarts at 1 — the shape that
  // makes a printed label differ from a position.
  const context = pdf.context;
  pdf.catalog.set(
    PDFName.of("PageLabels"),
    context.obj({
      Nums: context.obj([
        PDFNumber.of(0),
        context.obj({ S: PDFName.of("r") }),
        PDFNumber.of(2),
        context.obj({ S: PDFName.of("D"), St: PDFNumber.of(1) }),
      ]),
    }),
  );
  return pdf.save();
};

test("printed page labels come back from a real PDF", async () => {
  const bytes = await buildFixturePdf();
  const facts = await readPdfFacts(bytes);
  assert.deepEqual(facts.pageLabels, ["i", "ii", "1"]);
  assert.equal(facts.info.title, "Fixture Document");
  // The bytes must survive: pdf.js detaches the buffer it is handed, and every
  // caller downstream still needs these.
  assert.ok(bytes.byteLength > 0);
});

test("the shell parses a real PDF end to end", async () => {
  const bytes = await buildFixturePdf();
  const doc = await parsePdfDocument(bytes, { contentHash: "sha256:fixture" });
  assert.equal(doc.kind, "pdf");
  assert.equal(doc.title, "Fixture Document");
  assert.equal(doc.units.length, 3);
  assert.equal(doc.coverage.unitsFound, 3);
  assert.equal(doc.coverage.unitsRead, 3);
  assert.deepEqual(doc.coverage.unitsUnread, []);
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.printedLabel),
    ["i", "ii", "1"],
  );
  assert.ok(doc.units[0]?.blocks[0]?.text.includes("fixture"));
  assert.ok(doc.units.every((unit) => unit.blocks.every((block) => block.method === "textLayer")));
  assert.ok([...walkBlocks(doc)].every(({ block }) => block.box === undefined));
});

// This really does exercise the catch: pdf.js tries to recover (it logs "Indexing
// all PDF objects" while doing so) and then throws InvalidPDFException. Facts are a
// nicety, so failing to read them must never take the parse down with it.
test("a PDF that cannot be opened yields no facts rather than throwing", async () => {
  const facts = await readPdfFacts(new Uint8Array([1, 2, 3, 4]));
  assert.equal(facts.pageLabels, null);
  assert.equal(facts.info.title, null);
});
