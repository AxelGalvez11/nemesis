import assert from "node:assert/strict";
import { test } from "node:test";

import { strToU8, zipSync } from "fflate";

import { coreTitle, DOCX_PARSER_VERSION, parseDocx, readDocumentRels, readParagraphXml, readTableXml } from "./docx-parse";
import type { DocBlock } from "@nemesis/shared";

/** A PNG whose header states its real size (see ./pptx-parse.test.ts). */
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

const STYLES =
  "<w:styles>" +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="SubClause"><w:name w:val="Sub Clause"/><w:basedOn w:val="Heading3"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>' +
  '<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>' +
  "</w:styles>";

const NUMBERING =
  "<w:numbering>" +
  '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>' +
  '<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:numFmt w:val="none"/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
  '<w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num>' +
  "</w:numbering>";

const RELS =
  '<?xml version="1.0"?><Relationships>' +
  '<Relationship Id="rId1" Type="x/hyperlink" Target="https://example.org/spec" TargetMode="External"/>' +
  '<Relationship Id="rId2" Type="x/image" Target="media/image1.png"/>' +
  "</Relationships>";

const FOOTNOTES =
  "<w:footnotes>" +
  '<w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:t>separator rule</w:t></w:r></w:p></w:footnote>' +
  '<w:footnote w:id="2"><w:p><w:r><w:t>Measured at 20 degrees.</w:t></w:r></w:p></w:footnote>' +
  "</w:footnotes>";

// Row 0: [Stage] [Duty gridSpan=2]
// Row 1: [One gridSpan=2] [Note vMerge=restart]   <- the merge starts at COLUMN 2,
// Row 2: [a] [b] [c vMerge]                          which is the SECOND cell of row 1
//                                                     and the THIRD of row 2.
const TABLE =
  "<w:tbl>" +
  "<w:tr><w:trPr><w:tblHeader/></w:trPr>" +
  "<w:tc><w:p><w:r><w:t>Stage</w:t></w:r></w:p></w:tc>" +
  '<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Duty</w:t></w:r></w:p></w:tc>' +
  "</w:tr>" +
  "<w:tr>" +
  '<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>One</w:t></w:r></w:p></w:tc>' +
  '<w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:tc>' +
  "</w:tr>" +
  "<w:tr>" +
  "<w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc>" +
  "<w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc>" +
  "<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>" +
  "</w:tr>" +
  "</w:tbl>";

const DOCUMENT =
  "<w:document><w:body>" +
  "<w:p><w:r><w:t>Cover page</w:t></w:r></w:p>" +
  '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Scope</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t xml:space="preserve">Kept </w:t></w:r>' +
  "<w:del><w:r><w:delText>deleted words </w:delText></w:r></w:del>" +
  '<w:r><w:instrText> PAGE \\* MERGEFORMAT </w:instrText></w:r>' +
  "<w:r><w:t>after.</w:t></w:r></w:p>" +
  '<w:p><w:hyperlink r:id="rId1"><w:r><w:t>the spec</w:t></w:r></w:hyperlink></w:p>' +
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Nested</w:t></w:r></w:p>' +
  TABLE +
  "<w:p><w:r><w:drawing><wp:inline>" +
  '<wp:docPr id="1" name="Picture 1" descr="Cutaway of the impeller"/>' +
  '<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
  "</wp:inline></w:drawing></w:r></w:p>" +
  '<w:p><w:pPr><w:pStyle w:val="SubClause"/></w:pPr><w:r><w:t>Impeller</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Rated flow</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Terms</w:t></w:r></w:p>' +
  '<w:p><w:r><w:rPr><w:rStyle w:val="Strong"/></w:rPr><w:t>Head</w:t></w:r>' +
  '<w:r><w:t xml:space="preserve"> means pressure.</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr><w:r><w:t>Body text is not a heading.</w:t></w:r></w:p>' +
  "</w:body></w:document>";

function document(): Uint8Array {
  return zipSync({
    "docProps/core.xml": strToU8("<cp:coreProperties><dc:title>Pump specification</dc:title></cp:coreProperties>"),
    "word/_rels/document.xml.rels": strToU8(RELS),
    "word/document.xml": strToU8(DOCUMENT),
    "word/footnotes.xml": strToU8(FOOTNOTES),
    "word/media/image1.png": png(900, 700, 1),
    "word/numbering.xml": strToU8(NUMBERING),
    "word/styles.xml": strToU8(STYLES),
  });
}

const textOf = (blocks: DocBlock[], kind: DocBlock["kind"]): string[] =>
  blocks.filter((block) => block.kind === kind).map((block) => block.text);

