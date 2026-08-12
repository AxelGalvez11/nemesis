/**
 * Reading order, frozen.
 *
 * 🔴 A REGRESSION HERE IS INVISIBLE TO EVERY OTHER CHECK. Reshuffling blocks
 * loses no characters, changes no coverage number and fails no existing test —
 * the same words are all still there. It only shows up as a document that reads
 * out of sequence, an answer assembled from paragraphs that never sat together,
 * and a citation pointing at the block before the one it quoted.
 *
 * This is deliberately NOT a quality metric. There is no ground truth here for
 * what the right order is; there is only the order production produces today,
 * against the sample documents that live in this repository. When a change moves
 * these numbers ON PURPOSE, regenerate and say so in the commit:
 *
 *   npx tsx scripts/reading-order-print.mts
 *
 * Real files rather than hand-built models, because a synthetic model would
 * freeze the assembler and skip everything upstream of it — which is where the
 * ordering decisions actually are.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { orderOf, SAMPLE_DIR, sampleModels, textHash } from "./reading-order";

const FROZEN: Record<string, { blocks: number; hash: string; order: string; units: number }> = {
  docx: {
    blocks: 12,
    hash: "3d916af99404ea7f",
    order: "0:heading 0:paragraph 0:heading 0:paragraph 0:listItem 0:listItem 0:listItem 0:heading 0:table 0:paragraph 0:heading 0:paragraph",
    units: 1,
  },
  pdf: {
    blocks: 17,
    hash: "711b17efcad7d157",
    order:
      // 🔴 THIS VALUE MOVED ONCE, AND ONLY THE LABELS MOVED. The last block on
      // each page is running furniture and is now named `pageFooter` rather than
      // `paragraph`. The SEQUENCE is identical — same blocks, same positions, same
      // units — and the proof is that `hash` above did not change: a reorder would
      // have broken the text-sequence hash, a relabel cannot.
      "0:heading 0:paragraph 0:paragraph 0:pageFooter 1:heading 1:paragraph 1:paragraph 1:paragraph 1:pageFooter " +
      "2:heading 2:paragraph 2:pageFooter 3:heading 3:paragraph 3:paragraph 3:paragraph 3:pageFooter",
    units: 4,
  },
  pptx: {
    blocks: 14,
    hash: "722af0d403092535",
    order:
      "0:heading 0:paragraph 0:paragraph 0:paragraph 0:paragraph 1:heading 1:paragraph 1:paragraph 1:paragraph " +
      "2:heading 2:paragraph 2:paragraph 2:paragraph 2:paragraph",
    units: 3,
  },
};

// Parsed once, lazily: these test files compile to CommonJS, where a top-level
// await is not available, and reparsing three documents per assertion is waste.
let cached: Awaited<ReturnType<typeof sampleModels>> | null = null;
const modelFor = async (format: string) => {
  cached ??= await sampleModels(SAMPLE_DIR);
  return cached[format]!;
};

for (const [format, expected] of Object.entries(FROZEN)) {
  test(`${format}: block order is unchanged`, async () => {
    const model = await modelFor(format);
    assert.equal(model.units.length, expected.units, "unit count");
    assert.equal(model.blocks.length, expected.blocks, "block count");
    assert.equal(orderOf(model), expected.order);
  });

  test(`${format}: the text sequence is unchanged`, async () => {
    // Catches a reshuffle that keeps every kind in place — two paragraphs
    // swapping is invisible to the order string above and obvious here.
    assert.equal(textHash(await modelFor(format)), expected.hash);
  });

  test(`${format}: every block belongs to a unit that exists`, async () => {
    // A locator that points past the end resolves to nothing, and every later
    // check of it passes while it points at nothing.
    const model = await modelFor(format);
    for (const block of model.blocks) {
      assert.ok(block.unit >= 0 && block.unit < model.units.length, `${block.id} → unit ${block.unit}`);
    }
  });

  test(`${format}: blocks are grouped by unit, never interleaved`, async () => {
    // Reading order across the document implies a unit's blocks are contiguous.
    // A deck once put slide 19's heading at the front of the whole document, and
    // every locator still said "slide 19", so nothing looked wrong.
    const seen = new Set<number>();
    let current = -1;
    for (const block of (await modelFor(format)).blocks) {
      if (block.unit === current) continue;
      assert.ok(!seen.has(block.unit), `unit ${block.unit} is revisited after leaving it`);
      seen.add(block.unit);
      current = block.unit;
    }
  });
}
