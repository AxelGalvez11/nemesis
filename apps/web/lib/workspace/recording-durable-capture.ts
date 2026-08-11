// Writing the lecture down while it is still being recorded.
//
// 🔴 ADDITIVE BY DESIGN. The existing finish path — accumulate chunks in memory, join, upload
// once — is left exactly as it was and is still what a normal finish uses. This runs alongside
// it and does one thing: get bytes onto the server early enough that a closed tab cannot take
// them. A rewrite of the working path would put the common case at risk to protect the rare
// one, which is the wrong trade for the thing people actually do every day.
//
// 🔴 AN UPLOAD FAILURE MUST NEVER STOP THE RECORDING. The microphone is the irreplaceable part;
// the network is not. Every failure here keeps the bytes buffered and tries again at the next
// flush, and the recording continues regardless. A durability feature that can end a lecture is
// worse than the problem it solves.

import { supabase } from "@/lib/supabase";

import {
  appendPart,
  newManifest,
  partPath,
  PART_SECONDS,
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
  manifest: () => RecordingManifest;
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
}): DurableCapture {
  const perPart = Math.max(1, Math.round(((input.partSeconds ?? PART_SECONDS) * 1000) / input.chunkMs));

  let manifest = newManifest({
    sessionId: input.sessionId,
    userId: input.userId,
    mimeType: input.mimeType,
    extension: input.extension,
    targetPath: input.targetPath,
    startedAt: new Date().toISOString(),
  });
  writeManifest(manifest);

  /** Chunks not yet part of a successfully uploaded part. */
  let buffered: Blob[] = [];
  let nextIndex = 0;
  /** Uploads are serialised: parts must land in order, and two in flight can reorder. */
  let chain: Promise<void> = Promise.resolve();

  const flush = (): void => {
    if (buffered.length === 0) return;
    const payload = buffered;
    const index = nextIndex;
    // 🔴 Claimed BEFORE the upload resolves. If the next flush reused this index while the
    // first was still in flight, two different runs of audio would fight over one position and
    // one would be silently lost.
    nextIndex += 1;
    buffered = [];

    chain = chain.then(async () => {
      const blob = new Blob(payload, { type: input.mimeType });
      const path = partPath(input.sessionId, index, input.extension);
      try {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
        if (error) throw error;
        manifest = appendPart(manifest, {
          index,
          path,
          bytes: blob.size,
          uploadedAt: new Date().toISOString(),
        });
        writeManifest(manifest);
      } catch {
        // 🔴 Put the bytes BACK at the front of the buffer so the next flush carries them, and
        // release the index so nothing is left with a permanent hole in it. The recording is
        // unaffected — the microphone never stopped.
        buffered = [...payload, ...buffered];
        if (index === nextIndex - 1) nextIndex -= 1;
      }
    });
  };

  return {
    onChunk(blob: Blob) {
      if (blob.size === 0) return;
      buffered.push(blob);
      if (buffered.length >= perPart) flush();
    },
    async finish() {
      flush();
      manifest = { ...manifest, state: "finalizing" };
      await chain;
      manifest = { ...manifest, state: "finalized" };
      writeManifest(manifest);
      return manifest;
    },
    discard() {
      buffered = [];
      forgetManifest(input.sessionId);
    },
    manifest() {
      return manifest;
    },
  };
}
