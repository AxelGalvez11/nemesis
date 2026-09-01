// How far through reading a document we honestly are.
//
// 🔴🔴 EVERY NUMBER HERE IS A COMPLETED FACT, NEVER A CLOCK. Owner, 2026-09-01: *"replace with a
// circular progress bar that doesnt spin but just does the progress indicator."* A filling arc is a
// PROMISE that something real is behind it, and the tempting way to build one is a timer that
// creeps toward 90% and waits. That is the same lie as the progress bar this product refused to
// draw in #1027, dressed differently, and it misbehaves worst on exactly the big documents where
// somebody is actually watching it: the estimate is tuned on the common case, so the file that
// takes two minutes sits at 90% for ninety seconds.
//
// So the arc advances ONLY when a step of `extractFile` has genuinely finished. Nothing here reads
// a clock, and nothing interpolates between two stops.
//
// 🔴 A PAUSED ARC IS NOT A STUCK ARC, AND THAT IS WHY THE CARD ALSO SWEEPS. The arc answers "how
// far"; the sweep across the card answers "still working". Either alone would be worse: a sweep
// with no arc says nothing about progress, and an arc that holds at 60% with a dead card around it
// reads as a hang. Together, a long step looks like a long step.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md), and never per-format either. These are the
// steps `extractFile` takes for a lecture PDF, a spreadsheet and a photograph alike.
//
// PURE. No React, no I/O, no clock.

/**
 * The steps of a read that a browser can actually observe finishing.
 *
 * 🔴 THESE ARE `extractFile`'S OWN BOUNDARIES, not a description of what a parser does. The server
 * pulls text, finds figures and reads some of them, and reports none of it: the response arrives
 * whole or not at all. What the client genuinely knows is when it got a key, when the bytes
 * finished going up, and when the answer came back.
 */
export type ReadPhase =
  /** Picked, nothing done yet. */
  | "queued"
  /** The device key resolved. Fast, and it is what proves the read has actually begun. */
  | "authorised"
  /** The file finished uploading. Absent on the inline lane, where there is no upload. */
  | "uploaded"
  /** The extractor answered. The document is readable from here. */
  | "read";

/**
 * Where each finished step leaves the arc.
 *
 * 🔴 THE WEIGHTS ARE THE WALL CLOCK, NOT AN EVEN SPLIT. Authorising is milliseconds, so it barely
 * moves the arc and exists only to prove the read started. The upload is where a big document
 * spends most of its wait, so finishing it is worth half the circle. Everything after it is one
 * request whose length nobody can see.
 *
 * 🔴 AN EVEN THREE-WAY SPLIT WOULD BE THE DISHONEST VERSION: it would put the arc a third of the
 * way round for a step that took eight milliseconds.
 */
export const READ_STOPS: Readonly<Record<ReadPhase, number>> = {
  authorised: 0.1,
  queued: 0,
  read: 1,
  uploaded: 0.6,
};

/**
 * The arc for a phase, as a fraction of the circle.
 *
 * 🔴 CLAMPED AND MONOTONIC BY CONSTRUCTION. A caller that reports steps out of order (a retry, a
 * late resolve from an abandoned read) must never make the arc travel backwards on screen, which
 * reads as the document being un-read. `advance` below is what enforces that; this function only
 * says where a phase sits.
 */
export function progressFor(phase: ReadPhase): number {
  return READ_STOPS[phase];
}

/**
 * The arc after `phase` is reported, given what it already showed.
 *
 * 🔴 THE MAXIMUM, DELIBERATELY. On the inline lane there is no upload, so a small file reports
 * `authorised` then `read` and never touches 0.6; on the filed lane a retry can re-report
 * `authorised` after the arc has passed it. Taking the larger of the two means neither case can
 * rewind the drawing.
 */
export function advance(shown: number, phase: ReadPhase): number {
  return Math.max(shown, progressFor(phase));
}

/** Circumference of the arc's circle: r = 15 on the 34px slot the document glyph used to sit in. */
export const ARC_CIRCUMFERENCE = 2 * Math.PI * 15;

/**
 * The `stroke-dashoffset` that draws `progress` of the circle.
 *
 * 🔴 DASHOFFSET RATHER THAN A TWO-VALUE DASHARRAY, because only the offset is reliably animatable:
 * a transition between two `stroke-dasharray` pairs is not interpolated the same way across
 * engines, and the arc would snap between stops in some browsers and glide in others. One number
 * moving is also what lets the whole thing be a CSS transition rather than a script.
 */
export function dashOffsetFor(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return ARC_CIRCUMFERENCE * (1 - clamped);
}
