import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { composeSlide } from "../export/deck-compose";
import { deckDesign } from "../export/deck-designs";
import { EMPTY_SLIDE, readDeckJson, deckSystemPrompt, type DeckPlan } from "../export/deck-plan";
import type { SceneImage, SceneText } from "../export/deck-scene";
import { figureMenu, figuresFromContext, MAX_DECK_FIGURES } from "./deck-figures";
import type { SourceContext } from "@/lib/sources/source-context";

// The learner's own figures inside their decks (owner 2026-08-24, "a priority"). Everything here
// guards the same boundary from two sides: the model may point at one of the learner's pictures
// and may never name one, and a picture that cannot be shown must still leave the slide honest.

const unit = (figure: Record<string, unknown> | undefined, i: number) => ({
  anchor: `u${i}`,
  index: i,
  kind: "figure" as const,
  text: "",
  ...(figure ? { figure } : {}),
});

const contextWith = (figures: Array<Record<string, unknown> | undefined>): SourceContext =>
  ({ units: figures.map((f, i) => unit(f, i)) }) as unknown as SourceContext;

test("a figure is offered only when it has both pixels and words", () => {
  const found = figuresFromContext(
    contextWith([
      { asset: { mime: "image/png", path: "uid/figures/a.png" }, caption: "The Z-scheme of photosystems" },
      // Stored, but nobody could say what it is — a menu of unlabelled numbers is unpickable.
      { asset: { mime: "image/png", path: "uid/figures/b.png" } },
      // Described, but the pixels were never kept: nothing to draw.
      { description: "A phagocyte engulfing a bacterium" },
      // Only vision looked at it. Usable, and second-best to the document's own caption.
      { asset: { mime: "image/png", path: "uid/figures/d.png" }, description: "A labelled chloroplast" },
      undefined,
    ]),
    "Lecture 4.pdf",
  );
  assert.deepEqual(
    found.map((f) => f.caption),
    ["The Z-scheme of photosystems", "A labelled chloroplast"],
  );
  assert.equal(found[0]?.source, "Lecture 4.pdf", "a figure forgot which document it came from");
  assert.equal(found[0]?.path, "uid/figures/a.png");
});

test("🔴 the document's own caption beats a model's description of it", () => {
  // source-context.ts keeps the two apart on purpose: the caption is what the lecture says, the
  // description is what a machine said about it. Printing the second when the first exists would
  // put an inference under a picture and make it look like the source.
  const [figure] = figuresFromContext(
    contextWith([
      {
        asset: { mime: "image/png", path: "uid/figures/a.png" },
        caption: "Figure 3. Light reactions",
        description: "A diagram with arrows and green shapes",
      },
    ]),
    "Lecture.pdf",
  );
  assert.equal(figure?.caption, "Figure 3. Light reactions");
});

test("🔴 the model picks a NUMBER, and is told never to name a picture", () => {
  const prompt = deckSystemPrompt();
  assert.match(prompt, /PICTURES ARE CHOSEN BY NUMBER, NEVER NAMED/);
  assert.match(prompt, /never write a filename, a path or a figure that is not in the list/);
  // The menu is 1-based, because the plan's 0 means "no picture". An off-by-one here would put
  // the wrong lecture diagram on the slide, which looks deliberate and is worse than none.
  const menu = figureMenu([
    { caption: "The Z-scheme", path: "uid/figures/a.png", source: "Lecture.pdf" },
    { caption: "A chloroplast", path: "uid/figures/b.png", source: "Lecture.pdf" },
  ]);
  assert.match(menu, /1\. The Z-scheme {2}\(from: Lecture\.pdf\)/);
  assert.match(menu, /2\. A chloroplast/);
  assert.ok(!menu.includes("uid/figures"), "🔴 the menu leaked a storage path to the model");
  assert.equal(figureMenu([]), "", "a canvas with no figures should say nothing about figures");
});

test("a path the model writes itself is not a figure", () => {
  // The reader accepts a whole positive number and nothing else — so a hallucinated path, a
  // caption, a float or a negative all mean "no picture" rather than a storage request.
  // A plan needs three slides to be a plan at all, so each case carries a real one.
  const planText = (figure: string) =>
    `{"title":"T","subtitle":"s","slides":[{"layout":"cover","title":"T","subtitle":"s"},` +
    `{"layout":"bullets","title":"The light reactions","points":["a","b"],"figure":${figure}},` +
    `{"layout":"closing","title":"Questions?"}]}`;
  const bulletsOf = (plan: DeckPlan | null) => plan?.slides.find((slide) => slide.layout === "bullets");
  for (const written of ['"uid/figures/a.png"', '"Figure 3"', "-1", "1.5", "0", "true", "null"]) {
    assert.equal(bulletsOf(readDeckJson(planText(written)))?.figure, 0, `"${written}" was read as a figure`);
  }
  const good = readDeckJson(planText("3"));
  assert.equal(bulletsOf(good)?.figure, 3, "a real figure number did not survive the reader");
  assert.deepEqual(good?.figures, [], "the reader invented a figure list");
});

