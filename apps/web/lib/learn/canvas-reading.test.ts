// §12 — finishing a reading chunk. The control, and the three things it must not become.
//
// 🔴 THE HEADLINE FINDING, RECORDED HERE BECAUSE IT SHAPES THE WHOLE CHANGE: the control §12 asks
// for already existed, in the position §12 asks for, with a label meaning the same thing —
// `{ to: "recall", label: "I've read this" }` at the bottom of the document — and it had been DEAD
// since the six-stage retirement, because `recall` is an evidence stage and `nextAction` refuses
// every move into one. The first test below proves that rather than asserting it.

import assert from "node:assert/strict";
import test from "node:test";

import { appendEvent } from "./canvas-events";
import type { CanvasBlock, LearningCanvas } from "./canvas-model";
import { finishReading, isRead, offersContinue, reopenReading, unreadChunk } from "./canvas-reading";
import { nextAction } from "./canvas-state";
import { canvasFromRow, canvasToRow } from "./canvas-store";

const AT = "2026-08-13T12:00:00.000Z";

function block(id: string, overrides: Partial<CanvasBlock> = {}): CanvasBlock {
  return { content: `Paragraph ${id}`, id, type: "paragraph", ...overrides };
}

function canvas(blocks: CanvasBlock[]): LearningCanvas {
  return {
    activeMs: 0, answers: [], blocks, concepts: [], correctedConceptIds: [], correctiveAttempts: {},
    createdAt: AT, events: [], id: "c1", level: null, outputs: [], questions: [], recall: [],
    recallResults: [], responses: [], sources: [], state: "learn", title: "Cardiac action potential",
    updatedAt: AT, weakConceptIds: [],
  } as unknown as LearningCanvas;
}

function at(c: LearningCanvas, index: number): CanvasBlock {
  const found = c.blocks[index];
  assert.ok(found, `expected a block at ${index}`);
  return found;
}

test("🔴 the control §12 asks for existed and was DEAD — this is what made it a repoint", () => {
  // The legacy machine still offers it for a reading canvas…
  const reading = canvas([block("b1")]);
  // …and `nextAction` refuses, because its destination is a retired evidence stage. So the bottom
  // of every reading canvas has been empty. If this ever returns a move again, the new Continue
  // and the old one would render side by side, which §17 and §23 both rule out.
  assert.equal(nextAction(reading), null, "a reading canvas must offer no legacy move");
  assert.equal(nextAction(canvas([])), null, "and nothing to read offers nothing either");
});

test("Continue renders while there is unread material, and not otherwise", () => {
  const base = { awaitingDemonstration: false, busy: false, hasUnreadMaterial: true };
  assert.equal(offersContinue(base), true);
  assert.equal(offersContinue({ ...base, hasUnreadMaterial: false }), false, "nothing left to finish");
  assert.equal(offersContinue({ ...base, busy: true }), false, "pressing on mid-generation races it");
});

test("🔴 N3: no Continue while a demonstration is owed — it must not be a way past the question", () => {
  // §17 forbids a Continue after an answer; N3 is the stronger reason it must be IMPOSSIBLE while
  // one is owed. The composer's `✓` is refused in the same state, and the two doors must agree.
  assert.equal(
    offersContinue({ awaitingDemonstration: true, busy: false, hasUnreadMaterial: true }),
    false,
    "a required demonstration must offer no control that moves the learner past it",
  );
});

test("finishing marks the chunk on screen, and later material becomes the next chunk", () => {
  const after = finishReading(canvas([block("b1"), block("b2")]), AT);
  assert.equal(at(after, 0).readAt, AT);
  assert.equal(at(after, 1).readAt, AT);
  assert.equal(unreadChunk(after.blocks).length, 0);

  // The teaching loop appends. That material is unread without any bookkeeping, so the control
  // comes back on its own.
  const grown = { ...after, blocks: [...after.blocks, block("b3")] };
  assert.equal(unreadChunk(grown.blocks).length, 1);
  assert.equal(isRead(at(grown, 2)), false);

  // Finishing again marks only the new material and does not restamp the old.
  const again = finishReading(grown, "2026-08-13T12:30:00.000Z");
  assert.equal(at(again, 0).readAt, AT, "already-read material keeps its original timestamp");
  assert.equal(at(again, 2).readAt, "2026-08-13T12:30:00.000Z");
});

