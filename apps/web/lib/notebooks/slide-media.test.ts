import assert from "node:assert/strict";
import { test } from "node:test";

import {
  embeddedRelIds,
  imageMime,
  isDecorativeSpread,
  MAX_IMAGES_PER_DECK,
  MAX_SLIDES_BEFORE_DECORATIVE,
  mergeImageDescriptions,
  MIN_IMAGE_BYTES,
  parseSlideRels,
  planSlideMedia,
  slideNumber,
  type SlideMediaInput,
} from "./slide-media";

const BIG = MIN_IMAGE_BYTES * 4;

const rels = (pairs: Array<[string, string]>) =>
  `<?xml version="1.0"?><Relationships>${pairs
    .map(([id, target]) => `<Relationship Id="${id}" Type="…/image" Target="${target}"/>`)
    .join("")}</Relationships>`;

const slide = (relIds: string[]) =>
  `<p:sld><p:cSld><p:spTree>${relIds
    .map((id) => `<p:pic><p:blipFill><a:blip r:embed="${id}"/></p:blipFill></p:pic>`)
    .join("")}</p:spTree></p:cSld></p:sld>`;

/** One slide carrying one image, wired end to end. */
function deck(
  slides: Array<{ n: number; images: string[] }>,
  sizes: Record<string, number>,
): SlideMediaInput {
  const slideXml = new Map<string, string>();
  const relsXml = new Map<string, string>();
  for (const entry of slides) {
    const ids = entry.images.map((_, index) => `rId${index + 2}`);
    slideXml.set(`ppt/slides/slide${entry.n}.xml`, slide(ids));
    relsXml.set(
      `ppt/slides/_rels/slide${entry.n}.xml.rels`,
      rels(entry.images.map((image, index) => [`rId${index + 2}`, `../media/${image}`])),
    );
  }
  const mediaSizes = new Map(Object.entries(sizes).map(([name, size]) => [`ppt/media/${name}`, size]));
  return { mediaSizes, relsXml, slideXml };
}

// ── Parsing the zip's own bookkeeping ────────────────────────────────────────

test("relationship targets resolve to real zip entry names", () => {
  const map = parseSlideRels(rels([["rId2", "../media/image1.png"], ["rId3", "./../media/image2.jpg"]]));
  assert.equal(map.get("rId2"), "ppt/media/image1.png");
  assert.equal(map.get("rId3"), "ppt/media/image2.jpg");
});

test("external relationships (hyperlinks) are not treated as images", () => {
  const xml = '<Relationships><Relationship Id="rId9" Target="https://example.com" TargetMode="External"/></Relationships>';
  assert.equal(parseSlideRels(xml).size, 0);
});

test("embedded picture ids are read in document order", () => {
  assert.deepEqual(embeddedRelIds(slide(["rId2", "rId5"])), ["rId2", "rId5"]);
});

test("a slide with no pictures yields no ids", () => {
  assert.deepEqual(embeddedRelIds("<p:sld><p:txBody>Words only</p:txBody></p:sld>"), []);
});

test("slide numbers come from the entry name", () => {
  assert.equal(slideNumber("ppt/slides/slide12.xml"), 12);
  assert.equal(slideNumber("ppt/slideMasters/slideMaster1.xml"), 0);
});

test("only raster formats a vision model reads are accepted", () => {
  assert.equal(imageMime("ppt/media/image1.png"), "image/png");
  assert.equal(imageMime("ppt/media/image2.JPG"), "image/jpeg");
  assert.equal(imageMime("ppt/media/image3.emf"), null, "vector metafiles are not images to a vision model");
  assert.equal(imageMime("ppt/media/image4.wmf"), null);
});

// ── Telling content from template furniture ──────────────────────────────────

test("a real diagram on one slide is content", () => {
  const plan = planSlideMedia(deck([{ images: ["pathway.png"], n: 4 }], { "pathway.png": BIG }));
  assert.equal(plan.images.length, 1);
  assert.deepEqual(plan.images[0]?.slides, [4]);
});

