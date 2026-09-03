import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { focusMaterial } from "./canvas-focus-material";
import { groundingBlock, materialText } from "./canvas-grounding";
import type { CanvasBlock, CanvasSource } from "./canvas-model";

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

// ---------------------------------------------------------------- the deliverable packet

test("🔴🔴🔴 the deliverable packet hears all fifty too, not the first two", () => {
  // `materialText` is what a study guide, a document or a deck is written from when retrieval has
  // nothing yet. It walked the sources in order and spent the whole budget as it went.
  //
  // Calibration, measured before the fix on this exact fixture: 48 of 50 lectures contributed no
  // text at all. After: 0.
  const pile = Array.from({ length: 50 }, (_, at) => lecture(`s${at}`, 40, 2_000));
  const text = materialText(pile);
  for (const source of pile) assert.ok(text.includes(`### ${source.title}`), `${source.id} lost its header`);
  const silent = pile.filter((source) => !text.includes(source.excerpts[0]!.text));
  assert.deepEqual(silent.map((source) => source.id), [], `${silent.length} of 50 lectures contributed no text to the deliverable`);
  assert.match(text, /further passages? (was|were) not included/, "a truncated deliverable stopped saying it was truncated");
  assert.ok(text.length <= 130_000, `${text.length}: the budget is no longer a budget`);
});

test("🔴 the deliverable keeps reading order inside a document, one document per header", () => {
  const text = materialText([lecture("s0", 6, 10), lecture("s1", 6, 10)]);
  const order = [...text.matchAll(/s0-(\d)/g)].map((hit) => Number(hit[1]));
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5], "one document's passages were shuffled");
  assert.ok(text.indexOf("s0-5") < text.indexOf("### Lecture s1"), "two documents were interleaved");
});

// ---------------------------------------------------------------- the teaching turn's packet

/** A source whose every excerpt shares vocabulary with the question, so all of them rank.
 *  470 characters each: twenty-five fit the 12,000-character turn budget, so twenty sources CAN all
 *  be heard and the only question is whether they are. */
const chapter = (id: string, excerpts: number): CanvasSource =>
  ({
    excerpts: Array.from({ length: excerpts }, (_, at) => ({
      id: `${id}:e${at + 1}`,
      label: null,
      text: `${id} paragraph ${at} explains the shared keyword alpha and its consequences ${"y".repeat(400)}`,
    })),
    id,
    kind: "pdf",
    title: `Chapter ${id}`,
  }) as unknown as CanvasSource;

test("🔴🔴 twenty sources that all bear on the question each get their best excerpt in", () => {
  // Every excerpt of every source is a vocabulary hit of the same strength, so the old tie-break
  // (source index) put all ten of source 0's excerpts ahead of source 1's first, and the budget ran
  // out inside source three.
  //
  // Calibration, measured before the fix on this exact fixture: 3 of 20 sources represented, 25
  // excerpts, 11,750 characters. After: 20 of 20, the same 25 excerpts, the same budget.
  const pile = Array.from({ length: 20 }, (_, at) => chapter(`s${at}`, 10));
  const focused = focusMaterial(pile, { scope: [], texts: ["explain alpha consequences"] });
  assert.equal(focused.sources.length, 20, `${focused.sources.length} of 20 sources represented`);
  assert.ok(focused.chars <= 12_000, `${focused.chars}: the budget stopped being a budget`);
  assert.ok(focused.omitted > 100, "nothing was dropped, so this fixture proves nothing");
});

test("🔴 a citation still leads, ahead of every other source's best", () => {
  // The oldest rule in `canvas-focus-material.ts`: the excerpt the page cited is never dropped for
  // a weaker match. Fairness runs behind it, not over it. Two citations from the LAST source, and a
  // budget that fits exactly two excerpts (two are 940 characters; three would be 1,410).
  const pile = Array.from({ length: 20 }, (_, at) => chapter(`s${at}`, 10));
  const scope: CanvasBlock[] = [
    {
      content: "",
      id: "b1",
      sourceRefs: [
        { excerptId: "s19:e7", sourceId: "s19" },
        { excerptId: "s19:e9", sourceId: "s19" },
      ],
      type: "paragraph",
    },
  ];
  const focused = focusMaterial(pile, { budget: 1_000, scope, texts: ["explain alpha consequences"] });
  const kept = focused.sources.flatMap((entry) => entry.excerpts.map((excerpt) => excerpt.id));
  assert.deepEqual(kept, ["s19:e7", "s19:e9"], "a cited excerpt was dropped for another source's vocabulary hit");
});

// ---------------------------------------------------------------- the chat turn's packet

test("🔴🔴🔴 a question asked of the pile is answered from the pile, and every document is in the packet either way", () => {
  // Measured 2026-09-03 on a fresh seven-document drop asked "help me learn this": retrieval
  // matched one document, the packet narrowed to it, and the model said "there's only one document
  // I can read". Named in an inventory is not present in a packet.
  const chat = readFileSync(new URL("../../components/workspace/learn/canvas-chat.ts", import.meta.url), "utf8");
  const decision = chat.slice(chat.indexOf("const narrowed ="), chat.indexOf("const ask ="));
  assert.match(
    decision,
    /retrievalIsBroad\(canvas\.sources\.length, focused\.sources\.length\) \|\| questionIsSpecific\(question\)/,
    "a narrow retrieval of a broad question is used as the material again",
  );
  assert.match(decision, /groundingBlock\(everyDocumentPresent\(canvas\.sources, focused\.sources\)\)/, "an unmatched document is a name again, not text");
  assert.match(
    decision,
    /retrievalNote\(focused\.sources\.length, retrieved\?\.length \?\? 0, \{ documents: canvas\.sources\.length, openings: true \}\)/,
    "the note no longer knows how many documents are attached",
  );
  assert.match(
    decision,
    /inventoryNote\(canvas\.sources, canvas\.sources\), groundingBlock\(canvas\.sources\)/,
    "the fallback packet lost the inventory, and with it the rule never to call a document missing",
  );
});
