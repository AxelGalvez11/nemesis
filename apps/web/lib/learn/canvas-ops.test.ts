import assert from "node:assert/strict";
import { test } from "node:test";

import { applyOps, parseCanvasOps, validateOps, type CanvasOp } from "./canvas-ops";
import { emptyCanvas, type CanvasBlock, type LearningCanvas } from "./canvas-model";

function canvas(blocks: CanvasBlock[], patch: Partial<LearningCanvas> = {}): LearningCanvas {
  return {
    ...emptyCanvas("c1", "2026-08-06T00:00:00.000Z"),
    state: "learn",
    blocks,
    concepts: [{ id: "k1", label: "Ion gradients" }],
    ...patch,
  };
}

const THREE: CanvasBlock[] = [
  { id: "b1", type: "heading", content: "Cardiac action potentials" },
  { id: "b2", type: "paragraph", content: "Long original text." },
  { id: "b3", type: "paragraph", content: "Another paragraph." },
];

// ---------------------------------------------------------------- validation

test("an op naming a block that does not exist is rejected", () => {
  const result = validateOps(canvas(THREE), [{ operation: "replace_block", blockId: "b99", content: "hi" }]);
  assert.equal(result.ops.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /unknown block/i);
});

test("an unknown operation name is rejected rather than guessed at", () => {
  const result = validateOps(canvas(THREE), [{ operation: "drop_database", blockId: "b1" } as unknown as CanvasOp]);
  assert.equal(result.ops.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /unknown operation/i);
});

test("a valid replace survives validation unchanged", () => {
  const result = validateOps(canvas(THREE), [{ operation: "replace_block", blockId: "b2", content: "Shorter." }]);
  assert.equal(result.ops.length, 1);
  assert.equal(result.rejected.length, 0);
});

test("a selection-scoped command may only touch the selected block", () => {
  // This is the guard that makes "simplify this paragraph" cost one paragraph. Without it a
  // model given a free choice rewrites the whole page every time.
  const result = validateOps(canvas(THREE), [
    { operation: "replace_block", blockId: "b2", content: "ok" },
    { operation: "replace_block", blockId: "b3", content: "not ok" },
  ], { scopeBlockIds: ["b2"] });
  assert.equal(result.ops.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0]?.reason ?? "", /outside the selection/i);
});

test("an insert next to the selected block is allowed — clarification lands beside it", () => {
  const result = validateOps(
    canvas(THREE),
    [{ operation: "insert_after", blockId: "b2", block: { type: "example", content: "For instance…" } }],
    { scopeBlockIds: ["b2"] },
  );
  assert.equal(result.ops.length, 1);
});

test("replace_canvas is refused when the command was scoped to a selection", () => {
  const result = validateOps(canvas(THREE), [{ operation: "replace_canvas", blocks: [] }], { scopeBlockIds: ["b2"] });
  assert.equal(result.ops.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /not permitted/i);
});

test("replace_canvas with no blocks is refused even unscoped — a canvas is never emptied", () => {
  const result = validateOps(canvas(THREE), [{ operation: "replace_canvas", blocks: [] }]);
  assert.equal(result.ops.length, 0);
});

test("a transition the state machine forbids is rejected", () => {
  const result = validateOps(canvas(THREE, { state: "learn" }), [
    { operation: "transition_state", to: "complete" },
  ]);
  assert.equal(result.ops.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /cannot move/i);
});

test("a block referencing a concept the canvas never declared is rejected", () => {
  // Otherwise the diagnosis fills with concepts nothing can explain.
  const result = validateOps(canvas(THREE), [
    { operation: "insert_after", blockId: "b1", block: { type: "paragraph", content: "x", conceptIds: ["ghost"] } },
  ]);
  assert.equal(result.ops.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /unknown concept/i);
});

