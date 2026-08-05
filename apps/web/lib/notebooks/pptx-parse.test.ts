import assert from "node:assert/strict";
import { test } from "node:test";

import { strToU8, zipSync } from "fflate";

import { markedLines, parsePptx, PPTX_PARSER_VERSION, readFrameTables } from "./pptx-parse";
import type { DocBlock, DocTable } from "@nemesis/shared";

/** A PNG whose header states its real size. `salt` changes the bytes without
 *  changing the dimensions, so two pictures can be the same size and still be
 *  different content — which is what the dedupe has to tell apart. */
function png(width: number, height: number, salt = 0): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const be = (value: number, at: number): void => {
    bytes[at] = (value >>> 24) & 0xff;
    bytes[at + 1] = (value >>> 16) & 0xff;
    bytes[at + 2] = (value >>> 8) & 0xff;
    bytes[at + 3] = value & 0xff;
  };
  be(width, 16);
  be(height, 20);
  bytes[31] = salt;
  return bytes;
}

const rels = (pairs: Array<[string, string]>): string =>
  `<?xml version="1.0"?><Relationships>${pairs
    .map(([id, target]) => `<Relationship Id="${id}" Type="x" Target="${target}"/>`)
    .join("")}</Relationships>`;

const TABLE_FRAME =
  "<p:graphicFrame><a:graphic><a:graphicData><a:tbl>" +
  '<a:tblPr firstRow="1"/>' +
  "<a:tr>" +
  "<a:tc><a:txBody><a:p><a:r><a:t>Flow</a:t></a:r></a:p></a:txBody></a:tc>" +
  '<a:tc gridSpan="2"><a:txBody><a:p><a:r><a:t>Head</a:t></a:r></a:p></a:txBody></a:tc>' +
  '<a:tc hMerge="1"><a:txBody></a:txBody></a:tc>' +
  "</a:tr>" +
  "<a:tr>" +
  '<a:tc rowSpan="2"><a:txBody><a:p><a:r><a:t>Low</a:t></a:r></a:p></a:txBody></a:tc>' +
  "<a:tc><a:txBody><a:p><a:r><a:t>50</a:t></a:r></a:p></a:txBody></a:tc>" +
  "<a:tc><a:txBody><a:p><a:r><a:t>60</a:t></a:r></a:p></a:txBody></a:tc>" +
  "</a:tr>" +
  "<a:tr>" +
  '<a:tc vMerge="1"><a:txBody></a:txBody></a:tc>' +
  "<a:tc><a:txBody><a:p><a:r><a:t>70</a:t></a:r></a:p></a:txBody></a:tc>" +
  "<a:tc><a:txBody><a:p><a:r><a:t>80</a:t></a:r></a:p></a:txBody></a:tc>" +
  "</a:tr>" +
  "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>";

const SLIDE_ONE =
  "<p:sld><p:cSld><p:spTree>" +
  '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
  "<p:txBody><a:p><a:r><a:t>Pump curves</a:t></a:r></a:p></p:txBody></p:sp>" +
  "<p:sp><p:txBody>" +
  "<a:p><a:r><a:t>Head rises</a:t></a:r></a:p>" +
  '<a:p><a:pPr lvl="1"/><a:r><a:rPr b="1"/><a:t>then falls</a:t></a:r></a:p>' +
  "</p:txBody></p:sp>" +
  TABLE_FRAME +
  '<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture 4" descr="Cutaway of the impeller"/></p:nvPicPr>' +
  '<p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>' +
  "</p:spTree></p:cSld></p:sld>";

const SLIDE_TWO =
  "<p:sld><p:cSld><p:spTree>" +
  '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
  "<p:txBody><a:p><a:r><a:t>Affinity laws</a:t></a:r></a:p></p:txBody></p:sp>" +
  '<p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>' +
  '<p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>' +
  "</p:spTree></p:cSld></p:sld>";

function deck(): Uint8Array {
  return zipSync({
    "ppt/charts/chart1.xml": strToU8("<c:chartSpace><c:title><a:t>Efficiency</a:t></c:title></c:chartSpace>"),
    "ppt/media/image1.png": png(800, 600, 1),
    "ppt/media/image2.png": png(16, 16, 2),
    "ppt/notesSlides/notesSlide1.xml": strToU8(
      "<p:notes><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Mention the affinity laws.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>",
    ),
    "ppt/diagrams/data1.xml": strToU8(
      "<dgm:dataModel><dgm:pt><dgm:t><a:p><a:r><a:t>Suction</a:t></a:r></a:p>" +
        "<a:p><a:r><a:t>Discharge</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:dataModel>",
    ),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(
      rels([
        ["rId1", "../notesSlides/notesSlide1.xml"],
        ["rId2", "../media/image1.png"],
        ["rId3", "../charts/chart1.xml"],
        ["rId4", "../diagrams/data1.xml"],
      ]),
    ),
    "ppt/slides/_rels/slide2.xml.rels": strToU8(
      rels([
        ["rId1", "../media/image2.png"],
        ["rId2", "../media/image1.png"],
      ]),
    ),
    "ppt/slides/slide1.xml": strToU8(SLIDE_ONE),
    "ppt/slides/slide2.xml": strToU8(SLIDE_TWO),
  });
}

