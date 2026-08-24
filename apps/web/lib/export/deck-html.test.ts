import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { composeSlide } from "./deck-compose";
import { DECK_DESIGNS, deckDesign } from "./deck-designs";
import { DECK_CSS, SLIDE_PX_H, SLIDE_PX_W, sceneToHtml } from "./deck-html";
import { EMPTY_SLIDE, type DeckPlan } from "./deck-plan";
import { SLIDE_H, SLIDE_W } from "./deck-scene";

// The HTML backend is what the learner actually looks at (owner 2026-08-24: "HTML is the deck,
// .pptx is an export"), so what it must never do is disagree with the file: same Scene, same
// geometry, same words.

const PLAN: DeckPlan = {
  references: [],
  slides: [
    { ...EMPTY_SLIDE, layout: "cover", subtitle: "sub", title: "Photosynthesis" },
    {
      ...EMPTY_SLIDE,
      chart: "column",
      data: [
        { label: "Captured", value: 100 },
        { label: "Stored", value: 4.5 },
      ],
      layout: "chart",
      takeaway: "Most of it is lost first.",
      title: "Ninety-five per cent never becomes sugar",
      unit: "%",
    },
  ],
  subtitle: "sub",
  title: "Photosynthesis",
};

test("a slide is one element, sized as the printed page", async () => {
  const scene = composeSlide(deckDesign("studio"), PLAN.slides[0]!, { credit: "Nemesis", index: 1, plan: PLAN });
  const html = await sceneToHtml(scene, 1);
  assert.match(html, /^<section /, "a slide is not a section element");
  assert.match(html, /data-slide="1"/);
  assert.match(html, /Photosynthesis/, "the title never reached the page");
  // 13.33in x 7.5in at 96 CSS px per inch. Print rules depend on this being exact.
  assert.equal(SLIDE_PX_W, SLIDE_W * 96);
  assert.equal(SLIDE_PX_H, SLIDE_H * 96);
  assert.match(DECK_CSS, new RegExp(`width:${SLIDE_PX_W}px`), "the slide is not the width of the page");
  assert.match(DECK_CSS, new RegExp(`size:${SLIDE_W}in ${SLIDE_H}in`), "the print size no longer matches the slide");
  assert.match(DECK_CSS, /margin:0/, "a print margin would scale the deck down");
});

test("the deck's own words are escaped", async () => {
  const slide = { ...EMPTY_SLIDE, layout: "cover" as const, subtitle: "a & b", title: "Ohm's <law> in practice" };
  const scene = composeSlide(deckDesign("studio"), slide, { credit: "Nemesis", index: 1, plan: { ...PLAN, slides: [slide] } });
  const html = await sceneToHtml(scene, 1);
  assert.ok(!html.includes("<law>"), "raw angle brackets went into the markup");
  assert.match(html, /&lt;law&gt;/);
  assert.ok(!html.includes("a & b"), "an unescaped ampersand went into the markup");
});

test("every design renders every slide kind without throwing", async () => {
  for (const design of DECK_DESIGNS) {
    for (const [i, slide] of PLAN.slides.entries()) {
      const html = await sceneToHtml(composeSlide(design, slide, { credit: "Nemesis", index: i + 1, plan: PLAN }), i + 1);
      assert.ok(html.length > 200, `${design.id}: slide ${i + 1} came out empty`);
      assert.ok(!html.includes("undefined"), `${design.id}: slide ${i + 1} wrote "undefined" into the markup`);
      assert.ok(!html.includes("NaN"), `${design.id}: slide ${i + 1} wrote NaN into a position`);
    }
  }
});

test("the chart's bars and labels survive the trip to HTML", async () => {
  const scene = composeSlide(deckDesign("meridian"), PLAN.slides[1]!, { credit: "Nemesis", index: 2, plan: PLAN });
  const html = await sceneToHtml(scene, 2);
  assert.match(html, /100%/, "a value label is missing");
  assert.match(html, /4\.5%/, "the small value label is missing");
  assert.match(html, /Captured/, "a category label is missing");
  assert.match(html, /Most of it is lost first\./, "the takeaway is missing");
});

test("the deck is a route, and both shelves open it rather than downloading", () => {
  // Owner 2026-08-24. A deck that could only be downloaded made the learner leave the app to
  // see what they had made.
  const route = readFileSync(new URL("../../app/(workspace)/deck/page.tsx", import.meta.url), "utf8");
  assert.match(route, /DeckView/, "the deck route no longer renders the deck");
  assert.match(route, /downloadDeck/, "the .pptx export left the deck view");
  const view = readFileSync(new URL("../../components/workspace/deck/deck-view.tsx", import.meta.url), "utf8");
  assert.match(view, /requestFullscreen/, "present mode is gone");
  assert.match(view, /window\.print\(\)/, "the PDF path is gone — printing IS the PDF export");
  const controls = readFileSync(new URL("../../components/workspace/learn/canvas-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /\/deck\?c=/, "the canvas outputs panel no longer opens the deck");
  const library = readFileSync(new URL("../../components/workspace/library/library-outputs.tsx", import.meta.url), "utf8");
  assert.match(library, /\/deck\?c=/, "the Library's Slides shelf no longer opens the deck");
});
