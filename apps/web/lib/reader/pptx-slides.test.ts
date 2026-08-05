import assert from "node:assert/strict";
import { test } from "node:test";

import { notesPathFor, parseSlide, resolveRelationships, slideOrder, slideText } from "./pptx-slides";
import { at } from "./test-helpers";

const shape = (text: string, placeholder = "", level = "0") =>
  `<p:sp><p:nvSpPr><p:nvPr>${placeholder}</p:nvPr></p:nvSpPr><p:txBody><a:p><a:pPr lvl="${level}"/><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;

const slide = (body: string) => `<p:sld><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;

test("the title placeholder becomes the slide title and is not repeated as body", () => {
  const parsed = parseSlide(1, slide(shape("Ohm's law", '<p:ph type="title"/>') + shape("Voltage equals current times resistance")), null, "ppt/slides/slide1.xml", null);
  assert.equal(parsed.title, "Ohm's law");
  assert.deepEqual(parsed.paragraphs.map((paragraph) => paragraph.text), ["Voltage equals current times resistance"]);
});

test("a slide with no title placeholder has no invented title", () => {
  const parsed = parseSlide(2, slide(shape("Just a body line")), null, "ppt/slides/slide2.xml", null);
  assert.equal(parsed.title, null);
});

test("outline depth comes from the deck's own indent level", () => {
  const parsed = parseSlide(1, slide(shape("nested point", "", "2")), null, "ppt/slides/slide1.xml", null);
  assert.equal(at(parsed.paragraphs, 0).level, 2);
});

test("a table on a slide keeps its cells together per row", () => {
  const table =
    "<p:graphicFrame><a:tbl><a:tr>" +
    "<a:tc><a:txBody><a:p><a:r><a:t>Material</a:t></a:r></a:p></a:txBody></a:tc>" +
    "<a:tc><a:txBody><a:p><a:r><a:t>Yield</a:t></a:r></a:p></a:txBody></a:tc>" +
    "</a:tr></a:tbl></p:graphicFrame>";
  const parsed = parseSlide(1, slide(table), null, "ppt/slides/slide1.xml", null);
  assert.deepEqual(parsed.paragraphs.map((paragraph) => paragraph.text), ["Material · Yield"]);
});

test("pictures resolve to their real zip entry through the slide's relationships", () => {
  const rels =
    '<Relationships><Relationship Id="rId2" Target="../media/image3.png"/></Relationships>';
  const parsed = parseSlide(
    1,
    slide('<p:pic><p:nvPicPr><p:cNvPr descr="Circuit"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>'),
    rels,
    "ppt/slides/slide1.xml",
    null,
  );
  assert.deepEqual(parsed.pictures, [{ relId: "rId2", target: "ppt/media/image3.png", alt: "Circuit" }]);
});

test("speaker notes are read, and the slide-number placeholder is not mistaken for one", () => {
  const notes =
    "<p:notes><p:cSld><p:spTree>" +
    shape("12", '<p:ph type="sldNum"/>') +
    shape("Remind them this is examinable") +
    "</p:spTree></p:cSld></p:notes>";
  const parsed = parseSlide(1, slide(shape("Body")), null, "ppt/slides/slide1.xml", notes);
  assert.equal(parsed.notes, "Remind them this is examinable");
});

test("a slide with no notes reports null rather than an empty string", () => {
  assert.equal(parseSlide(1, slide(shape("Body")), null, "ppt/slides/slide1.xml", null).notes, null);
  assert.equal(parseSlide(1, slide(shape("Body")), null, "ppt/slides/slide1.xml", "<p:notes/>").notes, null);
});

test("relationship targets are resolved relative to the part's own folder", () => {
  const map = resolveRelationships(
    '<Relationships><Relationship Id="a" Target="../media/x.png"/><Relationship Id="b" Target="slide2.xml"/><Relationship Id="c" Target="http://example.com/x"/></Relationships>',
    "ppt/slides/slide1.xml",
  );
  assert.equal(map.get("a"), "ppt/media/x.png");
  assert.equal(map.get("b"), "ppt/slides/slide2.xml");
  assert.equal(map.get("c"), undefined, "external targets are not zip entries");
});

test("slide order follows presentation.xml, not the filenames", () => {
  const files = { "ppt/slides/slide1.xml": 1, "ppt/slides/slide2.xml": 1, "ppt/slides/slide3.xml": 1 };
  const presentation = '<p:presentation><p:sldIdLst><p:sldId r:id="r3"/><p:sldId r:id="r1"/><p:sldId r:id="r2"/></p:sldIdLst></p:presentation>';
  const rels =
    '<Relationships>' +
    '<Relationship Id="r1" Target="slides/slide1.xml"/>' +
    '<Relationship Id="r2" Target="slides/slide2.xml"/>' +
    '<Relationship Id="r3" Target="slides/slide3.xml"/>' +
    "</Relationships>";
  assert.deepEqual(slideOrder(files, presentation, rels), [
    "ppt/slides/slide3.xml",
    "ppt/slides/slide1.xml",
    "ppt/slides/slide2.xml",
  ]);
});

test("without presentation.xml, slides sort numerically — 10 after 2, not before", () => {
  const files = { "ppt/slides/slide10.xml": 1, "ppt/slides/slide2.xml": 1, "ppt/slides/slide1.xml": 1 };
  assert.deepEqual(slideOrder(files, null, null), [
    "ppt/slides/slide1.xml",
    "ppt/slides/slide2.xml",
    "ppt/slides/slide10.xml",
  ]);
});

test("a slide the presentation part forgot is still shown, at the end", () => {
  const files = { "ppt/slides/slide1.xml": 1, "ppt/slides/slide2.xml": 1 };
  const presentation = '<p:presentation><p:sldIdLst><p:sldId r:id="r1"/></p:sldIdLst></p:presentation>';
  const rels = '<Relationships><Relationship Id="r1" Target="slides/slide1.xml"/></Relationships>';
  assert.deepEqual(slideOrder(files, presentation, rels), ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]);
});

test("the notes part is found through relationships, not by slide number", () => {
  const rels = '<Relationships><Relationship Id="r5" Target="../notesSlides/notesSlide7.xml"/></Relationships>';
  assert.equal(notesPathFor(rels, "ppt/slides/slide2.xml"), "ppt/notesSlides/notesSlide7.xml");
  assert.equal(notesPathFor(null, "ppt/slides/slide2.xml"), null);
});

test("a slide's searchable text covers its title, body and notes", () => {
  const parsed = parseSlide(1, slide(shape("Title", '<p:ph type="title"/>') + shape("Body")), null, "ppt/slides/slide1.xml", `<p:notes><p:cSld><p:spTree>${shape("Notes line")}</p:spTree></p:cSld></p:notes>`);
  assert.equal(slideText(parsed), "Title\nBody\nNotes line");
});

test("an unreadable slide part yields an empty slide rather than throwing", () => {
  const parsed = parseSlide(4, "", null, "ppt/slides/slide4.xml", null);
  assert.deepEqual(parsed, { index: 4, title: null, paragraphs: [], pictures: [], notes: null });
});
