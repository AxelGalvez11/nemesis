import assert from "node:assert/strict";
import { test } from "node:test";

import {
  embeddedRelIds,
  imageMime,
  isGlyph,
  isRecurring,
  MAX_IMAGES_PER_DECK,
  MAX_SLIDES_BEFORE_RECURRING,
  mergeImageDescriptions,
  MIN_IMAGE_EDGE,
  MIN_IMAGE_PIXELS,
  MIN_UNKNOWN_BYTES,
  parseSlideRels,
  planSlideMedia,
  slideNumber,
  type MediaFact,
  type SlideMediaInput,
} from "./slide-media";

/** A picture comfortably over both the edge and the area floor. */
const FIGURE = { bytes: 40_000, height: 600, width: 800 };

const rels = (pairs: Array<[string, string]>) =>
  `<?xml version="1.0"?><Relationships>${pairs
    .map(([id, target]) => `<Relationship Id="${id}" Type="…/image" Target="${target}"/>`)
    .join("")}</Relationships>`;

const slide = (relIds: string[]) =>
  `<p:sld><p:cSld><p:spTree>${relIds
    .map((id) => `<p:pic><p:blipFill><a:blip r:embed="${id}"/></p:blipFill></p:pic>`)
    .join("")}</p:spTree></p:cSld></p:sld>`;

type Fact = Partial<MediaFact> & { contentKey?: string };

/** Wire slides, their rels, and what is known about each picture. By default every
 *  named picture is a distinct, readable figure. */
