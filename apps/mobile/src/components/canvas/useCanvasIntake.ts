import { useEffect, useRef, useState } from "react";
import { fetchNote } from "@/api/cloudLibrary";
import { attachToCanvas } from "@/api/canvas-sources";
import { takePending, type PendingAttachmentItem } from "@/lib/pending-attachment";
import type { LearningCanvas } from "@/learn/web";

// What a canvas screen does with material it did not read itself, before the learner's first
// turn — the phone's version of the web's two mount effects in learning-canvas.tsx: the
// "material chosen on the landing page" effect (`claimedFiles` ref, `takePending`) and the
// "file the canvas into a project" effect. Pulled out of canvas.tsx to keep that file's own
// length down (§ this pass's brief); the ownership split stays the same as the web's — canvas.tsx
// still owns `canvas`/`canvasRef`/`savedRef` and hands this hook only what it needs to read and a
// callback to report back through.
//
// 🔴 A REAL STATE DEPENDENCY, NOT JUST EFFECT ORDER. The web gets away with a ref
// (`attaching.current`) because `attachFiles` registers the in-flight promise SYNCHRONOUSLY,
// before the opening-ask effect (declared after it in source) can run in the same commit. Ordering
// two effects by where they're called works within one render, but this hook's own attach is
// asynchronous across renders — so `attachReady` is real state, and the caller's ask-effect must
// list it as a dependency rather than trust it ran first.

export interface CanvasIntakeResult {
  /**
   * True once every attach this canvas owes — front-door material staged before it existed, a
   * `note` the document viewer asked to carry along — has SETTLED. Settled, not necessarily
   * succeeded, mirroring the web's `settledAttachments`: a read that failed has nothing more to
   * wait for, and holding every later turn hostage to one bad file would make a single unreadable
   * photo strand the whole canvas.
   */
  attachReady: boolean;
}

/**
 * Claim whatever this canvas owes on open, attach it, and file the canvas into its project.
 *
 * `canvas` must be the LOADED (or freshly minted) canvas, not null — this hook does nothing while
 * canvas.tsx's own load effect is still running, the same gate the web's effect gets from
 * `session.ready`.
 */
export function useCanvasIntake(input: {
  uid: string | null;
  canvasId: string | undefined;
  canvas: LearningCanvas | null;
  /** A Library note the document viewer asked to carry along (`?note=`) — attached alongside
   *  whatever else this canvas owes, as one more `PendingAttachmentItem`. */
  noteId: string | undefined;
  /** A project id the front door asked to file this canvas into (`?folder=`). */
  folderId: string | undefined;
  /** Called once, with the canvas AFTER every owed item has been attached and saved — never
   *  called at all when there was nothing to attach. */
  onAttached: (canvas: LearningCanvas) => void;
  /** canvas.tsx's own `fileInto` — saves the canvas first if it has no row yet, then sets its
   *  project. Reused rather than re-implemented so there is one "file this canvas" path. */
  fileInto: (folderId: string) => void;
}): CanvasIntakeResult {
  const { uid, canvasId, canvas, noteId, folderId, onAttached, fileInto } = input;
  const claimedRef = useRef<string | null>(null);
  const filedRef = useRef<string | null>(null);
  const [attachReady, setAttachReady] = useState(false);

  // The route can point at a different canvas without this component unmounting (expo-router
  // reuses the screen) — reset the latch the moment it does, or a second canvas opened right
  // after a first inherits "already attached" and never claims its own material.
  useEffect(() => {
    claimedRef.current = null;
    setAttachReady(false);
  }, [canvasId]);

  useEffect(() => {
    if (!uid || !canvasId || !canvas) return;
    if (claimedRef.current === canvasId) return;
    claimedRef.current = canvasId;

    void (async () => {
      const items: PendingAttachmentItem[] = [...(takePending() ?? [])];
      if (noteId) {
        // A network miss here costs the note's grounding, not the turn — the attach (and the
        // ask that is waiting on it) still goes ahead over whatever else is there.
        const note = await fetchNote(uid, { id: noteId }).catch(() => null);
        if (note) items.push({ kind: "note", note });
      }
      if (items.length === 0) {
        setAttachReady(true);
        return;
      }
      const outcome = await attachToCanvas(uid, canvas, items);
      onAttached(outcome.canvas);
      setAttachReady(true);
    })();
  }, [uid, canvasId, canvas, noteId, onAttached]);

  // Filed once, as soon as the canvas has an id — independent of the attach above, and never
  // blocks it: a project assignment has nothing to do with what the first turn is grounded in.
  useEffect(() => {
    if (!folderId || !canvasId || filedRef.current === canvasId) return;
    filedRef.current = canvasId;
    fileInto(folderId);
  }, [folderId, canvasId, fileInto]);

  return { attachReady };
}
