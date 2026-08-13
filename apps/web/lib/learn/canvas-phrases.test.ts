// §11 + brief §15 — typing "make this simpler", and the referent problem underneath it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { applyOps, applyRewrite } from "./canvas-ops";
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

test("🔴 REVERSED: the owner's confusion phrasings DO fire — my narrowing was wrong", () => {
  // 🔴 I ARGUED THE OPPOSITE AND SHIPPED IT NARROW. The reasoning was an asymmetry: a false
  // positive silently rewrites material the learner may have been relying on. Two things defeat
  // it, and the second is the one I missed.
  //
  //   1. The wording is NOT destroyed — §11 keeps `previousContent` and offers restore, so the
  //      cost is "it changed and I can put it back".
  //   2. 🔴 THE SAFE FALLBACK WAS THE PROHIBITED BEHAVIOUR. §11 says "do not append another
  //      explanation underneath". Checked rather than assumed: the ordinary path's prompt permits
  //      insert_before, insert_after and annotate_block — so a confused learner falling through
  //      gets an explanation STACKED BELOW the passage, the exact shape §11 forbids.
  for (const text of ["I still don't understand this", "I don't get this", "im lost", "I am confused"]) {
    assert.equal(asksForRewrite(text), true, `${text} is on the owner's list and must rewrite in place`);
  }
});

test("a question with a subject is still not a rewrite request", () => {
  // The line that survives: "what does osmolarity mean" asks about a TERM and is answered beside
  // the passage, disturbing nothing. "I don't understand this" reports that the material failed.
  for (const text of [
    "why does that happen",
    "what does osmolarity mean",
    "is this the same as the last one",
    "",
    // 🔴 THESE FOUR ARE THE ONES THE OPENER GUARD ACTUALLY CARRIES, and I only know that because
    // deleting the guard did NOT fail my first set. Those cases passed for an unrelated reason —
    // the confusion pattern needs a negation directly before "understand", which they lack. A
    // calibration that does not go red is telling you the assertion is not testing what its name
    // claims, which is the same lesson as a guard measuring text instead of a property.
    "why am I confused",
    "what am I not understanding",
    "how is this confusing",
    "why do I not get this",
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

// ── §39, structurally: any op that changes what the learner reads invalidates `readAt` ──────────

test("🔴 the invalidation is enforced by OBSERVATION, not by a list of operations", () => {
  // The obvious fix was to clear `readAt` inside the `replace_block` branch. That passes today and
  // strands a Continue the first time somebody adds a tenth operation — a guard written against
  // the nine that exist would stay green forever. `applyOps` compares what each block SAID before
  // against what it says after, so a new operation is covered the moment it is written.
  const read = () =>
    ({
      blocks: [{ content: "Original.", id: "b1", readAt: "2026-08-13T12:00:00.000Z", type: "paragraph" }],
      state: "learn",
    }) as unknown as LearningCanvas;
  const b1 = (canvas: LearningCanvas) => canvas.blocks.find((block) => block.id === "b1");

  // Content replaced → the learner has new material.
  assert.equal(b1(applyOps(read(), [{ blockId: "b1", content: "New wording.", operation: "replace_block" }]))?.readAt, undefined);
  // 🔴 A NOTE COUNTS. The paragraph is untouched, but material was added to the block that the
  // learner has not read — so the region owes reading again.
  assert.equal(b1(applyOps(read(), [{ blockId: "b1", note: "A clarification.", operation: "annotate_block" }]))?.readAt, undefined);

  // And it does NOT fire where nothing the learner reads changed — otherwise every collapse or
  // unrelated insert would resurrect a Continue they already dismissed.
  assert.ok(b1(applyOps(read(), [{ blockId: "b1", collapsed: true, operation: "collapse_block" }]))?.readAt);
  assert.ok(
    b1(applyOps(read(), [{ block: { content: "Extra.", type: "paragraph" }, blockId: "b1", operation: "insert_after" }]))?.readAt,
    "an unrelated insert must not un-finish a chunk the learner completed",
  );
});

test("the rewrite path gets it from applyOps rather than clearing it twice", () => {
  // 🔴 DELIBERATELY NOT BELT-AND-BRACES. `applyRewrite` used to clear `readAt` itself. If it still
  // did, a break in the structural rule would keep the one path anybody tests working while every
  // other path silently stranded a Continue — the failure hidden by the redundancy meant to
  // prevent it.
  const source = readFileSync(join(import.meta.dirname, "canvas-ops.ts"), "utf8");
  const rewrite = source.slice(source.indexOf("export function applyRewrite"));
  const body = rewrite
    .slice(0, rewrite.indexOf("\n}"))
    // The code, not the comment explaining WHY it does not clear it — the third time a guard in
    // this repo has read its own explanation as the violation.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(!/readAt/.test(body), "applyRewrite must not clear readAt itself — applyOps owns it");
});