test("units are sections, split at the SHALLOWEST heading depth the document uses", () => {
  const { doc } = parseDocx(document(), "spec.docx");
  assert.equal(doc.kind, "docx");
  assert.equal(doc.parserVersion, DOCX_PARSER_VERSION);
  assert.equal(doc.contentHash.length, 64);
  assert.equal(doc.title, "Pump specification");
  // Heading 2 is the top level here; splitting on depth 1 would return one unit.
  assert.equal(doc.units.length, 3);
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.label),
    [undefined, "Scope", "Terms"],
  );
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.headingPath),
    [undefined, ["Scope"], ["Terms"]],
  );
  assert.equal(doc.units[0]?.locator.kind, "section");
  assert.deepEqual(textOf(doc.units[0]?.blocks ?? [], "paragraph"), ["Cover page"]);
});

test("a heading deeper than the split level stays inside its section", () => {
  const { doc } = parseDocx(document());
  const scope = doc.units[1];
  assert.ok(scope);
  const headings = scope.blocks.filter((block) => block.kind === "heading");
  assert.deepEqual(
    headings.map((block) => [block.depth, block.text]),
    [
      [2, "Scope"],
      // SubClause is BASED ON Heading3 and carries no outline level of its own.
      [3, "Impeller"],
    ],
  );
});

test("tracked deletions and field instructions never reach the text", () => {
  const { doc } = parseDocx(document());
  const paragraphs = textOf(doc.units[1]?.blocks ?? [], "paragraph");
  assert.ok(paragraphs.includes("Kept after."), `got: ${paragraphs.join(" | ")}`);
  const all = JSON.stringify(doc);
  assert.ok(!all.includes("deleted words"), "a struck-out clause must not be indexed as surviving text");
  assert.ok(!all.includes("MERGEFORMAT"), "field instruction text is not the author's words");
  // One deletion, counted once: the whole <w:del> subtree is skipped, so its
  // <w:delText> is never even reached.
  assert.equal(doc.meta?.trackedDeletionsDropped, 1);
  assert.equal(doc.meta?.fieldCodesSkipped, 1);
  assert.ok(doc.coverage.notes?.some((note) => /tracked deletions/.test(note)));
  assert.ok(doc.coverage.notes?.some((note) => /field codes/.test(note)));
});

test("a hyperlink keeps its target and a character style keeps its emphasis", () => {
  const { doc } = parseDocx(document());
  const scope = textOf(doc.units[1]?.blocks ?? [], "paragraph");
  assert.ok(scope.includes("[the spec](https://example.org/spec)"));
  const terms = textOf(doc.units[2]?.blocks ?? [], "paragraph");
  assert.deepEqual(terms, ["**Head** means pressure.", "Body text is not a heading."]);
});

test("list items keep their nesting depth", () => {
  const { doc } = parseDocx(document());
  const items = (doc.units[1]?.blocks ?? []).filter((block) => block.kind === "listItem");
  assert.deepEqual(
    items.map((block) => [block.depth, block.text]),
    [
      [1, "First"],
      [2, "Nested"],
    ],
  );
});

test("a table is a grid, reachable from the block stream", () => {
  const { doc } = parseDocx(document());
  assert.equal(doc.tables.length, 1);
  const table = doc.tables[0];
  assert.ok(table);
  assert.equal(table.locator.index, 2);
  assert.equal(table.title, "Scope");
  const block = (doc.units[1]?.blocks ?? []).find((candidate) => candidate.kind === "table");
  assert.equal(block?.tableId, table.id);
  assert.match(block?.text ?? "", /Stage\tDuty/);
});

test("a picture becomes a visual with its alt text, and a figure block points at it", () => {
  const { doc, imageBytes } = parseDocx(document());
  assert.equal(doc.visuals.length, 1);
  const visual = doc.visuals[0];
  assert.ok(visual);
  assert.equal(visual.id, "word/media/image1.png");
  assert.equal(visual.caption, "Cutaway of the impeller");
  assert.equal(visual.width, 900);
  assert.equal(visual.height, 700);
  assert.equal(visual.role, "content");
  assert.equal(visual.locator.index, 2);
  const figure = (doc.units[1]?.blocks ?? []).find((block) => block.kind === "figure");
  assert.equal(figure?.visualId, visual.id);
  assert.deepEqual([...imageBytes.keys()], ["word/media/image1.png"]);
  assert.equal(doc.coverage.visualsFound, 1);
  assert.equal(doc.coverage.visualsKept, 1);
});

test("a footnote is read where it is referenced, and the separator rule is not", () => {
  const { doc } = parseDocx(document());
  const notes = textOf(doc.units[1]?.blocks ?? [], "footnote");
  assert.deepEqual(notes, ["Measured at 20 degrees."]);
  assert.equal(doc.meta?.footnotesRead, 1);
  assert.ok(!JSON.stringify(doc).includes("separator rule"));
});

