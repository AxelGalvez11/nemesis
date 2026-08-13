// What the learner DID, as distinct from what they demonstrated.
//
// 🔴 EVENTS ARE NOT EVIDENCE, and collapsing the two is the specific mistake this file exists
// to prevent:
//
//     opened a definition  →  concept mastery −20%        ← wrong, and tempting
//
// Opening a definition once is a very weak friction signal. Opening definitions for four
// related terms in one paragraph is a moderate one. Opening a definition and then failing a
// retrieval on the same term is real evidence of a gap — but it is the retrieval that carries
// it, not the tooltip. So these get recorded, and the learner model combines them later with
// performance evidence. Nothing here may reach into a verdict on its own.
//
// The guard is behavioural, not a comment: `canvas-events.test.ts` appends fifty events and
// asserts `diagnose()` returns exactly what it returned before. If that test ever fails,
// interaction telemetry has started deciding what someone knows.
//
// 🔴 AND THIS IS NOT THE APPEND-ONLY EVIDENCE LOG. It is capped, and it drops the oldest rows
// when it fills. It is telemetry for interpreting evidence, not a history anything may be
// reconstructed from — the real `LearningEvent` + `Evidence` layer keyed by objective is still
// to come, and treating this ring buffer as that history would silently lose the beginning.

import type { LearningCanvas } from "./canvas-model";

/** Kept small on purpose. The jsonb document travels on every save, and an unbounded array
 *  would grow until the row did. Oldest out first. */
export const MAX_EVENTS = 500;

export type LearningEventType =
  /** A range of text was highlighted. Weakest signal here: people select while reading. */
  | "selection_created"
  | "definition_opened"
  | "explanation_requested"
  | "simplification_requested"
  // §11 — the learner put a rewritten passage back the way it was written. Worth recording
  // separately from the request: a simplification that gets restored is a signal the rewrite made
  // the material WORSE for this learner, which a request count alone cannot tell you.
  | "simplification_restored"
  // §12 — the learner said they had finished reading the chunk on screen.
  // 🔴 A PACING SIGNAL, NOT A CLAIM ABOUT KNOWLEDGE (R3). It is here rather than in evidence
  // precisely because this store provably cannot reach a verdict. Its `activeElapsedMs` is the
  // part §25 expects to become useful later — how long a chunk took is a difficulty signal, and
  // difficulty is not the same question as mastery.
  | "reading_finished"
  | "example_requested"
  | "why_requested"
  | "source_opened"
  | "response_submitted"
  | "unknown_admitted";

export interface LearningEvent {
  id: string;
  type: LearningEventType;
  at: string;
  /** The block or region it happened in, where there was one. */
  blockId?: string;
  conceptIds?: string[];
  /** The exact text the learner pointed at. Their words about their own confusion. */
  selectedText?: string;
  /** Active time on this canvas when it happened — NOT wall clock. Someone who opens a canvas
   *  and walks away for 25 minutes has not studied for 25 minutes, and a latency computed from
   *  wall clock would read that as deep thought. */
  activeElapsedMs?: number;
  payload?: Record<string, unknown>;
}

export interface NewLearningEvent {
  type: LearningEventType;
  blockId?: string;
  conceptIds?: readonly string[];
  selectedText?: string;
  payload?: Record<string, unknown>;
}

/** Append one interaction, dropping the oldest if the log is full.
 *
 *  Pure: it returns a new canvas and touches nothing else. In particular it does not, and must
 *  not, adjust `weakConceptIds`, any evaluation, or any scheduling grade. */
export function appendEvent(
  canvas: LearningCanvas,
  event: NewLearningEvent,
  now: string,
  id: string,
): LearningCanvas {
  const entry: LearningEvent = {
    id,
    type: event.type,
    at: now,
    ...(event.blockId ? { blockId: event.blockId } : {}),
    ...(event.conceptIds?.length ? { conceptIds: [...event.conceptIds] } : {}),
    // Truncated: this is a signal about where attention went, not a copy of the document.
    ...(event.selectedText ? { selectedText: event.selectedText.slice(0, 200) } : {}),
    activeElapsedMs: Math.max(0, Math.round(canvas.activeMs)),
    ...(event.payload ? { payload: event.payload } : {}),
  };

  const events = [...canvas.events, entry];
  return { ...canvas, events: events.slice(-MAX_EVENTS) };
}

/** How many times the learner asked for help with this exact term.
 *
 *  §12: one lookup is noise, repetition is the signal. Exposed as a COUNT rather than as a
 *  judgement, because what it means depends on evidence this module does not have. */
export function frictionCount(canvas: Pick<LearningCanvas, "events">, term: string): number {
  const needle = term.trim().toLowerCase();
  if (!needle) return 0;
  return canvas.events.filter(
    (event) =>
      event.selectedText?.trim().toLowerCase() === needle &&
      event.type !== "selection_created" &&
      event.type !== "response_submitted",
  ).length;
}
