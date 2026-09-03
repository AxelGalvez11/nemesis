/**
 * THE MODEL MUST BE TOLD WHICH PAGE A QUOTE CAME FROM, AND MUST NEVER BE TOLD ONE THAT DOES NOT EXIST.
 *
 * Owner, 2026-09-03: the app must "understand where everything is in the document". It could not.
 * His 83-page lecture reached the model as 354 excerpts that each knew their heading and not their
 * page, so "what is on page 40?" was unanswerable about a document we had read completely.
 *
 * The number was never missing. `unitsFromModel` has always measured `anchor.page` off the stored
 * document; this builder threw it away. It also wrote `page: block.unit + 1` for EVERY model, so a
 * Word document carried `page: 1` — harmless only because nothing rendered it, and a live
 * fabrication the moment something did.
 *
 * Both halves are guarded here: the number arrives, and it arrives only when it is true.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, unitPhrase } from "@nemesis/shared";

import { buildExcerptsFromModel, groundingBlock, materialText } from "./canvas-grounding";
import type { CanvasSource } from "./canvas-model";

const lecture = buildDocument({
  format: "pdf",
  title: "Chronic Asthma",
  units: [
    { index: 0, kind: "page" },
    { index: 1, kind: "page" },
  ],
  blocks: [
    { headingPath: [], kind: "heading", level: 1, text: "Spirometry", unit: 0 },
    { headingPath: ["Spirometry"], kind: "paragraph", text: "FEV1 is the volume forced out in one second.", unit: 0 },
    { headingPath: [], kind: "paragraph", text: "Alpha-1 antitrypsin deficiency causes early emphysema.", unit: 1 },
  ],
});

/** A Word document: one flowing unit, no pages anywhere in it. */
const memo = buildDocument({
  format: "docx",
  title: "Pre-Assignment",
  units: [{ index: 0, kind: "body" }],
  blocks: [{ headingPath: [], kind: "paragraph", text: "Read the handbook before class.", unit: 0 }],
});

const asSource = (id: string, model: Parameters<typeof buildExcerptsFromModel>[1], title: string) =>
  ({ id, kind: "pdf", title, excerpts: buildExcerptsFromModel(id, model) }) as unknown as CanvasSource;

test("an excerpt from a paginated document knows its page", () => {
  const excerpts = buildExcerptsFromModel("s1", lecture);
  assert.equal(excerpts.length, 2, "the heading is not itself quotable");
  assert.equal(excerpts[0]?.locator, "page 1");
  assert.equal(excerpts[1]?.locator, "page 2", "the second page must not inherit the first's number");
});

test("the model is shown the page beside the heading, in both builders", () => {
  const sources = [asSource("s1", lecture, "Chronic Asthma")];
  const block = groundingBlock(sources);
  assert.match(block, /\[s1:e1\] \(page 1 · Spirometry\) FEV1/, block);
  // Page 2 sits under no heading, so the locator must stand on its own rather than vanish with it.
  assert.match(block, /\[s1:e2\] \(page 2\) Alpha-1/, block);
  assert.match(materialText(sources), /page 2: Alpha-1/, "materialText carries it too");
});

test("a deck says slide, not page", () => {
  const deck = buildDocument({
    format: "pptx",
    title: "Chronic Asthma",
    units: [{ index: 0, kind: "slide" }, { index: 1, kind: "slide", label: "Treatment goals" }],
    blocks: [
      { headingPath: [], kind: "paragraph", text: "Status asthmaticus.", unit: 0 },
      { headingPath: [], kind: "paragraph", text: "Reverse the obstruction.", unit: 1 },
    ],
  });
  const excerpts = buildExcerptsFromModel("s2", deck);
  assert.equal(excerpts[0]?.locator, "slide 1");
  assert.equal(excerpts[1]?.locator, "slide 2");
  // 🔴 The number alone would be rendered "page 2" by any consumer holding only an integer, which
  // is wrong in the one way a learner notices immediately.
  assert.doesNotMatch(groundingBlock([asSource("s2", deck, "Deck")]), /page \d/);
});

test("🔴 a Word document is never given a page it does not have", () => {
  const excerpts = buildExcerptsFromModel("s3", memo);
  assert.equal(excerpts.length, 1);
  assert.equal(excerpts[0]?.locator, undefined, "a body unit has no page 1 to point at");
  const block = groundingBlock([asSource("s3", memo, "Pre-Assignment")]);
  assert.doesNotMatch(block, /page|slide|sheet/i, `nothing may name a unit this file has none of: ${block}`);
  assert.match(block, /\[s3:e1\] Read the handbook/, block);
});

test("🔴 there is ONE renderer, and it is the one that refuses", () => {
  // Anchored on the shared helper rather than on this file's output, because the rule it enforces
  // ("never number a document that has no numbers") has to hold for every future caller too.
  assert.equal(unitPhrase("page", 0), "page 1", "0-based in, 1-based out");
  assert.equal(unitPhrase("slide", 11), "slide 12");
  assert.equal(unitPhrase("sheet", 1), "sheet 2");
  assert.equal(unitPhrase("body", 0), null);
  assert.equal(unitPhrase("image", 0), null);
  assert.equal(unitPhrase("page", -1), null, "a negative index is a bug, not page 0");
});
