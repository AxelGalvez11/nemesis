// §11 — "rewrite the Canvas in place", and the half of it that is easy to lose.
//
// > *"Make this simpler · I still don't understand this · Explain this differently* must not append
// > another explanation underneath. The existing passage enters a subtle processing state and
// > rewrites itself in place. **Keep the old version internally so it can be restored.** Visually
// > there is normally one active explanation, never competing versions stacked."
//
// Rewriting in place already worked. What did not exist was the second sentence: `simplifySelection`
// has always returned `before`, captured at the moment of the write, with a comment saying that once
// the ops are applied the original wording is gone and no later step can reconstruct it — and every
// caller threw it away. A value computed and never used.
//
// 🔴 AND THE ROUND TRIP IS THE POINT OF THIS FILE, NOT THE APPLY. `previousContent` is a new
// structural field, and this repo's standing rule exists because six of them died AFTER passing
// their own parser's tests: `real edit → toRow → fromRow → consumer → still resolves`. The failure
// mode here is specific and would pass every in-memory check — restore works all session, then the
// canvas reloads and the original wording is gone, silently, with the control still on screen.

import assert from "node:assert/strict";
import test from "node:test";

import { applyRewrite, isRewritten, restoreBlock } from "./canvas-ops";
import { canvasFromRow, canvasToRow } from "./canvas-store";
import type { CanvasBlock, LearningCanvas } from "./canvas-model";

const ORIGINAL =
  "Competitive antagonism produces a parallel rightward displacement of the agonist concentration-response curve without reducing the maximal response.";
const SIMPLER =
  "A competitive antagonist makes it harder for the agonist to bind. You can overcome this by adding more agonist, so the same maximum effect can still be reached, but it takes a higher concentration.";

function block(overrides: Partial<CanvasBlock> = {}): CanvasBlock {
  return { content: ORIGINAL, id: "b1", type: "paragraph", ...overrides };
}

function canvas(blocks: CanvasBlock[]): LearningCanvas {
  return {
    activeMs: 0,
    answers: [],
    blocks,
    concepts: [],
    correctedConceptIds: [],
    correctiveAttempts: {},
    createdAt: new Date().toISOString(),
    events: [],
    id: "c1",
    level: null,
    outputs: [],
    questions: [],
    recall: [],
    recallResults: [],
    responses: [],
    sources: [],
    state: "learn",
    title: "Receptor pharmacology",
    updatedAt: new Date().toISOString(),
    weakConceptIds: [],
  } as unknown as LearningCanvas;
}

/** The block at `index`, asserted present — `noUncheckedIndexedAccess` is on, and a silent
 *  `undefined` slipping into an assertion is how a test passes while checking nothing. */
function at(canvas: LearningCanvas, index: number): CanvasBlock {
  const found = canvas.blocks[index];
  assert.ok(found, `expected a block at ${index}`);
  return found;
}

const rewriteOf = (blockId: string, content: string, before: string) => ({
  before,
  blockId,
  ops: [{ blockId, content, operation: "replace_block" as const }],
});

test("a rewrite replaces the passage in place and keeps what it replaced", () => {
  const after = applyRewrite(canvas([block()]), rewriteOf("b1", SIMPLER, ORIGINAL));

  // In place: one block, not two. §11's whole first sentence.
  assert.equal(after.blocks.length, 1, "a rewrite must not append a second explanation");
  assert.equal(at(after, 0).content, SIMPLER);
  assert.equal(at(after, 0).previousContent, ORIGINAL, "the old version must be kept internally");
  assert.ok(isRewritten(at(after, 0)));
});

test("🔴 restoring keeps the ORIGINAL, not the middle version, however many times it is simplified", () => {
  const once = applyRewrite(canvas([block()]), rewriteOf("b1", SIMPLER, ORIGINAL));
  const twice = applyRewrite(once, rewriteOf("b1", "Even simpler wording.", SIMPLER));

  assert.equal(at(twice, 0).content, "Even simpler wording.");
  assert.equal(
    at(twice, 0).previousContent,
    ORIGINAL,
    "restore means 'put the material back as it was written' — the once-simplified version is one the learner asked for",
  );

  const restored = restoreBlock(twice, "b1");
  assert.equal(at(restored, 0).content, ORIGINAL);
});

test("restoring stops offering to restore, so the control cannot become a no-op", () => {
  const after = applyRewrite(canvas([block()]), rewriteOf("b1", SIMPLER, ORIGINAL));
  const restored = restoreBlock(after, "b1");

  assert.equal(at(restored, 0).content, ORIGINAL);
  assert.equal(at(restored, 0).previousContent, undefined, "a restored block has nothing left to restore");
  assert.equal(isRewritten(at(restored, 0)), false);
  // And pressing it again changes nothing rather than throwing.
  assert.deepEqual(restoreBlock(restored, "b1").blocks[0], at(restored, 0));
});

test("a rewrite that changed nothing offers no restore", () => {
  const after = applyRewrite(canvas([block()]), rewriteOf("b1", ORIGINAL, ORIGINAL));
  assert.equal(isRewritten(at(after, 0)), false, "a control that visibly does nothing reads as broken");
});

test("only the block the learner asked about is touched", () => {
  const after = applyRewrite(
    canvas([block(), block({ content: "Another paragraph.", id: "b2" })]),
    rewriteOf("b1", SIMPLER, ORIGINAL),
  );
  assert.equal(at(after, 1).content, "Another paragraph.");
  assert.equal(at(after, 1).previousContent, undefined);
  assert.equal(isRewritten(at(after, 1)), false);
});

test("🔴 the previous wording survives the database round trip, or restore is a lie after a reload", () => {
  // The standing rule: real edit → canvasToRow → canvasFromRow → consumer → still resolves. Six
  // structural fields have died at exactly this boundary, each after passing its own unit tests.
  const rewritten = applyRewrite(canvas([block()]), rewriteOf("b1", SIMPLER, ORIGINAL));

  const row = canvasToRow(rewritten, "user-1");
  // Through JSON, because jsonb is what actually happens to it — an `undefined` or a class
  // instance would survive an object comparison and not survive the column.
  const serialised = JSON.parse(JSON.stringify(row.document));
  const reloaded = canvasFromRow({
    active_ms: row.active_ms as number,
    created_at: rewritten.createdAt,
    document: serialised,
    id: "c1",
    level: null,
    state: "learn",
    title: "Receptor pharmacology",
    updated_at: rewritten.updatedAt,
  } as Parameters<typeof canvasFromRow>[0]);

  assert.equal(at(reloaded, 0).content, SIMPLER, "the rewrite survives");
  assert.equal(at(reloaded, 0).previousContent, ORIGINAL, "and so does the version it replaced");

  // 🔴 THE CONSUMER, NOT JUST THE FIELD. A field that reads back but no longer satisfies the
  // predicate the UI branches on is the same defect wearing a passing test.
  assert.ok(isRewritten(at(reloaded, 0)), "the restore control must still render after a reload");
  assert.equal(at(restoreBlock(reloaded, "b1"), 0).content, ORIGINAL, "and pressing it must still work");
});
