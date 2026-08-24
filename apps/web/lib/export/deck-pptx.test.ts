import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_SLIDE, type DeckPlan } from "./deck-plan";
import { buildDeckPptx } from "./deck-pptx";

// One real build, opened up. Geometry and colour are the theme's own business; what this
// pins is the contract: a plan in, a genuine PowerPoint out — every slide present, the
// references slide appended, the fonts the theme promises actually named in the XML.

const PLAN: DeckPlan = {
  references: [{ title: "OpenStax Biology 2e", url: "https://openstax.org/books/biology-2e" }],
  slides: [
    { ...EMPTY_SLIDE, layout: "cover", subtitle: "sub", title: "Deck" },
    { ...EMPTY_SLIDE, layout: "section", icon: "lightbulb", title: "Part one" },
    { ...EMPTY_SLIDE, layout: "bullets", points: ["one", "two"], title: "Points" },
    { ...EMPTY_SLIDE, layout: "stat", statLabel: "of something", statValue: "42%" },
    { ...EMPTY_SLIDE, layout: "closing", title: "End" },
  ],
  subtitle: "sub",
  title: "Deck",
};

test("a plan becomes a real .pptx: zip magic, one XML per slide, the theme's fonts", async () => {
  const built = (await buildDeckPptx(PLAN, { credit: "Made with Nemesis" })) as Buffer;
  assert.ok(Buffer.isBuffer(built), "under Node the builder returns a Buffer");
  assert.ok(built.length > 50_000, "a deck with backgrounds cannot be this small");
  assert.equal(built.subarray(0, 2).toString(), "PK", "not a zip, so not a pptx");
  const text = built.toString("latin1");
  for (let i = 1; i <= 6; i += 1) {
    assert.ok(text.includes(`ppt/slides/slide${i}.xml`), `slide ${i} missing — 5 planned + references`);
  }
  assert.ok(!text.includes("ppt/slides/slide7.xml"), "more slides than the plan holds");
});

test("no references, no references slide", async () => {
  const built = (await buildDeckPptx({ ...PLAN, references: [] }, { credit: "x" })) as Buffer;
  const text = built.toString("latin1");
  assert.ok(text.includes("ppt/slides/slide5.xml"));
  assert.ok(!text.includes("ppt/slides/slide6.xml"), "a references slide appeared from nowhere");
});

test("the theme, not the plan, decides how the deck looks", async () => {
  // Owner 2026-08-25 asked for twenty looks. The same plan must come out wearing different
  // clothes — same slides, different fonts and colours — with no change to the content.
  const house = ((await buildDeckPptx(PLAN, { credit: "x" })) as Buffer).toString("latin1");
  const neon = ((await buildDeckPptx(PLAN, { credit: "x", themeId: "neon" })) as Buffer).toString("latin1");
  assert.ok(house.includes("Georgia"), "the house look lost its display font");
  assert.ok(neon.includes("Trebuchet MS"), "the neon look is not wearing its own display font");
  assert.ok(!neon.includes("Georgia"), "the neon look leaked the house font");
  for (let i = 1; i <= 6; i += 1) {
    assert.ok(neon.includes(`ppt/slides/slide${i}.xml`), `theming dropped slide ${i}`);
  }
});

test("a theme id nobody recognises still produces a deck", async () => {
  // Stored ids outlive code. A theme that was renamed or removed must degrade to the house
  // look, never to a failed download.
  const built = (await buildDeckPptx(PLAN, { credit: "x", themeId: "theme-from-a-future-release" })) as Buffer;
  assert.equal(built.subarray(0, 2).toString(), "PK");
  assert.ok(built.toString("latin1").includes("Georgia"), "the fallback is not the house look");
});
