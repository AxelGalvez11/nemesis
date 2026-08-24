import assert from "node:assert/strict";
import { test } from "node:test";

import { composeSlide, type DeckDesign } from "./deck-compose";
import { DECK_DESIGNS } from "./deck-designs";
import { EMPTY_SLIDE, type DeckPlan, type DeckSlide } from "./deck-plan";
import { SLIDE_H, SLIDE_W, type Box, type SceneBullets, type SceneShape, type SceneText } from "./deck-scene";
import { measureText } from "./deck-svg";

// 🔴 THE OWNER'S SECOND COMPLAINT, MECHANISED: *"some of the shapes are blocking the text."*
// A picture catches that instantly and code never does — unless code is asked. These tests ask,
// for every slide kind of every design, using MEASURED text extents rather than the generous
// boxes the layout hands out.

const PLAN: DeckPlan = {
  references: [{ title: "Zhu, Long & Ort, Annual Review of Plant Biology" }, { title: "OpenStax Biology 2e" }],
  slides: [
    { ...EMPTY_SLIDE, layout: "cover", subtitle: "Where the energy goes, and what that costs the plant", title: "Photosynthesis" },
    { ...EMPTY_SLIDE, layout: "agenda", points: ["The light reactions", "The Calvin cycle", "Where the losses are", "What breeders change"], title: "Agenda" },
    { ...EMPTY_SLIDE, layout: "section", title: "The light reactions" },
    {
      ...EMPTY_SLIDE,
      chart: "column",
      data: [
        { label: "Light captured", value: 100 },
        { label: "Reflected", value: 47 },
        { label: "Wrong wavelength", value: 30 },
        { label: "Heat loss", value: 19 },
        { label: "Stored as sugar", value: 4.5 },
      ],
      layout: "chart",
      takeaway: "Only a twentieth of the light hitting a leaf ends up as sugar; the rest is lost first.",
      title: "Ninety-five per cent of incoming light never becomes sugar",
      unit: "%",
    },
    {
      ...EMPTY_SLIDE,
      data: [
        { label: "Maximum theoretical efficiency, C3 plants", value: 4.6 },
        { label: "Observed field efficiency", value: 1.1 },
        { label: "Carbon lost to photorespiration", value: 25 },
      ],
      layout: "kpi",
      note: "Field figures are season averages for temperate C3 crops.",
      takeaway: "The gap between theory and field is where every yield programme lives.",
      title: "Theory says 4.6%. Fields deliver 1.1%.",
      unit: "%",
    },
    {
      ...EMPTY_SLIDE,
      columns: ["Pathway", "Optimal temp", "Water cost", "Share of crops"],
      layout: "table",
      rows: [
        ["C3", "15-25°C", "High", "85%"],
        ["C4", "30-40°C", "Low", "12%"],
        ["CAM", "35°C+", "Lowest", "3%"],
      ],
      takeaway: "C4 plants trade extra machinery for half the water bill.",
      title: "Three pathways, three different bets on water",
    },
    {
      ...EMPTY_SLIDE,
      layout: "bullets",
      points: [
        "Light hits chlorophyll and knocks an electron loose",
        "Water is split to replace it, and oxygen leaves as waste",
        "The electron falls down a chain, and the energy pumps protons",
        "Protons rush back through ATP synthase, which makes ATP",
      ],
      takeaway: "Every step is a hand-off; break one and the chain stalls within seconds.",
      title: "The light reactions are a relay, not a reaction",
    },
    { ...EMPTY_SLIDE, layout: "stat", statLabel: "of the oxygen you breathe was made this way", statValue: "70%", title: "Scale" },
    { ...EMPTY_SLIDE, layout: "quote", quoteAttribution: "Melvin Calvin", title: "The plant is a chemical factory run on sunlight" },
    { ...EMPTY_SLIDE, layout: "closing", points: ["Next: the Calvin cycle"], title: "Questions?" },
  ],
  subtitle: "Where the energy goes",
  title: "Photosynthesis",
};

const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const scenesOf = (design: DeckDesign) =>
  PLAN.slides.map((slide, i) => ({
    scene: composeSlide(design, slide, { credit: "Nemesis", index: i + 1, plan: PLAN }),
    slide,
  }));

test("🔴 no two pieces of text overlap, on any slide of any design", () => {
  for (const design of DECK_DESIGNS) {
    for (const { scene, slide } of scenesOf(design)) {
      const words = scene.items.filter(
        (it): it is SceneText | SceneBullets => it.kind === "text" || it.kind === "bullets",
      );
      const spans = words.map((w) => ({ area: measureText(w), item: w }));
      for (let a = 0; a < spans.length; a += 1) {
        for (let b = a + 1; b < spans.length; b += 1) {
          const first = spans[a];
          const second = spans[b];
          if (!first || !second) continue;
          const hit = overlap(first.area, second.area);
          const smaller = Math.min(first.area.w * first.area.h, second.area.w * second.area.h);
          assert.ok(
            hit < smaller * 0.12,
            `${design.id} / ${slide.layout}: text collides — "${"text" in first.item ? first.item.text : first.item.items[0]}" over "${"text" in second.item ? second.item.text : second.item.items[0]}"`,
          );
        }
      }
    }
  }
});

