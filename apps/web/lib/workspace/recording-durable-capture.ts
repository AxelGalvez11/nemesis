// Writing the lecture down while it is still being recorded.
//
// 🔴 ADDITIVE BY DESIGN. The existing finish path — accumulate chunks in memory, join, upload
// once — is left exactly as it was and is still what a normal finish uses. This runs alongside
// it and does one thing: get bytes onto the server early enough that a closed tab cannot take
// them. A rewrite of the working path would put the common case at risk to protect the rare
// one, which is the wrong trade for the thing people actually do every day.
//
// 🔴 AN UPLOAD FAILURE MUST NEVER STOP THE RECORDING. The microphone is the irreplaceable part;
// the network is not. Every failure here keeps the bytes and tries again at the next flush, and
// the recording continues regardless. A durability feature that can end a lecture is worse than
// the problem it solves.
//
// ── 🔴 A SEQUENCE NUMBER IS BOUND TO ITS BYTES AND NEVER MOVES ───────────────────────────────
//
// This is the correctness property of the whole file, and the first version got it wrong. It
// claimed an index from a counter, and on failure returned the bytes to a shared buffer and
// tried to hand the index back — which only worked if no later flush had already claimed one.
// That condition is false in exactly the case that matters: a SLOW upload is what lets the next
// flush happen first. So the failed payload was re-uploaded at a LATER index, and the opening of
// the lecture — the piece carrying the container header — landed in the middle of the file.
//
// Assembly by index is only correct if an index means the same bytes forever. A part is
// therefore given its position the moment it is cut, and it keeps that position through every
// retry until it lands or the recording ends.

import { supabase } from "@/lib/supabase";

import {
  appendPart,
  newManifest,
  partPath,
  PART_SECONDS,
  playability,
  type RecordingManifest,
} from "./recording-manifest";

const BUCKET = "recordings";
const MANIFEST_PREFIX = "nemesis.recording.manifest.v1.";
const MANIFEST_INDEX = "nemesis.recording.manifests.v1";

export interface DurableCapture {
  /** Hand over each chunk MediaRecorder produces. Never throws. */
  onChunk: (blob: Blob) => void;
  /** Flush whatever is buffered and mark the session finished. Never throws. */
  finish: () => Promise<RecordingManifest>;
  /** The learner threw the recording away — forget the local record of it. */
  discard: () => void;
  /** Wait for uploads already in flight. For tests and for anything that needs to read the
   *  manifest at a settled moment; the recorder itself never waits on this. */
  settled: () => Promise<void>;
  manifest: () => RecordingManifest;
}

/** Put these bytes at this path. Throws on failure. Injected so the ordering rules above can be
 *  tested without a network, a bucket, or a microphone. */
export type UploadPart = (path: string, blob: Blob) => Promise<void>;

async function uploadToBucket(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
  if (error) throw error;
}

// ------------------------------------------------------------- local record

function writeManifest(manifest: RecordingManifest): void {
  try {
    window.localStorage.setItem(MANIFEST_PREFIX + manifest.sessionId, JSON.stringify(manifest));
    const index = readIndex().filter((id) => id !== manifest.sessionId);
    window.localStorage.setItem(MANIFEST_INDEX, JSON.stringify([manifest.sessionId, ...index].slice(0, 20)));
  } catch {
    // 🔴 A full or blocked localStorage costs us the RECOVERY RECORD, not the audio — the parts
    // are already in cloud storage either way. Losing the ability to offer a recording back is
    // bad; interrupting the lecture to complain about it is worse.
  }
}

