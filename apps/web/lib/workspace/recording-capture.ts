// Recording capture rules (owner decision 2026-07-27: "Drop live transcript
// entirely, one live high quality pass").
//
// The recorder used to stream PCM to AssemblyAI while you spoke — which is what
// put words on screen, and is also why a clean second pass would have meant
// paying to transcribe the same hour twice. Now the microphone is only ever
// written to a file; the single paid pass happens once, on the finished audio,
// through the batch route that already exists (/api/transcription/submit, Groq
// whisper-large-v3-turbo with an AssemblyAI fallback).
//
// Everything here is pure so the rules can be tested without a microphone, a
// MediaRecorder, or a network.

/**
 * Container preference, best first.
 *
 * Opus in WebM is what Chrome and Firefox give us and what we want: speech at
 * 32 kbps is transparent and an hour lands around 14 MB. Safari refuses WebM
 * and produces MP4/AAC instead, which both transcription providers also accept,
 * so it is a fallback rather than a failure.
 */
// Ogg is deliberately absent even though Firefox offers it: the `recordings`
// bucket's allowed_mime_types is [audio/mp4, audio/m4a, audio/aac, audio/mpeg,
// audio/webm], so an Ogg upload is rejected at the door. Recording in a
// container the bucket will not accept loses the lecture at the last step.
export const RECORDING_MIME_PREFERENCE = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

/**
 * Speech, not music. Higher buys nothing a transcriber can hear, and the
 * ceiling is not taste: the bucket rejects anything over 40 MB, so the bitrate
 * is what decides how long a lecture can be. At 32 kbps that is ~2.9 hours,
 * which matches the submit route's own 3-hour cap. Left to its default a
 * browser may pick 128 kbps, where a 40 MB file is only 43 minutes — i.e. an
 * ordinary lecture would fail to upload.
 *
 * UNVERIFIED on Safari: `audioBitsPerSecond` is a hint, and Safari's AAC
 * encoder has historically ignored it. If it does, an ordinary lecture trips
 * the size guard below. Not worked around blind — the guard fails with
 * something actionable, and the real rate is worth measuring before guessing.
 */
export const RECORDING_BITS_PER_SECOND = 32_000;

/** What the bucket will store. Mirrors storage.buckets.file_size_limit. */
export const RECORDING_MAX_BYTES = 40 * 1024 * 1024;

/**
 * How often MediaRecorder hands us a chunk.
 *
 * This bounds memory spikes and proves data is still flowing. It does NOT make
 * a crash survivable — the chunks accumulate in memory, so a closed tab loses
 * all of them whatever the timeslice. Surviving a crash would mean writing each
 * chunk to IndexedDB, which is real work and not what this number does.
 */
export const RECORDING_CHUNK_MS = 5_000;

export interface RecordingFormat {
  mimeType: string;
  /** Filename extension the storage bucket and the providers key off. */
  extension: string;
}

function extensionFor(mimeType: string): string {
  if (mimeType.startsWith("audio/mp4")) return "m4a";
  return "webm";
}

/**
 * What to upload a finished blob AS.
 *
 * MediaRecorder reports its type with parameters attached —
 * "audio/webm;codecs=opus" — and the bucket's allow-list holds bare types.
 * Sending the parameterised string risks being rejected for a container the
 * bucket actually accepts, so the codec is stripped before it goes anywhere.
 */
export function describeRecordingBlob(blobType: string): { contentType: string; extension: string } {
  const base = (blobType.split(";")[0] ?? "").trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/aac") {
    return { contentType: "audio/mp4", extension: "m4a" };
  }
  if (base === "audio/mpeg") return { contentType: "audio/mpeg", extension: "mp3" };
  // Anything else (including a browser that reported nothing) is treated as
  // WebM, which is what every recorder we ask for produces first.
  return { contentType: "audio/webm", extension: "webm" };
}

/**
 * The best container this browser will actually record.
 *
 * `isSupported` is passed in rather than read off MediaRecorder so the choice
 * is testable — and so a browser that supports nothing still returns a usable
 * shape instead of throwing halfway through a lecture.
 */
export function pickRecordingFormat(isSupported: (mimeType: string) => boolean): RecordingFormat {
  for (const mimeType of RECORDING_MIME_PREFERENCE) {
    if (isSupported(mimeType)) return { extension: extensionFor(mimeType), mimeType };
  }
  // Let the browser pick its own default; the blob still carries a real type.
  return { extension: "webm", mimeType: "" };
}

/**
 * Where the audio lands in the private `recordings` bucket.
 *
 * The `${userId}/` prefix is not cosmetic: /api/transcription/submit rejects any
 * path that does not start with the caller's own id, which is what stops one
 * account submitting another's audio.
 */
export function recordingStoragePath(userId: string, id: string, extension: string): string {
  return `${userId}/${id}.${extension}`;
}

// `pollDelayMs` and `POLL_TIMEOUT_MS` lived here until 2026-08-05. They paced a
// transcription poll loop that ran INSIDE the recording hook, and they went with
// it: the browser no longer waits for a transcript at all. The equivalent
// decisions now live in supabase/functions/recording-worker/pipeline.ts
// (backoffSeconds, stageAttemptLimit), where they can outlive the page.

/** What the batch route reports back about this month's allowance. */
export interface TranscriptionUsage {
  plan: string;
  usedSeconds: number;
  limitSeconds: number;
}

/** `transcribing` is gone from this list (2026-08-05) and its absence is the
 *  point: the recorder's job now ends at the upload. What happens next is a
 *  recording_jobs row with its own stages, which the chat card reports — see
 *  lib/workspace/recording-job.ts. */
export type RecordingStatus =
  | "idle"
  | "recording"
  | "uploading"
  | "quota"
  | "error";

/** One line of student-readable state. No jargon: "uploading" is what is
 *  happening, but "Saving audio" is what it means. */
export function recordingStatusCopy(status: RecordingStatus): string {
  switch (status) {
    case "recording": return "Recording";
    case "uploading": return "Saving audio";
    case "quota": return "Monthly limit reached";
    case "error": return "Unavailable";
    default: return "Ready";
  }
}

/** Whether the microphone is live — drives the meter and the timer. */
export function isCapturing(status: RecordingStatus): boolean {
  return status === "recording";
}

/** Whether we are still doing work after the microphone closed, so the UI keeps
 *  its spinner instead of looking finished while the audio is still uploading.
 *  This is now a SHORT window — the upload — rather than the whole write-up. */
export function isFinishing(status: RecordingStatus): boolean {
  return status === "uploading";
}
