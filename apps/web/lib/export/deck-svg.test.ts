import assert from "node:assert/strict";
import { test } from "node:test";

import { composeSlide } from "./deck-compose";
import { DECK_DESIGNS, deckDesign } from "./deck-designs";
import { EMPTY_SLIDE, type DeckPlan } from "./deck-plan";
import { sceneToSvg } from "./deck-svg";

// The preview backend exists so a design can be judged before it is downloaded. Its whole
// value is that it renders the SAME Scene the .pptx does, so these tests guard the properties
// that would let a preview lie: clipping, escaping, and actually drawing the words.

const PLAN: DeckPlan = {
  figures: [],
  references: [],
  slides: [{ ...EMPTY_SLIDE, layout: "cover", subtitle: "sub", title: "Photosynthesis" }],
  subtitle: "sub",
  title: "Photosynthesis",
};

test("a scene becomes an SVG of the slide's proportions, clipped like PowerPoint clips", async () => {
  const scene = composeSlide(deckDesign("orchid"), PLAN.slides[0]!, { credit: "Nemesis", index: 1, plan: PLAN });
  const svg = await sceneToSvg(scene, 800);
  assert.match(svg, /^<svg /, "not an svg");
  assert.match(svg, /width="800"/);
  const height = Number(/^<svg height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  assert.ok(Math.abs(height - (800 * 7.5) / 13.33) < 1, `the preview is not the slide's shape (${height}px tall)`);
  // Orchid's cover is a circle that runs off the corner on purpose; unclipped, a preview would
  // paint it over whatever sits beside the preview.
  assert.match(svg, /clipPath/, "the preview does not clip to the slide");
  assert.match(svg, /clip-path="url\(#/, "the clip path is defined but never used");
});

test("the deck's own words reach the picture, escaped", async () => {
  const slide = { ...EMPTY_SLIDE, layout: "cover" as const, subtitle: "a & b", title: "Ohm's law <in> practice" };
  const scene = composeSlide(deckDesign("studio"), slide, { credit: "Nemesis", index: 1, plan: { ...PLAN, slides: [slide] } });
  const svg = await sceneToSvg(scene, 600);
  assert.ok(svg.includes("Ohm&#39;s") || svg.includes("Ohm's"), "the title never made it into the preview");
  assert.ok(!svg.includes("<in>"), "raw angle brackets went into the markup");
  assert.match(svg, /&lt;in&gt;/, "the title was not escaped");
  assert.ok(!svg.includes("a & b"), "an unescaped ampersand went into the markup");
});

test("every design previews without throwing", async () => {
  for (const design of DECK_DESIGNS) {
    const svg = await sceneToSvg(
      composeSlide(design, PLAN.slides[0]!, { credit: "Nemesis", index: 1, plan: PLAN }),
      260,
    );
    assert.ok(svg.length > 200, `${design.id}: the preview is suspiciously empty`);
    assert.ok(svg.includes("Photosynthesis"), `${design.id}: the preview lost the title`);
  }
});