test("ordinals are dense within each unit and block ids are unique", () => {
  const { doc } = parseDocx(document());
  const ids = new Set<string>();
  for (const unit of doc.units) {
    unit.blocks.forEach((block, index) => {
      assert.equal(block.ordinal, index);
      assert.ok(!ids.has(block.id), `duplicate block id ${block.id}`);
      ids.add(block.id);
    });
  }
  assert.equal(doc.coverage.unitsFound, 3);
  assert.equal(doc.coverage.unitsRead, 3);
  assert.equal(doc.coverage.tablesFound, 1);
});

test("a document with no headings is one unit, and claims no heading trail", () => {
  const flat = zipSync({
    "word/document.xml": strToU8(
      "<w:document><w:body><w:p><w:r><w:t>Dear Sir</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>Yours faithfully</w:t></w:r></w:p></w:body></w:document>",
    ),
  });
  const { doc } = parseDocx(flat);
  assert.equal(doc.units.length, 1);
  assert.equal(doc.units[0]?.locator.label, undefined);
  assert.equal(doc.units[0]?.locator.headingPath, undefined);
  assert.equal(doc.units[0]?.blocks.length, 2);
  assert.equal(doc.title, undefined, "a file with no title of its own is not given the storage key as one");
});

test("the same picture in two sections is one visual with alsoAt", () => {
  const drawing = (relId: string): string =>
    "<w:p><w:r><w:drawing><wp:inline><wp:docPr id='1' name='Picture 1'/>" +
    `<a:graphic><a:graphicData><a:blip r:embed="${relId}"/></a:graphicData></a:graphic>` +
    "</wp:inline></w:drawing></w:r></w:p>";
  const twice = zipSync({
    "word/_rels/document.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId2" Target="media/logo.png"/>' +
        '<Relationship Id="rId3" Target="media/copy-of-logo.png"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      "<w:document><w:body>" +
        "<w:p><w:pPr><w:outlineLvl w:val='0'/></w:pPr><w:r><w:t>One</w:t></w:r></w:p>" +
        drawing("rId2") +
        "<w:p><w:pPr><w:outlineLvl w:val='0'/></w:pPr><w:r><w:t>Two</w:t></w:r></w:p>" +
        drawing("rId3") +
        "</w:body></w:document>",
    ),
    // Identical bytes under two entry names: one picture, two places.
    "word/media/copy-of-logo.png": png(400, 300, 9),
    "word/media/logo.png": png(400, 300, 9),
  });
  const { doc } = parseDocx(twice);
  assert.equal(doc.units.length, 2);
  assert.equal(doc.visuals.length, 1);
  const visual = doc.visuals[0];
  assert.equal(visual?.id, "word/media/copy-of-logo.png", "the earliest entry name wins, so the choice is stable");
  assert.equal(visual?.locator.index, 1);
  assert.deepEqual(
    visual?.alsoAt?.map((locator) => locator.index),
    [2],
  );
  // Both figure blocks point at the one visual.
  const figures = doc.units.flatMap((unit) => unit.blocks.filter((block) => block.kind === "figure"));
  assert.deepEqual(
    figures.map((block) => block.visualId),
    [visual?.id, visual?.id],
  );
});

test("a picture whose bytes are missing leaves no dangling figure block", () => {
  const broken = zipSync({
    "word/_rels/document.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId2" Target="media/gone.png"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      "<w:document><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p>" +
        "<w:p><w:r><w:drawing><wp:inline><wp:docPr id='1'/>" +
        '<a:graphic><a:graphicData><a:blip r:embed="rId2"/></a:graphicData></a:graphic>' +
        "</wp:inline></w:drawing></w:r></w:p></w:body></w:document>",
    ),
  });
  const { doc } = parseDocx(broken);
  assert.equal(doc.visuals.length, 0);
  assert.equal(
    doc.units.flatMap((unit) => unit.blocks).filter((block) => block.kind === "figure").length,
    0,
    "a figure block pointing at nothing is worse than no block",
  );
  assert.equal(doc.coverage.visualsFound, 1, "…but the reference is still reported as found");
  assert.equal(doc.coverage.visualsKept, 0, "nothing is retrievable, and coverage says so");
  assert.ok(doc.coverage.notes?.some((note) => /not stored in the file/.test(note)));
});

test("a file with no word/document.xml is refused", () => {
  assert.throws(() => parseDocx(zipSync({ "ppt/slides/slide1.xml": strToU8("<p:sld/>") })), /Word/);
});

// ── the walker, without a zip ────────────────────────────────────────────────

test("an outline level of 9 means body text, not depth 10", () => {
  const styles = "<w:styles><w:style w:styleId='Quote'><w:pPr><w:outlineLvl w:val='9'/></w:pPr></w:style></w:styles>";
  const read = readParagraphXml("<w:p><w:pPr><w:pStyle w:val='Quote'/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>", {
    styles,
  });
  assert.equal(read.kind, "paragraph");
  assert.equal(read.depth, undefined);
});

