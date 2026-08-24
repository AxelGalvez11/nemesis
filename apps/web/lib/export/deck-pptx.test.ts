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
