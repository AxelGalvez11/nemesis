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
  /** The learner pressed finish, but parts never landed — the network was down and stayed
   *  down. Distinct from "finalized" because the difference is whether the audio exists. */
  | "incomplete"
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

/** Where one part lives in the `recordings` bucket.
 *
 *  🔴 THE `${userId}/` PREFIX IS NOT COSMETIC AND ITS ABSENCE IS NOT A STYLE BUG. The bucket's
 *  RLS policies are all of the form
 *
 *      bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text
 *
 *  so the FIRST path segment must be the caller's own id. The first version of this function
 *  returned `parts/<session>/…`, whose first segment is the literal "parts" — which means every
 *  part upload was refused by the database, and refused SILENTLY, because the capture loop
 *  treats an upload failure as something to retry rather than something to report. The feature
 *  looked complete, passed its unit tests against an injected uploader, and stored nothing.
 *
 *  Zero-padded so a lexical listing is also the correct order — recovery may read storage
 *  directly, and a listing that sorts part10 before part2 reassembles the lecture scrambled,
 *  which still plays. */
export function partPath(userId: string, sessionId: string, index: number, extension: string): string {
  return `${userId}/parts/${sessionId}/${String(index).padStart(5, "0")}.${extension}`;
}

/** The single rule every storage path in this bucket has to satisfy. Exported so the paths can
 *  be checked against the policy in a test instead of in production. */
export function isOwnedPath(path: string, userId: string): boolean {
  return path.split("/")[0] === userId && userId.length > 0;
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

/** What a recovery can actually offer the learner.
 *
 *  🔴 PART 0 IS NOT LIKE THE OTHERS, AND THIS IS THE WHOLE REASON THIS FUNCTION EXISTS.
 *  MediaRecorder does not produce a sequence of independently playable files. It produces ONE
 *  file cut into pieces: the container header — WebM's EBML header and segment metadata, or
 *  MP4's moov box — rides in the FIRST chunk, and every piece after it is payload that means
 *  nothing without it. So a set missing part 0 is not "slightly short", it is undecodable, and
 *  a recovery that uploaded it would report success and deliver silence.
 *
 *  A gap ANYWHERE ELSE is a different outcome and deliberately a recoverable one: the decoder
 *  resynchronises at the next cluster, so the lecture plays with a skip in it. Fifty-five
 *  minutes with a hole is worth incomparably more to a student than nothing, which is why this
 *  returns three answers and not a boolean. */
export type Playability = "empty" | "unplayable" | "gapped" | "complete";

export function playability(manifest: RecordingManifest): Playability {
  if (manifest.parts.length === 0) return "empty";
  if (!manifest.parts.some((part) => part.index === 0)) return "unplayable";
  return isContiguous(manifest) ? "complete" : "gapped";
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
 *  🔴 Anything playable counts, including one that never reached "finalizing". The whole
 *  reason this exists is the tab that died mid-lecture — requiring a clean finish before a
 *  recording is recoverable would exclude exactly the case it was built for.
 *
 *  A set whose part 0 never landed is deliberately NOT offered: see `playability`. Those bytes
 *  cannot be turned into audio, and an offer that produces silence is worse than no offer,
 *  because the learner spends their trust on it. */
export function recoverable(manifests: readonly RecordingManifest[], now: Date): RecordingManifest[] {
  // 🔴 THERE IS DELIBERATELY NO "IS THE TIMESTAMP SANE" TEST HERE. An earlier version dropped
  // any manifest whose `updatedAt` was in the future, which sounds like harmless hygiene and is
  // not: `updatedAt` comes from the recording device's own clock, so a laptop running a few
  // seconds fast — or one whose timezone was corrected mid-lecture — silently lost its crash
  // recovery, with real audio sitting in storage and nothing offering it back. Whether a
  // recording is still live is a question `looksAbandoned` answers; a clock is not evidence
  // about whether bytes exist.
  void now;
  return manifests
    .filter((manifest) => manifest.state !== "finalized")
    .filter((manifest) => playability(manifest) === "complete" || playability(manifest) === "gapped")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Roughly how much audio a manifest holds, from the part cadence rather than the bytes.
 *
 *  Deliberately derived and deliberately approximate: the exact duration needs the decoded
 *  file, which recovery does not have yet. It exists so the offer can say "about 47 minutes"
 *  instead of "6 parts", which is the difference between a number a student can act on and one
 *  only an engineer can. Rounded DOWN so it never overstates what survived. */
export function approximateSeconds(manifest: RecordingManifest, partSeconds = PART_SECONDS): number {
  const highest = manifest.parts.reduce((max, part) => Math.max(max, part.index), -1);
  return Math.max(0, (highest + 1) * partSeconds);
}

/** Records that can never become an offer, and are safe to forget.
 *
 *  🔴 GUARDED ON `looksAbandoned`, AND THAT GUARD IS THE WHOLE POINT. A session that is being
 *  recorded RIGHT NOW in another tab is briefly empty, and is unplayable until its first part
 *  lands. Pruning on playability alone would therefore delete the recovery record of the live
 *  lecture, in the first seconds of it, which is precisely the recording this system exists to
 *  protect. Only a session that has also gone quiet is finished enough to judge. */
export function retirable(manifests: readonly RecordingManifest[], now: Date): RecordingManifest[] {
  return manifests.filter((manifest) => {
    if (manifest.state === "finalized") return true;
    if (!looksAbandoned(manifest, now)) return false;
    const state = playability(manifest);
    return state === "empty" || state === "unplayable";
  });
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
