// Offering an interrupted recording back.
//
// The durability layer writes parts to storage while the lecture is happening, so the bytes
// survive a closed tab. That is only half a feature: until something puts the recording in front
// of the student again, "safe" and "lost" look identical from their side. This is that half.
//
// 🔴 RECOVERING AUDIO IS NOT RESUMING A RECORDING. Nothing in this module opens a microphone,
// and nothing it returns can be used to. After a crash Nemesis rebuilds and saves what was
// already captured; if the student wants to keep recording they start a new one, deliberately.
// Two discontinuous captures are not one continuous lecture, and pretending otherwise would put
// a gap in the middle of a file that claims to be whole.

import {
  approximateSeconds,
  assemblyOrder,
  missingParts,
  playability,
  totalBytes,
  type RecordingManifest,
} from "./recording-manifest";

/** What the offer says, in the student's terms. */
export interface RecoveryOffer {
  sessionId: string;
  /** "47m 18s" — approximate and never overstated. See `approximateSeconds`. */
  duration: string;
  /** One plain sentence, or null when the recording is whole and needs no caveat. */
  caveat: string | null;
  bytes: number;
  parts: number;
}

/** Minutes and seconds, the way the live recorder already writes them. */
function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/** Turn a manifest into the offer, or null when there is nothing honest to offer.
 *
 *  🔴 Returns null for a set whose first part never landed. Those bytes cannot be decoded — the
 *  container header is in part 0 — so an offer would be a promise the recovery cannot keep. */
export function recoveryOffer(manifest: RecordingManifest, partSeconds?: number): RecoveryOffer | null {
  const state = playability(manifest);
  if (state === "empty" || state === "unplayable") return null;

  const gaps = missingParts(manifest);
  return {
    bytes: totalBytes(manifest),
    caveat:
      gaps.length === 0
        ? null
        : // Named rather than hidden: a lecture that jumps reads as a transcription error later,
          // and nobody traces that back to an upload that failed weeks earlier.
          `A short piece in the middle didn't save, so the audio skips ${gaps.length === 1 ? "once" : `${gaps.length} times`}.`,
    duration: duration(approximateSeconds(manifest, partSeconds)),
    parts: manifest.parts.length,
    sessionId: manifest.sessionId,
  };
}

/** The request body the recover route expects for this manifest. */
export function recoveryRequest(manifest: RecordingManifest): {
  contentType: string;
  parts: { index: number; path: string }[];
  targetPath: string;
} {
  return {
    // The bucket's allow-list holds bare types; MediaRecorder reports "audio/webm;codecs=opus".
    contentType: (manifest.mimeType.split(";")[0] ?? "audio/webm").trim() || "audio/webm",
    parts: manifest.parts.map((part) => ({ index: part.index, path: part.path })),
    targetPath: manifest.targetPath,
  };
}

/** Paths in playing order — exported so a caller can check the order it is about to send. */
export function recoveryOrder(manifest: RecordingManifest): string[] {
  return assemblyOrder(manifest);
}
