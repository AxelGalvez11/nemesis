import { useCallback, useEffect, useRef, useState } from "react";
import { requestLiveNotes } from "@/api/chat";
import { mergeLiveNotes, shouldRequestLiveNotes } from "@/lib/live-notes";

// Live AI notes for the Record screen — the phone half of web's recorder
// notes panel. While recording, a light timer watches the growing on-device
// transcript and, when lib/live-notes.ts's gate opens (enough text, enough
// growth, cooldown elapsed, nothing in flight), spends one metered
// deepseek-chat call to distill fresh bullets. Every failure path — offline,
// out of tokens, junk reply — is silent: the recorder works fine with the
// panel empty, and the next interval simply tries again.

const TICK_MS = 5_000;

export function useLiveNotes(uid: string | null, transcript: string, active: boolean) {
  const [notes, setNotes] = useState<string[]>([]);
  // Surfaced so the panel can say it's working. Without it, the stretch before
  // the first note came back was indistinguishable from the feature being
  // broken — which is exactly how it was reported.
  const [writing, setWriting] = useState(false);
  const notesRef = useRef<string[]>([]);
  const transcriptRef = useRef(transcript);
  const inFlightRef = useRef(false);
  const lastAtRef = useRef(0);
  const lastLengthRef = useRef(0);

  // Mirrored into refs (outside render) so the interval callback always sees
  // current values without re-arming the timer — same pattern as
  // useLiveTranscription's statusRef.
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (!active || !uid) return;
    const timer = setInterval(() => {
      const text = transcriptRef.current;
      if (
        !shouldRequestLiveNotes({
          inFlight: inFlightRef.current,
          lastAt: lastAtRef.current,
          lastLength: lastLengthRef.current,
          now: Date.now(),
          transcriptLength: text.length,
        })
      ) {
        return;
      }
      inFlightRef.current = true;
      setWriting(true);
      lastAtRef.current = Date.now();
      lastLengthRef.current = text.length;
      requestLiveNotes(uid, text, notesRef.current)
        .then((fresh) => {
          if (fresh) setNotes((current) => mergeLiveNotes(current, fresh));
        })
        .catch(() => {
          // requestLiveNotes never throws by contract; belt and suspenders
        })
        .finally(() => {
          inFlightRef.current = false;
          setWriting(false);
        });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, uid]);

  // A fresh recording starts with a clean board.
  const reset = useCallback(() => {
    setNotes([]);
    setWriting(false);
    lastAtRef.current = 0;
    lastLengthRef.current = 0;
  }, []);

  return { notes, reset, writing };
}
