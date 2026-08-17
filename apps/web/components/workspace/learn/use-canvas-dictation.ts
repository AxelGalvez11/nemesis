"use client";

// Speaking an answer, as a first-class way to answer (§7, §72A).
//
// WHY THIS IS NOT THE CHAT COMPOSER'S DICTATION. The same capability already exists inside
// sessions/composer.tsx, but it is welded to that component's contenteditable, its attachment
// menu and its send button. Extracting it would mean editing the shipped chat composer to
// deliver a canvas feature, and the chat composer is the single most-used control in the
// product. This is the same technique — continuous Web Speech, with a second microphone opened
// purely to drive the waveform — kept to the part the canvas needs. Worth merging the two later,
// deliberately, rather than as a side effect of this work.
//
// 🔴 THE MICROPHONE IS OPENED TWICE ON PURPOSE. lib/workspace/mic-level.ts argues never to do
// this, and it is right about the recorder, where a second stream would meter audio other than
// the audio being captured. Dictation is the case that rule does not cover: the Web Speech API
// owns its microphone privately and exposes no stream, no node and no level, so there is
// nothing to read from it. Without a second stream there is no waveform at all.

import { useCallback, useEffect, useRef, useState } from "react";

import { publishMicLevel, resetMicLevel } from "@/lib/workspace/mic-level";

const METER_MS = 80;

type SpeechAlternative = { transcript?: string };
type SpeechResult = { readonly isFinal?: boolean; readonly 0?: SpeechAlternative };
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recogniser(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Whether this browser can listen at all, without mounting the hook.
 *
 * 🔴 EXPORTED SO ONE FACT HAS ONE ANSWER. Voice mode's "shall I open the microphone for you?"
 * question lives in the header and the microphone lives in the composer; both must agree, and two
 * independent feature checks are two things that can disagree after a browser update. It is a
 * property of the window, not of either component, so neither owns it.
 */
export function speechRecognitionSupported(): boolean {
  return recogniser() !== null;
}

export interface Dictation {
  /** False in browsers with no Web Speech API — Firefox, most notably. The caller must still
   *  offer typing, so this hides the microphone rather than disabling the answer. */
  supported: boolean;
  listening: boolean;
  /** Everything heard this session: settled text plus the phrase currently in flight. */
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useCanvasDictation(): Dictation {
  const [supported] = useState(() => recogniser() !== null);
  const [listening, setListening] = useState(false);
  const [settled, setSettled] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const engine = useRef<SpeechRecognitionLike | null>(null);
  const wanted = useRef(false);
  const meter = useRef<{ context: AudioContext; stream: MediaStream; timer: number } | null>(null);

  const closeMeter = useCallback(() => {
    const open = meter.current;
    meter.current = null;
    if (!open) return;
    window.clearInterval(open.timer);
    for (const track of open.stream.getTracks()) track.stop();
    void open.context.close().catch(() => {});
    resetMicLevel();
  }, []);

  const openMeter = useCallback(async () => {
    if (meter.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop may have been pressed while the permission prompt was still up.
      if (!wanted.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1_024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let squares = 0;
        for (const sample of samples) squares += sample * sample;
        // The same RMS x 4 the recorder publishes, so one waveform can read either source.
        publishMicLevel(Math.min(1, Math.sqrt(squares / Math.max(1, samples.length)) * 4));
      }, METER_MS);
      meter.current = { context, stream, timer };
    } catch {
      // No waveform, but dictation itself may well still work: the Web Speech API holds its own
      // permission. Losing the animation is not a reason to refuse to listen.
    }
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    const active = engine.current;
    engine.current = null;
    if (active) {
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      try {
        active.stop();
      } catch {
        // Already stopped.
      }
    }
    closeMeter();
    setListening(false);
    // Whatever was mid-phrase when they stopped is still something they said.
    setInterim((current) => {
      if (current.trim()) setSettled((done) => `${done}${done ? " " : ""}${current.trim()}`);
      return "";
    });
  }, [closeMeter]);

  const start = useCallback(() => {
    const Engine = recogniser();
    if (!Engine || wanted.current) return;
    setError(null);
    wanted.current = true;

    const active = new Engine();
    active.continuous = true;
    active.interimResults = true;
    active.lang = navigator.language || "en-US";

    active.onresult = (event) => {
      let flushed = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const said = result?.[0]?.transcript ?? "";
        if (!said) continue;
        if (result?.isFinal) flushed += said;
        else pending += said;
      }
      if (flushed.trim()) {
        setSettled((current) => `${current}${current ? " " : ""}${flushed.trim()}`);
      }
      setInterim(pending.trim());
    };

    active.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary: someone paused, or pressed stop. Only a real
      // refusal is worth telling them about, because only that one they can act on.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Nemesis needs microphone access to hear you. You can type instead.");
        stop();
      }
    };

    // Continuous recognition still ends itself — on a long pause, and on some browsers every
    // minute or so. While the learner still wants to talk, start it again; otherwise a mid-answer
    // silence would end dictation without anyone asking for it.
    active.onend = () => {
      if (!wanted.current) return;
      try {
        active.start();
      } catch {
        setListening(false);
      }
    };

    engine.current = active;
    try {
      active.start();
      setListening(true);
      void openMeter();
    } catch {
      wanted.current = false;
      engine.current = null;
      setError("Nemesis couldn't start listening. You can type instead.");
    }
  }, [openMeter, stop]);

  const reset = useCallback(() => {
    setSettled("");
    setInterim("");
    setError(null);
  }, []);

  // A component unmounted mid-answer would leave the microphone open and the recogniser running
  // with nowhere to put its words.
  useEffect(() => stop, [stop]);

  return {
    supported,
    listening,
    transcript: [settled, interim].filter(Boolean).join(" "),
    error,
    start,
    stop,
    reset,
  };
}
