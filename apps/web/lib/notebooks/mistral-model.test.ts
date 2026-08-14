/**
 * What must survive the vendor boundary.
 *
 * 🔴 THIS FILE EXISTS BECAUSE THE RICH DOCUMENT MODEL HAS BEEN BUILT AND FLATTENED AT A BOUNDARY
 * FOUR SEPARATE TIMES IN THIS REPOSITORY. Swapping the extractor is exactly the change that does it
 * a fifth time: the mapping compiles, the text looks right, and the structure — merged cells,
 * heading paths, page boundaries, figure rectangles — quietly becomes `undefined` somewhere between
 * the vendor and the learner. Every assertion below names a field that has died at a boundary
 * before.
 *
 * The last test is the one that matters: a vendor response goes all the way through the persistence
 * envelope and out the other side, and a CITATION RESOLVES. Nothing here asserts the spelling of a
 * function; each asserts a property a learner would notice losing.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  citeQuote,
  resolveLocator,
  storedDocumentModel,
  structureEnvelope,
  cellText,
  documentToText,
} from "@nemesis/shared";

import { modelFromMistral, rectFrom, plainText, titleFromMistral } from "./mistral-model";
import { tableFromHtml } from "./mistral-tables";
import { buildMistralRequest, parseMistralResponse, mistralHandles, mistralMime } from "./mistral-ocr";
import type { MistralOcrResponse } from "./mistral-ocr";

/** A response shaped the way Mistral documents its own output. */
function response(pages: MistralOcrResponse["pages"]): MistralOcrResponse {
  return { model: "mistral-ocr-2505", pages, usage_info: { pages_processed: pages.length } };
}

// ── The grid ───────────────────────────────────────────────────────────────

test("a merged cell keeps its span, and the covered position stays empty", () => {
  const table = tableFromHtml(`
    <table>
      <thead><tr><th>Drug</th><th>Class</th></tr></thead>
      <tbody>
        <tr><td rowspan="2">Lisinopril</td><td>ACE inhibitor</td></tr>
        <tr><td>Antihypertensive</td></tr>
      </tbody>
    </table>`);

  assert.ok(table, "a table with cells must not be refused");
  // 🔴 THE FACT THAT DIES FIRST. A markdown pipe table cannot express this at all, which is why
  // the vendor is asked for HTML.
  const merged = table.cells?.find((cell) => cell.text === "Lisinopril");
  assert.equal(merged?.rowSpan, 2, "the rowspan must survive as a span, not as a repeated value");

  // The covered position is EMPTY in the projection and RESOLVES through the span.
  assert.equal(table.rows[2]?.[0], "", "a covered position must not be filled with a copy");
  assert.equal(cellText(table, 2, 0), "Lisinopril", "but it must resolve to what governs it");

  // The occupancy map: without it, "Antihypertensive" lands in column 0, under the wrong heading.
  assert.equal(table.rows[2]?.[1], "Antihypertensive", "a spanned row must not shift left");
});

test("header rows come from the markup and are never inferred", () => {
  const stated = tableFromHtml("<table><thead><tr><th>A</th><th>B</th></tr></thead><tr><td>1</td><td>2</td></tr></table>");
  assert.equal(stated?.headerRows, 1);
  assert.deepEqual(stated?.columns, ["A", "B"], "a stated header names the columns");
  assert.equal(stated?.headerSource, "present");

  // 🔴 A ROW THAT MERELY LOOKS LIKE LABELS IS NOT A HEADER. Guessing here relabels every value
  // beneath it, and `extractKnowledgeObjects` reads two-column tables straight into knowledge —
  // so a data row read as a header becomes a fact the learner is asked to recall.
  const unstated = tableFromHtml("<table><tr><td>Drug</td><td>Class</td></tr><tr><td>1</td><td>2</td></tr></table>");
  assert.equal(unstated?.headerRows, 0, "no markup means no header, not a guess");
  assert.equal(unstated?.columns, undefined, "and no invented column names");
});

// ── Locality ───────────────────────────────────────────────────────────────

