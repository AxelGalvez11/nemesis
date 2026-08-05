import assert from "node:assert/strict";
import { test } from "node:test";

import { docxBlocks, docxBlockText, orderedNumberingIds } from "./docx-blocks";
import { at, ofKind } from "./test-helpers";

const wrap = (body: string) => `<w:document><w:body>${body}</w:body></w:document>`;
const para = (text: string, properties = "") => `<w:p>${properties}<w:r><w:t>${text}</w:t></w:r></w:p>`;

test("a plain paragraph is a paragraph", () => {
  const blocks = docxBlocks(wrap(para("Ordinary running text.")));
  assert.deepEqual(blocks, [{ kind: "paragraph", runs: [{ text: "Ordinary running text." }], quote: false }]);
});

test("a heading style becomes a heading at its level", () => {
  const blocks = docxBlocks(wrap(para("Scope", '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>')));
  assert.equal(ofKind(blocks[0], "heading").level, 2);
});

test("an outline level marks a heading even when the style name is localised", () => {
  const blocks = docxBlocks(wrap(para("Alcance", '<w:pPr><w:pStyle w:val="Ttulo3"/><w:outlineLvl w:val="2"/></w:pPr>')));
  assert.equal(ofKind(blocks[0], "heading").level, 3);
});

test("a style that merely ends in a digit is not a heading", () => {
  const blocks = docxBlocks(wrap(para("Body", '<w:pPr><w:pStyle w:val="BodyText2"/></w:pPr>')));
  assert.equal(at(blocks, 0).kind, "paragraph");
});

test("bold, italic and underline survive; adjacent identical runs merge", () => {
  const blocks = docxBlocks(
    wrap(
      "<w:p>" +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>Bo</w:t></w:r>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>ld</w:t></w:r>' +
        "<w:r><w:t> then plain</w:t></w:r>" +
        "</w:p>",
    ),
  );
  assert.deepEqual(ofKind(blocks[0], "paragraph").runs, [{ text: "Bold", bold: true }, { text: " then plain" }]);
});

test('formatting explicitly turned off ("w:val=0") is not applied', () => {
  const blocks = docxBlocks(wrap('<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>plain</w:t></w:r></w:p>'));
  assert.deepEqual(ofKind(blocks[0], "paragraph").runs, [{ text: "plain" }]);
});

test("text the author DELETED with track changes never reaches the reader", () => {
  const blocks = docxBlocks(
    wrap('<w:p><w:r><w:t>kept</w:t></w:r><w:del><w:r><w:delText> removed</w:delText></w:r></w:del></w:p>'),
  );
  assert.equal(docxBlockText(at(blocks, 0)), "kept");
});

test("field instruction codes do not leak into the text", () => {
  const blocks = docxBlocks(wrap('<w:p><w:r><w:instrText> PAGEREF _Toc123 </w:instrText></w:r><w:r><w:t>Chapter</w:t></w:r></w:p>'));
  assert.equal(docxBlockText(at(blocks, 0)), "Chapter");
});

test("a numbered list is ordered only when numbering.xml says so", () => {
  const body = para("first", '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr>');
  const numbering =
    '<w:numbering><w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>' +
    '<w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num></w:numbering>';
  assert.equal(ofKind(docxBlocks(wrap(body), numbering)[0], "list-item").ordered, true);
  assert.equal(ofKind(docxBlocks(wrap(body))[0], "list-item").ordered, false);
});

test("a bulleted list is never presented as numbered", () => {
  const numbering =
    '<w:numbering><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
  assert.equal(orderedNumberingIds(numbering).has("2"), false);
});

test("list depth comes from the document's own indent level", () => {
  const blocks = docxBlocks(wrap(para("nested", '<w:pPr><w:numPr><w:ilvl w:val="2"/><w:numId w:val="1"/></w:numPr></w:pPr>')));
  assert.equal(ofKind(blocks[0], "list-item").level, 2);
});

test("a table keeps its rows, its columns and its header row", () => {
  const cell = (text: string, properties = "") => `<w:tc>${properties}<w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const blocks = docxBlocks(
    wrap(`<w:tbl><w:tr>${cell("Term")}${cell("Meaning")}</w:tr><w:tr>${cell("Estoppel")}${cell("A bar to denial")}</w:tr></w:tbl>`),
  );
  const table = ofKind(blocks[0], "table");
  assert.equal(table.rows.length, 2);
  assert.equal(at(at(table.rows, 0), 0).header, true);
  assert.equal(at(at(table.rows, 1), 0).header, false);
  assert.equal(docxBlockText(table), "Term\tMeaning\nEstoppel\tA bar to denial");
});

test("a merged cell reports its span", () => {
  const blocks = docxBlocks(
    wrap('<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Wide</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'),
  );
  assert.equal(at(at(ofKind(blocks[0], "table").rows, 0), 0).colSpan, 2);
});

test("an embedded picture becomes an image block carrying its relationship id", () => {
  const blocks = docxBlocks(
    wrap('<w:p><w:drawing><wp:docPr descr="A circuit"/><a:blip r:embed="rId9"/></w:drawing></w:p>'),
  );
  assert.deepEqual(blocks[0], { kind: "image", relId: "rId9", alt: "A circuit" });
});

test("an empty paragraph is spacing; one carrying a section break is a boundary", () => {
  assert.deepEqual(docxBlocks(wrap("<w:p/>")), []);
  assert.deepEqual(docxBlocks(wrap("<w:p><w:pPr><w:sectPr/></w:pPr></w:p>")), [{ kind: "section-break" }]);
});

test("tabs and line breaks inside a run are kept", () => {
  const blocks = docxBlocks(wrap("<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>"));
  assert.equal(at(ofKind(blocks[0], "paragraph").runs, 0).text, "a\tb\nc");
});

test("a document with no body at all yields no blocks rather than throwing", () => {
  assert.deepEqual(docxBlocks(""), []);
  assert.deepEqual(docxBlocks("<w:document/>"), []);
});
