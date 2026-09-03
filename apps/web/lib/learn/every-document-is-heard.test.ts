import assert from "node:assert/strict";
import test from "node:test";

import { groundingBlock } from "./canvas-grounding";
import type { CanvasSource } from "./canvas-model";

// Owner, 2026-09-03: *"even if I drop in 50 documents it should be able to understand all of
// them… what matters most is that it understands content."*
//
// Retrieval is the real answer to that and already ships. This guards the FALLBACK, which is what
// runs before a freshly dropped pile has finished indexing — i.e. on the first question after a
// drop, which is exactly when the pile is largest.

/** A source whose excerpts are big enough that fifty of them cannot all fit. */
const lecture = (id: string, excerpts: number, size: number): CanvasSource =>
  ({
    excerpts: Array.from({ length: excerpts }, (_, at) => ({
      id: `e${at}`,
      label: null,
      text: `${id}-${at} ${"x".repeat(size)}`,
    })),
    id,
    kind: "pdf",
    title: `Lecture ${id}`,
  }) as unknown as CanvasSource;

test("🔴🔴🔴 fifty documents each get a hearing, rather than the first few getting everything", () => {
  // 50 lectures x 40 excerpts x 2,000 chars is 4,000,000 characters into a 120,000 budget, so
  // something must be dropped. The question is WHAT.
  const pile = Array.from({ length: 50 }, (_, at) => lecture(`s${at}`, 40, 2_000));
  const block = groundingBlock(pile);

  // Every lecture is named — that was true before and stays true.
  for (const source of pile) assert.ok(block.includes(`### SOURCE ${source.id} —`), `${source.id} lost its header`);

  // 🔴 AND EVERY LECTURE HAS AT LEAST ONE SENTENCE UNDER ITS NAME. Before this, the budget was
  // spent in reading order: the first two lectures arrived whole and the other forty-eight were a
  // title above nothing. A header with no text under it tells the model a document exists and
  // nothing about what is in it, which is worse than useless — it invites an answer about material
  // that was never sent.
  //
  // Calibration: spend the budget source-by-source instead of round-robin and this reddens with
  // ~48 silent lectures.
  const silent = pile.filter((source) => !block.includes(`[${source.excerpts[0]!.id}] ${source.excerpts[0]!.text}`));
  assert.deepEqual(silent.map((source) => source.id), [], `${silent.length} of 50 lectures contributed no text at all`);
});

test("🔴 what is lost is the tail of each document, not the whole of most", () => {
  const pile = Array.from({ length: 20 }, (_, at) => lecture(`s${at}`, 30, 1_500));
  const block = groundingBlock(pile);
  // The opening of every lecture survives; the deep tail of every lecture does not. Both halves
  // matter: the first says the packet is broad, the second says the budget is real.
  assert.ok(pile.every((source) => block.includes(`${source.id}-0 `)), "a lecture lost its opening");
  assert.ok(pile.some((source) => !block.includes(`${source.id}-29 `)), "nothing was dropped, so this fixture proves nothing");
  assert.match(block, /further excerpts? were not included/, "a truncated packet stopped saying it was truncated");
});

test("🔴 reading order INSIDE a document is preserved", () => {
  // Round-robin is how the budget is SPENT; it must not become how the material is READ. An
  // excerpt out of order is a lecture whose argument no longer follows.
  const block = groundingBlock([lecture("s0", 6, 10), lecture("s1", 6, 10)]);
  const order = [...block.matchAll(/s0-(\d)/g)].map((hit) => Number(hit[1]));
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5], "one document's excerpts were shuffled");
  // And each document's lines sit under its own header.
  assert.ok(block.indexOf("### SOURCE s0") < block.indexOf("s0-0"), "a document's text escaped its header");
  assert.ok(block.indexOf("### SOURCE s1") < block.indexOf("s1-0"), "a document's text escaped its header");
  assert.ok(block.indexOf("s0-5") < block.indexOf("### SOURCE s1"), "two documents were interleaved in the output");
});

test("a pile that fits is unchanged — every excerpt of every document", () => {
  const pile = [lecture("s0", 3, 50), lecture("s1", 2, 50)];
  const block = groundingBlock(pile);
  for (const source of pile) {
    for (const excerpt of source.excerpts) assert.ok(block.includes(excerpt.text), `${source.id}/${excerpt.id} was dropped from a packet that fits`);
  }
  assert.doesNotMatch(block, /further excerpts? were not included/, "a packet that fits claimed to be truncated");
});