test("a rectangle is converted to unit-relative coordinates, or omitted", () => {
  const size = { height: 1000, width: 500 };
  const rect = rectFrom({ bottom_right_x: 250, bottom_right_y: 500, top_left_x: 50, top_left_y: 100 }, size);
  // 🔴 THE VENDOR REPORTS PIXELS, THE MODEL STORES FRACTIONS. A missed conversion is a locator
  // pointing at a sliver in the top-left corner, and every rect still "exists" so nothing notices.
  assert.deepEqual(rect, { height: 0.4, width: 0.4, x: 0.1, y: 0.1 });

  assert.equal(rectFrom({ bottom_right_x: 250, bottom_right_y: 500, top_left_x: 50, top_left_y: 100 }, null), undefined,
    "no page size means no rectangle — never a guessed one");
  assert.equal(rectFrom({ bottom_right_x: 10, bottom_right_y: 500, top_left_x: 50, top_left_y: 100 }, size), undefined,
    "a box with no positive area is refused");
});

test("page boundaries survive for a PDF and are refused for a Word file", () => {
  const pages = [
    { index: 0, markdown: "# One\n\nAlpha." },
    { index: 1, markdown: "Beta." },
  ];

  const pdf = modelFromMistral(response(pages), "pdf", null);
  assert.equal(pdf?.units.length, 2, "a PDF keeps the vendor's pages");
  assert.equal(pdf?.units[1]?.kind, "page");
  assert.equal(pdf?.blocks.at(-1)?.unit, 1, "and the last block belongs to the second page");

  const slides = modelFromMistral(response(pages), "pptx", null);
  assert.equal(slides?.units[0]?.kind, "slide", "a deck's units are slides, not pages");

  // 🔴 WORD PAGINATES AT LAYOUT TIME. The vendor's page numbers are a property of ITS renderer, so
  // a citation to "page 7" of a .docx would point somewhere else after any re-render. The existing
  // DOCX lane refuses to invent them and a vendor swap must not quietly reverse that.
  const docx = modelFromMistral(response(pages), "docx", null);
  assert.equal(docx?.units.length, 1, "a Word file is one unit");
  assert.equal(docx?.units[0]?.kind, "body");
  assert.ok(docx?.blocks.every((block) => block.unit === 0), "every block belongs to that one unit");
});

// ── Structure ──────────────────────────────────────────────────────────────

test("a heading path is built from the heading stack and crosses page boundaries", () => {
  const model = modelFromMistral(
    response([
      { index: 0, markdown: "# Pharmacokinetics\n\n## Clearance\n\nRenal clearance is additive." },
      { index: 1, markdown: "Hepatic clearance is not." },
    ]),
    "pdf",
    null,
  );

  const nested = model?.blocks.find((block) => block.text.startsWith("Renal"));
  assert.deepEqual(nested?.headingPath, ["Pharmacokinetics", "Clearance"], "outermost first");

  // 🔴 A SECTION THAT STARTS ON PAGE 1 STILL GOVERNS PAGE 2. Resetting the stack per page orphans
  // every block after the first break, and `headingPath` is what retrieval and citations group by.
  const nextPage = model?.blocks.find((block) => block.text.startsWith("Hepatic"));
  assert.deepEqual(nextPage?.headingPath, ["Pharmacokinetics", "Clearance"]);

  // A heading's own path is its ANCESTORS, never itself.
  const heading = model?.blocks.find((block) => block.kind === "heading" && block.text === "Clearance");
  assert.deepEqual(heading?.headingPath, ["Pharmacokinetics"]);
  assert.equal(heading?.level, 2);
});

test("equations, lists and tables keep their own kinds", () => {
  const model = modelFromMistral(
    response([
      {
        index: 0,
        markdown:
          "# Formulas\n\n$$CL = k \\cdot V_d$$\n\n- First\n- Second\n\n<table><tr><td>a</td><td>b</td></tr></table>",
      },
    ]),
    "pdf",
    null,
  );
  const kinds = model?.blocks.map((block) => block.kind) ?? [];
  assert.deepEqual(kinds, ["heading", "equation", "listItem", "listItem", "table"]);
  // 🔴 AN EQUATION READ AS A PARAGRAPH IS A FACT THE LEARNER CANNOT BE TESTED ON PROPERLY, and
  // equation-heavy material is one of the five acceptance criteria.
  assert.match(model?.blocks[1]?.text ?? "", /CL = k/);
  assert.equal(model?.blocks[4]?.table?.rows[0]?.[1], "b", "the grid rides on the block");
});

