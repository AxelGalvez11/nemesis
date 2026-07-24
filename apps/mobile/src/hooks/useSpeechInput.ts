import { useCallback, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { normalizeMicLevel, publishMicLevel, resetMicLevel } from "@/lib/mic-level";

// Voice dictation for the chat composer (owner: a mic to speak into the chat bar).
// iOS SFSpeechRecognizer via expo-speech-recognition, run ON-DEVICE (privacy — no
// audio leaves the phone; requires iOS 16.4+). `onResult` fires with the live
// (interim) transcript so the composer can stream it straight into the input; the
// caller decides how to merge it with any text already typed.
//
// VOLUME IS PUBLISHED TOO (owner 2026-07-24: "dictation should show like ChatGPT
// or whisper flow"). Both of those answer you with a live waveform while you
// speak, and this hook already sits on the one event that can drive one — the
// engine's own `volumechange`. It went nowhere before, so the composer had
// nothing to draw and dictation was a mic button that quietly changed colour.
// Levels go to lib/mic-level.ts, exactly as useLiveTranscription (the recorder's
// hook) already does, so LiveWaveform works here with no changes at all.
export function useSpeechInput(onResult: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  // The newest interim transcript, for the listening bar to show as you talk.
  const [transcript, setTranscript] = useState("");
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useSpeechRecognitionEvent("result", (event) => {
    const next = event.results?.[0]?.transcript;
    if (typeof next === "string") {
      setTranscript(next);
      onResultRef.current(next);
    }
  });
  useSpeechRecognitionEvent("volumechange", (event) => {
    publishMicLevel(normalizeMicLevel(typeof event.value === "number" ? event.value : 0));
  });
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    resetMicLevel();
  });
  useSpeechRecognitionEvent("error", () => {
    setListening(false);
    resetMicLevel();
  });

  const start = useCallback(async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return false;
      setTranscript("");
      resetMicLevel();
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        requiresOnDeviceRecognition: true,
        continuous: true,
        // Ask for the volume events the waveform is drawn from.
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      });
      setListening(true);
      return true;
    } catch {
      setListening(false);
      resetMicLevel();
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // best-effort — stopping an already-stopped session is harmless
    }
    setListening(false);
    resetMicLevel();
  }, []);

  return { listening, start, stop, transcript };
}