const planWith = (figures: DeckPlan["figures"], figure: number): DeckPlan => ({
  figures,
  references: [],
  slides: [{ ...EMPTY_SLIDE, figure, layout: "bullets", points: ["one", "two"], title: "The light reactions" }],
  subtitle: "",
  title: "Photosynthesis",
});

test("🔴 a figure number past the end of the list draws nothing", () => {
  // The plan is saved and rebuilt later. An index that resolved against a different list would
  // put someone else's diagram on the slide — so out of range means no picture, never a guess.
  const plan = planWith([{ caption: "The Z-scheme", path: "uid/figures/a.png", source: "Lecture.pdf", url: "https://x/a" }], 7);
  const scene = composeSlide(deckDesign("studio"), plan.slides[0]!, { credit: "N", index: 3, plan });
  assert.ok(!scene.items.some((it) => it.kind === "image"), "an out-of-range figure still drew a picture");
});

test("a figure reaches the slide with its caption and its source", () => {
  const plan = planWith(
    [{ caption: "The Z-scheme of photosystems", path: "uid/figures/a.png", source: "Lecture 4.pdf", url: "https://signed/a.png" }],
    1,
  );
  const scene = composeSlide(deckDesign("studio"), plan.slides[0]!, { credit: "N", index: 3, plan });
  const picture = scene.items.find((it): it is SceneImage => it.kind === "image");
  assert.equal(picture?.data, "https://signed/a.png", "the signed picture never reached the slide");
  const words = scene.items.filter((it): it is SceneText => it.kind === "text").map((t) => t.text);
  assert.ok(words.includes("The Z-scheme of photosystems"), "the caption is missing");
  assert.ok(words.some((w) => w.includes("Lecture 4.pdf")), "the slide does not say which document it came from");
  // The design's own list treatment survives: the points are still there, beside the picture.
  assert.ok(words.includes("one") && words.includes("two"), "the figure column ate the slide's points");
});

test("🔴 an unsignable figure keeps its caption and loses only its picture", () => {
  // A signature expires, storage refuses, a learner signs out. An empty frame with no words is
  // the exact failure figure-asset-url.ts exists to prevent.
  const plan = planWith([{ caption: "The Z-scheme", path: "uid/figures/a.png", source: "Lecture 4.pdf" }], 1);
  const scene = composeSlide(deckDesign("studio"), plan.slides[0]!, { credit: "N", index: 3, plan });
  assert.ok(!scene.items.some((it) => it.kind === "image"), "an unsigned figure was drawn anyway");
  const words = scene.items.filter((it): it is SceneText => it.kind === "text").map((t) => t.text);
  assert.ok(words.includes("The Z-scheme"), "the caption went with the picture");
  assert.ok(words.some((w) => w.includes("Lecture 4.pdf")), "the provenance went with the picture");
});

test("every design can carry a figure without losing its page furniture", () => {
  const plan = planWith([{ caption: "The Z-scheme", path: "uid/figures/a.png", source: "L.pdf", url: "https://signed/a" }], 1);
  for (const id of ["studio", "atrium", "quiet", "harbor", "notebook", "weave", "gallery"]) {
    const design = deckDesign(id);
    const scene = composeSlide(design, plan.slides[0]!, { credit: "Nemesis", index: 4, plan });
    const words = scene.items.filter((it): it is SceneText => it.kind === "text").map((t) => t.text);
    assert.ok(scene.items.some((it) => it.kind === "image"), `${id}: no picture`);
    assert.ok(words.includes("The Z-scheme"), `${id}: no caption`);
    if (design.chrome !== "none") {
      assert.ok(words.some((w) => /·\s*4$/.test(w)), `${id}: a figure slide lost its page number`);
    }
  }
});

test("🔴 a storage path never reaches the saved plan by way of the model", () => {
  // Belt and braces on the border: the ONLY writer of plan.figures is the deliverable, from the
  // canvas's own sources. If this ever changes, the model can address a private bucket.
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(source, /plan\.figures = figures;/, "the deck deliverable no longer fills figures itself");
  assert.match(source, /if \(slide\.figure > figures\.length\) slide\.figure = 0;/, "the range clamp is gone");
  assert.ok(MAX_DECK_FIGURES > 0 && MAX_DECK_FIGURES <= 24, "the figure menu is unbounded");
});
