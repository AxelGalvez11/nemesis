// Finishing a reading chunk (contract §12) — the learner's pacing signal, and nothing more.
//
// > **"There should be a 'continue' button once user finishes reading, at the bottom of the
// > paragraph chunk."**
//
// 🔴 THE CONTROL ALREADY EXISTED AND HAD BEEN DEAD FOR WEEKS. `canvas-state.ts` still offers
// `{ to: "recall", label: "I've read this" }` for a reading canvas, rendered at the bottom of the
// document — the position §12 asks for, with a label meaning the same thing. `nextAction` then
// REFUSES it, because `recall` is an evidence stage and the six-stage retirement closed every
// entrance to those. Proved rather than assumed: `nextAction` on a `learn` canvas holding one
// block returns `null`, so the button has simply not rendered.
//
// So §12 is a repoint, not an addition. The control was right; its DESTINATION was the problem,
// and the destination is what this module replaces. That also settles what would otherwise be the
// riskiest question here — one control at the end of the material, never one per block. A real
// import stored 197 blocks; a per-block Continue would be 197 presses with 196 paragraphs still
// visible underneath.
//
// ── What it is not ───────────────────────────────────────────────────────────────────────────
//
// 🔴 IT IS NOT EVIDENCE, AND THE FIELD IS DELIBERATELY NOT CALLED `resolvedAt`. §28's lifecycle
// runs ACTIVE → RESOLVED → REOPENED, and RESOLVED is reached when *"the learner demonstrates
// understanding"*. Pressing Continue demonstrates nothing — R3 is explicit that reading is not
// evidence of knowledge. Giving both states one name is how the next person wires
// demonstration-driven compression to a reading click, which would store a claim about the
// learner that they never made. `readAt` records what actually happened: they said they had
// finished reading.
//
// 🔴 AND IT DOES NOT HIDE THE MATERIAL. This surface has already shipped and removed exactly that
// defect: J1 deleted a one-click control that filtered blocks out of the document on a learner's
// own mastery claim, because *"a learner CLAIMING knowledge is not a demonstration of it, and
// hiding material on that claim was changing the curriculum without evidence."* A Continue that
// collapsed the passage to a one-line chevron would rebuild J1 with a friendlier label. Read
// material RECEDES — §7's *"resolved history stays accessible but recedes"* — and stays where it
// is, at full length, quieter.
//
// Pure, so every rule above is a test rather than a paragraph someone has to remember.

import type { CanvasBlock, LearningCanvas } from "./canvas-model";

/** Has the learner said they finished reading this? */
export function isRead(block: Pick<CanvasBlock, "readAt">): boolean {
  return typeof block.readAt === "string" && block.readAt.length > 0;
}

/**
 * The material the learner has not yet said they finished.
 *
 * 🔴 NOT "THE LAST BLOCK", AND NOT "THE ONE IN VIEW". Both are guesses about where the learner is
 * looking. This is derived from events the learner themselves generated, so it has a determinate
 * answer at every moment: everything they have not yet marked. When the teaching loop appends new
 * material later, that material becomes the next chunk on its own, with no bookkeeping.
 */
export function unreadChunk(blocks: readonly CanvasBlock[]): readonly CanvasBlock[] {
  return blocks.filter((block) => !isRead(block));
}

/**
 * Whether the Continue control renders.
 *
 * 🔴 `awaitingDemonstration` IS THE PRODUCTION GUARD, NOT A TIDINESS RULE. §12 scopes Continue to
 * reading chunks and §17 forbids it after an answer, but the reason it must be impossible while a
 * retrieval is unanswered is N3: a control that moves the learner on while a demonstration is owed
 * is a way to press past the question. The composer's `✓` is refused in exactly this state for
 * exactly this reason — see `offersAdvance` — and the two must not disagree, or the surface offers
 * through one door what it refuses through the other.
 */
export function offersContinue(state: {
  /** There is material on screen the learner has not marked as read. */
  readonly hasUnreadMaterial: boolean;
  /** A retrieval prompt is up and unanswered. */
  readonly awaitingDemonstration: boolean;
  /** Something is being generated; pressing on now would race it. */
  readonly busy: boolean;
}): boolean {
  if (state.awaitingDemonstration) return false;
  if (state.busy) return false;
  return state.hasUnreadMaterial;
}

/**
 * Record that the learner finished the chunk on screen.
 *
 * Marks everything currently unread, because that is what "I have finished reading" means when one
 * control sits at the end of the material. Blocks appended afterwards are untouched and become the
 * next chunk.
 *
 * 🔴 IT SETS NOTHING ELSE. Not `collapsed`, not `known`, not a state transition. `collapsed` would
 * hide the material (J1); `known` is the J1 field itself and is still read elsewhere; and a state
 * transition is what made the original control dead by pointing it at an evidence stage.
 */
export function finishReading(canvas: LearningCanvas, at: string): LearningCanvas {
  if (unreadChunk(canvas.blocks).length === 0) return canvas;
  return {
    ...canvas,
    blocks: canvas.blocks.map((block) => (isRead(block) ? block : { ...block, readAt: at })),
  };
}

/**
 * Reading the same material again after saying you had finished.
 *
 * 🔴 KEPT DELIBERATELY, THOUGH NOTHING CALLS IT YET, BECAUSE THE ALTERNATIVE IS A ONE-WAY DOOR.
 * §27.0: *"history remains available, but resolved history becomes visually secondary"* — a
 * learner may reopen an explanation at any time. Since read material only recedes rather than
 * disappearing, that is currently free: they scroll up and read it. This exists so that the
 * moment anything DOES gate on `readAt`, the way back is already here and already tested, rather
 * than being discovered as missing once someone is stuck behind it.
 */
export function reopenReading(canvas: LearningCanvas, blockId: string): LearningCanvas {
  return {
    ...canvas,
    blocks: canvas.blocks.map((block) => {
      if (block.id !== blockId || !isRead(block)) return block;
      const { readAt, ...rest } = block;
      return rest;
    }),
  };
}