function deck(
  slides: Array<{ n: number; images: string[] }>,
  facts: Record<string, Fact> = {},
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
  const names = new Set(slides.flatMap((entry) => entry.images));
  const media = new Map<string, MediaFact>();
  for (const name of names) {
    const given = facts[name] ?? {};
    media.set(`ppt/media/${name}`, {
      bytes: given.bytes ?? FIGURE.bytes,
      contentKey: given.contentKey ?? `key-${name}`,
      height: given.height === undefined ? FIGURE.height : given.height,
      mime: given.mime === undefined ? "image/png" : given.mime,
      width: given.width === undefined ? FIGURE.width : given.width,
    });
  }
  return { media, relsXml, slideXml };
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

test("only raster formats a vision model reads are accepted by extension", () => {
  assert.equal(imageMime("ppt/media/image1.png"), "image/png");
  assert.equal(imageMime("ppt/media/image2.JPG"), "image/jpeg");
  assert.equal(imageMime("ppt/media/image3.emf"), null, "vector metafiles are not images to a vision model");
  assert.equal(imageMime("ppt/media/image4.wmf"), null);
});

// ── Glyph or figure: decided on pixels ───────────────────────────────────────
// Every case below is a real file measured in a 12-deck pharmacokinetics course.

test("a 16x16 icon is a glyph even when it is a fat 21KB JPEG", () => {
  assert.equal(isGlyph({ bytes: 21_922, height: 16, width: 16 }), true);
});

test("a 1408x523 figure is content even at 4.6KB", () => {
  assert.equal(isGlyph({ bytes: 4_603, height: 523, width: 1408 }), false);
});

test("a wide thin divider bar is a glyph on its short edge", () => {
  assert.equal(isGlyph({ bytes: 30_000, height: 12, width: 900 }), true);
});

test("a small square badge fails on area even with a passable edge", () => {
  assert.equal(isGlyph({ bytes: 30_000, height: MIN_IMAGE_EDGE + 2, width: MIN_IMAGE_EDGE + 2 }), true);
  assert.ok((MIN_IMAGE_EDGE + 2) ** 2 < MIN_IMAGE_PIXELS);
});

test("an unreadable header is not treated as small unless the file is tiny", () => {
  assert.equal(isGlyph({ bytes: 4_603, height: null, width: null }), false, "unknown size is not a reason to drop");
  assert.equal(isGlyph({ bytes: MIN_UNKNOWN_BYTES - 1, height: null, width: null }), true);
});

test("a real diagram on one slide is content", () => {
  const plan = planSlideMedia(deck([{ images: ["pathway.png"], n: 4 }]));
  assert.equal(plan.images.length, 1);
  assert.deepEqual(plan.images[0]?.slides, [4]);
  assert.equal(plan.images[0]?.recurring, false);
});

test("a bullet glyph is skipped and counted", () => {
  const plan = planSlideMedia(deck([{ images: ["bullet.png"], n: 1 }], { "bullet.png": { height: 20, width: 20 } }));
  assert.deepEqual(plan.images, []);
  assert.equal(plan.skippedGlyphs, 1);
  assert.equal(plan.found, 1, "it was found — it just was not sent");
});

// ── What cannot be read is reported, not hidden ──────────────────────────────

test("a true vector drawing is counted as unreadable rather than dropped in silence", () => {
  const plan = planSlideMedia(deck([{ images: ["arrows.emf"], n: 1 }], { "arrows.emf": { mime: null } }));
  assert.deepEqual(plan.images, []);
  assert.equal(plan.unreadable, 1);
  assert.equal(plan.found, 1);
});

test("every picture on a slide is accounted for exactly once", () => {
  const plan = planSlideMedia(
    deck([{ images: ["figure.png", "bullet.png", "arrows.emf"], n: 1 }], {
      "arrows.emf": { mime: null },
      "bullet.png": { height: 18, width: 18 },
    }),
  );
  assert.equal(plan.found, 3);
  assert.equal(plan.images.length + plan.skippedGlyphs + plan.unreadable + plan.droppedToCap, plan.found);
});

// ── Dedupe: the crest on 71 slides is ONE picture ────────────────────────────

test("the same picture stored under two entry names is described once", () => {
  const plan = planSlideMedia(
    deck([{ images: ["a.png"], n: 1 }, { images: ["b.png"], n: 5 }], {
      "a.png": { contentKey: "same" },
      "b.png": { contentKey: "same" },
    }),
  );
  assert.equal(plan.images.length, 1);
  assert.deepEqual(plan.images[0]?.slides, [1, 5], "both appearances are kept, both point at one description");
  assert.equal(plan.found, 1);
});

test("a crest on every slide costs one description, not one per slide", () => {
  const slides = Array.from({ length: 40 }, (_, i) => ({ images: ["crest.png"], n: i + 1 }));
  const plan = planSlideMedia(deck(slides));
  assert.equal(plan.images.length, 1);
  assert.equal(plan.images[0]?.recurring, true);
  assert.equal(plan.images[0]?.slides.length, 40);
});

test("the cap counts distinct pictures, so repetition can never exhaust it", () => {
  const slides = Array.from({ length: MAX_IMAGES_PER_DECK + 40 }, (_, i) => ({ images: ["crest.png"], n: i + 1 }));
  const plan = planSlideMedia(deck(slides));
  assert.equal(plan.droppedToCap, 0);
  assert.equal(plan.images.length, 1);
});

// ── Recurring is a label now, not a reason to drop ───────────────────────────

test("a picture on many slides is still read", () => {
  const slides = Array.from({ length: 20 }, (_, i) => ({ images: ["crest.png"], n: i + 1 }));
  const plan = planSlideMedia(deck(slides));
  assert.equal(plan.images.length, 1, "it is described — the old rule threw it away unseen");
  assert.equal(plan.images[0]?.recurring, true);
});

test("isRecurring reads both rules", () => {
  assert.equal(isRecurring(3, 3), true, "every slide of a 3-slide deck");
  assert.equal(isRecurring(1, 3), false);
  assert.equal(isRecurring(MAX_SLIDES_BEFORE_RECURRING + 1, 40), true);
  assert.equal(isRecurring(2, 40), false);
  assert.equal(isRecurring(2, 2), false, "no majority to read in a 2-slide deck");
});

// ── Bounded, and honest about the bound ──────────────────────────────────────

test("a deck of distinct figures past the ceiling reports what it left out", () => {
  const count = MAX_IMAGES_PER_DECK + 6;
  const slides = Array.from({ length: count }, (_, i) => ({ images: [`fig${i}.png`], n: i + 1 }));
  const plan = planSlideMedia(deck(slides));
  assert.equal(plan.images.length, MAX_IMAGES_PER_DECK);
  assert.equal(plan.droppedToCap, 6);
});

test("when capped, the pictures kept are the earliest slides, not a random subset", () => {
  const count = MAX_IMAGES_PER_DECK + 5;
  const slides = Array.from({ length: count }, (_, i) => ({ images: [`fig${i}.png`], n: i + 1 }));
  const plan = planSlideMedia(deck(slides));
  assert.equal(plan.images[0]?.slides[0], 1);
  assert.equal(plan.images.at(-1)?.slides[0], MAX_IMAGES_PER_DECK);
});

test("pictures come back in slide order", () => {
  const plan = planSlideMedia(deck([{ images: ["late.png"], n: 9 }, { images: ["early.png"], n: 2 }]));
  assert.deepEqual(plan.images.map((image) => image.slides[0]), [2, 9]);
});

test("a picture referenced by a slide but missing from the zip is skipped, not crashed on", () => {
  const input = deck([{ images: ["ghost.png"], n: 1 }]);
  const stripped: SlideMediaInput = { ...input, media: new Map() };
  assert.deepEqual(planSlideMedia(stripped).images, []);
});

test("a slide with no rels file does not throw", () => {
  const input = deck([{ images: ["a.png"], n: 1 }]);
  const stripped: SlideMediaInput = { ...input, relsXml: new Map() };
  assert.deepEqual(planSlideMedia(stripped).images, []);
});

// ── Folding descriptions back into the deck's text ───────────────────────────

test("a description lands under the slide it came from", () => {
  const merged = mergeImageDescriptions(
    ["Slide one text", "Slide two text", "Slide three text"],
    new Map([["ppt/media/a.png", "A flow chart of the renin-angiotensin system"]]),
    [{ mime: "image/png", name: "ppt/media/a.png", recurring: false, slides: [2] }],
  );
  assert.equal(merged[0], "Slide one text");
  assert.match(merged[1]!, /\[Figure: A flow chart of the renin-angiotensin system\]/);
  assert.equal(merged[2], "Slide three text");
});

test("a figure is marked as a figure, so it is never mistaken for the lecturer's words", () => {
  const merged = mergeImageDescriptions(["Text"], new Map([["a.png", "A graph"]]), [
    { mime: "image/png", name: "a.png", recurring: false, slides: [1] },
  ]);
  assert.match(merged[0]!, /^Text\n\[Figure: /);
});

test("a figure reused on two slides is noted on each of them", () => {
  const merged = mergeImageDescriptions(["One", "Two"], new Map([["a.png", "Shared figure"]]), [
    { mime: "image/png", name: "a.png", recurring: false, slides: [1, 2] },
  ]);
  assert.match(merged[0]!, /Shared figure/);
  assert.match(merged[1]!, /Shared figure/);
});

test("a recurring graphic is noted once, not under all 40 slides", () => {
  const slides = Array.from({ length: 40 }, (_, i) => `Slide ${i + 1}`);
  const merged = mergeImageDescriptions(slides, new Map([["crest.png", "A university crest"]]), [
    { mime: "image/png", name: "crest.png", recurring: true, slides: slides.map((_, i) => i + 1) },
  ]);
  assert.match(merged[0]!, /\[Recurring graphic: A university crest\]/);
  assert.equal(merged.filter((text) => text.includes("A university crest")).length, 1);
});

test("a slide with only a picture becomes the description rather than staying blank", () => {
  const merged = mergeImageDescriptions(["", "Words"], new Map([["a.png", "An anatomy diagram"]]), [
    { mime: "image/png", name: "a.png", recurring: false, slides: [1] },
  ]);
  assert.equal(merged[0], "[Figure: An anatomy diagram]");
});

test("pictures with no description leave their slide untouched", () => {
  const merged = mergeImageDescriptions(["Text"], new Map(), [
    { mime: "image/png", name: "a.png", recurring: false, slides: [1] },
  ]);
  assert.equal(merged[0], "Text");
});

test("a description for a slide beyond the deck is dropped, not appended somewhere wrong", () => {
  const merged = mergeImageDescriptions(["Only slide"], new Map([["a.png", "Ghost"]]), [
    { mime: "image/png", name: "a.png", recurring: false, slides: [7] },
  ]);
  assert.deepEqual(merged, ["Only slide"]);
});