function readIndex(): string[] {
  try {
    const raw = window.localStorage.getItem(MANIFEST_INDEX);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Every manifest this browser knows about, newest first. */
export function storedManifests(): RecordingManifest[] {
  const out: RecordingManifest[] = [];
  for (const id of readIndex()) {
    try {
      const raw = window.localStorage.getItem(MANIFEST_PREFIX + id);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as RecordingManifest;
      if (parsed?.sessionId && Array.isArray(parsed.parts)) out.push(parsed);
    } catch {
      // A corrupt entry is skipped, not fatal — the others are still recoverable.
    }
  }
  return out;
}

export function forgetManifest(sessionId: string): void {
  try {
    window.localStorage.removeItem(MANIFEST_PREFIX + sessionId);
    window.localStorage.setItem(MANIFEST_INDEX, JSON.stringify(readIndex().filter((id) => id !== sessionId)));
  } catch {
    // Nothing to do; a stale entry is filtered on read anyway.
  }
}

// ----------------------------------------------------------------- capture

export function createDurableCapture(input: {
  userId: string;
  sessionId: string;
  mimeType: string;
  extension: string;
  targetPath: string;
  /** Seconds of audio per part. Defaults to PART_SECONDS — the worst-case loss window. */
  partSeconds?: number;
  /** MediaRecorder's timeslice, so we know how many chunks make a part. */
  chunkMs: number;
  /** Where the bytes go. Defaults to the recordings bucket. */
  upload?: UploadPart;
}): DurableCapture {
  const perPart = Math.max(1, Math.round(((input.partSeconds ?? PART_SECONDS) * 1000) / input.chunkMs));
  const upload = input.upload ?? uploadToBucket;

  let manifest = newManifest({
    sessionId: input.sessionId,
    userId: input.userId,
    mimeType: input.mimeType,
    extension: input.extension,
    targetPath: input.targetPath,
    startedAt: new Date().toISOString(),
  });
  writeManifest(manifest);

  /** Chunks not yet cut into a part. */
  let buffered: Blob[] = [];
  /** The next position to hand out. Only ever increases. */
  let nextIndex = 0;
  /** Parts that have been cut and are waiting to land, each holding the position it was cut at.
   *  🔴 An entry leaves this list ONLY by being uploaded successfully. There is deliberately no
   *  path that returns its bytes to `buffered`, because that is what moved audio down the file. */
  let pending: { index: number; chunks: Blob[] }[] = [];
  /** Uploads are serialised so a slow one cannot interleave with a retry of the same part. */
  let chain: Promise<void> = Promise.resolve();

  /** Cut whatever is buffered into a part and give it its permanent position. */
  const cut = (): void => {
    if (buffered.length === 0) return;
    pending.push({ chunks: buffered, index: nextIndex });
    nextIndex += 1;
    buffered = [];
  };

  /** Try to land everything still pending, oldest position first.
   *
   *  Oldest first because part 0 carries the container header: until it lands there is no
   *  playable recording at all, so it is the part most worth retrying soonest. A part that
   *  fails is left where it is and tried again at the next flush — later parts still upload,
   *  since a hole that fills in later is far better than a queue that stalls behind one bad
   *  request. */
  const drain = (): void => {
    chain = chain.then(async () => {
      for (const part of [...pending].sort((a, b) => a.index - b.index)) {
        const blob = new Blob(part.chunks, { type: input.mimeType });
        const path = partPath(input.userId, input.sessionId, part.index, input.extension);
        try {
          await upload(path, blob);
          pending = pending.filter((entry) => entry.index !== part.index);
          manifest = appendPart(manifest, {
            bytes: blob.size,
            index: part.index,
            path,
            uploadedAt: new Date().toISOString(),
          });
          writeManifest(manifest);
        } catch {
          // Stays pending, WITH ITS INDEX, for the next flush. The microphone never stopped.
        }
      }
    });
  };

  return {
    onChunk(blob: Blob) {
      if (blob.size === 0) return;
      buffered.push(blob);
      if (buffered.length < perPart) return;
      cut();
      drain();
    },
    async finish() {
      cut();
      manifest = { ...manifest, state: "finalizing" };
      drain();
      await chain;
      // 🔴 "finalized" is a claim that the audio is safe, so it is only made when it is. A
      // network that never came back leaves the recording INCOMPLETE, which is what keeps it in
      // the recovery list instead of retiring it as done.
      const landed = pending.length === 0 && playability(manifest) !== "unplayable";
      manifest = { ...manifest, state: landed ? "finalized" : "incomplete" };
      writeManifest(manifest);
      return manifest;
    },
    discard() {
      buffered = [];
      pending = [];
      forgetManifest(input.sessionId);
    },
    settled() {
      return chain;
    },
    manifest() {
      return manifest;
    },
  };
}