test("🔴 no filled shape is painted on top of text", () => {
  // Order matters: a shape drawn BEFORE text is a background (a card, an action box, a rail),
  // which is fine. A shape drawn AFTER text is covering it.
  for (const design of DECK_DESIGNS) {
    for (const { scene, slide } of scenesOf(design)) {
      scene.items.forEach((item, index) => {
        if (item.kind !== "text" && item.kind !== "bullets") return;
        const area = measureText(item);
        const later = scene.items.slice(index + 1).filter((it): it is SceneShape => it.kind === "shape" && !!it.fill && !it.alpha);
        for (const shape of later) {
          if (shape.shape === "line") continue;
          const hit = overlap(area, shape.box);
          assert.ok(
            hit < area.w * area.h * 0.25,
            `${design.id} / ${slide.layout}: a ${shape.shape} is painted over "${"text" in item ? item.text : item.items[0]}"`,
          );
        }
      });
    }
  }
});

test("text stays on the slide", () => {
  for (const design of DECK_DESIGNS) {
    for (const { scene, slide } of scenesOf(design)) {
      for (const item of scene.items) {
        if (item.kind !== "text" && item.kind !== "bullets") continue;
        const area = measureText(item);
        assert.ok(area.x >= -0.25, `${design.id} / ${slide.layout}: text starts off the left edge`);
        assert.ok(area.x + area.w <= SLIDE_W + 0.3, `${design.id} / ${slide.layout}: text runs off the right edge`);
        assert.ok(area.y >= -0.3, `${design.id} / ${slide.layout}: text starts above the slide`);
        assert.ok(area.y + area.h <= SLIDE_H + 0.35, `${design.id} / ${slide.layout}: text runs off the bottom`);
      }
    }
  }
});

test("an exhibit draws the figures it was given", () => {
  const chartSlide = PLAN.slides[3] as DeckSlide;
  for (const design of DECK_DESIGNS) {
    const scene = composeSlide(design, chartSlide, { credit: "Nemesis", index: 4, plan: PLAN });
    // Bars are the rects that share a width and a baseline — counting by height would miss the
    // smallest bar, which is exactly the one a reader must still be able to see.
    const rects = scene.items.filter((it): it is SceneShape => it.kind === "shape" && it.shape === "rect" && !!it.fill && it.box.w < 2);
    const byWidth = new Map<string, SceneShape[]>();
    for (const r of rects) {
      const key = r.box.w.toFixed(3);
      byWidth.set(key, [...(byWidth.get(key) ?? []), r]);
    }
    const bars = [...byWidth.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    assert.equal(bars.length, chartSlide.data.length, `${design.id}: ${bars.length} bars for ${chartSlide.data.length} figures`);
    // Bar heights must be proportional: the 100 bar is about 22x the 4.5 bar.
    const heights = bars.map((b) => b.box.h).sort((x, y) => y - x);
    const tallest = heights[0] ?? 0;
    const shortest = heights[heights.length - 1] ?? 0;
    assert.ok(tallest > shortest * 5, `${design.id}: the bars are not proportional to the data`);
    assert.ok(shortest > 0.05, `${design.id}: the smallest bar is invisible`);
    const labels = scene.items.filter((it) => it.kind === "text" && /100%|4\.5%/.test(it.text));
    assert.ok(labels.length >= 2, `${design.id}: the chart lost its value labels`);
  }
});

test("the source line comes from the canvas, and only when there is one", () => {
  const table = PLAN.slides[5] as DeckSlide;
  const design = DECK_DESIGNS[0] as DeckDesign;
  const withRefs = composeSlide(design, table, { credit: "Nemesis", index: 6, plan: PLAN });
  assert.ok(
    withRefs.items.some((it) => it.kind === "text" && it.text.startsWith("Source: Zhu, Long & Ort")),
    "an exhibit built from a grounded canvas lost its source line",
  );
  const bare = composeSlide(design, table, { credit: "Nemesis", index: 6, plan: { ...PLAN, references: [] } });
  assert.ok(
    !bare.items.some((it) => it.kind === "text" && it.text.startsWith("Source:")),
    "a deck with no sources invented a source line",
  );
});

test("every content slide carries page furniture, unless the design opts out", () => {
  const bullets = PLAN.slides[6] as DeckSlide;
  for (const design of DECK_DESIGNS) {
    const scene = composeSlide(design, bullets, { credit: "Nemesis", index: 7, plan: PLAN });
    const texts = scene.items.filter((it): it is SceneText => it.kind === "text");
    if (design.chrome === "none") continue;
    assert.ok(
      texts.some((t) => /Exhibit|EXHIBIT/i.test(t.text)),
      `${design.id}: no eyebrow on a content slide`,
    );
    assert.ok(
      texts.some((t) => /·\s*7$/.test(t.text)),
      `${design.id}: no page number on a content slide`,
    );
    assert.ok(texts.some((t) => t.text === bullets.takeaway), `${design.id}: the takeaway never reached the slide`);
  }
});
