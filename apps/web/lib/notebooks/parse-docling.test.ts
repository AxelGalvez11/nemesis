import assert from "node:assert/strict";
import { test } from "node:test";

import type { DocBlock, DocRect, DocumentModel } from "@nemesis/shared";

import { buildDoclingParse } from "./parse-docling.ts";
import type { CapturedFigure } from "@/lib/pdf/structure";

/**
 * A minimal but REAL DoclingDocument: reading order in `body.children`, text and
 * pictures in their own buckets, a page table with sizes. Built by hand rather
 * than mocked, because the adapter's whole job is reading this shape correctly.
 */
function doclingDoc(options: {
  pages: number;
  /** 1-based page numbers that actually carry a paragraph. */
  filled: number[];
  pictures?: number[];
}): unknown {
  const texts = options.filled.map((page, i) => ({
    self_ref: `#/texts/${i}`,
    label: "text",
    text: `Body text on page ${page}.`,
    prov: [{ page_no: page, bbox: { l: 50, t: 700, r: 550, b: 660, coord_origin: "BOTTOMLEFT" } }],
  }));
  const pictures = (options.pictures ?? []).map((page, i) => ({
    self_ref: `#/pictures/${i}`,
    label: "picture",
    prov: [{ page_no: page, bbox: { l: 60, t: 600, r: 400, b: 400, coord_origin: "BOTTOMLEFT" } }],
  }));
  const pages: Record<string, unknown> = {};
  for (let n = 1; n <= options.pages; n += 1) {
    pages[String(n)] = { page_no: n, size: { width: 612, height: 792 } };
  }
  return {
    name: "some-file.pdf",
    body: {
      children: [
        ...texts.map((_, i) => ({ $ref: `#/texts/${i}` })),
        ...pictures.map((_, i) => ({ $ref: `#/pictures/${i}` })),
      ],
    },
    texts,
    pictures,
    pages,
  };
}

const nativeMap = (entries: [number, boolean][]) => new Map<number, boolean>(entries);

test("a PDF with no native-text map is REFUSED, not graded generously", async () => {
  // 🔴 THIS IS THE BLOCKER, AS A TEST. Docling's export carries no OCR signal —
  // a key sweep over all 322 corpus exports found none — so grading a PDF
  // without PDF.js's answer means reporting a page rescued from pixels as though
  // it had real embedded text. Refusing sends the document to our own parser,
  // which can still produce a split it has evidence for.
  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 2, filled: [1, 2] }),
    kind: "pdf",
    status: "success",
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "unreconciled");
});

test("a scanned PDF is recorded as read from PIXELS, not as native text", async () => {
  // The 7 scanned PDFs in the corpus are exactly why the map exists. Docling +
  // RapidOCR reads them; without this split the record would claim they had a
  // text layer all along.
  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 3, filled: [1, 2, 3] }),
    kind: "pdf",
    status: "success",
    nativeText: nativeMap([
      [0, false],
      [1, false],
      [2, false],
    ]),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const coverage = outcome.document.coverage as unknown as Record<string, number>;
  assert.equal(coverage.units, 3);
  assert.equal(coverage.unitsVision, 3, "every page came from pixels");
  assert.equal(coverage.unitsNative, 0, "and none of them had their own text");
});

test("an ordinary PDF is native, and a page docling filled nothing for is UNREAD", async () => {
  // Docling returns SUCCESS on documents it understood partially — measured, on
  // 8 corpus files it declared more units than it filled. A page with no blocks
  // is unread whatever its text layer says: nothing reached the student from it.
  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 4, filled: [1, 2, 4] }),
    kind: "pdf",
    status: "success",
    nativeText: nativeMap([
      [0, true],
      [1, true],
      [2, true],
      [3, true],
    ]),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const coverage = outcome.document.coverage as unknown as Record<string, number | string>;
  assert.equal(coverage.units, 4);
  assert.equal(coverage.unitsNative, 3);
  assert.equal(coverage.unitsUnread, 1, "page 3 produced nothing and must say so");
  assert.equal(coverage.state, "partial", "and that cannot read as complete");
});

test("a picture nobody looked at keeps the document out of 'complete'", async () => {
  // Docling DETECTS figures; it never describes them. Marking them decorative
  // would be free and would read as complete, and it would be a lie —
  // `decorative` means "we know it is a bullet or a rule", which we do not.
  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 1, filled: [1], pictures: [1] }),
    kind: "pdf",
    status: "success",
    nativeText: nativeMap([[0, true]]),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const coverage = outcome.document.coverage as unknown as {
    state: string;
    figures?: { found: number; described: number; reasons: Record<string, number> };
  };
  assert.equal(coverage.figures?.found, 1);
  assert.equal(coverage.figures?.described, 0);
  assert.equal(coverage.figures?.reasons["not-examined"], 1);
  assert.equal(coverage.state, "partial");
});

