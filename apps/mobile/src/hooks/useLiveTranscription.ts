import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { applyRecognitionResult, emptyTranscript, type LiveTranscript } from "@/lib/recording";

// Long-form live transcription for the Record screen (lectures, study
// sessions). Same on-device SFSpeechRecognizer as chat dictation
// (useSpeechInput.ts) — no audio ever leaves the phone and no server minutes
// are billed — but recorder-grade: final utterances accumulate as paragraphs
// (lib/recording.ts), an elapsed clock runs, and when iOS ends a recognition
// task mid-recording (silence, task timeout) it is restarted automatically so
// a 40-minute lecture doesn't silently stop transcribing at minute three.

const RECOGNITION_OPTIONS = {
  lang: "en-US",
  interimResults: true,
  requiresOnDeviceRecognition: true,
  continuous: true,
} as const;

// Errors that mean "recognition cannot run at all" — everything else (e.g.
// no-speech during a quiet stretch) is transient and rides through the
// auto-restart in the "end" handler.
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

export type LiveTranscriptionStatus = "idle" | "recording" | "stopped" | "denied" | "error";

export function useLiveTranscription() {
  const [status, setStatus] = useState<LiveTranscriptionStatus>("idle");
  const [transcript, setTranscript] = useState<LiveTranscript>(emptyTranscript());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const statusRef = useRef<LiveTranscriptionStatus>("idle");
  const startedAtRef = useRef<number | null>(null);

  // Mirror status into a ref (outside render) so the native-event handlers
  // below always see the current value without re-subscribing.
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useSpeechRecognitionEvent("result", (event) => {
    if (statusRef.current !== "recording") return;
    const text = event.results?.[0]?.transcript;
    if (typeof text === "string") setTranscript((current) => applyRecognitionResult(current, text, event.isFinal === true));
  });

  useSpeechRecognitionEvent("end", () => {
    if (statusRef.current !== "recording") return;
    try {
      ExpoSpeechRecognitionModule.start(RECOGNITION_OPTIONS);
    } catch {
      setStatus("error");
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (statusRef.current !== "recording") return;
    const code = typeof event.error === "string" ? event.error : "";
    if (FATAL_ERRORS.has(code)) setStatus(code === "not-allowed" || code === "service-not-allowed" ? "denied" : "error");
  });

  // Elapsed clock derived from the wall-clock start so ticks can't drift.
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => {
      if (startedAtRef.current !== null) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const start = useCallback(async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus("denied");
        return false;
      }
      setTranscript(emptyTranscript());
      setElapsedSeconds(0);
      startedAtRef.current = Date.now();
      ExpoSpeechRecognitionModule.start(RECOGNITION_OPTIONS);
      setStatus("recording");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    // Order matters: leaving "recording" first keeps the resulting "end"
    // event from auto-restarting recognition.
    setStatus("stopped");
    if (startedAtRef.current !== null) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // best-effort — stopping an already-stopped session is harmless
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setTranscript(emptyTranscript());
    setElapsedSeconds(0);
    startedAtRef.current = null;
  }, []);

  // Leaving the screen mid-recording must not leave the mic running.
  useEffect(() => {
    return () => {
      statusRef.current = "idle";
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // best-effort
      }
    };
  }, []);

  return { status, transcript, elapsedSeconds, start, stop, reset };
}
