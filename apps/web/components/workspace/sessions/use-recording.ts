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
  createDurableCapture,
  type DurableCapture,
} from "@/lib/workspace/recording-durable-capture";
import {
  describeRecordingBlob,
  pickRecordingFormat,
  RECORDING_BITS_PER_SECOND,
  RECORDING_CHUNK_MS,
  RECORDING_MAX_BYTES,
  recordingStoragePath,
  type RecordingStatus,
  type TranscriptionUsage,
} from "@/lib/workspace/recording-capture";
import { createSilenceGate, describeSilenceSkipped, stepSilenceGate, type SilenceGate } from "@/lib/workspace/silence-gate";
import { emptyWaveform, pushWaveBar, WAVEFORM_SAMPLE_MS, type WaveBar } from "@/lib/workspace/waveform-history";

/** Which conversation a finished recording belongs to. Answered by the caller
 *  at hand-off time, because opening the recorder must not create a session. */
export interface RecordingTarget {
  contextId: string;
  /** The chat message the caller is about to post for this recording, so the job
   *  can point back at it when a page returns later. */
  messageId: string;
  /** Which chat this belongs to. Defaults to the main Sessions chat; notebooks
   *  keep their artifacts under their own context. */
  surface?: "sessions" | "notebook";
  /** "12 minutes of quiet skipped", when the silence gate saved enough to be
   *  worth saying. Filled in by the hook, not the caller. */
  silenceSkipped?: string;
}

/** What the page gets back once the recording is safely in the pipeline. There
 *  is no transcript here on purpose — it does not exist yet, and waiting for it
 *  is exactly what this design stopped doing. */
export interface RecordingHandoff {
  jobId: string;
  artifactId: string;
  contextId: string;
  messageId: string;
  title: string;
  libraryPath: string | null;
  durationSeconds: number;
  silenceSkipped?: string;
}

interface UseRecordingOptions {
  active: boolean;
  accessToken: string | null;
  uid: string | null;
  /**
   * Throw the audio away instead of transcribing it when capture stops.
   *
   * Read at the moment `active` goes false, so the caller sets this in the same
   * commit as it clears `active` — "cancel" is one decision, not two.
   */
  discard?: boolean;
  /** Which conversation to file this recording under. Called once, only when
   *  there is audio worth keeping, and may create the conversation. */
  resolveTarget?: () => RecordingTarget | null;
  /** Called once the job exists — which is as soon as the audio is uploaded, not
   *  when the transcript is back. The caller closes the recorder here and posts
   *  the card that watches the job from then on. */
  onComplete?: (handoff: RecordingHandoff) => void;
  /** The microphone heard nothing worth keeping. Nothing was uploaded, nothing
   *  was created, and the caller just closes the panel. */
  onEmpty?: () => void;
  /** Called after a discard, so the caller can close the panel. Nothing was
   *  saved, so there is nothing to hand back. */
  onDiscarded?: () => void;
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

// The `sleep` helper that used to sit here went with the transcription poll
// loop (2026-08-05). Nothing in the recorder waits on a timer any more: the
// microphone closes, the audio uploads, and the job takes over.

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
  /** Uploads parts of the recording WHILE it is being made, so a closed tab cannot take the
   *  lecture with it. Runs alongside the in-memory path above, which is still what a normal
   *  finish uses — see recording-durable-capture.ts for why it is additive rather than a
   *  replacement. Null when there is no signed-in user to store parts for. */
  const durableRef = useRef<DurableCapture | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const completeRef = useRef(options.onComplete);
  completeRef.current = options.onComplete;
  const discardedRef = useRef(options.onDiscarded);
  discardedRef.current = options.onDiscarded;
  const emptyRef = useRef(options.onEmpty);
  emptyRef.current = options.onEmpty;
  const targetRef = useRef(options.resolveTarget);
  targetRef.current = options.resolveTarget;
  // Read at stop time rather than passed to a callback: `active` and `discard`
  // change in the same render, and a callback captured earlier would still be
  // holding the old answer.
  const wantsDiscardRef = useRef(false);
  wantsDiscardRef.current = options.discard === true;