const blocksOf = (unit: { blocks: DocBlock[] }, kind: DocBlock["kind"]): DocBlock[] =>
  unit.blocks.filter((block) => block.kind === kind);

test("a deck becomes one unit per slide, located by the slide's own number", () => {
  const { doc } = parsePptx(deck(), "pumps.pptx");
  assert.equal(doc.kind, "pptx");
  assert.equal(doc.parserVersion, PPTX_PARSER_VERSION);
  assert.equal(doc.contentHash.length, 64, "the document hash must be sha256, which the schema checks");
  assert.equal(doc.title, "Pump curves");
  assert.equal(doc.units.length, 2);
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.index),
    [1, 2],
  );
  assert.equal(doc.units[0]?.locator.kind, "slide");
  assert.equal(doc.units[0]?.locator.label, "Pump curves");
});

test("the slide title is a heading and the body keeps its outline depth and emphasis", () => {
  const { doc } = parsePptx(deck());
  const unit = doc.units[0];
  assert.ok(unit);
  const heading = blocksOf(unit, "heading")[0];
  assert.equal(heading?.text, "Pump curves");
  assert.equal(heading?.depth, 1);
  const items = blocksOf(unit, "listItem");
  assert.deepEqual(
    items.map((block) => [block.depth, block.text]),
    [
      [1, "Head rises"],
      [2, "**then falls**"],
    ],
  );
  // Reading order: the heading comes first and the ordinals are dense.
  assert.deepEqual(
    unit.blocks.map((block) => block.ordinal),
    unit.blocks.map((_, index) => index),
  );
});

test("a slide table becomes a grid, not bullets", () => {
  const { doc } = parsePptx(deck());
  assert.equal(doc.tables.length, 1);
  const table = doc.tables[0] as DocTable;
  assert.equal(table.locator.index, 1);
  assert.equal(table.method, "ooxml");
  assert.deepEqual(
    table.rows[0]?.map((cell) => [cell.row, cell.col, cell.text, cell.colSpan, cell.header]),
    [
      [0, 0, "Flow", undefined, true],
      [0, 1, "Head", 2, true],
    ],
  );
  assert.deepEqual(
    table.rows[1]?.map((cell) => [cell.col, cell.text, cell.rowSpan]),
    [
      [0, "Low", 2],
      [1, "50", undefined],
      [2, "60", undefined],
    ],
  );
  // The vertically merged cell is not repeated in the row it reaches into.
  assert.deepEqual(
    table.rows[2]?.map((cell) => [cell.col, cell.text]),
    [
      [1, "70"],
      [2, "80"],
    ],
  );

  // …and the cells are NOT also emitted as body bullets.
  const items = blocksOf(doc.units[0]!, "listItem").map((block) => block.text);
  assert.ok(!items.includes("Flow"), `table cells leaked into the bullets: ${items.join(" | ")}`);

  // The block stream a chunker walks must reach the table.
  const tableBlock = blocksOf(doc.units[0]!, "table")[0];
  assert.equal(tableBlock?.tableId, table.id);
  assert.match(tableBlock?.text ?? "", /Flow\tHead/);
});

test("a chart is a composited visual with its text, and speaker notes are their own block", () => {
  const { doc } = parsePptx(deck());
  const unit = doc.units[0];
  assert.ok(unit);
  const chart = doc.visuals.find((visual) => visual.composited);
  assert.ok(chart, "a chart is drawn from shapes and must be recorded as composited");
  assert.equal(chart.composited, true);
  assert.equal(chart.assetPath, undefined);
  assert.equal(chart.nearbyText, "Efficiency");
  assert.equal(chart.locator.index, 1);
  const figure = unit.blocks.find((block) => block.visualId === chart.id);
  assert.equal(figure?.kind, "figure");
  assert.equal(figure?.text, "Efficiency");

  const notes = blocksOf(unit, "speakerNotes");
  assert.deepEqual(
    notes.map((block) => block.text),
    ["Mention the affinity laws."],
  );
});

