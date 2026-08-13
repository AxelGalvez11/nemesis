// §11 + brief §15 — typing "make this simpler", and the referent problem underneath it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { applyRewrite } from "./canvas-ops";
import { asksForRewrite, routeComposerText } from "./canvas-phrases";
import { finishReading, unreadChunk } from "./canvas-reading";
import type { LearningCanvas } from "./canvas-model";

const BASE = {
  awaitingDemonstration: false,
  hasReadingMaterial: true,
  selectedBlockId: null,
  unreadBlockIds: ["b1"],
};

test("an explicit request to change the wording is recognised", () => {
  for (const text of [
    "make this simpler",
    "Simplify this please",
    "explain this differently",
    "can you rephrase that",
    "in plain english",
    "break this down",
  ]) {
    assert.equal(asksForRewrite(text), true, `${text} should ask for a rewrite`);
  }
});

test("🔴 an expression of confusion is NOT a rewrite request, deliberately", () => {
  // The asymmetry that sets the bar: a false positive silently rewrites material the learner may
  // have been relying on; a false negative gives them an ordinary answer, which is what they get
  // today. So the bar is an explicit request to change the TEXT.
  for (const text of [
    "I don't get this",
    "why does that happen",
    "what does osmolarity mean",
    "is this the same as the last one",
    "",
  ]) {
    assert.equal(asksForRewrite(text), false, `${text} must not silently edit the page`);
  }
});

test("the referent is the active reading region, derived from the learner's own Continue presses", () => {
  assert.deepEqual(routeComposerText("make this simpler", BASE), { blockId: "b1", kind: "rewrite" });
});

test("a highlighted block outranks inference — they pointed at it", () => {
  assert.deepEqual(
    routeComposerText("simpler", { ...BASE, selectedBlockId: "b7", unreadBlockIds: ["b1", "b2"] }),
    { blockId: "b7", kind: "rewrite" },
  );
});

test("🔴 REFUSES rather than guessing, and the refusal is something the learner can act on", () => {
  // Several unread passages: "this" names none of them. The two tempting answers — the most recent
  // block, and the one nearest the viewport — are guesses about time and gaze respectively, and
  // neither is anything the learner told us.
  const many = routeComposerText("make this simpler", { ...BASE, unreadBlockIds: ["b1", "b2", "b3"] });
  assert.equal(many.kind, "refused");
  assert.match(many.kind === "refused" ? many.message : "", /highlight/i, "the refusal must name the action that resolves it");

  const none = routeComposerText("make this simpler", { ...BASE, hasReadingMaterial: false, unreadBlockIds: [] });
  assert.equal(none.kind, "refused");

  // 🔴 AND A REFUSAL IS NEVER SILENT. Silence is indistinguishable from the feature being broken.
  for (const routing of [many, none]) {
    assert.ok(routing.kind === "refused" && routing.message.trim().length > 0);
    assert.ok(
      routing.kind === "refused" && !/referent|ambiguous|null|undefined|region/i.test(routing.message),
      "a refusal must not report internal state",
    );
  }
});

test("🔴 while a demonstration is owed this is a SCAFFOLDING request, and not mine to answer", () => {
  // "Make this simpler" under a live question is the learner asking to move down §33's ladder —
  // the policy's decision. Rewriting the material there would also hand them the answer.
  assert.deepEqual(
    routeComposerText("make this simpler", { ...BASE, awaitingDemonstration: true }),
    { kind: "defer-to-policy" },
  );
  // Even with an explicit selection: the demonstration outranks it.
  assert.deepEqual(
    routeComposerText("simpler", { ...BASE, awaitingDemonstration: true, selectedBlockId: "b7" }),
    { kind: "defer-to-policy" },
  );
});

test("anything else takes the ordinary path", () => {
  assert.deepEqual(routeComposerText("why does that happen", BASE), { kind: "ordinary" });
});

// ── §39: a rewrite is a reading requirement ──────────────────────────────────

test("🔴 a rewritten passage becomes unread again — the defect §12 shipped", () => {
  // Measured before fixing: press Continue, then ask for a simpler version, and the learner gets
  // NEW WORDING with no Continue under it, because the block was still stamped as read. Asking for
  // something simpler silently cost them their pacing control.
  const canvas = {
    blocks: [{ content: "Dense original wording.", id: "b1", type: "paragraph" }],
    state: "learn",
  } as unknown as LearningCanvas;

  const read = finishReading(canvas, "2026-08-13T12:00:00.000Z");
  assert.equal(unreadChunk(read.blocks).length, 0, "the chunk is finished");

  const rewritten = applyRewrite(read, {
    before: "Dense original wording.",
    blockId: "b1",
    ops: [{ blockId: "b1", content: "Much simpler wording.", operation: "replace_block" }],
  });

  assert.equal(rewritten.blocks[0]?.content, "Much simpler wording.");
  assert.equal(unreadChunk(rewritten.blocks).length, 1, "new material must require reading again");
  // 🔴 AND THE RESTORE PATH SURVIVES IT. Clearing `readAt` must not clear the copy §11 keeps.
  assert.equal(rewritten.blocks[0]?.previousContent, "Dense original wording.");
});

test("the typed path and the toolbar path share one rewrite implementation", () => {
  // Two implementations of "simpler" would drift, and the one nobody uses would rot. The composer
  // route calls the same `askAboutSelection(…, "simpler")` the selection toolbar does.
  const source = readFileSync(
    join(import.meta.dirname, "..", "..", "components", "workspace", "learn", "learning-canvas.tsx"),
    "utf8",
  );
  const calls = source.match(/askAboutSelection\(/g) ?? [];
  assert.ok(calls.length >= 2, "expected the composer route to reuse the selection path");
  assert.match(source, /"simpler",/, "and to ask for the same action");
});