test("🔴 a figure matched to our own pixels is no longer 'not-examined' — SOMETHING looked", async () => {
  // This is the wiring P3 exists for: without `pdfFigures`, the test above shows
  // Docling's figure sits at `not-examined` forever. Supplying a match must move
  // it to SOME OTHER reason — `described` if a vision key happens to be
  // configured in whatever environment runs this test, `vision-unavailable`
  // otherwise — because either one proves `lookAtFigures` actually ran, which is
  // the fact this test protects. Only `not-examined` would mean the wiring is a
  // no-op.
  const baseline = await buildDoclingParse({
    document: doclingDoc({ pages: 1, filled: [1], pictures: [1] }),
    kind: "pdf",
    status: "success",
    nativeText: nativeMap([[0, true]]),
  });
  assert.equal(baseline.ok, true);
  if (!baseline.ok) return;
  const target = baseline.document.model!.blocks.find((b) => b.kind === "figure") as DocBlock | undefined;
  const targetRect = target?.rect as DocRect | undefined;
  assert.ok(targetRect, "the adapter must have placed the picture somewhere for this test to mean anything");

  // A source model whose own figure sits at EXACTLY the Docling figure's rect —
  // containment is then 1.0, so the match is not what this test is checking.
  const sourceFigure: DocBlock = {
    figure: { ref: target!.figure!.ref },
    headingPath: [],
    id: "src-0",
    kind: "figure",
    rect: targetRect,
    text: "",
    unit: 0,
  } as DocBlock;
  const sourceModel: DocumentModel = {
    blocks: [sourceFigure],
    format: "pdf",
    units: [{ index: 0, kind: "page" }],
  } as DocumentModel;
  const image: CapturedFigure = { height: 10, png: new Uint8Array([1, 2, 3]), width: 10 };
  const images = new Map<string, CapturedFigure>([[`0:${target!.figure!.ref}`, image]]);

  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 1, filled: [1], pictures: [1] }),
    kind: "pdf",
    status: "success",
    nativeText: nativeMap([[0, true]]),
    pdfFigures: { images, model: sourceModel },
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const coverage = outcome.document.coverage as unknown as {
    figures?: { found: number; described: number; reasons: Record<string, number> };
  };
  assert.equal(coverage.figures?.found, 1);
  assert.ok(
    !coverage.figures?.reasons["not-examined"],
    `expected the match to move the figure off 'not-examined', got reasons=${JSON.stringify(coverage.figures?.reasons)}`,
  );
});

test("a Word file is one document, never a page, and needs no page map", async () => {
  // Word paginates at layout time. Claiming "page 1 of 1" for a 40-page
  // dissertation invents a locator every later citation would point at falsely.
  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 1, filled: [1] }),
    kind: "docx",
    status: "success",
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const coverage = outcome.document.coverage as unknown as Record<string, unknown>;
  assert.equal(coverage.unitKind, "document");
  assert.equal(coverage.units, 1);
  assert.equal(outcome.document.model?.units[0]?.kind, "body");
});

test("a page map offered for a flowing format is dropped here, not passed down", async () => {
  // `doclingCoverage` REFUSES a page map for a document with no pages, rather
  // than ignoring it — refusing is right, because a caller that thought it had
  // recorded a split must not be told it succeeded. This lane strips it instead,
  // so a caller that probes every file uniformly does not turn every Word
  // document into a fallback.
  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 1, filled: [1] }),
    kind: "docx",
    status: "success",
    nativeText: nativeMap([[0, true]]),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const coverage = outcome.document.coverage as unknown as Record<string, unknown>;
  assert.equal(coverage.unitKind, "document");
});

test("the unit cap TRUNCATES and DISCLOSES, it does not quietly shorten the file", async () => {
  // Cost tracks unit count, not bytes: a few hundred KB of generated PDF can
  // declare a hundred thousand pages. Reading the first N and reporting that as
  // the whole document renames the file to its own prefix.
  const outcome = await buildDoclingParse({
    document: doclingDoc({ pages: 6, filled: [1, 2, 3, 4, 5, 6] }),
    kind: "pdf",
    status: "success",
    maxUnits: 2,
    nativeText: nativeMap([
      [0, true],
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [5, true],
    ]),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const coverage = outcome.document.coverage as unknown as Record<string, number | string>;
  assert.equal(outcome.document.model?.units.length, 2, "only two units were built");
  assert.equal(coverage.units, 6, "but the file still declares six");
  assert.equal(coverage.unitsNative, 2);
  assert.equal(coverage.unitsUnread, 4, "the four we refused to read are counted");
  assert.equal(coverage.state, "partial");
});

test("a document that produced no text at all is a verdict about the file", async () => {
  const outcome = await buildDoclingParse({
    document: { body: { children: [] }, texts: [], pages: {} },
    kind: "pdf",
    status: "success",
    nativeText: nativeMap([]),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "empty");
});

test("garbage from the sidecar does not throw — it falls back", async () => {
  // The input crossed a process boundary from a language with different failure
  // modes. A parser that throws on hostile input takes the worker down with it.
  for (const junk of [null, "a string", 42, { body: null }, { body: { children: [{}] } }]) {
    const outcome = await buildDoclingParse({ document: junk, kind: "pdf", status: "success", nativeText: nativeMap([]) });
    assert.equal(outcome.ok, false, `${JSON.stringify(junk)} must be refused, not thrown on`);
  }
});