test("a block whose citation points at no real excerpt is rejected", () => {
  const withSource = canvas(THREE, {
    sources: [{ id: "s1", title: "Lecture", kind: "pdf", excerpts: [{ id: "s1:e1", label: null, text: "t" }] }],
  });
  const result = validateOps(withSource, [
    {
      operation: "insert_after",
      blockId: "b1",
      block: { type: "paragraph", content: "x", sourceRefs: [{ sourceId: "s1", excerptId: "s1:e9" }] },
    },
  ]);
  assert.equal(result.ops.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /citation/i);
});

test("empty content is rejected — a block that says nothing is not an edit", () => {
  const result = validateOps(canvas(THREE), [{ operation: "replace_block", blockId: "b2", content: "   " }]);
  assert.equal(result.ops.length, 0);
});

test("a batch far larger than the document is refused wholesale", () => {
  const many: CanvasOp[] = Array.from({ length: 200 }, (_, i) => ({
    operation: "insert_after" as const,
    blockId: "b1",
    block: { type: "paragraph" as const, content: `x${i}` },
  }));
  const result = validateOps(canvas(THREE), many);
  assert.ok(result.ops.length <= 60);
});

// ------------------------------------------------------------------- parsing

test("plain JSON from the model parses", () => {
  const ops = parseCanvasOps('{"operations":[{"operation":"delete_block","blockId":"b3"}]}');
  assert.equal(ops.length, 1);
  assert.equal(ops[0]?.operation, "delete_block");
});

test("JSON wrapped in a fenced code block parses — models do this constantly", () => {
  const ops = parseCanvasOps('Sure!\n```json\n{"operations":[{"operation":"delete_block","blockId":"b3"}]}\n```\n');
  assert.equal(ops.length, 1);
});

test("a bare array of operations parses", () => {
  assert.equal(parseCanvasOps('[{"operation":"delete_block","blockId":"b3"}]').length, 1);
});

test("prose with no JSON at all yields no operations rather than throwing", () => {
  assert.deepEqual(parseCanvasOps("I'd be happy to help with that!"), []);
});

test("truncated JSON yields no operations rather than a half-applied edit", () => {
  assert.deepEqual(parseCanvasOps('{"operations":[{"operation":"replace_block","blockId":'), []);
});

// ---------------------------------------------------------------- application

test("replace_block changes only the named block", () => {
  const before = canvas(THREE);
  const after = applyOps(before, [{ operation: "replace_block", blockId: "b2", content: "Short now." }]);
  assert.equal(after.blocks[1]?.content, "Short now.");
  assert.equal(after.blocks[0]?.content, before.blocks[0]?.content);
  assert.equal(after.blocks[2]?.content, before.blocks[2]?.content);
  assert.equal(after.blocks.length, 3);
});

test("applying an op never mutates the canvas it was given", () => {
  const before = canvas(THREE);
  const snapshot = JSON.stringify(before);
  applyOps(before, [{ operation: "replace_block", blockId: "b2", content: "changed" }]);
  assert.equal(JSON.stringify(before), snapshot);
});

test("replace_block keeps the block's citations when the model does not restate them", () => {
  // A simplified paragraph is still the same paragraph — silently dropping its provenance
  // would make "where did this come from?" fail for exactly the blocks people rewrite most.
  const withRefs = canvas([{ ...(THREE[1] as CanvasBlock), sourceRefs: [{ sourceId: "s1", excerptId: "s1:e1" }] }]);
  const after = applyOps(withRefs, [{ operation: "replace_block", blockId: "b2", content: "Simpler." }]);
  assert.deepEqual(after.blocks[0]?.sourceRefs, [{ sourceId: "s1", excerptId: "s1:e1" }]);
});

test("insert_after puts the new block immediately after its anchor and gives it a fresh id", () => {
  const after = applyOps(canvas(THREE), [
    { operation: "insert_after", blockId: "b1", block: { type: "callout", content: "Read this first" } },
  ]);
  assert.equal(after.blocks.length, 4);
  assert.equal(after.blocks[1]?.content, "Read this first");
  assert.notEqual(after.blocks[1]?.id, "b1");
  assert.equal(after.blocks[2]?.id, "b2");
});

