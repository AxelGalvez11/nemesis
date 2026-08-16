// Builds public/reader-sample.pdf — the fixture the signed-out reader demo opens.
//
// Generated rather than checked in from a real document on purpose: it is
// field-agnostic (the standing product rule), tiny, licence-free, and it
// deliberately contains the shapes the reader has to handle — a title page, an
// outline/bookmark tree, headings, body paragraphs long enough to test text
// selection and in-page search, and a table drawn as ruled text.
//
// Run: pnpm --filter @nemesis/web exec tsx scripts/make-reader-fixture.mts

import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGES: { title: string; body: string[] }[] = [
  {
    title: "How a document becomes evidence",
    body: [
      "This sample exists so the Nemesis reader can be checked without signing in.",
      "It carries the shapes a real source carries: headings, running text, a table,",
      "and enough pages to make thumbnails and page navigation meaningful.",
      "",
      "Every page below is plain, selectable text. If you can drag-select this",
      "sentence, the text layer is working and citations can point at it.",
    ],
  },
  {
    title: "Structure is what makes a page addressable",
    body: [
      "A reader that only shows pixels can show you a page. A reader that knows the",
      "document's structure can take you to a section, quote it, and prove where the",
      "quote came from.",
      "",
      "Headings, lists and tables are not decoration. They are the addresses that a",
      "citation resolves against. Losing them during extraction is what turns a",
      "citation into a guess.",
      "",
      "The word ARBITRARY appears once on this page and once on page four, so that",
      "in-page search has something to find in more than one place.",
    ],
  },
  {
    title: "A table, drawn as a table",
    body: [
      "Column relationships survive here as position rather than as a flat list:",
    ],
  },
  {
    title: "The original stays authoritative",
    body: [
      "Reading mode is derived. It is a cleaned-up rendering of what the parser",
      "extracted, and it exists for comfort, not for proof.",
      "",
      "Source mode is the original: the real page, the real layout, the real wording.",
      "When the two disagree, the original wins, and anything ARBITRARY that the",
      "reconstruction invented is a bug in the reconstruction.",
      "",
      "This is the last page of the sample.",
    ],
  },
];

const TABLE: string[][] = [
  ["Representation", "Powers", "Authoritative"],
  ["Original file", "Source mode, download", "Yes"],
  ["Visual", "Page and slide rendering", "Faithful copy"],
  ["Structured parse", "Search, retrieval, AI", "Derived"],
];

async function main(): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Nemesis reader sample");
  pdf.setAuthor("Nemesis");
  pdf.setSubject("Fixture document for the built-in reader");

  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  PAGES.forEach((spec, index) => {
    const page = pdf.addPage([612, 792]);
    page.drawText(spec.title, { font: bold, size: 20, x: 64, y: 700, color: rgb(0.06, 0.07, 0.09) });
    page.drawLine({
      start: { x: 64, y: 688 },
      end: { x: 548, y: 688 },
      thickness: 0.75,
      color: rgb(0.82, 0.83, 0.85),
    });

    let y = 654;
    for (const line of spec.body) {
      if (line) page.drawText(line, { font: body, size: 11.5, x: 64, y, color: rgb(0.16, 0.17, 0.2) });
      y -= 20;
    }

    if (index === 2) {
      TABLE.forEach((row, rowIndex) => {
        const rowY = y - rowIndex * 26;
        row.forEach((cell, cellIndex) => {
          page.drawText(cell, {
            font: rowIndex === 0 ? bold : body,
            size: 11,
            x: 64 + cellIndex * 165,
            y: rowY,
            color: rgb(0.16, 0.17, 0.2),
          });
        });
        page.drawLine({
          start: { x: 64, y: rowY - 8 },
          end: { x: 548, y: rowY - 8 },
          thickness: 0.5,
          color: rgb(0.88, 0.89, 0.91),
        });
      });
    }

    page.drawText(`${index + 1}`, { font: body, size: 9, x: 300, y: 48, color: rgb(0.55, 0.57, 0.6) });
  });

  // An outline so the reader's Outline tab has something real to flatten.
  const pageRefs = pdf.getPages().map((page) => page.ref);
  const context = pdf.context;
  const outlineRoot = context.nextRef();
  const items = PAGES.map(() => context.nextRef());
  items.forEach((ref, index) => {
    context.assign(
      ref,
      context.obj({
        Title: PDFDocument.prototype ? context.obj(PAGES[index].title) : context.obj(""),
        Parent: outlineRoot,
        Dest: context.obj([pageRefs[index], context.obj("Fit")]),
        ...(index > 0 ? { Prev: items[index - 1] } : {}),
        ...(index < items.length - 1 ? { Next: items[index + 1] } : {}),
      }),
    );
  });
  context.assign(
    outlineRoot,
    context.obj({ Type: "Outlines", First: items[0], Last: items[items.length - 1], Count: items.length }),
  );
  pdf.catalog.set(context.obj("Outlines"), outlineRoot);

  const bytes = await pdf.save();
  await writeFile(new URL("../public/reader-sample.pdf", import.meta.url), bytes);
  console.log(`reader-sample.pdf — ${PAGES.length} pages, ${bytes.length} bytes`);

  await makeScanFixture();
}

/** public/reader-sample-scan.pdf — the HYBRID shape, in miniature.
 *
 *  One page of real text, then one page that is nothing but a full-page image.
 *  That is the exact shape of a real recitation PDF (7 text pages, 5 scanned),
 *  and it is what `lib/reader/pdf-page-scan.ts` has to tell apart: the first
 *  page must never be offered to OCR, the second must be recognised as a
 *  picture of a page rather than a blank one. */
async function makeScanFixture(): Promise<void> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const textPage = pdf.addPage([612, 792]);
  textPage.drawText("This page carries its own text layer.", { font, size: 14, x: 64, y: 700, color: rgb(0.1, 0.1, 0.12) });
  textPage.drawText("Selection, search and citations all work here, so OCR must never touch it.", {
    font, size: 11, x: 64, y: 672, color: rgb(0.2, 0.2, 0.24),
  });

  // A tiny PNG, drawn to fill the whole page. The bytes do not matter — what is
  // being tested is the GEOMETRY: no text, one image covering the page.
  const pixel = await pdf.embedPng(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const scanPage = pdf.addPage([612, 792]);
  scanPage.drawImage(pixel, { x: 0, y: 0, width: 612, height: 792 });

  const bytes = await pdf.save();
  await writeFile(new URL("../public/reader-sample-scan.pdf", import.meta.url), bytes);
  console.log(`reader-sample-scan.pdf — 2 pages (1 text, 1 image-only), ${bytes.length} bytes`);
}

void main();