test("SmartArt lives outside the slide and is still recorded, composited", () => {
  const { doc } = parsePptx(deck());
  const smartArt = doc.visuals.find((visual) => visual.id === "s1:ppt/diagrams/data1.xml");
  assert.ok(smartArt, "SmartArt text sits in ppt/diagrams/, invisible to a slide-only read");
  assert.equal(smartArt.composited, true);
  assert.equal(smartArt.assetPath, undefined);
  // The shapes' text is joined on one line: a diagram is one graphic, not a list.
  assert.equal(smartArt.nearbyText, "Suction · Discharge");
  assert.equal(smartArt.locator.index, 1);
  const figure = (doc.units[0]?.blocks ?? []).find((block) => block.visualId === smartArt.id);
  assert.equal(figure?.kind, "figure");
  assert.equal(figure?.text, "Suction · Discharge");
  assert.equal(doc.meta?.diagrams, 1);
  assert.equal(doc.meta?.smartArtAndChartGraphics, 2);
});

test("one picture on two slides is one visual with alsoAt, and a glyph is furniture", () => {
  const { doc, imageBytes } = parsePptx(deck());
  const figure = doc.visuals.find((visual) => visual.id === "ppt/media/image1.png");
  assert.ok(figure);
  assert.equal(figure.role, "content");
  assert.equal(figure.width, 800);
  assert.equal(figure.height, 600);
  assert.equal(figure.caption, "Cutaway of the impeller");
  assert.equal(figure.contentHash?.length, 40, "picture identity is the sha1 the deck reader already uses");
  assert.deepEqual(
    figure.alsoAt?.map((locator) => locator.index),
    [2],
  );

  const glyph = doc.visuals.find((visual) => visual.id === "ppt/media/image2.png");
  assert.equal(glyph?.role, "furniture", "a 16x16 picture is an icon, whatever it is of");

  // The read plan is a subset of the structure: the glyph is recorded but not
  // sent anywhere, and the figure is.
  assert.deepEqual([...imageBytes.keys()], ["ppt/media/image1.png"]);
});

test("coverage counts what was found and what was not", () => {
  const { doc } = parsePptx(deck());
  assert.equal(doc.coverage.unitsFound, 2);
  assert.equal(doc.coverage.unitsRead, 2);
  assert.equal(doc.coverage.tablesFound, 1);
  assert.equal(doc.coverage.visualsFound, doc.visuals.length);
  // Found: one figure, one glyph, a chart and a piece of SmartArt.
  // Kept (retrievable): the figure's bytes plus the two composited graphics —
  // the glyph is located but nothing is fetched for it.
  assert.equal(doc.coverage.visualsFound, 4);
  assert.equal(doc.coverage.visualsKept, 3);
  assert.equal(doc.coverage.visualsUnreadable, 0);
  assert.ok(doc.coverage.notes?.some((note) => /bullets, rules or icons/.test(note)));
  assert.equal(doc.meta?.charts, 1);
  assert.equal(doc.meta?.notesPages, 1);
});

test("a file with no slides is refused", () => {
  const notADeck = zipSync({ "word/document.xml": strToU8("<w:document/>") });
  assert.throws(() => parsePptx(notADeck), /PowerPoint/);
});

// A GUARD, not a behaviour test: `markedLines` reads back what
// ./office-text's pptxSlideXmlToMarkdown writes. If that emitter ever changes
// its indent or its bullet marker, depth must fail loudly here rather than
// silently flatten to 1 everywhere.
test("markedLines is the exact inverse of the markdown emitter", () => {
  assert.deepEqual(markedLines("- top\n  - one\n    - two\n      - three"), [
    { depth: 1, text: "top" },
    { depth: 2, text: "one" },
    { depth: 3, text: "two" },
    { depth: 4, text: "three" },
  ]);
  assert.deepEqual(markedLines("- **bold** and *italic*"), [{ depth: 1, text: "**bold** and *italic*" }]);
  // A line the emitter did not bullet is still content.
  assert.deepEqual(markedLines("bare\n\n"), [{ depth: 1, text: "bare" }]);
});

test("readFrameTables ignores a frame that holds no table", () => {
  const locator = { index: 3, kind: "slide" as const };
  assert.deepEqual(readFrameTables("<p:graphicFrame><a:graphic/></p:graphicFrame>", locator, true), []);
  const tables = readFrameTables(TABLE_FRAME, locator, true, 2);
  assert.equal(tables[0]?.id, "s3:t2", "the id must stay unique across several frames on one slide");
});