test("insert_before puts the new block ahead of its anchor", () => {
  const after = applyOps(canvas(THREE), [
    { operation: "insert_before", blockId: "b2", block: { type: "concept", content: "Prerequisite" } },
  ]);
  assert.equal(after.blocks[1]?.content, "Prerequisite");
  assert.equal(after.blocks[2]?.id, "b2");
});

test("two inserts on the same anchor both land, with different ids", () => {
  const after = applyOps(canvas(THREE), [
    { operation: "insert_after", blockId: "b1", block: { type: "paragraph", content: "first" } },
    { operation: "insert_after", blockId: "b1", block: { type: "paragraph", content: "second" } },
  ]);
  assert.equal(after.blocks.length, 5);
  assert.equal(new Set(after.blocks.map((b) => b.id)).size, 5);
});

test("delete_block removes exactly one block", () => {
  const after = applyOps(canvas(THREE), [{ operation: "delete_block", blockId: "b2" }]);
  assert.deepEqual(after.blocks.map((b) => b.id), ["b1", "b3"]);
});

test("annotate_block leaves the text alone and attaches a note beside it", () => {
  const after = applyOps(canvas(THREE), [
    { operation: "annotate_block", blockId: "b2", note: "In other words: charge moves." },
  ]);
  assert.equal(after.blocks[1]?.content, "Long original text.");
  assert.equal(after.blocks[1]?.note, "In other words: charge moves.");
});

test("collapse_block folds a block away without deleting it", () => {
  const after = applyOps(canvas(THREE), [{ operation: "collapse_block", blockId: "b3", collapsed: true }]);
  assert.equal(after.blocks[2]?.collapsed, true);
  assert.equal(after.blocks.length, 3);
});

test("rewrite_section replaces a run of blocks with new ones", () => {
  const after = applyOps(canvas(THREE), [
    {
      operation: "rewrite_section",
      blockIds: ["b2", "b3"],
      blocks: [{ type: "paragraph", content: "Merged and shorter." }],
    },
  ]);
  assert.equal(after.blocks.length, 2);
  assert.equal(after.blocks[0]?.id, "b1");
  assert.equal(after.blocks[1]?.content, "Merged and shorter.");
});

test("replace_canvas swaps the whole document", () => {
  const after = applyOps(canvas(THREE), [
    { operation: "replace_canvas", blocks: [{ type: "heading", content: "Just the weak parts" }] },
  ]);
  assert.equal(after.blocks.length, 1);
  assert.equal(after.blocks[0]?.content, "Just the weak parts");
});

test("transition_state moves the canvas", () => {
  const after = applyOps(canvas(THREE, { state: "learn" }), [{ operation: "transition_state", to: "recall" }]);
  assert.equal(after.state, "recall");
});

test("a validated batch applies in order and the result is coherent", () => {
  const result = validateOps(canvas(THREE), [
    { operation: "replace_block", blockId: "b2", content: "Simpler." },
    { operation: "insert_after", blockId: "b2", block: { type: "example", content: "Like a battery." } },
    { operation: "delete_block", blockId: "b3" },
  ]);
  assert.equal(result.ops.length, 3);
  const after = applyOps(canvas(THREE), result.ops);
  assert.deepEqual(after.blocks.map((b) => b.content), ["Cardiac action potentials", "Simpler.", "Like a battery."]);
});

test("an op that names a block deleted earlier in the same batch is caught at validation", () => {
  const result = validateOps(canvas(THREE), [
    { operation: "delete_block", blockId: "b3" },
    { operation: "replace_block", blockId: "b3", content: "too late" },
  ]);
  assert.equal(result.ops.length, 1);
  assert.match(result.rejected[0]?.reason ?? "", /unknown block/i);
});