  // ── The student's own pause, which is NOT the silence gate's ───────────────
  //
  // Both end up calling MediaRecorder.pause(), so they have to agree about who
  // is in charge. The rule: while the student has paused, the gate is not
  // allowed to touch the recorder at all. Without that, the gate's next tick
  // hears the room, decides there is audio, and resumes a recording the student
  // deliberately stopped — the microphone would come back on by itself.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  /** Total time spent paused, and when the current pause began. The timer the
   *  student watches must not run while nothing is being recorded — an hour
   *  that says 60:00 for 20 minutes of audio is a lie about the file. */
  const pausedTotalMsRef = useRef(0);
  const pausedAtRef = useRef(0);

  /** Wall-clock milliseconds actually spent recording, pauses removed. */
  const runningMs = useCallback((): number => {
    if (!startedAtRef.current) return 0;
    const held = pausedTotalMsRef.current + (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0);
    return Math.max(0, Date.now() - startedAtRef.current - held);
  }, []);

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

  /** Close the open capture window, if there is one, into the captured total. */
  const closeCaptureWindow = useCallback(() => {
    if (captureSinceRef.current) {
      capturedMsRef.current += Math.max(0, performance.now() - captureSinceRef.current);
      captureSinceRef.current = 0;
    }
  }, []);

