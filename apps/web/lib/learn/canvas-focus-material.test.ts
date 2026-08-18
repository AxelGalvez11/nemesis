/**
 * What one teaching turn is allowed to carry, and the two ways narrowing it could go wrong.
 *
 * 🔴 THE DANGEROUS FAILURES ARE NOT "SENT TOO MUCH". They are:
 *   1. dropping the excerpt the page actually cited, so a correction is written about material the
 *      model cannot see and the citation it emits is an invention; and
 *   2. sending nothing at all, which turns a grounded lesson into general knowledge wearing a
 *      citation rule.
 * Both are pinned below, and so is the third-order one: presenting the survivors out of reading
 * order, which teaches the model that the document says things in an order it does not.
 *
 * Measured against production the day this was written: 24 canvases, 14 carrying material, average
 * material shipped per turn 13,481 characters, worst case the full 120,000-character cap.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  citedExcerptIds,
  focusMaterial,
  NEIGHBOUR_RADIUS,
  TURN_GROUNDING_CHARS,
} from "./canvas-focus-material";
import type { CanvasBlock, CanvasSource, SourceExcerpt } from "./canvas-model";

function excerpt(id: string, text: string): SourceExcerpt {
  return { id, label: null, text };
}

function source(id: string, texts: readonly string[]): CanvasSource {
  return {
    excerpts: texts.map((text, index) => excerpt(`${id}:e${index + 1}`, text)),
    id,
    kind: "pdf",
    title: `Source ${id}`,
  };
}

function block(id: string, content: string, cites: readonly string[] = []): CanvasBlock {
  return {
    content,
    id,
    sourceRefs: cites.map((excerptId) => ({ excerptId, sourceId: excerptId.split(":")[0]! })),
    type: "paragraph",
  };
}

/** Forty excerpts of distinct, field-neutral prose. */
const LONG = source(
  "s1",
  Array.from({ length: 40 }, (_, n) =>
    `Paragraph ${n} discusses topic${n} and establishes that topic${n} depends on the preceding condition.`,
  ),
);

test("🔴 the excerpt the page cited is always kept", () => {
  const scope = [block("b1", "…", ["s1:e18"])];
  const focused = focusMaterial([LONG], { scope, texts: ["something unrelated"] });
  const kept = focused.sources.flatMap((entry) => entry.excerpts).map((entry) => entry.id);
  assert.ok(kept.includes("s1:e18"), "a citation is the page telling us where this idea came from");
  assert.equal(focused.byReason.cited, 1);
});

test("the excerpts either side of a cited one come with it", () => {
  const focused = focusMaterial([LONG], { scope: [block("b1", "…", ["s1:e18"])], texts: [] });
  const kept = focused.sources.flatMap((entry) => entry.excerpts).map((entry) => entry.id);
  assert.ok(kept.includes("s1:e17"), "the sentence that set it up");
  assert.ok(kept.includes("s1:e19"), "and the one that follows from it");
  assert.equal(NEIGHBOUR_RADIUS, 1);
});

test("🔴 a whole lecture is not sent to fix one paragraph", () => {
  const focused = focusMaterial([LONG], { scope: [block("b1", "…", ["s1:e18"])], texts: [] });
  assert.ok(focused.chars < focused.wholeChars, "the point of the exercise");
  assert.equal(focused.sources.flatMap((entry) => entry.excerpts).length, 3);
  assert.ok(focused.omitted > 30, "and the omission is countable, not implicit in a shorter list");
});

test("vocabulary finds material the page never cited", () => {
  // A learner asks about something the current blocks do not cover. Nothing is cited, so the only
  // honest signal is what the material actually talks about.
  const focused = focusMaterial([LONG], { scope: [], texts: ["topic7"] });
  const kept = focused.sources.flatMap((entry) => entry.excerpts).map((entry) => entry.id);
  assert.ok(kept.includes("s1:e8"), "paragraph 7 is the eighth excerpt");
  assert.equal(focused.byReason.vocabulary > 0, true);
});

test("🔴 a turn with nothing to go on still gets material rather than nothing", () => {
  // Topic-first teaching, or a page written before citations were required. Sending no material
  // while insisting on citations is exactly the shape that produces an invented one.
  const focused = focusMaterial([LONG], { scope: [], texts: ["zzzz"] });
  assert.ok(focused.sources.length > 0);
  assert.ok(focused.chars > 0);
  assert.equal(focused.byReason.opening > 0, true);
});

test("🔴 reading order survives the selection", () => {
  const focused = focusMaterial([LONG], {
    scope: [block("b1", "…", ["s1:e30", "s1:e4"])],
    texts: [],
  });
  const kept = focused.sources.flatMap((entry) => entry.excerpts).map((entry) => entry.id);
  const positions = kept.map((id) => Number(id.split("e")[1]));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "selection ranks; presentation must not");
});

test("🔴 citations outrank everything and are never dropped for a weaker match", () => {
  // Sixty excerpts of the same words, so vocabulary matches all of them, and a budget that fits
  // only a handful. The cited one has to survive.
  const noisy = source(
    "s2",
    Array.from({ length: 60 }, () => "the same shared vocabulary appears in every single one of these paragraphs"),
  );
  const focused = focusMaterial([noisy], {
    budget: 300,
    scope: [block("b1", "…", ["s2:e55"])],
    texts: ["shared vocabulary paragraphs"],
  });
  const kept = focused.sources.flatMap((entry) => entry.excerpts).map((entry) => entry.id);
  assert.ok(kept.includes("s2:e55"));
});

test("the budget is respected, and one oversized excerpt is still sent rather than nothing", () => {
  const huge = source("s3", ["x".repeat(50_000)]);
  const focused = focusMaterial([huge], { budget: 1_000, scope: [], texts: [] });
  assert.equal(focused.sources.flatMap((entry) => entry.excerpts).length, 1, "a turn with no material is worse than a long one");
});

test("several sources each contribute their own relevant part", () => {
  const a = source("sa", ["alpha discusses the first idea", "alpha continues", "alpha ends"]);
  const b = source("sb", ["beta discusses the second idea", "beta continues", "beta ends"]);
  const focused = focusMaterial([a, b], {
    scope: [block("b1", "…", ["sa:e1", "sb:e1"])],
    texts: [],
  });
  assert.equal(focused.sources.length, 2);
});

test("citedExcerptIds reads what the blocks declare and invents nothing", () => {
  assert.deepEqual([...citedExcerptIds([block("b1", "…", ["s1:e2", "s1:e3"]), block("b2", "…")])], [
    "s1:e2",
    "s1:e3",
  ]);
  assert.equal(citedExcerptIds([]).size, 0);
});

test("🔴 the per-turn budget is far below the whole-document one", () => {
  // `MAX_GROUNDING_CHARS` is 120,000. A per-turn budget anywhere near it would make this module
  // decoration. Production average material per canvas was 13,481 characters when this was written.
  assert.ok(TURN_GROUNDING_CHARS <= 20_000);
  assert.ok(TURN_GROUNDING_CHARS >= 4_000, "and small enough to be useless is its own failure");
});