test("a heading is found by its outline level in any language", () => {
  // No English "Heading" anywhere: the German style name and id, with the
  // outline level that every localisation of Word writes.
  const styles =
    "<w:styles><w:style w:styleId='berschrift2'><w:name w:val='Überschrift 2'/>" +
    "<w:pPr><w:outlineLvl w:val='1'/></w:pPr></w:style></w:styles>";
  const read = readParagraphXml("<w:p><w:pPr><w:pStyle w:val='berschrift2'/></w:pPr><w:r><w:t>Umfang</w:t></w:r></w:p>", {
    styles,
  });
  assert.deepEqual([read.kind, read.depth, read.text], ["heading", 2, "Umfang"]);
});

test("direct formatting outranks the style", () => {
  const styles =
    "<w:styles><w:style w:styleId='Heading1'><w:pPr><w:outlineLvl w:val='0'/></w:pPr></w:style></w:styles>";
  const promoted = readParagraphXml(
    "<w:p><w:pPr><w:outlineLvl w:val='2'/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>",
    { styles },
  );
  assert.deepEqual([promoted.kind, promoted.depth], ["heading", 3]);
  const demoted = readParagraphXml(
    "<w:p><w:pPr><w:pStyle w:val='Heading1'/><w:outlineLvl w:val='9'/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>",
    { styles },
  );
  assert.equal(demoted.kind, "paragraph");
});

test("numbering removed or formatted as none is not a list", () => {
  const cases: Array<[string, string]> = [
    ["1", "listItem"],
    ["0", "paragraph"],
    ["3", "paragraph"],
  ];
  for (const [numId, expected] of cases) {
    const read = readParagraphXml(
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>x</w:t></w:r></w:p>`,
      { numbering: NUMBERING },
    );
    assert.equal(read.kind, expected, `numId ${numId}`);
  }
});

test("runs split mid-word are merged before emphasis is marked", () => {
  // Word splits a word across runs at every edit boundary; marking each piece
  // separately gives `**C****max**`, which is neither valid nor searchable.
  const read = readParagraphXml(
    "<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>max</w:t></w:r>" +
      '<w:r><w:t xml:space="preserve"> is the peak.</w:t></w:r></w:p>',
  );
  assert.equal(read.text, "**Cmax** is the peak.");
});

test("bold explicitly turned off inside a bold character style stays off", () => {
  const styles =
    "<w:styles><w:style w:type='character' w:styleId='Strong'><w:rPr><w:b/></w:rPr></w:style></w:styles>";
  const read = readParagraphXml(
    "<w:p><w:r><w:rPr><w:rStyle w:val='Strong'/><w:b w:val='0'/></w:rPr><w:t>plain</w:t></w:r></w:p>",
    { styles },
  );
  assert.equal(read.text, "plain");
});

test("a vertical merge is matched by COLUMN, not by cell ordinal", () => {
  const rows = readTableXml(TABLE);
  assert.deepEqual(
    rows[1]?.map((cell) => [cell.col, cell.text, cell.colSpan, cell.rowSpan]),
    [
      [0, "One", 2, undefined],
      [2, "Note", undefined, 2],
    ],
  );
  assert.deepEqual(
    rows[2]?.map((cell) => [cell.col, cell.text]),
    [
      [0, "a"],
      [1, "b"],
    ],
  );
  assert.equal(rows[0]?.every((cell) => cell.header), true);
});

test("a table nested in a cell is still that cell's content", () => {
  const rows = readTableXml(
    "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>outer</w:t></w:r></w:p>" +
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>in1</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>in2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
      "</w:tc></w:tr></w:tbl>",
  );
  assert.equal(rows[0]?.[0]?.text, "outer\nin1\tin2");
});

test("relationships resolve to zip entry names, and external ones stay whole", () => {
  const map = readDocumentRels(
    '<Relationships><Relationship Id="a" Target="media/x.png"/>' +
      '<Relationship Id="b" Target="../customXml/item1.xml"/>' +
      '<Relationship Id="c" Target="https://example.org" TargetMode="External"/></Relationships>',
  );
  assert.deepEqual(map.get("a"), { external: false, target: "word/media/x.png" });
  assert.deepEqual(map.get("b"), { external: false, target: "customXml/item1.xml" });
  assert.deepEqual(map.get("c"), { external: true, target: "https://example.org" });
});

test("coreTitle reads the file's own title and nothing else", () => {
  assert.equal(coreTitle("<cp:coreProperties><dc:title>Lease</dc:title></cp:coreProperties>"), "Lease");
  assert.equal(coreTitle("<cp:coreProperties><dc:title>  </dc:title></cp:coreProperties>"), undefined);
  assert.equal(coreTitle(null), undefined);
});
