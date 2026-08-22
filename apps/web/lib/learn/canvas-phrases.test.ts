// §11 + brief §15 — typing "make this simpler", and the referent problem underneath it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { applyOps, applyRewrite } from "./canvas-ops";
import { routeRewrite } from "./canvas-phrases";
import { finishReading, unreadChunk } from "./canvas-reading";
import type { LearningCanvas } from "./canvas-model";

const BASE = {
  awaitingDemonstration: false,
  hasReadingMaterial: true,
  selectedBlockId: null,
  unreadBlockIds: ["b1"],
};

// 🔴 THE PHRASE TESTS ARE GONE, AND SO IS WHAT THEY TESTED. Three of them pinned `asksForRewrite`:
// that "make this simpler" and "can you rephrase that" fired, that the owner's confusion phrasings
// ("I don't understand this", "I'm lost") fired too, and that a question with a subject ("what does
// osmolarity mean") did not. That function was a list of instruction phrases, a list of confusion
// phrasings, and an interrogative guard wedged between them to stop the two colliding — and its own
// comments record two phrasings it got wrong before anybody noticed.
//
// The model reads the turn now and returns `then: "rewrite"` (lib/learn/turn-router.ts), and those
// phrasings are exercised against it by `scripts/conversation-acceptance.ts`. What is tested here is
// the half that was never a reading of language: WHICH passage a rewrite lands on, and when it must
// not land at all.

test("the referent is the active reading region, derived from the learner's own Continue presses", () => {
  assert.deepEqual(routeRewrite(BASE), { blockId: "b1", kind: "rewrite" });
});

test("a highlighted block outranks inference — they pointed at it", () => {
  assert.deepEqual(
    routeRewrite({ ...BASE, selectedBlockId: "b7", unreadBlockIds: ["b1", "b2"] }),
    { blockId: "b7", kind: "rewrite" },
  );
});

test("🔴 REFUSES rather than guessing, and the refusal is something the learner can act on", () => {
  // Several unread passages: "this" names none of them. The two tempting answers — the most recent
  // block, and the one nearest the viewport — are guesses about time and gaze respectively, and
  // neither is anything the learner told us.
  const many = routeRewrite({ ...BASE, unreadBlockIds: ["b1", "b2", "b3"] });
  assert.equal(many.kind, "refused");
  assert.match(many.kind === "refused" ? many.message : "", /highlight/i, "the refusal must name the action that resolves it");

  const none = routeRewrite({ ...BASE, hasReadingMaterial: false, unreadBlockIds: [] });
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
    routeRewrite({ ...BASE, awaitingDemonstration: true }),
    { kind: "defer-to-policy" },
  );
  // Even with an explicit selection: the demonstration outranks it.
  assert.deepEqual(
    routeRewrite({ ...BASE, awaitingDemonstration: true, selectedBlockId: "b7" }),
    { kind: "defer-to-policy" },
  );
});

// There is no "ordinary" outcome any more: this function is called only once the model has already
// read the turn as a rewrite, so its whole job is where the rewrite lands.

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

test("🔴 there is exactly one rewrite implementation, and the learner's words reach it", () => {
  // Two implementations of "rewrite" would drift, and the one nobody uses would rot. This used to
  // assert that the composer route called the same `askAboutSelection(…, "simpler")` the selection
  // toolbar did — and it stayed green while the real problem grew underneath it: the toolbar was
  // deleted (owner 2026-08-21), which left `simplifySelection` as a second implementation reached
  // from one place, with a prompt that threw the learner's sentence away and asked for "simpler"
  // every time. "Make this shorter" and "add an example here" both came back simplified.
  //
  // 🔴 SO THE ASSERTION IS NOW ON THE SENTENCE REACHING THE REWRITE, which is the thing that was
  // actually missing. Calibration: drop `text` from the call below and this reddens.
  const canvas = readFileSync(
    join(import.meta.dirname, "..", "..", "components", "workspace", "learn", "learning-canvas.tsx"),
    "utf8",
  );
  assert.match(canvas, /session\.rewriteSelection\(\{[\s\S]{0,400}\}, text\);/, "the composer route rewrites without saying what was asked for");

  const api = readFileSync(join(import.meta.dirname, "canvas-api.ts"), "utf8");
  assert.ok(!/export async function simplifySelection/.test(api), "the second rewrite implementation is back");
  assert.equal((api.match(/operation: "replace_block"/g) ?? []).length, 1, "more than one place builds a block rewrite");
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
