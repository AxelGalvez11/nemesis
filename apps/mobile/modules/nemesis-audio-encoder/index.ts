// Local Expo module: re-encode a recorded PCM WAV as AAC in an m4a container.
//
// THIS IS THE UNBLOCK, not an optimisation. `expo-speech-recognition` can only
// persist raw PCM, which is ~115 MB/hr, and the private `recordings` bucket caps
// a file at 40 MB AND does not list `audio/wav` among its accepted types — so
// every phone upload was rejected outright and the student silently kept the
// rough on-device transcript. AAC at 32 kbps is ~14 MB/hr and `audio/m4a` is
// already accepted, so this makes the upload work with NO production storage
// change.
//
// It does not reduce the transcription bill — providers charge by DURATION, not
// bytes. That is lib/wav-trim.ts's job, and it runs FIRST: trim the raw PCM
// (easy, and only possible while it is still PCM), then compress what survives.

import { requireOptionalNativeModule } from "expo";

export interface EncodedAudio {
  /** `file://` URI of the m4a. */
  uri: string;
  /** Duration of the SOURCE audio in seconds, as AVFoundation measured it. */
  seconds: number;
  /** Size of the encoded file in bytes. */
  bytes: number;
}

interface NemesisAudioEncoderNativeModule {
  encodeToM4A(sourceUri: string, targetUri: string, bitRate: number): Promise<EncodedAudio>;
}

/**
 * Optional on purpose. The module is Apple-only and lives in the binary, so it
 * is absent on Android, in Expo Go, and in any JS-only test environment.
 * `requireOptionalNativeModule` returns null there instead of throwing, and
 * `encodeToM4A` below reports that as "not available" so the caller can fall
 * back to uploading what it already has.
 */
const native = requireOptionalNativeModule<NemesisAudioEncoderNativeModule>("NemesisAudioEncoder");

/** Whether this build can compress audio at all. */
export const canEncodeAudio = native !== null;

/**
 * 32 kbps mono AAC — the same rate the web recorder uses, chosen because it is
 * what keeps an hour comfortably inside the bucket's 40 MB limit. Speech stays
 * clearly intelligible at this rate, and the transcription provider is not
 * listening for music.
 */
export const DEFAULT_BIT_RATE = 32_000;

/**
 * Encode `sourceUri` to `targetUri`, or return null if this build cannot (no
 * native module) or the encode failed. Never throws: a failed compression must
 * leave the caller free to upload the original rather than lose the recording.
 */
export async function encodeToM4A(
  sourceUri: string,
  targetUri: string,
  bitRate: number = DEFAULT_BIT_RATE,
): Promise<EncodedAudio | null> {
  if (!native) return null;
  try {
    return await native.encodeToM4A(sourceUri, targetUri, bitRate);
  } catch (error) {
    console.warn("audio compression failed, uploading the original", (error as Error)?.message);
    return null;
  }
}
