// One finished turn of the conversation, as the thread keeps it.
//
// 🔴🔴 THE PAYLOAD, NOT A PROJECTION OF IT. `canvas-history.ts` reconstructs a moment from the
// durable log and can only ever return what was written down: flat text. That is right for the
// History Rail, whose job is navigation, and wrong for a thread — owner, 2026-08-26: the chat is
// the product now, and *"bring over the artifacts, rendering chips, the visualizations… the pill
// shapes for the sources and favicon thumbnails… the component chips for tests."* None of those
// survive a round trip through a string.
//
// So a turn carries the same objects the live answer renders, and the thread draws them with the
// same components. A drawing in the thread is not a picture of a drawing; it is the drawing.
//
// 🔴 TWO ORIGINS, AND THE DIFFERENCE IS STATED RATHER THAN HIDDEN. A turn taken in this sitting has
// everything. A turn rebuilt from `canvas.moments` after a refresh has whatever was persisted, and
// `restored` says so — see `MAX_STORED_VISUAL_BYTES` in canvas-moment.ts for what a stored turn
// keeps. A thread that silently dropped the pictures on reload would read as them being lost.
//
// PURE. No React, no I/O.

import type { CanvasOutput } from "./canvas-model";
import type { CanvasVisualRequest } from "./canvas-visual";

/** A web page the answer used, in the shape `CanvasSourceCards` draws. */
export interface ThreadSource {
  title: string;
  url: string;
}

export interface CanvasThreadTurn {
  /** Stable across re-renders. React keys off this, so it must not be an index. */
  id: string;
  /** ISO. */
  at: string;
  /** The learner's own words, or null for a turn the app opened by itself. */
  said: string | null;
  /** How those words arrived: "spoken" inside a live voice conversation, null when unobserved.
   *  The bubble draws spoken words in the reference's treatment (lighter, italic); it never
   *  means anything about their worth. */
  saidVia: "spoken" | null;
  /** What Nemesis said, as markdown, with its `[figure n]` markers intact. */
  reply: string;
  /** Drawings this reply made, in the order its markers count into. */
  visuals: readonly CanvasVisualRequest[];
  /** Pages the answer cited or consulted. */
  sources: readonly ThreadSource[];
  /**
   * Material attached during this turn, by title.
   *
   * 🔴 TITLES, NOT WHOLE SOURCES. The thread names what arrived; the Sources panel owns the source
   * itself, with its excerpts and its provenance. Copying the object in here would be a second
   * representation of one thing, and renaming a source would leave a stale name in the thread.
   */
  attached: readonly string[];
  /** Something the turn produced: a deck, a document, a set of slides. */
  output: CanvasOutput | null;
  /**
   * Rebuilt from the durable log rather than taken live — so the surface can be honest about a
   * turn whose drawings were too large to keep. Never used to style the turn differently.
   */
  restored?: boolean;
  /** The stored text was cut to its cap. */
  truncated?: boolean;
}

/** Whether a turn has anything at all worth drawing. Guards against an empty row in the thread. */
export function turnHasContent(turn: CanvasThreadTurn): boolean {
  return Boolean(
    turn.said?.trim()
    || turn.reply.trim()
    || turn.visuals.length
    || turn.sources.length
    || turn.attached.length
    || turn.output,
  );
}

/**
 * The turn currently on screen, as it will be filed once the next one starts.
 *
 * 🔴 THE THREAD IS EVERY TURN EXCEPT THE ONE THE LIVE REGION IS SHOWING, which is what stops the
 * newest answer being drawn twice — once by the thread and once by the canvas underneath it. The
 * hand-off happens when a new turn STARTS, not when the previous one finishes, because "finished"
 * is not a moment the surface can observe: an answer streams, and its last token is not an event.
 */
export function fileTurn(input: {
  id: string;
  at: string;
  said: string | null;
  saidVia?: "spoken" | null;
  reply: string;
  visuals?: readonly CanvasVisualRequest[];
  sources?: readonly ThreadSource[];
  attached?: readonly string[];
  output?: CanvasOutput | null;
}): CanvasThreadTurn {
  return {
    at: input.at,
    attached: input.attached ?? [],
    id: input.id,
    output: input.output ?? null,
    reply: input.reply,
    said: input.said,
    saidVia: input.saidVia ?? null,
    sources: input.sources ?? [],
    visuals: input.visuals ?? [],
  };
}
