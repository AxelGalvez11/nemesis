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
  // Set the instant CANCEL is pressed, cleared by the next start().
  //
  // This is the difference between cancelling and finishing. `stop()` is
  // documented to "attempt to return a final result through the result event",
  // and on iOS the final result only arrives AFTER recognition has stopped — so
  // a cancel that merely stopped the engine got one more result a beat later,
  // which wrote the abandoned sentence back into the composer. Cancel and Done
  // produced the same text. `abort()` is the API that skips the final result;
  // the flag is the belt to its braces, because the event has already been
  // observed to arrive late and the composer must not take it either way.
  const cancelledRef = useRef(false);
  // Whether THIS hook started the session that is currently running.
  //
  // 🔴 THE EVENTS BELOW ARE GLOBAL. `useSpeechRecognitionEvent` subscribes to the
  // one speech module on the phone, not to a session this hook owns — so it hears
  // every result from whoever started recognition. The composer is mounted for the
  // whole chat screen, INCLUDING while the recorder is running (chat.tsx renders
  // <Composer> outside the record-mode branch, because the record controls live in
  // the composer itself). So a lecture recording, which drives the same engine
  // through useLiveTranscription, was being typed word by word into the chat box
  // behind it — and the student got their whole lecture sitting in the prompt
  // field as if they had dictated it (owner 2026-07-29: "i tapped the record
  // button and once recording finished it dumped the transcript into the chat
  // composer").
  //
  // `cancelledRef` did NOT cover this. It only suppresses a late final result
  // after dictation was explicitly cancelled; when dictation was never started at
  // all it is false, which is exactly the state that let every recorder result
  // through. A flag for "I cancelled" cannot answer "was this mine?".
  //
  // A ref, not the `listening` state, because these handlers are registered once
  // and would close over a stale value.
  const listeningRef = useRef(false);

  useSpeechRecognitionEvent("result", (event) => {
    if (!listeningRef.current || cancelledRef.current) return;
    const next = event.results?.[0]?.transcript;
    if (typeof next === "string") {
      setTranscript(next);
      onResultRef.current(next);
    }
  });
  useSpeechRecognitionEvent("volumechange", (event) => {
    // Gated for the same reason, and it is not cosmetic: the recorder publishes
    // its own levels to the same channel, so an ungated composer would fight it
    // for the waveform the student is watching while recording.
    if (!listeningRef.current) return;
    publishMicLevel(normalizeMicLevel(typeof event.value === "number" ? event.value : 0));
  });
  useSpeechRecognitionEvent("end", () => {
    // Without the gate, the RECORDER's end event reset the composer's mic level —
    // clearing a waveform that belongs to a session still in progress.
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setListening(false);
    resetMicLevel();
  });
  useSpeechRecognitionEvent("error", () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setListening(false);
    resetMicLevel();
  });

  const start = useCallback(async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return false;
      cancelledRef.current = false;
      setTranscript("");
      resetMicLevel();
      // Claim the session BEFORE starting the engine — results are delivered on
      // the module's own schedule and the first one must not arrive to a hook
      // that has not yet admitted it is listening.
      listeningRef.current = true;
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
      listeningRef.current = false;
      setListening(false);
      resetMicLevel();
      return false;
    }
  }, []);

  /** Finish: ask the engine for its best final transcript and keep it. */
  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // best-effort — stopping an already-stopped session is harmless
    }
    // listeningRef DELIBERATELY STAYS TRUE HERE. iOS delivers the best final
    // transcript AFTER recognition stops (the same timing cancelledRef exists
    // for), so clearing our claim on the session now would make the gate above
    // reject the one result the student most wants — Done would keep less text
    // than the interim display had already shown them. The `end` event clears it
    // a beat later, which is the correct moment: the session is over by then.
    setListening(false);
    resetMicLevel();
  }, []);

  /** Throw it away. Not the same call as stop(): see cancelledRef above. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // Cleared here rather than left to `end`, the opposite of stop() above:
    // abort() is not guaranteed to emit `end`, and a claim that is never
    // released would silently re-open the bug this gate closes — the composer
    // would start accepting the recorder's results again. cancelledRef already
    // discards any late result, so releasing early costs nothing.
    listeningRef.current = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // best-effort — the flag alone already protects the composer
    }
    setTranscript("");
    setListening(false);
    resetMicLevel();
  }, []);

  return { cancel, listening, start, stop, transcript };
}