test("markdown wrappers do not reach a learner as literal characters", () => {
  assert.equal(plainText("**Warfarin** is a _narrow_ therapeutic index drug"),
    "Warfarin is a narrow therapeutic index drug");
  assert.equal(plainText("see [the chart](http://x/y)"), "see the chart");
});

test("a located figure is recorded as present and UNEXAMINED, never as described", () => {
  const model = modelFromMistral(
    response([
      {
        dimensions: { height: 200, width: 100 },
        images: [{ bottom_right_x: 100, bottom_right_y: 100, id: "img-1", top_left_x: 0, top_left_y: 0 }],
        index: 0,
        markdown: "Some prose about the diagram.",
      },
    ]),
    "pdf",
    null,
  );
  const figure = model?.blocks.find((block) => block.kind === "figure");
  assert.ok(figure, "a picture the markdown never mentioned must still be recorded");
  assert.deepEqual(figure?.rect, { height: 0.5, width: 1, x: 0, y: 0 });
  // 🔴 ABSENT MEANS "NOT EXAMINED". An empty string would mean "something looked and saw nothing",
  // which is what stops a later vision pass from ever enriching this document.
  assert.equal(figure?.figure?.description, undefined);
});

// ── The vendor call ────────────────────────────────────────────────────────

test("the request asks for the structure the model needs, by data URI", () => {
  const body = JSON.parse(buildMistralRequest({ base64: "QUJD", mime: "application/pdf", model: "m" }));
  // 🔴 A SIGNED URL WOULD FORCE STORAGE INTO THE PARSER. The data URI is what lets `parseDocument`
  // keep its signature and both lanes keep reading the same function.
  assert.equal(body.document.type, "document_url");
  assert.equal(body.document.document_url, "data:application/pdf;base64,QUJD");
  // 🔴 HTML, NOT MARKDOWN. Markdown tables are already flat — asking for them destroys the grid
  // before it ever reaches Nemesis, and no later pass can recover it.
  assert.equal(body.table_format, "html");
  assert.equal(body.include_blocks, true);

  // 🔴🔴 THE PARAMETER THAT DECIDES WHETHER DIAGRAMS EXIST. Both of these read as "we do not want
  // the pixels" and they do completely different things: measured on one 36-page diagram-heavy
  // lecture, `include_image_base64: false` returns 13 figures with coordinates while
  // `image_limit: 0` returns none — and drops their labelled blocks too, so nothing downstream can
  // tell that a page ever had a picture on it. Coverage then computes `complete` for a page nobody
  // looked at, which is a false claim of completeness that reconciles perfectly.
  //
  // 🔴 THIS IS ASSERTED HERE, ON THE REQUEST, BECAUSE IT CANNOT BE ASSERTED DOWNSTREAM. Three
  // separate paths in the mapper turn an image into a figure block — the labelled `image` branch,
  // the markdown reader's `imageRefOf`, and `locatedFigures` for pictures the prose never names —
  // so breaking any one of them leaves the other two producing figures and a model-level guard
  // stays green. Verified by trying exactly that. The request is the one place the defect is
  // representable.
  assert.equal(body.include_image_base64, false, "figures must be located, only their pixels declined");
  assert.equal(body.image_limit, undefined, "image_limit: 0 suppresses the figures themselves");
});

test("a reply that is not the OCR shape is refused rather than half-read", () => {
  assert.equal(parseMistralResponse({ error: "nope" }), null);
  assert.equal(parseMistralResponse({ pages: [{ index: 0 }] }), null, "a page with no markdown is not a page");
  assert.equal(parseMistralResponse(null), null);
  const ok = parseMistralResponse({ model: "m", pages: [{ index: 0, markdown: "x" }] });
  assert.equal(ok?.pages.length, 1);
});

