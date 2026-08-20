"use client";

// Recording one attempt at saying something, and finding out how it went (§47).
//
// 🔴 THIS IS THE PIECE THAT DID NOT EXIST, AND ITS ABSENCE WAS THE REAL BLOCKER. `useCanvasDictation`
// has always opened a microphone — but the Web Speech API owns its stream privately and hands back
// only words, and the SECOND stream that hook opens exists to drive a waveform and is thrown away
// eighty milliseconds at a time. So Nemesis has never had a recording of a learner speaking. No
// assessment engine, Azure's included, can score audio nobody kept.
//
// 🔴 A SEPARATE HOOK RATHER THAN A FLAG ON THE DICTATION ONE, BECAUSE THE TWO WANT OPPOSITE THINGS.
// Dictation is continuous, restarts itself on silence, and runs for as long as the learner is
// composing. An attempt is one sentence with a beginning and an end, and its whole value is that the
// audio boundaries match the reference text. Bolting a recorder onto a hook that restarts itself
// would produce a file whose contents nobody could describe.
//
// 🔴 THE AUDIO IS NOT STORED AND NOT UPLOADED ANYWHERE EXCEPT THE ASSESSOR. It lives in a blob in
// this component, goes to `/api/speech/pronunciation`, and is released when the attempt ends or the
// component unmounts. Nothing writes it to storage, nothing puts it in `learner_evidence`, and
// keeping it would be a privacy decision nobody has made — a recording of a person's voice is not
// the same object as a transcript of what they said.
//
// 🔴 NO TEST FILE, FOR THE REASON `use-canvas-speech.ts` GIVES: it wraps `MediaRecorder` and
// `getUserMedia`, which this runner cannot exercise without a DOM. Everything it decides —
// normalisation, diagnosis, comparison — is pure and tested in `lib/speech`.

import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { PronunciationEvidence, PronunciationGap } from "@/lib/learn/pronunciation-evidence";
import type { AttemptComparison } from "@/lib/speech/pronunciation-progress";
import type { Diagnosis } from "@/lib/speech/pronunciation-diagnosis";
import { publishMicLevel, resetMicLevel } from "@/lib/workspace/mic-level";

/** Why an attempt produced nothing. The provider's gaps, plus the two only a browser can hit. */
export type AttemptFailure =
  | PronunciationGap
  | "not-signed-in"
  /** The learner denied the microphone, or the browser has none. */
  | "microphone-unavailable"
  /** This browser cannot record in any format the assessor accepts. */
  | "recording-unsupported";

export interface AttemptResult {
  readonly evidence: PronunciationEvidence;
  readonly diagnosis: Diagnosis;
  /** Present only when this attempt followed another one. */
  readonly comparison: AttemptComparison | null;
}

export interface PronunciationAttempt {
  readonly supported: boolean;
  readonly recording: boolean;
  /** True while the assessor has the audio. */
  readonly assessing: boolean;
  readonly result: AttemptResult | null;
  readonly failure: AttemptFailure | null;
  /** How many attempts have been made at the current target. Resets with `reset`. */
  readonly attempts: number;
  /** Open the microphone. `text` and `locale` are what the attempt will be scored against. */
  readonly start: (target: { text: string; locale: string }) => Promise<void>;
  /** Stop, send, and score. Resolves when the result is in. */
  readonly stop: () => Promise<void>;
  /** Throw away the attempt in progress without scoring it. */
  readonly cancel: () => void;
  /** Start a new target: clears the result and the comparison chain. */
  readonly reset: () => void;
}

/**
 * What the browser will record in, in the order the assessor prefers.
 *
 * 🔴 SAFARI IS THE ONE THAT FAILS HERE AND IT FAILS HONESTLY. `MediaRecorder` on Safari produces
 * MP4/AAC, which Azure's REST endpoint does not accept, so `supported` comes back false and the
 * surface offers typing instead of a control that would 400. Pretending otherwise would put a
 * record button in front of a learner it can never work for.
 */
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

const METER_MS = 80;

