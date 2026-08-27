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

import {
  type DictationEngine,
  dictationLanguage,
  engineFor,
  MAX_DICTATION_SECONDS,
  pickDictationMime,
} from "@/lib/voice/dictation-engine";
import { joinSpoken, readHeard } from "@/lib/voice/dictation-transcript";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
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
  // 🔴 `resultIndex` IS ON THE REAL EVENT AND IS DELIBERATELY NOT ON THIS TYPE. Reading it is what
  // made every dictated sentence arrive twice (see the handler, and `readHeard`), so the shape this
  // file consumes does not offer it. Somebody who wants it back has to add it, and will read this.
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
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
 * Whether `MediaRecorder` and a microphone are both reachable — the xAI lane's requirement.
 *
 * 🔴 `navigator.mediaDevices` IS UNDEFINED IN AN INSECURE CONTEXT, NOT MERELY UNPERMITTED, and the
 * optional chain is what keeps that a `false` rather than a TypeError. A page served over plain
 * http (anything but localhost) has no microphone API at all, so the engine falls to "none" and the
 * button does not appear — which is right: a microphone that throws on press is worse than none.
 */
function canRecord(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as { MediaRecorder?: unknown }).MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Which engine this browser will actually use. See `lib/voice/dictation-engine.ts`. */
export function dictationEngine(): DictationEngine {
  return engineFor({ mediaRecorder: canRecord(), speechRecognition: recogniser() !== null });
}

/**
 * Whether this browser can listen at all, without mounting the hook.
 *
 * 🔴 EXPORTED SO ONE FACT HAS ONE ANSWER. Voice mode's "shall I open the microphone for you?"
 * question lives in the header and the microphone lives in the composer; both must agree, and two
 * independent feature checks are two things that can disagree after a browser update. It is a
 * property of the window, not of either component, so neither owns it.
 *
 * 🔴🔴 IT NO LONGER MEANS "HAS THE WEB SPEECH API", AND THE RENAME IS THE WHOLE POINT (owner
 * 2026-08-22). Firefox ships no recogniser, so this returned false there and the microphone was not
 * disabled — it was ABSENT. "Your browser cannot do this" and "Nemesis cannot do this" look
 * identical from the outside, and the second one is what a learner concluded. There is now a second
 * engine behind it, so the honest question is whether dictation works at all.
 */
export function speechRecognitionSupported(): boolean {
  return dictationEngine() !== "none";
}

