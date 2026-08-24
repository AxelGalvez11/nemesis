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

// ── the build-in ─────────────────────────────────────────────────────────────────────────────
// Owner 2026-08-24: *"maybe add… some animations."* Everything below is a defect that actually
// happened in the browser, written down so it cannot happen twice. CI has no browser, so these
// read the markup and the stylesheet instead.

test("🔴 a build-in never changes what a slide finally looks like", async () => {
  // The first version's keyframes ended at a flat `opacity:1`, and the animation fills forwards
  // — so once the slide had finished building, an 8%-tint takeaway box was a SOLID accent block
  // sitting on its own text, and every faint gridline was a hard rule. A shape's own opacity is
  // published as --dk-o and the keyframes end there instead.
  for (const name of ["dk-rise", "dk-fade", "dk-wipe", "dk-zoom"]) {
    const at = DECK_CSS.indexOf(`@keyframes ${name}{`);
    assert.ok(at >= 0, `${name} is not defined`);
    const landing = DECK_CSS.slice(DECK_CSS.indexOf("to{", at), DECK_CSS.indexOf("}", DECK_CSS.indexOf("to{", at)));
    assert.ok(landing.includes("opacity:var(--dk-o,1)"), `${name} settles at "${landing}" instead of the item's own opacity`);
    assert.ok(!/opacity:1[;}]?$/.test(landing.trim()), `${name} ends by forcing full opacity`);
  }
  const scene = composeSlide(deckDesign("studio"), PLAN.slides[1]!, { credit: "Nemesis", index: 2, plan: PLAN });
  const html = await sceneToHtml(scene, 2);
  // Every element that sets an opacity must publish the same number for the keyframes to land on.
  for (const [, value] of html.matchAll(/;opacity:([0-9.]+)/g)) {
    assert.ok(html.includes(`--dk-o:${value}`), `a shape at opacity ${value} did not publish it as --dk-o`);
  }
});

test("🔴 a rotated mark is still rotated when it lands", async () => {
  // The keyframes animate `transform`, which would otherwise overwrite an inline rotate and
  // leave a diamond sitting as a square.
  const scene = composeSlide(deckDesign("bindery"), PLAN.slides[1]!, { credit: "Nemesis", index: 2, plan: PLAN });
  const html = await sceneToHtml(scene, 2);
  for (const [, angle] of html.matchAll(/;transform:rotate\(([-0-9.]+)deg\)/g)) {
    assert.ok(html.includes(`--dk-r:${angle}deg`), `a shape rotated ${angle}deg did not publish it as --dk-r`);
  }
  for (const name of ["dk-rise", "dk-zoom"]) {
    assert.match(DECK_CSS, new RegExp(`@keyframes ${name}\\{[^}]*rotate\\(var\\(--dk-r,0deg\\)\\)`), `${name} drops rotation`);
  }
});

test("🔴 the hidden state exists ONLY under .dk-run", () => {
  // This is the whole safety story for motion: the viewer opts in per slide, so anything that
  // renders a deck without adding that class — printing, an embed, a future surface — gets a
  // finished slide. The failure mode is "no animation", never "no slide".
  for (const line of DECK_CSS.split("\n")) {
    if (!line.includes("animation:")) continue;
    // The rule may sit inside an @media block, but its SELECTOR must always be scoped.
    assert.ok(line.includes(".dk-run "), `motion is applied outside .dk-run: ${line.trim()}`);
  }
  assert.match(DECK_CSS, /@media \(prefers-reduced-motion:reduce\)\{\.dk-run \.dk-a\{animation:none\}\}/, "reduced motion is not honoured");
  assert.match(DECK_CSS, /\.dk-run \.dk-a\{animation:none!important\}/, "print does not cancel the build-in");
  // ...and print must cancel ONLY the animation: forcing opacity or clip-path there would print
  // every translucent panel solid and every triangle as a rectangle.
  const printBlock = DECK_CSS.slice(DECK_CSS.indexOf("@media print"));
  assert.ok(!printBlock.includes("opacity:1!important"), "print flattens translucent shapes");
  assert.ok(!printBlock.includes("clip-path:none!important"), "print un-clips the shaped primitives");
});

test("a design's motion reaches the slide, and the cascade stays short", async () => {
  const scene = composeSlide(deckDesign("chalk"), PLAN.slides[1]!, { credit: "Nemesis", index: 2, plan: PLAN });
  const html = await sceneToHtml(scene, 2);
  assert.match(html, /data-motion="wipe"/, "the design's motion never reached the slide");
  const delays = [...html.matchAll(/--dk-d:([0-9.]+)s/g)].map(([, d]) => Number(d));
  assert.ok(delays.length > 10, "nothing on a busy slide was given a build order");
  assert.ok(Math.max(...delays) <= 0.55, `the build takes ${Math.max(...delays)}s — a presenter is waiting`);
});