test("documents go to the vendor; grids and photographs stay local", () => {
  // 🔴 A PRODUCT DECISION, NOT A BENCHMARK RESULT (owner, 2026-08-13). Per-file the local readers
  // win on Office — 6 tables against 0 on a Word activity, 209 blocks against 100 on a deck — and
  // that is not the question. Owning three parsers for ever costs more than the difference. What
  // protects the Office case is `mistral-quality.ts`, which refuses a read missing content the file
  // itself declares; the legacy readers are fallbacks now, kept but not improved.
  for (const kind of ["pdf", "docx", "pptx"]) assert.equal(mistralHandles(kind), true, kind);
  // A spreadsheet's exact cell references and formulas cannot be improved on by an optical read,
  // and a standalone photograph wants describing rather than transcribing.
  for (const kind of ["xlsx", "csv", "text", "image"]) assert.equal(mistralHandles(kind), false, kind);
  assert.equal(mistralMime("lecture.pptx", ""),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(mistralMime("scan", "application/octet-stream"), "application/pdf");
});

// ── The boundary ───────────────────────────────────────────────────────────

test("🔴 vendor response → model → stored JSON → read back → A CITATION RESOLVES", () => {
  const model = modelFromMistral(
    response([
      {
        dimensions: { height: 1000, width: 500 },
        images: [{ bottom_right_x: 400, bottom_right_y: 300, id: "f1", top_left_x: 100, top_left_y: 100 }],
        index: 0,
        markdown:
          "# Warfarin\n\n## Monitoring\n\nWarfarin requires routine INR monitoring in every patient.\n\n" +
          "<table><thead><tr><th>Target</th><th>Range</th></tr></thead>" +
          "<tr><td rowspan=\"2\">INR</td><td>2.0-3.0</td></tr><tr><td>2.5-3.5</td></tr></table>",
      },
      { index: 1, markdown: "## Interactions\n\nAmiodarone raises the INR." },
    ]),
    "pdf",
    "Warfarin",
  );
  assert.ok(model);

  // Exactly how production stores it, and exactly how it reads it back.
  const stored = JSON.parse(
    JSON.stringify(structureEnvelope({ model, text: documentToText(model), title: model.title })),
  ) as unknown;
  const read = storedDocumentModel(stored);
  assert.ok(read, "the envelope must survive JSON — one unknown block kind nulls the whole document");

  // Every structural fact, after the round trip.
  assert.equal(read.units.length, 2, "page boundaries survived");
  assert.equal(read.title, "Warfarin");
  const table = read.blocks.find((block) => block.kind === "table")?.table;
  assert.equal(table?.headerRows, 1, "the header row survived");
  assert.deepEqual(table?.columns, ["Target", "Range"], "the column names survived");
  assert.equal(cellText(table!, 2, 0), "INR", "the merged cell still governs the row below it");
  const figure = read.blocks.find((block) => block.kind === "figure");
  assert.equal(figure?.rect?.x, 0.2, "the figure rectangle survived, still unit-relative");
  assert.deepEqual(
    read.blocks.find((block) => block.text.startsWith("Amiodarone"))?.headingPath,
    ["Warfarin", "Interactions"],
    "the heading path survived, including across the page break",
  );

  // 🔴 AND THE POINT OF ALL OF IT: a quote from the read-back document resolves to a real place.
  const cited = citeQuote(read, "Warfarin requires routine INR monitoring in every patient.");
  assert.ok(cited.ok, `expected a citation, got ${JSON.stringify(cited)}`);
  // 🔴 A NON-NULL ANSWER HERE IS ALREADY THE PROOF. `resolveLocator` re-derives the unit from the
  // LIVE document and refuses when it disagrees with the locator's own claim — so a page boundary
  // that failed to survive the round trip returns null rather than a block with a wrong page on it.
  const resolved = resolveLocator(read, cited.locator);
  assert.ok(resolved, "the locator must resolve against the document that was read back");
  assert.equal(read.units[resolved.unit]?.kind, "page");
  assert.deepEqual(resolved.headingPath, ["Warfarin", "Monitoring"]);
});

test("a title is taken from the document's own first heading, never invented", () => {
  assert.equal(titleFromMistral(response([{ index: 0, markdown: "# Real Title\n\nBody." }])), "Real Title");
  assert.equal(titleFromMistral(response([{ index: 0, markdown: "Just prose." }])), null);
});
