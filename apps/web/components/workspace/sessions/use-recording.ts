"use client";

// The recorder (owner decision 2026-07-27: "Drop live transcript entirely, one
// live high quality pass").
//
// Replaces the streaming recorder. That one opened a WebSocket to AssemblyAI
// and sent PCM as you spoke — which is what put words on screen, and is also
// what made a clean second pass cost double: the live transcript IS a paid
// transcription. It additionally called the model every 45 seconds to write
// interim notes, which the owner never asked for.
//
// Now the microphone only ever writes a file. Nothing is transcribed and no
// model is called until you stop, and then exactly once, through the batch
// route that already existed for the phone. Roughly $0.06 an hour against
// ~$0.23, and the transcript is better: a model that sees the whole recording
// beats one guessing a word at a time.

import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { formatLiveDuration } from "@/lib/workspace/recording-note";
import { publishMicLevel, resetMicLevel } from "@/lib/workspace/mic-level";
import {
  describeRecordingBlob,
  pickRecordingFormat,
  POLL_TIMEOUT_MS,
  pollDelayMs,
  RECORDING_BITS_PER_SECOND,
  RECORDING_CHUNK_MS,
  RECORDING_MAX_BYTES,
  recordingStoragePath,
  type RecordingStatus,
  type TranscriptionUsage,
} from "@/lib/workspace/recording-capture";
import type { RecordingArtifactDraft } from "@/lib/workspace/recording-artifacts";
import { createSilenceGate, describeSilenceSkipped, stepSilenceGate, type SilenceGate } from "@/lib/workspace/silence-gate";
import { emptyWaveform, pushWaveBar, WAVEFORM_SAMPLE_MS, type WaveBar } from "@/lib/workspace/waveform-history";

interface UseRecordingOptions {
  active: boolean;
  accessToken: string | null;
  uid: string | null;
  /** Called once, when the transcript is back — not when the microphone closes.
   *  The caller keeps the recording panel mounted until this fires. */
  onComplete?: (draft: RecordingArtifactDraft) => void;
}

interface CaptureNodes {
  context: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  recorder: MediaRecorder;
}

/** One tick drives the meter, the waveform AND silence detection. It is set by
 *  the strictest of the three: lag here is lost audio at the front of a word,
 *  not a stuttery bar. */
const LEVEL_INTERVAL_MS = WAVEFORM_SAMPLE_MS;

/**
 * Loudness of one analyser frame, 0..1.
 *
 * 🔴 READ AS FLOATS, NOT BYTES. This used to call getByteTimeDomainData and
 * centre each sample with `(byte - 128) / 128`. The scale it produced is
 * identical to the float one — both land in -1..1, so the `× 4` and every
 * threshold measured against it are unchanged — but the RESOLUTION was not.
 *
 * 8-bit samples move in steps of 1/128 ≈ 0.0078. The silence gate's floor is
 * 0.004 on this scale, which is an RMS of 0.001, which is a deviation of about
 * ONE EIGHTH of a single byte step. The byte data cannot represent that at all:
 * every level quieter than roughly 0.03 collapsed to the same handful of
 * integers, so the gate was deciding whether to throw away a lecture using a
 * number that had no precision left in exactly the range being decided. Lowering
 * the gate's threshold without this change would have been theatre — there was
 * nothing under 0.03 for it to see.
 *
 * Float samples arrive already in -1..1 with full precision, so quiet speech is
 * a real reading rather than a rounding artefact.
 */
