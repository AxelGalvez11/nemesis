import assert from "node:assert/strict";
import test from "node:test";

import { describeLocator, documentToText, locate } from "@nemesis/shared";

import { pptxToModel } from "./pptx-model";

const deck = {
  deckTitle: "Load paths in frames",
  images: [
    { mime: "image/png", name: "ppt/media/image1.png", recurring: false, slides: [2] },
    { mime: "image/png", name: "ppt/media/crest.png", recurring: true, slides: [1, 2, 3] },
  ],
  slideTitles: ["Load paths in frames", "Free-body diagrams", null],
  slides: [
    "Load paths in frames\nA one-line introduction.",
    "Free-body diagrams\nDraw the supports first.\nThen the applied loads.",
    "A slide with no title placeholder at all.",
  ],
};

test("every slide becomes a unit, so a locator can name one", () => {
  const model = pptxToModel(deck);
  assert.equal(model.units.length, 3);
  assert.equal(model.units[0]!.kind, "slide");
  const onSlideTwo = model.blocks.find((block) => block.unit === 1)!;
  // A deck genuinely HAS slides, so this number is a fact the format supplies —
  // unlike a page number for a .docx, which Word does not have until layout.
  assert.match(describeLocator(locate(model, onSlideTwo)), /^slide 2/);
});

test("a slide's title is its heading and is not repeated as a paragraph", () => {
  const model = pptxToModel(deck);
  const slideOne = model.blocks.filter((block) => block.unit === 0);
  assert.equal(slideOne.filter((block) => block.text === "Load paths in frames").length, 1);
  assert.equal(slideOne[0]!.kind, "heading");
});

test("a slide title does not leak onto later slides", () => {
  const model = pptxToModel(deck);
  const slideThree = model.blocks.filter((block) => block.unit === 2);
  // Slide 3 has no title of its own. Carrying slide 2's down would file it under
  // a heading it does not belong to, and retrieval would return it as if it did.
  assert.deepEqual(slideThree[0]!.headingPath, []);
});

test("a title that never appears in the body still opens its own slide", () => {
  const model = pptxToModel({
    ...deck,
    slides: ["Just the body text, no title line."],
    slideTitles: ["A title only in the placeholder"],
  });
  assert.equal(model.blocks[0]!.kind, "heading");
  assert.equal(model.blocks[0]!.unit, 0);
});

test("a late slide's inserted heading stays on that slide", () => {
  const model = pptxToModel({
    deckTitle: null,
    images: [],
    slides: ["First slide body.", "Second body with no title line."],
    slideTitles: [null, "Second slide title"],
  });
  // 🔴 The regression this guards: an `unshift` into the document-wide list put
  // slide 2's heading at the FRONT OF THE DECK. Every locator still said
  // "slide 2", so nothing looked wrong — but reading order, chunking and "what
  // comes next" were all answering about the wrong place.
  assert.equal(model.blocks[0]!.text, "First slide body.");
  assert.equal(model.blocks[0]!.unit, 0);
  assert.equal(model.blocks[1]!.text, "Second slide title");
  assert.equal(model.blocks[1]!.unit, 1);
});

test("a figure description is a description, never quotable slide text", () => {
  const model = pptxToModel(deck, new Map([["ppt/media/image1.png", "A cantilever with two supports."]]));
  const figure = model.blocks.find((block) => block.kind === "figure");
  assert.ok(figure, "expected a figure block");
  assert.equal(figure!.figure?.description, "A cantilever with two supports.");
  // Citations search text. A generated sentence in `text` becomes quotable as
  // the deck's own words.
  assert.equal(figure!.text, "");
  assert.equal(figure!.unit, 1);
});

test("a recurring graphic is noted once, exactly as the renderer does", () => {
  const model = pptxToModel(deck, new Map([["ppt/media/crest.png", "The university crest."]]));
  const found = model.blocks.filter((block) => block.figure?.description === "The university crest.");
  assert.equal(found.length, 1);
});

test("the unit label is the author's own title, never a generated one", () => {
  const model = pptxToModel(deck);
  assert.equal(model.units[1]!.label, "Free-body diagrams");
  // Slide 3 has no title placeholder. Inventing one from its first line would be
  // indistinguishable from a label the author wrote.
  assert.equal(model.units[2]!.label, undefined);
});

test("nothing the renderer produced goes missing", () => {
  const model = pptxToModel(deck);
  const text = documentToText(model);
  for (const line of deck.slides.join("\n").split("\n")) {
    assert.ok(text.includes(line.trim()), `lost: ${line}`);
  }
});
