import { useCallback, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

// Voice dictation for the chat composer (owner: a mic to speak into the chat bar).
// iOS SFSpeechRecognizer via expo-speech-recognition, run ON-DEVICE (privacy — no
// audio leaves the phone; requires iOS 16.4+). `onResult` fires with the live
// (interim) transcript so the composer can stream it straight into the input; the
// caller decides how to merge it with any text already typed.
export function useSpeechInput(onResult: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (typeof transcript === "string") onResultRef.current(transcript);
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", () => setListening(false));

  const start = useCallback(async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return false;
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        requiresOnDeviceRecognition: true,
        continuous: true,
      });
      setListening(true);
      return true;
    } catch {
      setListening(false);
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
  }, []);

  return { listening, start, stop };
}
