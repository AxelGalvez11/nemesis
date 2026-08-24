import assert from "node:assert/strict";
import { test } from "node:test";

import { composeSlide } from "./deck-compose";
import { DECK_DESIGNS, DEFAULT_DECK_DESIGN, deckDesign, SAFE_FONTS } from "./deck-designs";
import { EMPTY_SLIDE, type DeckPlan } from "./deck-plan";
import { buildDeckPptx } from "./deck-pptx";
import { SLIDE_H, SLIDE_W } from "./deck-scene";

// Twenty designs, commissioned twice: first as "twenty themes", then again when the first
// attempt turned out to be twenty colourways of one layout — *"those themes are terrible…
// like slides and PowerPoint have the designers feature"*. So the load-bearing test in this
// file is the one that says two designs may not be built the same way.

const HEX = /^[0-9a-f]{6}$/;

function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const PLAN: DeckPlan = {
  references: [{ title: "OpenStax Biology 2e", url: "https://openstax.org" }],
  slides: [
    { ...EMPTY_SLIDE, layout: "cover", subtitle: "How a plant turns light into sugar", title: "Photosynthesis" },
    { ...EMPTY_SLIDE, layout: "section", title: "The light reactions" },
    { ...EMPTY_SLIDE, layout: "bullets", points: ["one", "two", "three", "four"], title: "Four things" },
    { ...EMPTY_SLIDE, layout: "stat", statLabel: "of the oxygen you breathe", statValue: "70%" },
    { ...EMPTY_SLIDE, layout: "quote", quoteAttribution: "Melvin Calvin", title: "A factory run on sunlight" },
    { ...EMPTY_SLIDE, layout: "closing", points: ["Next: the Calvin cycle"], title: "Questions?" },
  ],
  subtitle: "How a plant turns light into sugar",
  title: "Photosynthesis",
};

test("the set keeps growing, and every design in it is distinct", () => {
  // Twenty was the first commission; the owner then asked for coverage of the Keynote
  // categories (Education, Personal, Portfolio, Craft, Textured…), so the floor matters and
  // the ceiling does not. What must hold is that no two are the same design.
  assert.ok(DECK_DESIGNS.length >= 20, `the set shrank to ${DECK_DESIGNS.length}`);
  assert.equal(new Set(DECK_DESIGNS.map((d) => d.id)).size, DECK_DESIGNS.length, "two designs share an id");
  assert.equal(new Set(DECK_DESIGNS.map((d) => d.name)).size, DECK_DESIGNS.length, "two designs share a name");
  assert.ok(DECK_DESIGNS.some((d) => d.id === DEFAULT_DECK_DESIGN), "the default names a design that does not exist");
});

test("🔴 no two designs are BUILT the same way — this is the whole point", () => {
  // The first twenty shipped as one layout in twenty colours and the owner rejected them on
  // sight. A design is a construction: cover archetype plus the way a list is set. That pair
  // must be unique, and the set must actually use most of the archetypes available.
  const pairs = DECK_DESIGNS.map((d) => `${d.cover}+${d.body}`);
  assert.equal(new Set(pairs).size, pairs.length, `two designs share a construction: ${pairs.join(", ")}`);
  assert.ok(new Set(DECK_DESIGNS.map((d) => d.cover)).size >= 12, "the covers are not varied enough");
  assert.ok(new Set(DECK_DESIGNS.map((d) => d.body)).size >= 8, "content slides are not varied enough");
  assert.ok(new Set(DECK_DESIGNS.map((d) => d.stat)).size >= 3, "number slides are not varied enough");
  assert.ok(new Set(DECK_DESIGNS.map((d) => d.quote)).size >= 3, "quotation slides are not varied enough");
  assert.ok(new Set(DECK_DESIGNS.map((d) => `${d.fonts.display}/${d.fonts.body}`)).size >= 10, "the type pairings repeat too much");
});

test("every colour is a real hex and every font is one a stock machine has", () => {
  for (const d of DECK_DESIGNS) {
    for (const [role, colour] of Object.entries({
      accent: d.accent,
      accentInk: d.accentInk,
      deep: d.deep,
      deepInk: d.deepInk,
      deepSoft: d.deepSoft,
      ink: d.ink,
      muted: d.muted,
      paper: d.paper,
      soft: d.soft,
    })) {
      assert.match(colour, HEX, `${d.id}: ${role} "${colour}" is not a bare 6-digit hex`);
    }
    // Nothing is embedded in a .pptx, so a font the machine lacks is a design that silently
    // becomes a different design.
    assert.ok(SAFE_FONTS.includes(d.fonts.display as never), `${d.id}: display font is not in SAFE_FONTS`);
    assert.ok(SAFE_FONTS.includes(d.fonts.body as never), `${d.id}: body font is not in SAFE_FONTS`);
  }
});

test("text is legible on whatever it sits on", () => {
  for (const d of DECK_DESIGNS) {
    const gaps: Array<[string, number]> = [
      ["title on page", Math.abs(luminance(d.ink) - luminance(d.paper))],
      ["body on page", Math.abs(luminance(d.soft) - luminance(d.paper))],
      ["ink on the dark field", Math.abs(luminance(d.deepInk) - luminance(d.deep))],
      ["secondary on the dark field", Math.abs(luminance(d.deepSoft) - luminance(d.deep))],
      ["text on the accent block", Math.abs(luminance(d.accentInk) - luminance(d.accent))],
    ];
    for (const [what, gap] of gaps) {
      assert.ok(gap > 0.3, `${d.id}: ${what} is too close in tone (${gap.toFixed(2)})`);
    }
  }
});

