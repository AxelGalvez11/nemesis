/**
 * A SLIDE WHOSE DIAGRAM IS IN PIECES IS READ WHOLE, EVEN THOUGH IT HAS WORDS ON IT.
 *
 * `pages.ts` has said this at the top of the file since it was written: *"most of these decks hold
 * their diagrams as vector operators, and where there are bitmaps they are often one figure sliced
 * into strips… Describing strips is worthless. The page is the only unit that is always the thing a
 * human would look at."* The router then sent a page to vision on ONE condition — thin text — so a
 * lecture slide with a title, four bullets and a shattered pathway diagram went to the figure lane,
 * where every shard is individually below `WORTH_LOOKING_AREA` and nothing was read at all.
 *
 * Measured on the owner's own lecture, 2026-09-03 (parse `9a6523fa`, 83 slides): 846 "figures",
 * 10.2 a slide. Slide 36 alone has 57 beside 1,159 characters of text, and not one was described.
 * Nor on slides 33, 34 or 55. Across 30 days of production: 41 of 1,626 units match, 31 of them
 * text-rich, 27 with nothing read.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, type DocBlock } from "@nemesis/shared";

import { fragmentedUnits, FRAGMENTED_UNIT_FIGURES, WORTH_LOOKING_AREA } from "./figure-routing";
import { MAX_VISION_PAGES, planPdfRead, thinPages, unreadPages } from "./pages";
import { DEFAULT_DOCUMENT_UNIT_CAP } from "./vision-budget";

const shard = (unit: number, at: number): DocBlock =>
  ({
    figure: { ref: `f${unit}_${at}` },
    headingPath: [],
    kind: "figure",
    rect: { height: 0.05, width: 0.08, x: 0.1 + at * 0.01, y: 0.3 },
    text: "",
    unit,
  }) as unknown as DocBlock;

const wholePicture = (unit: number, at: number): DocBlock =>
  ({
    figure: { ref: `p${unit}_${at}` },
    headingPath: [],
    kind: "figure",
    rect: { height: 0.3, width: 0.3, x: 0.05 + at * 0.3, y: 0.2 },
    text: "",
    unit,
  }) as unknown as DocBlock;

const words = (unit: number, text: string): DocBlock =>
  ({ headingPath: [], kind: "paragraph", text, unit }) as unknown as DocBlock;

const BULLETS = "Describe the pathophysiologic features of asthma and COPD, and contrast them. ".repeat(6);

test("a slide of shards is named, and an ordinary slide is not", () => {
  const deck = buildDocument({
    format: "pdf",
    title: "Chronic Asthma",
    units: [
      { index: 0, kind: "page" },
      { index: 1, kind: "page" },
      { index: 2, kind: "page" },
    ],
    blocks: [
      // Slide 0: the owner's case, in miniature — plenty of text AND a shattered drawing.
      words(0, BULLETS),
      ...Array.from({ length: 12 }, (_, at) => shard(0, at)),
      // Slide 1: an ordinary slide. Text and one real diagram.
      words(1, BULLETS),
      wholePicture(1, 0),
      // Slide 2: a photo gallery. Six REAL pictures, each worth its own call.
      words(2, BULLETS),
      ...Array.from({ length: 6 }, (_, at) => wholePicture(2, at % 3)),
    ],
  });
  assert.deepEqual(fragmentedUnits(deck), [0], "only the shattered slide");
});

test("🔴 both clauses are load-bearing: count alone would swallow a photo gallery", () => {
  const gallery = buildDocument({
    format: "pdf",
    title: "Contact sheet",
    units: [{ index: 0, kind: "page" }],
    blocks: [words(0, BULLETS), ...Array.from({ length: FRAGMENTED_UNIT_FIGURES + 2 }, (_, at) => wholePicture(0, at % 3))],
  });
  assert.deepEqual(fragmentedUnits(gallery), [], "large pictures are pictures, however many");

  const fewShards = buildDocument({
    format: "pdf",
    title: "Two shards",
    units: [{ index: 0, kind: "page" }],
    blocks: [words(0, BULLETS), shard(0, 0), shard(0, 1)],
  });
  assert.deepEqual(fewShards.blocks.filter((b) => b.kind === "figure").length, 2);
  assert.deepEqual(fragmentedUnits(fewShards), [], "two small marks are furniture, not a drawing");

  // And the small test really is below the worth-looking line, or the first clause does all the work.
  assert.ok(0.08 * 0.05 < WORTH_LOOKING_AREA, "the shard fixture must be genuinely small");
  assert.ok(0.3 * 0.3 >= WORTH_LOOKING_AREA, "the picture fixture must be genuinely large");
});

test("🔴 a text-rich shattered slide is actually SENT, which it never was before", () => {
  const pageTexts = [BULLETS, BULLETS, "Thin slide"];
  assert.deepEqual(thinPages(pageTexts), [2], "today's rule alone sees only the thin one");
  assert.deepEqual(thinPages(pageTexts, undefined, [0]), [0, 2], "the shattered slide joins it");

  const plan = planPdfRead(pageTexts, MAX_VISION_PAGES, undefined, [0]);
  assert.equal(plan.kind, "pages");
  assert.deepEqual(plan.kind === "pages" ? plan.needed : [], [0, 2]);
});

test("🔴 when the cap bites, the shattered slide is not the first thing dropped", () => {
  // It sorts by "least text first", and a shattered slide is wordy — so on raw length it sorted
  // LAST and was dropped first, which is the exact outcome this change exists to end.
  const pageTexts = [BULLETS, "", "", ""];
  assert.deepEqual(unreadPages(pageTexts, 2, undefined, [0]), [0, 1], "the forced page survives the cut");
  assert.deepEqual(unreadPages(pageTexts, 2), [1, 2], "and without it, the thin pages win as before");
});

test("🔴 the page ceiling is the priced one, not a second tighter guess", () => {
  // `MAX_FIGURES_PER_DOC` was raised 40 -> 120 for this reason on 2026-09-01; this constant was
  // the last unpriced ceiling. The owner's deck needs 52 pages and used to get 40.
  assert.equal(MAX_VISION_PAGES, DEFAULT_DOCUMENT_UNIT_CAP);
});
