"use client";

// Sending one page of a learner's written or drawn work to /api/handwriting/work and handing back
// what came off it — the network- and auth-touching half of the writing sheet, kept out of the
// component the same way `useCanvasDictation` is kept out of `canvas-composer.tsx`.
//
// No test file, for the same reason those two have none: this wraps browser APIs (fetch, FormData)
// that the app's runner cannot exercise without a DOM. The decisions it feeds — the submission
// gate, the correction, the render — are pure and live in `lib/learn/written-response.ts`, which
// is where the assertions are.
//
// 🔴 IT NEVER DECIDES ANYTHING ABOUT THE WORK. It returns the reading and whatever went wrong
// getting it. Whether the reading is good enough to be judged is `writtenSubmissionGate`'s, and
// whether the work is right is the evaluator's.

import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import type { WrittenWork } from "@/lib/handwriting/written-work";

export type WorkReading =
  | { kind: "work"; work: WrittenWork }
  /** 🔴 A DIFFERENT CASE FROM AN ABSTAINED READING, WHICH IS A `work` WITH `abstained: true`. This
   *  one means we never got a reading at all: no key, an outage, a dead network. The learner is
   *  told to try again rather than told their page could not be made out, because nobody looked. */
  | { kind: "unavailable"; message: string };

const UNAVAILABLE = "Nemesis couldn't read that page right now. Try again, or type your answer.";

export interface WrittenWorkCapture {
  busy: boolean;
  /** Send one image to be read. Resolves with the reading directly, and never rejects. */
  read: (blob: Blob) => Promise<WorkReading>;
}

export function useWrittenWorkCapture(): WrittenWorkCapture {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  // Invalidates a request that finishes after a newer one started — the same "still live" guard
  // `useHandwritingCapture` uses, and for the same reason: a learner who presses twice must not
  // have the first reply overwrite the second.
  const requestId = useRef(0);

  const read = useCallback(
    async (blob: Blob): Promise<WorkReading> => {
      const id = (requestId.current += 1);
      setBusy(true);
      const settle = (result: WorkReading): WorkReading => {
        if (id === requestId.current) setBusy(false);
        return result;
      };

      const token = session?.access_token ?? null;
      if (!token) return settle({ kind: "unavailable", message: UNAVAILABLE });

      try {
        const form = new FormData();
        form.append("file", blob, "work.png");
        const response = await fetch("/api/handwriting/work", {
          body: form,
          headers: { Authorization: `Bearer ${token}` },
          method: "POST",
        });
        const body = (await response.json().catch(() => null)) as
          | { error?: string; work?: WrittenWork }
          | null;
        if (!response.ok || !body?.work) {
          // A specific route error ("that image is too large") is more useful than the generic
          // one, and the route already writes them in the same plain voice this file uses.
          return settle({ kind: "unavailable", message: body?.error?.trim() || UNAVAILABLE });
        }
        return settle({ kind: "work", work: body.work });
      } catch {
        return settle({ kind: "unavailable", message: UNAVAILABLE });
      }
    },
    [session],
  );

  return { busy, read };
}
