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
  // 🔴 BY REF, NOT "THE FIRST FIGURE". Undescribed pictures are now blocks too —
  // the deck's recurring crest among them — so "the first figure block" is no
  // longer the described one. Naming the picture is what makes this test about
  // the description rather than about block order.
  const figure = model.blocks.find((block) => block.figure?.ref === "ppt/media/image1.png");
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

test("🔴 a picture nobody looked at is still a picture", () => {
  // MEASURED: across 23 real decks, not one produced a figure block, because a
  // figure existed only if vision had already described it — and vision is off
  // by default on the upload path, for cost. "No figure block" then reads as
  // "this deck has no images", which is the strongest possible claim about a
  // deck full of diagrams.
  const model = pptxToModel(deck);   // no descriptions at all
  const figures = model.blocks.filter((b) => b.kind === "figure");
  assert.ok(figures.length > 0, "the pictures must be countable even unexamined");
  const cantilever = figures.find((f) => f.figure?.ref === "ppt/media/image1.png");
  assert.ok(cantilever, "the slide's own picture is present");
  assert.equal(cantilever!.figure?.description, undefined, "ABSENT means nobody looked");
  assert.equal(cantilever!.figure?.skipped, undefined, "and no reason was invented for it");
  assert.equal(cantilever!.unit, 1, "on the slide the reader attributed it to");
});

test("template furniture is disclosed as decorative, not counted as an unread gap", () => {
  const model = pptxToModel(deck);
  const crest = model.blocks.find((b) => b.figure?.ref === "ppt/media/crest.png");
  assert.ok(crest);
  assert.equal(crest!.figure?.skipped, "decorative");
});

test("a described picture is never also emitted as unexamined", () => {
  // The two paths must stay disjoint, or the same picture appears twice — which
  // downstream is indistinguishable from the deck containing it twice.
  const model = pptxToModel(deck, new Map([["ppt/media/image1.png", "A cantilever."]]));
  const same = model.blocks.filter((b) => b.figure?.ref === "ppt/media/image1.png");
  assert.equal(same.length, 1);
  assert.equal(same[0]!.figure?.description, "A cantilever.");
});

test("a labelled diagram keeps its labels when vision described it", () => {
  const model = pptxToModel(
    deck,
    new Map([["ppt/media/image1.png", "A cantilever with two supports."]]),
    new Map([["ppt/media/image1.png", [{ text: "Support A", x: 0.2, y: 0.8 }]]]),
  );
  const figure = model.blocks.find((b) => b.figure?.ref === "ppt/media/image1.png");
  assert.deepEqual(figure!.figure?.labels, [{ text: "Support A", x: 0.2, y: 0.8 }]);
});

test("🔴 a figure with labels but NO prose still keeps its labels — the catch-up loop's blind spot", () => {
  // `readFiguresWithVision` sets `descriptions` and `labels` independently: an entry that is only
  // a LABELS line (or whose sentence was empty) never enters `descriptions`, so it never matches
  // the FIGURE_LINE branch above and falls into the catch-up loop for "pictures nobody described".
  // That loop used to ask only `descriptions` and had no slot for `labels` at all.
  const model = pptxToModel(
    deck,
    new Map(), // no descriptions — image1 gets no [Figure: ...] line at all
    new Map([["ppt/media/image1.png", [{ text: "Support A", x: 0.2, y: 0.8 }, { text: "Support B", x: 0.8, y: 0.8 }]]]),
  );
  const figure = model.blocks.find((b) => b.figure?.ref === "ppt/media/image1.png");
  assert.ok(figure, "the picture must still be a block");
  assert.equal(figure!.figure?.description, undefined, "no prose came back, and none is invented");
  assert.deepEqual(figure!.figure?.labels, [
    { text: "Support A", x: 0.2, y: 0.8 },
    { text: "Support B", x: 0.8, y: 0.8 },
  ]);
});

test("a labelled diagram is never marked decorative, even if it is recurring furniture", () => {
  // A labelled diagram is content by definition — vision only emits LABELS for a diagram with named
  // parts — so `recurring` must not be allowed to overrule that with `skipped: "decorative"`.
  const model = pptxToModel(
    deck,
    new Map(),
    new Map([["ppt/media/crest.png", [{ text: "Motto", x: 0.5, y: 0.5 }, { text: "Shield", x: 0.5, y: 0.2 }]]]),
  );
  const crest = model.blocks.find((b) => b.figure?.ref === "ppt/media/crest.png");
  assert.ok(crest);
  assert.equal(crest!.figure?.skipped, undefined);
  assert.equal(crest!.figure?.labels?.length, 2);
});

test("no LABELS line means no labels field — a decorative picture must never get an invented one", () => {
  const model = pptxToModel(deck, new Map([["ppt/media/image1.png", "A cantilever with two supports."]]));
  const figure = model.blocks.find((b) => b.figure?.ref === "ppt/media/image1.png");
  assert.equal(figure!.figure?.labels, undefined);
});