test("every design composes every slide kind, and puts words on all of them", () => {
  for (const d of DECK_DESIGNS) {
    for (const [i, slide] of PLAN.slides.entries()) {
      const scene = composeSlide(d, slide, { credit: "Nemesis", index: i + 1, plan: PLAN });
      const words = scene.items.filter((it) => it.kind === "text" || it.kind === "bullets");
      assert.ok(words.length > 0, `${d.id}: the ${slide.layout} slide has no text at all`);
      assert.match(scene.background.color, HEX, `${d.id}: ${slide.layout} has no background colour`);
      for (const item of scene.items) {
        if (item.kind !== "text") continue;
        assert.ok(item.text.trim().length > 0, `${d.id}: ${slide.layout} has an empty text box`);
        // Type may sit near an edge but never off the slide: PowerPoint would clip it.
        assert.ok(item.box.x > -0.2 && item.box.x + item.box.w <= SLIDE_W + 0.2, `${d.id}: ${slide.layout} text runs off the side`);
        assert.ok(item.box.y > -1.0 && item.box.y + item.box.h <= SLIDE_H + 0.6, `${d.id}: ${slide.layout} text runs off the bottom`);
      }
    }
  }
});

test("cards never overlap, at any number of points", () => {
  // A four-point slide once stacked its third and fourth cards on top of each other, which is
  // exactly the sort of thing that only shows up in a picture.
  const carded = DECK_DESIGNS.filter((d) => d.body === "cards");
  assert.ok(carded.length > 0, "no design sets its points as cards any more");
  for (const d of carded) {
    for (let n = 1; n <= 5; n += 1) {
      const slide = { ...EMPTY_SLIDE, layout: "bullets" as const, points: Array.from({ length: n }, (_, i) => `point ${i + 1}`), title: "T" };
      const scene = composeSlide(d, slide, { credit: "N", index: 3, plan: PLAN });
      const cards = scene.items.filter((it) => it.kind === "shape" && it.shape === "roundRect").map((it) => (it as { box: typeof slide extends never ? never : { x: number; y: number; w: number; h: number } }).box);
      assert.equal(cards.length, n, `${d.id}: ${n} points produced ${cards.length} cards`);
      for (let a = 0; a < cards.length; a += 1) {
        for (let b = a + 1; b < cards.length; b += 1) {
          const p = cards[a];
          const q = cards[b];
          if (!p || !q) continue;
          const apart = p.x + p.w <= q.x + 0.01 || q.x + q.w <= p.x + 0.01 || p.y + p.h <= q.y + 0.01 || q.y + q.h <= p.y + 0.01;
          assert.ok(apart, `${d.id}: cards ${a + 1} and ${b + 1} overlap with ${n} points`);
        }
      }
    }
  }
});

test("an unknown or missing design id falls back instead of throwing", () => {
  assert.equal(deckDesign("no-such-design").id, DEFAULT_DECK_DESIGN);
  assert.equal(deckDesign(null).id, DEFAULT_DECK_DESIGN);
  assert.equal(deckDesign(undefined).id, DEFAULT_DECK_DESIGN);
  assert.equal(deckDesign("onyx").id, "onyx");
});

test("all twenty build a genuine .pptx", async () => {
  for (const d of DECK_DESIGNS) {
    const built = (await buildDeckPptx(PLAN, { credit: "Made with Nemesis", designId: d.id })) as Buffer;
    assert.equal(built.subarray(0, 2).toString(), "PK", `${d.id}: not a zip`);
    const text = built.toString("latin1");
    assert.ok(text.includes("ppt/slides/slide7.xml"), `${d.id}: lost a slide (6 planned + references)`);
    assert.ok(!text.includes("ppt/slides/slide8.xml"), `${d.id}: invented a slide`);
    assert.ok(text.includes(d.fonts.display), `${d.id}: the display font is not named in the XML`);
  }
});

test("a design built on a picture declares whether that picture is dark", () => {
  // 2026-08-24: Quarry shipped its title in page ink on a slate cover and was nearly invisible.
  // A composition cannot see its own background, so the design has to say.
  for (const d of DECK_DESIGNS) {
    if (!d.texture?.cover) continue;
    assert.equal(typeof d.texture.dark, "boolean", `${d.id}: a textured cover must declare texture.dark`);
    const ink = d.texture.dark ? d.deepInk : d.ink;
    const ground = d.texture.dark ? d.deep : d.paper;
    const gap = Math.abs(luminance(ink) - luminance(ground));
    assert.ok(gap > 0.45, `${d.id}: the cover title is too close in tone to its own picture (${gap.toFixed(2)})`);
  }
});

test("a material used on the INTERIOR pages is a light one", () => {
  // The interior sets its type in the design's page ink, which is chosen against `paper`. A
  // design cannot see its own material, so the rule is structural: a design that lays material
  // under its content pages must have light paper for that ink to have been chosen correctly —
  // and `paper` is also what the page falls back to if the asset ever fails to load.
  for (const d of DECK_DESIGNS) {
    if (!d.texture?.page) continue;
    assert.ok(luminance(d.paper) > 0.75, `${d.id}: an interior material on dark paper would swallow the words`);
    assert.ok(
      Math.abs(luminance(d.ink) - luminance(d.paper)) > 0.5,
      `${d.id}: page ink is not dark enough to survive a material behind it`,
    );
  }
});

test("a texture is an app asset, not a link to somewhere else", () => {
  // A deck must build with no network beyond our own origin: the .pptx inlines these bytes.
  for (const d of DECK_DESIGNS) {
    for (const url of [d.texture?.cover, d.texture?.section, d.texture?.closing, d.texture?.page].filter(Boolean)) {
      assert.match(url as string, /^\/deck\/textures\/[a-z0-9-]+\.jpg$/, `${d.id}: "${url}" is not a local deck texture`);
    }
  }
});
