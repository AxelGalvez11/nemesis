import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { isNemesisAsrAvailable, NemesisAsr } from "../../modules/nemesis-asr";
import { normalizeRmsLevel, publishMicLevel, resetMicLevel } from "@/lib/mic-level";
import { emptyTranscript, type LiveTranscript } from "@/lib/recording";
import type { LiveTranscriptionStatus } from "./useLiveTranscription";

// On-device Parakeet transcription for the Record screen. Deliberately returns
// the SAME shape as useLiveTranscription so the recorder can hold one or the
// other without forking any call site — see lib/asr-engine.ts for which one is
// chosen and why.
//
// The difference that matters: Apple's recognizer emits per-utterance results
// that accumulate into paragraphs, while Parakeet hands back the WHOLE
// transcript so far on every update. So the growing text lives in `interim`
// and is committed to `finals` once, at stop.

export function useParakeetTranscription() {
  const [status, setStatus] = useState<LiveTranscriptionStatus>("idle");
  const [transcript, setTranscript] = useState<LiveTranscript>(emptyTranscript());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioUris, setAudioUris] = useState<string[]>([]);
  const statusRef = useRef<LiveTranscriptionStatus>("idle");
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Native event streams. Subscribed once and inert until start() runs, so a
  // build where the module is absent simply never subscribes.
  useEffect(() => {
    if (!NemesisAsr) return;
    const partial = NemesisAsr.addListener("onPartialTranscript", (event) => {
      if (statusRef.current !== "recording") return;
      setTranscript({ finals: [], interim: event.transcript });
    });
    // Published rather than held in state — same reasoning as the Apple path:
    // this fires many times a second and would re-render the whole screen.
    const level = NemesisAsr.addListener("onAudioLevel", (event) => {
      if (statusRef.current !== "recording") return;
      publishMicLevel(normalizeRmsLevel(event.level));
    });
    return () => {
      partial.remove();
      level.remove();
    };
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => {
      if (startedAtRef.current !== null) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const start = useCallback(async () => {
    if (!NemesisAsr || !isNemesisAsrAvailable()) {
      setStatus("error");
      return false;
    }
    try {
      // Reuses the existing permission request, which covers the microphone.
      // A mic-only prompt would be tidier — Parakeet needs no speech-recognition
      // entitlement — but sharing one path keeps a single permission story.
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus("denied");
        return false;
      }
      setTranscript(emptyTranscript());
      setElapsedSeconds(0);
      setAudioUris([]);
      startedAtRef.current = Date.now();
      // start() also downloads and loads the model on first run, so this can
      // take a while the very first time. The caller shows the status line.
      await NemesisAsr.start();
      setStatus("recording");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, []);

  const stop = useCallback(async () => {
    setStatus("stopped");
    resetMicLevel();
    if (startedAtRef.current !== null) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    if (!NemesisAsr) return;
    try {
      const result = await NemesisAsr.stop();
      // Commit the accumulated text once, so the saved transcript matches what
      // was on screen rather than depending on the last partial having landed.
      if (result.transcript.trim()) setTranscript({ finals: [result.transcript.trim()], interim: "" });
      if (result.audioPath) setAudioUris([result.audioPath]);
    } catch {
      // The on-screen transcript stands — losing the tail beats losing the lot.
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    resetMicLevel();
    setTranscript(emptyTranscript());
    setElapsedSeconds(0);
    setAudioUris([]);
    startedAtRef.current = null;
  }, []);

  // Leaving the screen mid-recording must not leave the mic running.
  useEffect(() => {
    return () => {
      statusRef.current = "idle";
      resetMicLevel();
      void NemesisAsr?.stop().catch(() => undefined);
    };
  }, []);

  return { status, transcript, elapsedSeconds, audioUris, start, stop, reset };
}