export interface Dictation {
  /** False in browsers with no Web Speech API — Firefox, most notably. The caller must still
   *  offer typing, so this hides the microphone rather than disabling the answer. */
  supported: boolean;
  listening: boolean;
  /**
   * True while a recorded clip is being turned into words.
   *
   * 🔴 ALWAYS FALSE ON THE BROWSER LANE, WHICH IS THE HONEST ANSWER RATHER THAN AN OMISSION. The
   * Web Speech API writes as it hears, so there is no gap to report. On the xAI lane there is one
   * — a real wait, after the learner has stopped talking — and a microphone that goes quiet with
   * nothing on screen reads as a control that ate the sentence.
   */
  transcribing: boolean;
  /** Everything heard this session: settled text plus the phrase currently in flight. */
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useCanvasDictation(): Dictation {
  const [lane] = useState<DictationEngine>(() => dictationEngine());
  const [supported] = useState(() => lane !== "none");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [settled, setSettled] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const engine = useRef<SpeechRecognitionLike | null>(null);
  /**
   * The phrase still in flight, mirrored outside React.
   *
   * 🔴🔴 THIS IS HALF OF THE "EVERY DICTATED SENTENCE WENT OUT TWICE" DEFECT (2026-08-26). `stop`
   * used to reach for the in-flight phrase the only way it had, through the state itself:
   *
   *     setInterim((current) => {
   *       if (current.trim()) setSettled((done) => …);   // ← a WRITE, inside an updater
   *       return "";
   *     });
   *
   * A state updater must be a pure function of its argument, and React is free to run one more than
   * once for a single update — it evaluates eagerly to see whether it can skip the render, then
   * again while rendering, and re-runs updaters whenever a render is thrown away and restarted.
   * Every one of those runs appended the sentence again. Nothing about it is visible in the diff:
   * it reads like an assignment.
   *
   * 🔴 A REF IS NOT A CACHE HERE, IT IS THE ONLY HONEST READ. `stop` is called from a click, a
   * keyup, an unmount and an error handler, none of which are renders, so there is no "current
   * state" available to them except one kept deliberately. Writing both states plainly from the ref
   * also makes a second `stop` harmless: the ref is empty by then, so nothing is appended twice.
   */
  const pendingPhrase = useRef("");
  /**
   * How many results of the CURRENT recogniser run are already written down. See `readHeard`.
   *
   * 🔴 RESET WHEN A RUN STARTS, AND NOWHERE ELSE. `continuous` recognition ends itself on a pause
   * and restarts below, and each run begins a fresh result list at index zero, so a count carried
   * across a restart would silently swallow the first phrase of every run after the first.
   */
  const written = useRef(0);
  const wanted = useRef(false);
  const meter = useRef<{ context: AudioContext; stream: MediaStream; timer: number } | null>(null);
  /** The recorder, its pieces, and when it started — the xAI lane only. */
  const recorder = useRef<MediaRecorder | null>(null);
  const pieces = useRef<Blob[]>([]);
  const openedAt = useRef(0);
  /** Bumped by every stop, so a clip still uploading knows it has been superseded or abandoned. */
  const clip = useRef(0);
  /** The hard stop. See `MAX_DICTATION_SECONDS`. */
  const cap = useRef<number | null>(null);
  const alive = useRef(true);

  const closeMeter = useCallback(() => {
    const open = meter.current;
    meter.current = null;
    if (!open) return;
    window.clearInterval(open.timer);
    for (const track of open.stream.getTracks()) track.stop();
    void open.context.close().catch(() => {});
    resetMicLevel();
  }, []);

  /**
   * Open the microphone for the waveform, and hand the stream back.
   *
   * 🔴 ONE STREAM, SHARED WITH THE RECORDER. `lib/workspace/mic-level.ts` argues never to open the
   * microphone twice, and it is right; the Web Speech API is the exception it does not cover,
   * because that API owns its microphone privately and exposes nothing to read. The xAI lane has no
   * such excuse — it records from exactly the stream the meter is already animating.
   */
  const openMeter = useCallback(async (): Promise<MediaStream | null> => {
    if (meter.current) return meter.current.stream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop may have been pressed while the permission prompt was still up.
      if (!wanted.current) {
        for (const track of stream.getTracks()) track.stop();
        return null;
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
      return stream;
    } catch {
      // No waveform, but dictation itself may well still work on the browser lane: the Web Speech
      // API holds its own permission. Losing the animation is not a reason to refuse to listen.
      // 🔴 THE xAI LANE CANNOT SHRUG THIS OFF, and its caller checks for null — there the stream is
      // not decoration, it is the recording.
      return null;
    }
  }, []);

  /**
   * Send the recorded clip and put what came back into the transcript.
   *
   * 🔴 EVERY FAILURE IS NAMED IN THE LEARNER'S TERMS, AND EVERY ONE ENDS WITH "you can type
   * instead". A microphone that swallows a spoken sentence and says nothing is the worst version of
   * this feature: the learner has already done the work of composing out loud, and silence tells
   * them neither what happened nor what to do next.
   */
  const sendClip = useCallback(async (ticket: number) => {
    const parts = pieces.current;
    pieces.current = [];
    const type = recorder.current?.mimeType || parts[0]?.type || "audio/webm";
    recorder.current = null;
    const blob = new Blob(parts, { type });
    // Nothing was captured — a permission revoked mid-answer, or a press so short no frame landed.
    // Not an error worth a line of red: there is nothing to transcribe and nothing was lost.
    if (blob.size === 0) return;

    const seconds = Math.max(1, Math.round((Date.now() - openedAt.current) / 1000));
    setTranscribing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (alive.current) setError("Sign in to use dictation. You can type instead.");
        return;
      }
      const query = new URLSearchParams({
        language: dictationLanguage(typeof navigator === "undefined" ? undefined : navigator.language),
        seconds: String(Math.min(MAX_DICTATION_SECONDS, seconds)),
      });
      const res = await fetch(`${supabaseUrl}/functions/v1/nemesis-dictate?${query}`, {
        body: blob,
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": type,
        },
        method: "POST",
      });
      // Abandoned while it was in flight — the learner cleared the composer, or left the canvas.
      if (!alive.current || clip.current !== ticket) return;
      if (!res.ok) {
        setError(
          res.status === 402 ? "You have used this month's voice time. You can type instead."
            : res.status === 503 ? "Dictation is not set up yet. You can type instead."
            : res.status === 422 ? "Nothing could be made out. Try again, or type instead."
            : "Dictation is unavailable right now. You can type instead.",
        );
        return;
      }
      const body = (await res.json().catch(() => null)) as { text?: unknown } | null;
      const heard = typeof body?.text === "string" ? body.text.trim() : "";
      if (!alive.current || clip.current !== ticket) return;
      if (!heard) {
        setError("Nothing could be made out. Try again, or type instead.");
        return;
      }
      // Appended, not replaced: someone may dictate twice into the same answer, exactly as the
      // browser lane accumulates its own final phrases.
      setSettled((current) => joinSpoken(current, heard));
    } catch {
      if (alive.current && clip.current === ticket) {
        setError("Dictation is unavailable right now. You can type instead.");
      }
    } finally {
      if (alive.current) setTranscribing(false);
    }
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    clip.current += 1;
    if (cap.current !== null) {
      window.clearTimeout(cap.current);
      cap.current = null;
    }
    // 🔴 THE RECORDER IS STOPPED, NOT DISCARDED. Its `onstop` is what uploads the clip, so tearing
    // it down here without letting that fire would throw away the sentence the learner just spoke.
    const taping = recorder.current;
    if (taping && taping.state !== "inactive") {
      try {
        taping.stop();
      } catch {
        // Already stopped.
      }
    }
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
    //
    // 🔴🔴 READ FROM THE REF AND WRITE BOTH STATES PLAINLY. This was one `setInterim` updater with a
    // `setSettled` inside it, and that is why a dictated sentence arrived twice: React may run an
    // updater more than once per update, and each run appended the phrase again. See
    // `pendingPhrase` above. Clearing the ref FIRST is what makes a second `stop` a no-op.
    const trailing = pendingPhrase.current.trim();
    pendingPhrase.current = "";
    written.current = 0;
    setInterim("");
    if (trailing) setSettled((done) => joinSpoken(done, trailing));
  }, [closeMeter]);

  const start = useCallback(() => {
    if (wanted.current) return;

    // 🔴🔴 THE xAI LANE, AND IT RUNS ONLY WHERE THE BROWSER HAS NOTHING (owner 2026-08-22: keep the
    // browser recogniser, add xAI behind it). No interim words here — the clip is transcribed after
    // it ends — which is exactly why it is the fallback and not the default: nothing bought with a
    // round trip beats words appearing as you say them.
    if (lane === "xai") {
      setError(null);
      wanted.current = true;
      const ticket = clip.current;
      void (async () => {
        const stream = await openMeter();
        if (!wanted.current || clip.current !== ticket) return;
        if (!stream) {
          wanted.current = false;
          setError("Nemesis needs microphone access to hear you. You can type instead.");
          return;
        }
        try {
          const mime = pickDictationMime((type) => MediaRecorder.isTypeSupported(type));
          // An empty string means "let the browser choose", which is a legitimate answer: every
          // engine has a default it can definitely write, and forcing one it refuses produces a
          // zero-byte clip.
          const taping = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          pieces.current = [];
          taping.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) pieces.current.push(event.data);
          };
          taping.onstop = () => void sendClip(clip.current);
          recorder.current = taping;
          openedAt.current = Date.now();
          taping.start();
          setListening(true);
          // 🔴 A HARD STOP, BECAUSE THIS LANE SPENDS MONEY AND THE OTHER ONE DOES NOT. The browser
          // recogniser can be left running for an hour and cost nothing; a recorder left open in a
          // pocket is a clip the server will refuse and an allowance quietly drawn down. Stopping
          // it here also means the learner GETS the two minutes they spoke, rather than a 413.
          cap.current = window.setTimeout(() => stop(), MAX_DICTATION_SECONDS * 1_000);
        } catch {
          wanted.current = false;
          setError("Nemesis couldn't start listening. You can type instead.");
        }
      })();
      return;
    }

    const Engine = recogniser();
    if (!Engine) return;
    setError(null);
    wanted.current = true;

    const active = new Engine();
    active.continuous = true;
    active.interimResults = true;
    active.lang = navigator.language || "en-US";

    // 🔴🔴 `event.resultIndex` IS DELIBERATELY NOT READ, AND THAT IS THE OTHER HALF OF THE DOUBLING.
    // This loop used to start at `resultIndex` and append every final it found, which is what every
    // Web Speech example does. It is correct only while that index is strictly ahead of everything
    // already consumed, and Chrome does not promise it: with `continuous` and `interimResults` both
    // on, an event carrying interim words for the NEXT phrase can arrive pointing back at the final
    // one before it. `readHeard` counts instead, so a result is written down once and never again.
    active.onresult = (event) => {
      const heard = readHeard({
        results: Array.from({ length: event.results.length }, (_unused, index) => {
          const result = event.results[index];
          return { isFinal: result?.isFinal, transcript: result?.[0]?.transcript ?? "" };
        }),
        settledCount: written.current,
      });
      written.current = heard.settledCount;
      if (heard.settled) setSettled((current) => joinSpoken(current, heard.settled));
      pendingPhrase.current = heard.pending;
      setInterim(heard.pending);
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
        // 🔴 A NEW RUN, SO A NEW RESULT LIST STARTING AT ZERO. Carrying the count across would make
        // `readHeard` skip the first phrase of every run after the first.
        written.current = 0;
        active.start();
      } catch {
        setListening(false);
      }
    };

    engine.current = active;
    try {
      written.current = 0;
      pendingPhrase.current = "";
      active.start();
      setListening(true);
      void openMeter();
    } catch {
      wanted.current = false;
      engine.current = null;
      setError("Nemesis couldn't start listening. You can type instead.");
    }
  }, [lane, openMeter, sendClip, stop]);

  const reset = useCallback(() => {
    // 🔴 THE MIRROR GOES WITH THE STATE. A `pendingPhrase` left behind by a discarded capture would
    // be appended by the NEXT `stop`, which is the doubling bug wearing a different hat.
    pendingPhrase.current = "";
    written.current = 0;
    setSettled("");
    setInterim("");
    setError(null);
  }, []);

  // A component unmounted mid-answer would leave the microphone open and the recogniser running
  // with nowhere to put its words.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  return {
    supported,
    listening,
    transcribing,
    transcript: joinSpoken(settled, interim),
    error,
    start,
    stop,
    reset,
  };
}