  const pause = useCallback(() => {
    if (pausedRef.current || !capturingRef.current) return;
    pausedRef.current = true;
    pausedAtRef.current = Date.now();
    closeCaptureWindow();
    const live = nodesRef.current?.recorder;
    if (live?.state === "recording") {
      try { live.pause(); } catch { /* a recorder mid-stop cannot pause */ }
    }
    // The meter must go quiet too: a bar still moving beside the word "Paused"
    // reads as "it is secretly still recording".
    resetMicLevel();
    if (mountedRef.current) {
      setPaused(true);
      setLevel(0);
    }
  }, [closeCaptureWindow]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    if (pausedAtRef.current) {
      pausedTotalMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = 0;
    }
    const live = nodesRef.current?.recorder;
    if (live?.state === "paused") {
      try { live.resume(); } catch { /* likewise */ }
    }
    // A fresh gate, deliberately. The old one carries however many seconds of
    // "quiet" accumulated while the student was paused, so reusing it would
    // have the gate close again the instant they resumed — and the first words
    // after a pause are the ones they came back for.
    gateRef.current = createSilenceGate();
    captureSinceRef.current = performance.now();
    lastTickRef.current = 0;
    if (mountedRef.current) {
      setPaused(false);
      setGateOpen(true);
    }
  }, []);

  /**
   * Get the audio somewhere durable, then hand it to the pipeline.
   *
   * 🔴 THIS IS THE ONLY PART OF PROCESSING A PAGE STILL OWNS, and it is the only
   * part it can: until the upload lands, the recording exists ONLY as an array
   * of blobs in this component's memory, so there is nothing for a server to be
   * durable about. Everything after the job is created — transcribing, the notes
   * pass, filing into a course, indexing — happens in recording_jobs and the
   * recording-worker function, and survives navigation, refresh and closing the
   * tab.
   *
   * The client-side poll loop that used to live here is GONE. It waited up to
   * fifteen minutes inside a React hook and threw its own result away if the
   * component had unmounted (`if (!mountedRef.current) return`), which is to say
   * a student who opened their Library while a lecture transcribed lost it.
   */
  const handOff = useCallback(async (blob: Blob, seconds: number, target: RecordingTarget): Promise<RecordingHandoff> => {
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

    const created = await fetch("/api/recordings/jobs", {
      body: JSON.stringify({
        contextId: target.contextId,
        durationSeconds: seconds,
        messageId: target.messageId,
        silenceSkipped: target.silenceSkipped ?? null,
        storagePath: path,
        surface: target.surface ?? "sessions",
      }),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const body = await created.json().catch(() => null) as
      | { artifactId?: string; jobId?: string; libraryPath?: string | null; title?: string; error?: string; limitSeconds?: number; plan?: string; usedSeconds?: number }
      | null;
    if (created.status === 429) {
      setUsage({ limitSeconds: body?.limitSeconds ?? 0, plan: body?.plan ?? "free", usedSeconds: body?.usedSeconds ?? 0 });
      const quota = new Error(body?.error ?? "You have reached this month's transcription limit.") as Error & { quota?: boolean };
      quota.quota = true;
      throw quota;
    }
    if (!created.ok || !body?.jobId || !body.artifactId) {
      throw new Error(body?.error ?? "This recording could not be queued. Try again in a moment.");
    }
    return {
      artifactId: body.artifactId,
      contextId: target.contextId,
      durationSeconds: seconds,
      jobId: body.jobId,
      libraryPath: body.libraryPath ?? null,
      messageId: target.messageId,
      title: body.title ?? "Recording",
      ...(target.silenceSkipped ? { silenceSkipped: target.silenceSkipped } : {}),
    };
  }, [options.accessToken, options.uid]);

  /** Stop the microphone, then run the single pass. */
  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    capturingRef.current = false;
    // Measured from the start timestamp, not from `elapsedSeconds` state: that
    // changes every second, and depending on it would rebuild this callback —
    // and therefore re-run the start/stop effect — once a second while recording.
    // Time the student was paused is not time the microphone was open, so it
    // cannot be part of the wall clock the captured audio is measured against.
    const wallClockSeconds = Math.round(runningMs() / 1_000);
    // Close the capture window that is still open — without this, a recording
    // stopped while the gate was open would count only the time up to its last
    // pause, which for a lecture with no long silences is zero.
    closeCaptureWindow();
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
      emptyRef.current?.();
      return;
    }

    try {
      // The caller decides WHICH conversation this belongs to, and creates one
      // if there is not one yet. Asked for here rather than passed in at mount:
      // a session must not be created merely because the recorder was opened
      // (owner 2026-07-29), so the question can only be answered once there is
      // audio worth keeping.
      const target = targetRef.current?.();
      if (!target) throw new Error("Choose a conversation before saving a recording.");

      const handoff = await handOff(blob, capturedSeconds, {
        ...target,
        ...(skipped ? { silenceSkipped: skipped } : {}),
      });
      finishingRef.current = false;
      // The whole file is up and the job owns it now, so the parts are redundant and this
      // recording must never be offered back as a crash recovery. Marked finished AFTER the
      // handoff succeeded — doing it earlier would retire the recovery record for a recording
      // whose real upload then failed, which is the one moment those parts are worth most.
      durableRef.current?.discard();
      durableRef.current = null;
      // NOT guarded on `mountedRef`. The old code returned early here if the
      // component had gone, which is how a finished recording could vanish. The
      // job now exists on the server whatever this page does, and the callback
      // writes to a module-level store rather than to this component's state.
      if (mountedRef.current) setStatus("idle");
      completeRef.current?.(handoff);
    } catch (caught) {
      const failure = caught as Error & { quota?: boolean };
      finishingRef.current = false;
      if (!mountedRef.current) return;
      setStatus(failure.quota ? "quota" : "error");
      setError(failure.message);
      // Deliberately NOT calling onComplete: the caller unmounts this panel when
      // it fires, and a student whose upload failed needs to read why. Nothing
      // was created server-side on this path, so there is no orphan to clean up.
    }
  }, [closeCaptureWindow, closeRecording, handOff, releaseMedia, runningMs]);

  /**
   * Throw the recording away. Nothing is uploaded, nothing is transcribed,
   * nothing is billed.
   *
   * 🔴 THE ✕ USED TO SAVE. Leaving record mode mid-capture cleared `active`,
   * which is the same signal a deliberate stop sends, so cancelling ran the
   * whole finish path: upload, transcribe, charge the student's allowance, and
   * drop an artefact card into the chat they had just said they did not want
   * (owner-reported 2026-07-31). A cancel that produces the thing you cancelled
   * is not a cancel.
   */
  const discard = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    capturingRef.current = false;
    pausedRef.current = false;
    try {
      await closeRecording();
    } finally {
      releaseMedia();
    }
    // Dropped before anything can reach for them again — including the uploaded parts and
    // their recovery record. A cancel that leaves a recoverable recording behind is not a
    // cancel.
    durableRef.current?.discard();
    durableRef.current = null;
    chunksRef.current = [];
    capturedMsRef.current = 0;
    captureSinceRef.current = 0;
    pausedTotalMsRef.current = 0;
    pausedAtRef.current = 0;
    startedAtRef.current = 0;
    finishingRef.current = false;
    if (mountedRef.current) {
      setPaused(false);
      setElapsedSeconds(0);
      setError(null);
      setStatus("idle");
    }
    discardedRef.current?.();
  }, [closeRecording, releaseMedia]);

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
    pausedRef.current = false;
    pausedTotalMsRef.current = 0;
    pausedAtRef.current = 0;
    waveformRef.current = emptyWaveform();
    setPaused(false);
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
        if (event.data.size === 0) return;
        chunksRef.current.push(event.data);
        // 🔴 The same bytes, written down sooner. `new Blob(chunks)` is byte concatenation, so
        // the parts uploaded here rejoin into a byte-identical file — this is not a second
        // encoding that has to be proved correct. Never throws; an upload failure keeps the
        // bytes buffered and the microphone running.
        durableRef.current?.onChunk(event.data);
      };
      // Start writing parts to storage as they arrive. Only for a signed-in user, because
      // there is nowhere to put them otherwise — a signed-out recording keeps exactly the
      // behaviour it had before.
      durableRef.current = options.uid
        ? createDurableCapture({
            chunkMs: RECORDING_CHUNK_MS,
            extension: format.extension,
            mimeType: recorder.mimeType || format.mimeType,
            sessionId: crypto.randomUUID(),
            targetPath: recordingStoragePath(options.uid, crypto.randomUUID(), format.extension),
            userId: options.uid,
          })
        : null;
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
        // 🔴 THE GATE MUST NOT OVERRULE THE STUDENT. Both this loop and the
        // pause button call MediaRecorder.pause()/resume(). If the loop kept
        // running while the student was paused, its very next tick would hear
        // the room, decide there was audio, and resume — the microphone would
        // switch itself back on a tenth of a second after they turned it off.
        if (pausedRef.current) return;
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
        // runningMs, not raw wall clock: the number on screen has to stand still
        // while the recording is paused, or it claims audio that does not exist.
        if (mountedRef.current) setElapsedSeconds(Math.floor(runningMs() / 1_000));
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
    if (!capturingRef.current) return;
    // Which of the two endings this is was decided by the caller in the same
    // commit that cleared `active`.
    if (wantsDiscardRef.current) void discard();
    else void finish();
  }, [discard, finish, options.active, start]);

  useEffect(() => () => {
    mountedRef.current = false;
    capturingRef.current = false;
    releaseMedia();
  }, [releaseMedia]);

  return {
    /** Throw the recording away. The caller confirms with the student first —
     *  the audio cannot be recovered. */
    discard,
    elapsedLabel: formatLiveDuration(elapsedSeconds),
    elapsedSeconds,
    error,
    /** False while the silence gate has the recorder paused. Drives the "quiet
     *  — not recording" label, so the pause is visible rather than mysterious. */
    gateOpen,
    level,
    /** True while the STUDENT has paused. Distinct from `gateOpen`, which is the
     *  app skipping silence on its own — one is a decision, the other is
     *  housekeeping, and they read very differently on screen. */
    paused,
    pause,
    resume,
    status,
    usage,
    /** Read from an animation frame by the canvas. A ref, not state: ten array
     *  updates a second through React would re-render the whole chat screen. */
    waveformRef,
  };
}
