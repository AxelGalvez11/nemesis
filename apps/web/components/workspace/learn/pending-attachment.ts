// Files chosen on the landing page, waiting for the canvas that will receive them.
//
// 🔴 WHY A MODULE VARIABLE AND NOT THE URL. The front door has no canvas yet — a canvas is minted
// by `useCanvasSession` the moment the Canvas surface mounts without an id. So "upload from the
// landing page" is necessarily two steps: pick the files here, hand them to the canvas that is
// about to exist. A `File` cannot be serialised into a query string, and writing it to storage
// first would mean uploading before the learner has a canvas to upload INTO.
//
// This is a same-tab, same-JavaScript-context handoff across a client-side navigation the learner
// does not perceive, which is the one situation a module variable is genuinely the right tool for.
//
// 🔴 SINGLE-USE, AND THAT IS THE IMPORTANT PART. `takePending()` clears as it reads. Without that,
// a learner who attached a file, went back to the landing page and opened a DIFFERENT canvas would
// find the first canvas's file attached to the second one — material silently duplicated into a
// body of knowledge it does not belong to. The window is small and the failure would be quiet, so
// the clear happens in the same expression as the read rather than at the call site.
//
// A full page reload drops whatever is held here. That is correct: the learner lands on a canvas
// with nothing attached, which is a visible, recoverable state rather than a wrong one.
//
// 🔴🔴 THE READING TRAVELS WITH THE FILE NOW, AND THAT IS WHY THIS HOLDS A PROMISE. Owner,
// 2026-08-31: *"read them on drop, like chatgpt."* The front door starts the upload and the parse
// the moment material lands, so by the time send is pressed the work is usually finished. Handing
// over only the `File` would throw that away: the canvas would upload and parse the same bytes a
// second time. Handing over the in-flight `extractFile` call instead means the canvas either gets
// the finished result immediately or waits out the remainder of a read that is already running.
//
// 🔴 A PROMISE SURVIVES THIS HANDOFF FOR EXACTLY THE REASON A `File` DOES: same tab, same
// JavaScript context, one client-side navigation. It could not ride a URL or `sessionStorage`,
// which is the same constraint that made this module a module variable in the first place.

import { type ExtractedFile } from "@/lib/workspace/chat-attachments";

export interface PendingAttachment {
  file: File;
  /** The read already running for this file, or null when it has not been started (the recorder's
   *  own hand-off, and any future door that stages without reading). */
  read: Promise<ExtractedFile> | null;
}

let pending: PendingAttachment[] | null = null;

/** Hold files for the canvas that is about to mount. Replaces anything already waiting. */
export function putPending(files: readonly PendingAttachment[]): void {
  pending = files.length > 0 ? [...files] : null;
}

/** Take the waiting files, if any, and clear them. Returns null when nothing is waiting. */
export function takePending(): PendingAttachment[] | null {
  const held = pending;
  pending = null;
  return held;
}

/** Testing seam: forget anything held, without claiming it. */
export function clearPending(): void {
  pending = null;
}