function frameLevel(samples: Float32Array): number {
  let squares = 0;
  for (const sample of samples) squares += sample * sample;
  return Math.min(1, Math.sqrt(squares / Math.max(1, samples.length)) * 4);
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function useRecordingSession(options: UseRecordingOptions) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [usage, setUsage] = useState<TranscriptionUsage | null>(null);

  const mountedRef = useRef(true);
  const capturingRef = useRef(false);
  const finishingRef = useRef(false);
  const nodesRef = useRef<CaptureNodes | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const levelTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const completeRef = useRef(options.onComplete);
  completeRef.current = options.onComplete;

  // Silence gating. `capturedMs` is the audio we will actually be billed for
  // and metered on; wall-clock time is the timer the student watches. The two
  // diverge by exactly the quiet we skipped, which is the number worth knowing.
  const gateRef = useRef<SilenceGate>(createSilenceGate());
  const capturedMsRef = useRef(0);
  // When the recorder last STARTED capturing, so captured time is measured from
  // pause/resume transitions rather than counted a tick at a time. A background
  // tab throttles setInterval to about 1 Hz, so counting a fixed slice per tick
  // undercounts a lecture by up to 10x — and a student switching tabs to take
  // notes is the normal case, not the edge one.
  const captureSinceRef = useRef(0);
  const lastTickRef = useRef(0);
  const [gateOpen, setGateOpen] = useState(true);
  // Held in a ref, not state: the canvas reads it from an animation frame, and
  // pushing 10 array updates a second through React would re-render the chat.
  const waveformRef = useRef<WaveBar[]>(emptyWaveform());

  /** Close the microphone and every timer. Never touches the transcription in
   *  flight — the audio is already captured by the time this runs. */
  const releaseMedia = useCallback(() => {
    if (levelTimerRef.current !== null) window.clearInterval(levelTimerRef.current);
    if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);
    levelTimerRef.current = null;
    elapsedTimerRef.current = null;

    const nodes = nodesRef.current;
    nodesRef.current = null;
    if (nodes) {
      if (nodes.recorder.state !== "inactive") {
        try { nodes.recorder.stop(); } catch { /* already stopping */ }
      }
      nodes.source.disconnect();
      nodes.analyser.disconnect();
      for (const track of nodes.stream.getTracks()) track.stop();
      void nodes.context.close().catch(() => undefined);
    }
    // Outside any mounted guard: a waveform holding the last reading would keep
    // drawing bars for a microphone that is already closed.
    resetMicLevel();
    if (mountedRef.current) setLevel(0);
  }, []);

  /** Wait for MediaRecorder to flush its final chunk, then hand back one blob. */
  const closeRecording = useCallback(async (): Promise<Blob | null> => {
    const nodes = nodesRef.current;
    if (!nodes) return null;
    const { recorder } = nodes;
    if (recorder.state === "inactive") {
      return chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType }) : null;
    }
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      // A recorder that never fires "stop" must not hang the lecture forever.
      window.setTimeout(resolve, 3_000);
    });
    // Resume first if the silence gate had it paused: a paused recorder is not
    // required to deliver its final chunk on stop, and the tail of the lecture
    // is the part with the summary in it.
    if (recorder.state === "paused") {
      try { recorder.resume(); } catch { /* about to stop anyway */ }
    }
    try { recorder.stop(); } catch { /* already stopping */ }
    await stopped;
    return chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType }) : null;
  }, []);

  const transcribe = useCallback(async (blob: Blob, seconds: number): Promise<string> => {
    const { accessToken, uid } = options;
    if (!accessToken || !uid) throw new Error("Sign in to save this recording.");

    setStatus("uploading");
    // The bucket rejects anything past this, so say so in terms a student can
    // act on rather than letting storage return a bare error.
    if (blob.size > RECORDING_MAX_BYTES) {
      throw new Error("That recording is too long to upload in one piece. Record in shorter sessions and they will still join up in your Library.");
    }
    const { contentType, extension } = describeRecordingBlob(blob.type);
    const path = recordingStoragePath(uid, crypto.randomUUID(), extension);
    const uploaded = await supabase.storage.from("recordings").upload(path, blob, { contentType, upsert: false });
    if (uploaded.error) throw new Error("Your recording could not be uploaded. Check your connection and try again.");

    setStatus("transcribing");
    const authorization = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const submitted = await fetch("/api/transcription/submit", {
      body: JSON.stringify({ seconds, storagePath: path }),
      headers: authorization,
      method: "POST",
    });
    const submitBody = await submitted.json().catch(() => null) as
      | { jobId?: string; usage?: TranscriptionUsage; error?: string; limitSeconds?: number; plan?: string; usedSeconds?: number }
      | null;
    if (submitted.status === 429) {
      setUsage({ limitSeconds: submitBody?.limitSeconds ?? 0, plan: submitBody?.plan ?? "free", usedSeconds: submitBody?.usedSeconds ?? 0 });
      const quota = new Error(submitBody?.error ?? "You have reached this month's transcription limit.") as Error & { quota?: boolean };
      quota.quota = true;
      throw quota;
    }
    if (!submitted.ok || !submitBody?.jobId) throw new Error(submitBody?.error ?? "The transcription service is unavailable. Try again in a moment.");
    if (submitBody.usage && mountedRef.current) setUsage(submitBody.usage);

    // Poll. Groq finishes inside the submit request and parks its text, so the
    // first poll usually already has it; AssemblyAI is the slow fallback lane.
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    for (let attempt = 1; Date.now() < deadline; attempt += 1) {
      await sleep(pollDelayMs(attempt));
      const polled = await fetch("/api/transcription/status", {
        body: JSON.stringify({ jobId: submitBody.jobId }),
        headers: authorization,
        method: "POST",
      });
      const pollBody = await polled.json().catch(() => null) as { status?: string; transcript?: string | null; error?: string } | null;
      if (!polled.ok) continue;
      if (pollBody?.status === "error") throw new Error(pollBody.error ?? "The recording could not be transcribed.");
      if (pollBody?.status === "done") return (pollBody.transcript ?? "").trim();
    }
    throw new Error("The transcription is taking longer than expected. Your recording is safe — try again shortly.");
  }, [options.accessToken, options.uid]);

  /** Stop the microphone, then run the single pass. */
  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    capturingRef.current = false;
    // Measured from the start timestamp, not from `elapsedSeconds` state: that
    // changes every second, and depending on it would rebuild this callback —
    // and therefore re-run the start/stop effect — once a second while recording.
    const wallClockSeconds = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1_000) : 0;
    // Close the capture window that is still open — without this, a recording
    // stopped while the gate was open would count only the time up to its last
    // pause, which for a lecture with no long silences is zero.
    if (captureSinceRef.current) {
      capturedMsRef.current += Math.max(0, performance.now() - captureSinceRef.current);
      captureSinceRef.current = 0;
    }
    // What the file actually contains, and therefore what we are billed for and
    // what the student's monthly allowance is charged (owner 2026-07-27 chose
    // the saving goes to the student). The gate never lets this exceed the
    // wall clock, but clamp anyway — a number that meters someone must not be
    // able to run away.
    const capturedSeconds = Math.min(wallClockSeconds, Math.round(capturedMsRef.current / 1_000));
    const skipped = describeSilenceSkipped(wallClockSeconds * 1_000, capturedSeconds * 1_000);

    let blob: Blob | null = null;
    try {
      blob = await closeRecording();
    } finally {
      releaseMedia();
    }

    if (!blob || blob.size === 0 || capturedSeconds <= 0) {
      if (mountedRef.current) {
        // A recording that captured nothing is a real outcome worth naming —
        // a muted mic looks exactly like a quiet room to the gate.
        if (wallClockSeconds > 5) {
          setStatus("error");
          setError("Nemesis did not hear anything. Check the microphone is not muted and try again.");
          finishingRef.current = false;
          return;
        }
        setStatus("idle");
      }
      finishingRef.current = false;
      completeRef.current?.({ durationSeconds: 0, notes: "", transcript: "" });
      return;
    }

    try {
      const transcript = await transcribe(blob, capturedSeconds);
      if (!mountedRef.current) return;
      setStatus("idle");
      finishingRef.current = false;
      completeRef.current?.({ durationSeconds: capturedSeconds, notes: "", transcript, ...(skipped ? { silenceSkipped: skipped } : {}) });
    } catch (caught) {
      const failure = caught as Error & { quota?: boolean };
      if (!mountedRef.current) return;
      setStatus(failure.quota ? "quota" : "error");
      setError(failure.message);
      finishingRef.current = false;
      // Deliberately NOT calling onComplete: the caller unmounts this panel when
      // it fires, and a student whose transcription failed needs to read why.
    }
  }, [closeRecording, releaseMedia, transcribe]);

  const start = useCallback(async () => {
    if (capturingRef.current || finishingRef.current) return;
    if (!options.accessToken || !options.uid) {
      setStatus("error");
      setError("Sign in to record.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("error");
      setError("This browser cannot record audio. Try Chrome, Edge, or Safari.");
      return;
    }

    setError(null);
    setUsage(null);
    setElapsedSeconds(0);
    chunksRef.current = [];
    gateRef.current = createSilenceGate();
    capturedMsRef.current = 0;
    captureSinceRef.current = 0;
    lastTickRef.current = 0;
    waveformRef.current = emptyWaveform();
    setGateOpen(true);
    capturingRef.current = true;
    setStatus("recording");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: true, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (!capturingRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      const format = pickRecordingFormat((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
        ...(format.mimeType ? { mimeType: format.mimeType } : {}),
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(RECORDING_CHUNK_MS);

      // Audio graph exists only to draw the meter — nothing leaves the browser.
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1_024;
      source.connect(analyser);
      nodesRef.current = { analyser, context, recorder, source, stream };

      const samples = new Float32Array(analyser.fftSize);
      levelTimerRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const next = frameLevel(samples);
        if (mountedRef.current) setLevel(next);
        // Same reading, published to the composer's waveform, which is a sibling
        // of this recorder rather than a child — see lib/workspace/mic-level.ts.
        publishMicLevel(next);

        // REAL elapsed, not the nominal interval: a background tab throttles
        // this timer to roughly 1 Hz, and a hold measured in ticks would then
        // mean fifteen seconds instead of one and a half.
        const now = performance.now();
        const delta = lastTickRef.current ? Math.min(now - lastTickRef.current, 30_000) : LEVEL_INTERVAL_MS;
        lastTickRef.current = now;

        // Silence gate. Decided BEFORE the recorder is touched so the bar drawn
        // for this slice matches what the recorder actually did with it.
        const gate = stepSilenceGate(gateRef.current, next, delta);
        const wasCapturing = gateRef.current.capturing;
        gateRef.current = gate;
        waveformRef.current = pushWaveBar(waveformRef.current, { captured: gate.capturing, level: next });

        // pause()/resume() are the whole mechanism: paused, MediaRecorder simply
        // stops adding bytes, so the quiet never enters the file and is never
        // uploaded or billed. Guarded by state so a steady room is not calling
        // into the recorder ten times a second.
        const live = nodesRef.current?.recorder;
        if (live) {
          if (!gate.capturing && live.state === "recording") {
            try { live.pause(); } catch { /* a recorder mid-stop cannot pause */ }
          } else if (gate.capturing && live.state === "paused") {
            try { live.resume(); } catch { /* likewise */ }
          }
        }

        // Captured time is measured across the pause/resume transition, not
        // accumulated per tick, so it stays exact however badly the browser
        // throttles this timer. This is the number the student is metered on.
        if (wasCapturing && !gate.capturing) {
          capturedMsRef.current += Math.max(0, now - captureSinceRef.current);
          captureSinceRef.current = 0;
        } else if (!wasCapturing && gate.capturing) {
          captureSinceRef.current = now;
        }
        if (mountedRef.current) setGateOpen(gate.capturing);
      }, LEVEL_INTERVAL_MS);

      startedAtRef.current = Date.now();
      // The gate opens capturing, so the first capture window starts here.
      captureSinceRef.current = performance.now();
      elapsedTimerRef.current = window.setInterval(() => {
        if (mountedRef.current) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1_000));
      }, 1_000);
    } catch (caught) {
      capturingRef.current = false;
      releaseMedia();
      setStatus("error");
      setError(caught instanceof DOMException && caught.name === "NotAllowedError"
        ? "Microphone access was denied. Allow it in browser settings and try again."
        : "Nemesis could not open the microphone.");
    }
  }, [options.accessToken, options.uid, releaseMedia]);

  useEffect(() => {
    if (options.active) {
      void start();
      return;
    }
    // Only finish a recording that actually started — `active` is false on the
    // very first render too, and finishing then would fire onComplete for a
    // session that never existed.
    if (capturingRef.current) void finish();
  }, [finish, options.active, start]);

  useEffect(() => () => {
    mountedRef.current = false;
    capturingRef.current = false;
    releaseMedia();
  }, [releaseMedia]);

  return {
    elapsedLabel: formatLiveDuration(elapsedSeconds),
    elapsedSeconds,
    error,
    /** False while the silence gate has the recorder paused. Drives the "quiet
     *  — not recording" label, so the pause is visible rather than mysterious. */
    gateOpen,
    level,
    status,
    usage,
    /** Read from an animation frame by the canvas. A ref, not state: ten array
     *  updates a second through React would re-render the whole chat screen. */
    waveformRef,
  };
}
