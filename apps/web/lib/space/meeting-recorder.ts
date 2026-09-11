// ── Recording a meeting in the workspace ────────────────────────────────────────────────────────────────────────────
//
// The microphone half of an AI Meeting Note. It keeps the app's recording rules (components/workspace/learn/
// use-recording.ts) without its React: the same container preference, bitrate, chunking and silence gate, so a long
// quiet stretch is not billed, then one upload to the private recordings bucket and one job at /api/recordings/jobs
// (surface "space"). Everything after that belongs to the recording worker, which keeps going if the page closes.

import {
  describeRecordingBlob,
  pickRecordingFormat,
  RECORDING_BITS_PER_SECOND,
  RECORDING_CHUNK_MS,
  RECORDING_MAX_BYTES,
  recordingStoragePath,
} from "@/lib/workspace/recording-capture";
import { createSilenceGate, describeSilenceSkipped, stepSilenceGate, type SilenceGate } from "@/lib/workspace/silence-gate";

export interface MeetingTake {
  blob: Blob;
  /** Seconds of sound the file holds: what the transcription allowance is charged. */
  seconds: number;
  /** "12 minutes of quiet skipped", when the gate skipped enough to say so. */
  silenceSkipped: string | null;
  /** Seconds the microphone was open. */
  wallSeconds: number;
}

export interface MeetingRecorder {
  /** Seconds since the microphone opened. */
  elapsed(): number;
  /** Closes the microphone and hands back the take; null when it was already stopped or thrown away. */
  stop(): Promise<MeetingTake | null>;
  /** Closes the microphone and keeps nothing. */
  discard(): void;
}

const LEVEL_MS = 100;

/** Loudness of one analyser frame, 0..1, on the same scale the silence gate was measured against (use-recording.ts). */
function frameLevel(samples: Float32Array): number {
  let squares = 0;
  for (const sample of samples) squares += sample * sample;
  return Math.min(1, Math.sqrt(squares / Math.max(1, samples.length)) * 4);
}

export async function startMeetingRecorder(): Promise<MeetingRecorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot record audio. Try Chrome, Edge, or Safari.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: true, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    throw new Error("Nemesis could not use the microphone. Allow it for this site and try again.");
  }
  const format = pickRecordingFormat((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, {
    audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    ...(format.mimeType ? { mimeType: format.mimeType } : {}),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(RECORDING_CHUNK_MS);

  const started = performance.now();
  let last = started;
  let gate: SilenceGate = createSilenceGate();
  let capturedMs = 0;
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1_024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    const now = performance.now();
    const step = now - last;
    last = now;
    analyser.getFloatTimeDomainData(samples);
    const wasCapturing = gate.capturing;
    if (wasCapturing) capturedMs += step;
    gate = stepSilenceGate(gate, frameLevel(samples), step);
    if (gate.capturing === wasCapturing) return;
    try {
      if (gate.capturing) recorder.resume();
      else recorder.pause();
    } catch {
      // The recorder is already stopping.
    }
  }, LEVEL_MS);

  let finished = false;
  const release = () => {
    clearInterval(timer);
    for (const track of stream.getTracks()) track.stop();
    void context.close().catch(() => undefined);
  };
  const type = () => recorder.mimeType || format.mimeType || "audio/webm";

  return {
    elapsed: () => Math.max(0, Math.round((performance.now() - started) / 1000)),
    async stop() {
      if (finished) return null;
      finished = true;
      const wallMs = performance.now() - started;
      if (gate.capturing) capturedMs += performance.now() - last;
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: type() }));
        try {
          if (recorder.state === "paused") recorder.resume();
          recorder.stop();
        } catch {
          resolve(new Blob(chunks, { type: type() }));
        }
      });
      release();
      const wallSeconds = Math.round(wallMs / 1000);
      const seconds = Math.min(wallSeconds, Math.round(capturedMs / 1000));
      return { blob, seconds, wallSeconds, silenceSkipped: describeSilenceSkipped(wallSeconds * 1000, seconds * 1000) };
    },
    discard() {
      if (finished) return;
      finished = true;
      try {
        recorder.stop();
      } catch {
        // Already stopped.
      }
      release();
    },
  };
}

export interface MeetingJob {
  jobId: string;
  artifactId: string;
}

interface RecordingsBucket {
  from(bucket: string): { upload(path: string, file: Blob, options: { contentType: string; upsert: boolean }): PromiseLike<{ error: unknown }> };
}

/**
 * Uploads a take and files its job. The context is the meeting block and the message is its page, which is how the
 * runtime finds where the notes belong when the job is done. Errors carry sentences a person can act on, the route's
 * own when it gives one (a monthly transcription limit, say).
 */
export async function fileMeetingRecording(input: {
  storage: RecordingsBucket;
  token: string | null | undefined;
  userId: string;
  take: MeetingTake;
  blockId: string;
  pageId: string;
  fetchImpl?: typeof fetch;
}): Promise<MeetingJob> {
  if (!input.token) throw new Error("Sign in to save this recording.");
  if (input.take.blob.size > RECORDING_MAX_BYTES) {
    throw new Error("That recording is too long to upload in one piece. Record the meeting in shorter parts.");
  }
  const { contentType, extension } = describeRecordingBlob(input.take.blob.type);
  const path = recordingStoragePath(input.userId, crypto.randomUUID(), extension);
  const uploaded = await input.storage.from("recordings").upload(path, input.take.blob, { contentType, upsert: false });
  if (uploaded.error) throw new Error("The recording could not be uploaded. Check your connection and try again.");
  const res = await (input.fetchImpl ?? fetch)("/api/recordings/jobs", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contextId: input.blockId,
      durationSeconds: input.take.seconds,
      messageId: input.pageId,
      silenceSkipped: input.take.silenceSkipped,
      storagePath: path,
      surface: "space",
    }),
  });
  const body = (await res.json().catch(() => null)) as { jobId?: string; artifactId?: string; error?: string } | null;
  if (!res.ok || !body?.jobId || !body.artifactId) throw new Error(body?.error || "The recording could not be saved. Try again in a moment.");
  return { jobId: body.jobId, artifactId: body.artifactId };
}