test("the university crest on every slide is decoration, not content", () => {
  const slides = Array.from({ length: 8 }, (_, i) => ({ images: ["crest.png"], n: i + 1 }));
  const plan = planSlideMedia(deck(slides, { "crest.png": BIG }));
  assert.deepEqual(plan.images, []);
  assert.equal(plan.skippedDecorative, 1);
});

test("an image on a couple of slides is still content — a lecturer reuses a figure", () => {
  // A 20-slide deck: 3 appearances is reuse, not furniture. (This fixture used to
  // be MAX_SLIDES_BEFORE_DECORATIVE slides long, which made it a crest-on-every-
  // slide deck and asserted the opposite of what it claimed.)
  const slides = Array.from({ length: 20 }, (_, i) => ({
    images: i < MAX_SLIDES_BEFORE_DECORATIVE ? ["figure.png"] : [],
    n: i + 1,
  }));
  const plan = planSlideMedia(deck(slides, { "figure.png": BIG }));
  assert.equal(plan.images.length, 1);
  assert.equal(plan.images[0]?.slides.length, MAX_SLIDES_BEFORE_DECORATIVE);
});

test("a bullet glyph is too small to be a figure", () => {
  const plan = planSlideMedia(deck([{ images: ["bullet.png"], n: 1 }], { "bullet.png": 900 }));
  assert.deepEqual(plan.images, []);
  assert.equal(plan.skippedDecorative, 1);
});

test("an unreadable format is skipped rather than sent and rejected", () => {
  const plan = planSlideMedia(deck([{ images: ["chart.emf"], n: 1 }], { "chart.emf": BIG }));
  assert.deepEqual(plan.images, []);
});

test("an image referenced by a slide but missing from the zip is skipped, not crashed on", () => {
  const plan = planSlideMedia(deck([{ images: ["ghost.png"], n: 1 }], {}));
  assert.deepEqual(plan.images, []);
});

test("a slide with no rels file does not throw", () => {
  const input = deck([{ images: ["a.png"], n: 1 }], { "a.png": BIG });
  const stripped: SlideMediaInput = { ...input, relsXml: new Map() };
  assert.deepEqual(planSlideMedia(stripped).images, []);
});

// ── Bounded cost, and honest about the bound ─────────────────────────────────

test("a deck full of figures is capped, and the cap is reported not hidden", () => {
  const count = MAX_IMAGES_PER_DECK + 6;
  const slides = Array.from({ length: count }, (_, i) => ({ images: [`fig${i}.png`], n: i + 1 }));
  const sizes = Object.fromEntries(Array.from({ length: count }, (_, i) => [`fig${i}.png`, BIG]));
  const plan = planSlideMedia(deck(slides, sizes));
  assert.equal(plan.images.length, MAX_IMAGES_PER_DECK);
  assert.equal(plan.droppedToCap, 6);
});

test("when capped, the images kept are the earliest slides, not a random subset", () => {
  const count = MAX_IMAGES_PER_DECK + 5;
  const slides = Array.from({ length: count }, (_, i) => ({ images: [`fig${i}.png`], n: i + 1 }));
  const sizes = Object.fromEntries(Array.from({ length: count }, (_, i) => [`fig${i}.png`, BIG]));
  const plan = planSlideMedia(deck(slides, sizes));
  assert.equal(plan.images[0]?.slides[0], 1);
  assert.equal(plan.images.at(-1)?.slides[0], MAX_IMAGES_PER_DECK);
});

test("images come back in slide order", () => {
  const plan = planSlideMedia(
    deck([{ images: ["late.png"], n: 9 }, { images: ["early.png"], n: 2 }], { "early.png": BIG, "late.png": BIG }),
  );
  assert.deepEqual(plan.images.map((image) => image.slides[0]), [2, 9]);
});

// ── Folding descriptions back into the deck's text ───────────────────────────

test("a description lands under the slide it came from", () => {
  const merged = mergeImageDescriptions(
    ["Slide one text", "Slide two text", "Slide three text"],
    new Map([["ppt/media/a.png", "A flow chart of the renin-angiotensin system"]]),
    [{ mime: "image/png", name: "ppt/media/a.png", slides: [2] }],
  );
  assert.equal(merged[0], "Slide one text");
  assert.match(merged[1]!, /\[Figure: A flow chart of the renin-angiotensin system\]/);
  assert.equal(merged[2], "Slide three text");
});