export function usePronunciationAttempt(): PronunciationAttempt {
  const [supported] = useState(() => typeof window !== "undefined" && pickMimeType() !== null);
  const [recording, setRecording] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [failure, setFailure] = useState<AttemptFailure | null>(null);
  const [attempts, setAttempts] = useState(0);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const target = useRef<{ text: string; locale: string } | null>(null);
  /** The previous attempt, so the next one can be compared with it. Never leaves the component. */
  const previous = useRef<PronunciationEvidence | null>(null);
  const targetedWords = useRef<string[]>([]);
  const meter = useRef<{ context: AudioContext; timer: number } | null>(null);
  const alive = useRef(true);

  const release = useCallback(() => {
    const open = meter.current;
    meter.current = null;
    if (open) {
      window.clearInterval(open.timer);
      void open.context.close().catch(() => {});
      resetMicLevel();
    }
    const active = recorder.current;
    recorder.current = null;
    if (active && active.state !== "inactive") {
      active.ondataavailable = null;
      active.onstop = null;
      try {
        active.stop();
      } catch {
        // Already stopped.
      }
    }
    const open2 = stream.current;
    stream.current = null;
    if (open2) for (const track of open2.getTracks()) track.stop();
    chunks.current = [];
  }, []);

  const start = useCallback(
    async (wanted: { text: string; locale: string }) => {
      if (recorder.current) return;
      const mimeType = pickMimeType();
      if (!mimeType) {
        setFailure("recording-unsupported");
        return;
      }
      setFailure(null);
      setResult(null);
      target.current = wanted;

      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          // 🔴 THE CONSTRAINTS MATTER FOR THIS ONE. Assessment scores the SOUND, and a noise
          // suppressor aggressive enough to help a transcript will also file the edges off a
          // fricative — which is exactly the difference being measured. Echo cancellation stays on
          // because a learner playing the target through a speaker and then speaking is the whole
          // drill, and without it the recording contains the model voice too.
          audio: { autoGainControl: false, echoCancellation: true, noiseSuppression: false },
        });
      } catch {
        if (alive.current) setFailure("microphone-unavailable");
        return;
      }
      if (!alive.current) {
        for (const track of media.getTracks()) track.stop();
        return;
      }

      stream.current = media;
      chunks.current = [];
      const active = new MediaRecorder(media, { mimeType });
      active.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.current.push(event.data);
      };
      recorder.current = active;
      active.start();
      setRecording(true);

      // The same RMS × 4 the recorder and dictation both publish, so one waveform reads any source.
      try {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1_024;
        context.createMediaStreamSource(media).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let squares = 0;
          for (const sample of samples) squares += sample * sample;
          publishMicLevel(Math.min(1, Math.sqrt(squares / Math.max(1, samples.length)) * 4));
        }, METER_MS);
        meter.current = { context, timer };
      } catch {
        // No waveform. The recording itself is unaffected, and losing an animation is not a reason
        // to refuse to listen.
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    release();
    if (alive.current) {
      setRecording(false);
      setAssessing(false);
    }
  }, [release]);

  const stop = useCallback(async () => {
    const active = recorder.current;
    const wanted = target.current;
    if (!active || !wanted) return;

    const audio = await new Promise<Blob | null>((resolve) => {
      active.onstop = () => resolve(new Blob(chunks.current, { type: active.mimeType }));
      try {
        active.stop();
      } catch {
        resolve(null);
      }
    });
    release();
    if (!alive.current) return;
    setRecording(false);
    if (!audio || audio.size === 0) {
      setFailure("audio-unusable");
      return;
    }

    setAssessing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (alive.current) { setFailure("not-signed-in"); setAssessing(false); }
        return;
      }

      const form = new FormData();
      form.append("audio", audio, "attempt.webm");
      form.append("text", wanted.text);
      form.append("locale", wanted.locale);
      if (previous.current) {
        form.append("previous", JSON.stringify(previous.current));
        form.append("targetedWords", JSON.stringify(targetedWords.current));
      }

      const response = await fetch("/api/speech/pronunciation", {
        body: form,
        headers: { Authorization: `Bearer ${token}` },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | (AttemptResult & { reason?: PronunciationGap })
        | null;

      if (!alive.current) return;
      if (!response.ok || !payload || !payload.evidence) {
        setFailure((payload?.reason as AttemptFailure) ?? "provider-error");
        setAssessing(false);
        return;
      }

      previous.current = payload.evidence;
      targetedWords.current = payload.diagnosis.findings.map((finding) => finding.word);
      setResult({ comparison: payload.comparison ?? null, diagnosis: payload.diagnosis, evidence: payload.evidence });
      setAttempts((count: number) => count + 1);
      setAssessing(false);
    } catch {
      if (alive.current) { setFailure("provider-unreachable"); setAssessing(false); }
    }
  }, [release]);

  const reset = useCallback(() => {
    release();
    previous.current = null;
    targetedWords.current = [];
    target.current = null;
    if (alive.current) {
      setResult(null);
      setFailure(null);
      setAttempts(0);
      setRecording(false);
      setAssessing(false);
    }
  }, [release]);

  // A component unmounted mid-attempt would leave a microphone open and a recorder running with
  // nowhere to put its audio.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release();
    };
  }, [release]);

  return { assessing, attempts, cancel, failure, recording, reset, result, start, stop, supported };
}