test("🔴 J1: finishing must not hide, collapse or claim knowledge", () => {
  // This surface has already shipped and REMOVED a one-click control that filtered material out of
  // the document on a learner's own claim. A Continue that collapsed the passage would rebuild it.
  const after = finishReading(canvas([block("b1")]), AT);
  const only = at(after, 0);
  assert.equal(after.blocks.length, 1, "material must not leave the document");
  assert.equal(only.content, "Paragraph b1", "and must not be shortened");
  assert.equal(only.collapsed, undefined, "reading must not fold the passage away");
  assert.equal(only.known, undefined, "🔴 reading is not a mastery claim — `known` is the J1 field");
  assert.equal(after.state, "learn", "and it is not a state transition — that is what killed the old control");
});

test("nothing to finish is a no-op rather than a rewrite", () => {
  const done = finishReading(canvas([block("b1")]), AT);
  assert.equal(finishReading(done, "2026-08-13T13:00:00.000Z"), done, "same object: no spurious save");
});

test("reading it again is possible, so nothing is a one-way door", () => {
  const done = finishReading(canvas([block("b1"), block("b2")]), AT);
  const reopened = reopenReading(done, "b1");
  assert.equal(isRead(at(reopened, 0)), false);
  assert.equal(at(reopened, 0).readAt, undefined, "the field is cleared, not blanked");
  assert.equal(isRead(at(reopened, 1)), true, "and only the one asked for");
});

test("🔴 the timing lands in the interaction log, never in evidence", () => {
  // §25: how long a chunk took may later be useful evidence about DIFFICULTY. R3: the reading
  // itself is not evidence of KNOWLEDGE. So the timing has to live somewhere that provably cannot
  // become a verdict — `canvas-events.ts`, whose own test appends fifty events and asserts
  // `diagnose()` is unchanged.
  const logged = appendEvent(canvas([block("b1")]), { type: "reading_finished" }, AT, "e1");
  const event = logged.events[logged.events.length - 1];
  assert.ok(event, "the press must be recorded");
  assert.equal(event.type, "reading_finished");
  assert.equal(event.at, AT);
  // And the evidence-bearing collections are untouched.
  assert.equal(logged.responses.length, 0, "reading writes no response");
  assert.equal(logged.recallResults.length, 0, "and no result");
  assert.equal(logged.answers.length, 0, "and no answer");
});

test("🔴 `readAt` survives the database round trip, or the chunk un-finishes on reload", () => {
  // A new structural field, and six have died at exactly this boundary after passing their own
  // tests. The failure would be quiet and absurd: the learner presses Continue, comes back
  // tomorrow, and every paragraph they already worked through is bright again with Continue at the
  // bottom offering to finish it a second time.
  const done = finishReading(canvas([block("b1"), block("b2")]), AT);
  const row = canvasToRow(done, "user-1");
  const reloaded = canvasFromRow({
    active_ms: row.active_ms as number,
    created_at: done.createdAt,
    document: JSON.parse(JSON.stringify(row.document)),
    id: "c1",
    level: null,
    state: "learn",
    title: done.title,
    updated_at: done.updatedAt,
  } as Parameters<typeof canvasFromRow>[0]);

  assert.equal(at(reloaded, 0).readAt, AT, "the field survives");
  // 🔴 THE CONSUMER, NOT JUST THE FIELD.
  assert.equal(isRead(at(reloaded, 0)), true);
  assert.equal(unreadChunk(reloaded.blocks).length, 0, "and the control must not come back");
  assert.equal(
    offersContinue({ awaitingDemonstration: false, busy: false, hasUnreadMaterial: unreadChunk(reloaded.blocks).length > 0 }),
    false,
  );
});