test("a figure is marked as a figure, so it is never mistaken for the lecturer's words", () => {
  const merged = mergeImageDescriptions(["Text"], new Map([["a.png", "A graph"]]), [
    { mime: "image/png", name: "a.png", slides: [1] },
  ]);
  assert.match(merged[0]!, /^Text\n\[Figure: /);
});

test("an image reused across slides is noted on each of them", () => {
  const merged = mergeImageDescriptions(["One", "Two"], new Map([["a.png", "Shared figure"]]), [
    { mime: "image/png", name: "a.png", slides: [1, 2] },
  ]);
  assert.match(merged[0]!, /Shared figure/);
  assert.match(merged[1]!, /Shared figure/);
});

test("a slide with only a picture becomes the description rather than staying blank", () => {
  const merged = mergeImageDescriptions(["", "Words"], new Map([["a.png", "An anatomy diagram"]]), [
    { mime: "image/png", name: "a.png", slides: [1] },
  ]);
  assert.equal(merged[0], "[Figure: An anatomy diagram]");
});

test("images with no description leave their slide untouched", () => {
  const merged = mergeImageDescriptions(["Text"], new Map(), [{ mime: "image/png", name: "a.png", slides: [1] }]);
  assert.equal(merged[0], "Text");
});

test("a description for a slide beyond the deck is dropped, not appended somewhere wrong", () => {
  const merged = mergeImageDescriptions(["Only slide"], new Map([["a.png", "Ghost"]]), [
    { mime: "image/png", name: "a.png", slides: [7] },
  ]);
  assert.deepEqual(merged, ["Only slide"]);
});

// ── Short decks: the bug a real .pptx found that the fixtures above did not ───
// An absolute "on more than 3 slides" threshold looks right until the deck is only
// three slides long — then the crest on every slide clears it and gets sent to the
// vision model as a figure. Coverage of the DECK is what actually marks furniture.

test("the crest on every slide of a SHORT deck is still decoration", () => {
  const slides = [1, 2, 3].map((n) => ({ images: ["crest.png", ...(n === 3 ? ["diagram.png"] : [])], n }));
  const plan = planSlideMedia(deck(slides, { "crest.png": BIG, "diagram.png": BIG }));
  assert.deepEqual(plan.images.map((image) => image.name), ["ppt/media/diagram.png"]);
});

test("a figure on one slide of a short deck is content", () => {
  const plan = planSlideMedia(deck(
    [{ images: [], n: 1 }, { images: [], n: 2 }, { images: ["figure.png"], n: 3 }],
    { "figure.png": BIG },
  ));
  assert.equal(plan.images.length, 1);
});

test("a figure reused on two slides of a long deck stays content", () => {
  const slides = Array.from({ length: 30 }, (_, i) => ({ images: i < 2 ? ["figure.png"] : [], n: i + 1 }));
  const plan = planSlideMedia(deck(slides, { "figure.png": BIG }));
  assert.equal(plan.images.length, 1);
});

test("in a deck too short to have a majority, a picture is given the benefit of the doubt", () => {
  const plan = planSlideMedia(deck(
    [{ images: ["figure.png"], n: 1 }, { images: ["figure.png"], n: 2 }],
    { "figure.png": BIG },
  ));
  assert.equal(plan.images.length, 1, "two slides is not enough evidence to call it furniture");
});

test("isDecorativeSpread reads both rules", () => {
  assert.equal(isDecorativeSpread(3, 3), true, "every slide of a 3-slide deck");
  assert.equal(isDecorativeSpread(1, 3), false);
  assert.equal(isDecorativeSpread(4, 40), true, "more slides than a lecturer reuses a figure for");
  assert.equal(isDecorativeSpread(2, 40), false);
  assert.equal(isDecorativeSpread(2, 2), false, "no majority to read in a 2-slide deck");
});
