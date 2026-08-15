"use client";

// Sending one drawn or photographed image to /api/handwriting/analyze and turning the reply into
// a CaptureOutcome — the network- and auth-touching half of the handwriting pad, kept out of the
// component the same way useCanvasDictation is kept out of canvas-composer.tsx. Neither has a
// test file for the same reason: both wrap a browser API (Web Speech there, fetch + FormData
// here) that this app's test runner cannot exercise without a DOM. The decision logic each of
// them calls into — composerControl, captureOutcome — is what actually gets tested.

import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import type { HandwritingObservation } from "@/lib/handwriting/types";

import { captureOutcome, type CaptureOutcome } from "./handwriting-pad-outcome";

export interface HandwritingCapture {
  busy: boolean;
  /** The last outcome, or null before anything has been sent. Kept for a caller that only wants
   *  to render current status; `analyze`'s own return value is the one to act on, since it is not
   *  subject to React's render timing the way this field is. */
  outcome: CaptureOutcome | null;
  /** Send one image to be read. Resolves with the outcome directly — never rejects, mirroring
   *  analyzeHandwriting's own "never throw" contract one layer up. */
  analyze: (blob: Blob, expectedElements?: readonly string[]) => Promise<CaptureOutcome>;
  reset: () => void;
}

export function useHandwritingCapture(): HandwritingCapture {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null);
  // Invalidates a request that finishes after a newer one started, or after the pad was reset —
  // the same "still live" guard StoredFigureOcclusion uses for a signed URL in flight.
  const requestId = useRef(0);

  const analyze = useCallback(
    async (blob: Blob, expectedElements?: readonly string[]): Promise<CaptureOutcome> => {
      const id = (requestId.current += 1);
      setBusy(true);
      setOutcome(null);
      const settle = (result: CaptureOutcome) => {
        if (id === requestId.current) {
          setOutcome(result);
          setBusy(false);
        }
        return result;
      };

      const token = session?.access_token ?? null;
      if (!token) return settle(captureOutcome(null));

      try {
        const form = new FormData();
        form.append("file", blob, "capture.png");
        if (expectedElements && expectedElements.length > 0) {
          form.append("expectedElements", JSON.stringify(expectedElements));
        }
        const response = await fetch("/api/handwriting/analyze", {
          body: form,
          headers: { Authorization: `Bearer ${token}` },
          method: "POST",
        });
        const body = (await response.json().catch(() => null)) as { observation?: unknown } | null;
        const observation = response.ok ? ((body?.observation as HandwritingObservation | undefined) ?? null) : null;
        return settle(captureOutcome(observation));
      } catch {
        return settle(captureOutcome(null));
      }
    },
    [session],
  );

  const reset = useCallback(() => {
    requestId.current += 1;
    setBusy(false);
    setOutcome(null);
  }, []);

  return { analyze, busy, outcome, reset };
}
