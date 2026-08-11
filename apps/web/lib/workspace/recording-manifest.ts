// A recording that survives the tab closing.
//
// 🔴 THE INVARIANT, AND IT IS THE WHOLE POINT:
//
//     once a part has successfully uploaded, closing the browser cannot erase it
//
// What this replaces held a two-hour lecture as an array of Blobs in one component's memory and
// uploaded it at Finish. `recording-capture.ts` said so in a comment — "the chunks accumulate in
// memory, so a closed tab loses all of them whatever the timeslice". A student can forgive a
// mediocre explanation. They cannot forgive "I recorded a 70-minute lecture and Nemesis lost it".
//
// 🔴 WHY CONCATENATION IS SAFE. `new Blob(chunks)` is byte concatenation and nothing else. So
// uploading the same chunk bytes, in the same order, and joining them back end-to-end produces
// a byte-identical file to the one the old path built in memory. This is not a new encoding
// scheme that has to be proved correct against MediaRecorder's container format — it is the
// same bytes, written down sooner. That is the entire reason this design was chosen over
// anything cleverer.
//
// The manifest is the record of which bytes are already safe. It is append-only and ordered,
// and nothing here can remove a part that landed — see `appendPart`, which is written to make
// that structurally impossible rather than merely unlikely.

/** One uploaded run of bytes, at a known position in the recording. */
export interface RecordingPart {
  /** 0-based position. The ORDER IS THE DATA — audio joined out of order is noise, and a
   *  missing part in the middle is a corrupt file rather than a shorter one. */
  index: number;
  /** Where it landed in storage. */
  path: string;
  bytes: number;
  uploadedAt: string;
}

export type FinalizationState =
  /** Capturing; parts still arriving. */
  | "recording"
  /** The learner pressed finish; the last part is uploading. */
  | "finalizing"
  /** Every part is up and the server has been told to assemble them. */
  | "finalized"
  /** The tab died mid-recording. Parts are safe; nobody has finished it yet. */
  | "abandoned";

export interface RecordingManifest {
  sessionId: string;
  userId: string;
  /** MediaRecorder's own reported type, so the reassembled file is declared correctly. */
  mimeType: string;
  extension: string;
  startedAt: string;
  /** Last time a part landed — how a stale session is recognised on recovery. */
  updatedAt: string;
  parts: RecordingPart[];
  state: FinalizationState;
  /** Where the assembled file will live, so recovery does not have to re-derive it. */
  targetPath: string;
}

/** A session untouched for this long, still in "recording", was almost certainly a closed tab. */
export const ABANDONED_AFTER_MS = 5 * 60_000;

/** How much audio one part holds. MediaRecorder hands us a chunk every few seconds; those are
 *  buffered and flushed at this cadence.
 *
 *  🔴 THIS NUMBER IS THE WORST-CASE LOSS WINDOW, and that is the only thing it means. At 20s, a
 *  crash costs at most the last 20 seconds of a lecture. Lower is safer and makes more storage
 *  objects; an hour at 20s is 180 parts, which is fine. Do not raise it to reduce object count
 *  without saying out loud how many seconds of someone's lecture that buys. */
export const PART_SECONDS = 20;

export function partPath(sessionId: string, index: number, extension: string): string {
  // Zero-padded so a lexical listing is also the correct order — recovery reads storage, and a
  // listing that sorts part10 before part2 reassembles the lecture scrambled.
  return `parts/${sessionId}/${String(index).padStart(5, "0")}.${extension}`;
}

/** Record that a part is safely stored.
 *
 *  🔴 APPEND-ONLY AND IDEMPOTENT BY INDEX. A retried upload must not create a duplicate, and
 *  nothing may replace a part that already landed with a smaller one — a retry that raced a
 *  successful write would otherwise silently truncate the middle of the recording. */
export function appendPart(manifest: RecordingManifest, part: RecordingPart): RecordingManifest {
  const existing = manifest.parts.find((entry) => entry.index === part.index);
  if (existing) {
    // Already have it. Keep whichever run of bytes is longer — never shrink.
    if (part.bytes <= existing.bytes) return manifest;
    return {
      ...manifest,
      updatedAt: part.uploadedAt,
      parts: manifest.parts.map((entry) => (entry.index === part.index ? part : entry)),
    };
  }
  return {
    ...manifest,
    updatedAt: part.uploadedAt,
    parts: [...manifest.parts, part].sort((a, b) => a.index - b.index),
  };
}

/** Indices that should exist but do not.
 *
 *  A gap means an upload failed while later ones succeeded. The recording is still worth
 *  recovering — but it must be assembled knowing there is a hole, not silently joined into a
 *  file that jumps in time and reads as a transcription error later. */
export function missingParts(manifest: RecordingManifest): number[] {
  if (manifest.parts.length === 0) return [];
  const have = new Set(manifest.parts.map((part) => part.index));
  const highest = Math.max(...have);
  const gaps: number[] = [];
  for (let index = 0; index <= highest; index += 1) if (!have.has(index)) gaps.push(index);
  return gaps;
}

export function isContiguous(manifest: RecordingManifest): boolean {
  return missingParts(manifest).length === 0;
}

export function totalBytes(manifest: RecordingManifest): number {
  return manifest.parts.reduce((sum, part) => sum + part.bytes, 0);
}

/** Storage paths in the order they must be joined. */
export function assemblyOrder(manifest: RecordingManifest): string[] {
  return [...manifest.parts].sort((a, b) => a.index - b.index).map((part) => part.path);
}

/** Sessions worth offering back to the learner after a crash.
 *
 *  🔴 Anything with bytes counts, including one that never reached "finalizing". The whole
 *  reason this exists is the tab that died mid-lecture — requiring a clean finish before a
 *  recording is recoverable would exclude exactly the case it was built for. */
export function recoverable(manifests: readonly RecordingManifest[], now: Date): RecordingManifest[] {
  return manifests
    .filter((manifest) => manifest.state !== "finalized")
    .filter((manifest) => manifest.parts.length > 0)
    .filter((manifest) => now.getTime() - Date.parse(manifest.updatedAt) >= 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Has this session gone quiet long enough to call it abandoned rather than in progress? */
export function looksAbandoned(manifest: RecordingManifest, now: Date): boolean {
  if (manifest.state === "finalized") return false;
  return now.getTime() - Date.parse(manifest.updatedAt) > ABANDONED_AFTER_MS;
}

export function newManifest(input: {
  sessionId: string;
  userId: string;
  mimeType: string;
  extension: string;
  targetPath: string;
  startedAt: string;
}): RecordingManifest {
  return {
    sessionId: input.sessionId,
    userId: input.userId,
    mimeType: input.mimeType,
    extension: input.extension,
    targetPath: input.targetPath,
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    parts: [],
    state: "recording",
  };
}
