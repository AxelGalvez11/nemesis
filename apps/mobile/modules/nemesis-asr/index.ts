// TS face of the on-device Parakeet recognizer (see ios/NemesisAsrModule.swift).
//
// requireOptionalNativeModule is the load-bearing call: it returns null instead
// of throwing when the native side is absent. That is the normal case, not an
// error — every build shipped before this module existed runs this same
// JavaScript, because an over-the-air update cannot add native code. Callers
// read isNemesisAsrAvailable() and fall back to the platform recognizer.
import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

export interface PartialTranscriptEvent {
  transcript: string;
}

export interface NemesisAsrNativeModule {
  /** False when the module is linked but the OS is below FluidAudio's iOS 17. */
  isSupported(): boolean;
  /** Download (first run) and load the model. Idempotent. */
  prepare(): Promise<void>;
  /** Open the mic and begin decoding. */
  start(): Promise<void>;
  /** Close the mic and resolve with the final transcript. */
  stop(): Promise<string>;
  /** The transcript so far, without ending the session. */
  partialTranscript(): Promise<string>;
  /** Free the model from memory. */
  release(): Promise<void>;
  addListener(
    event: "onPartialTranscript",
    listener: (event: PartialTranscriptEvent) => void,
  ): EventSubscription;
}

export const NemesisAsr = requireOptionalNativeModule<NemesisAsrNativeModule>("NemesisAsr");

/**
 * Whether this binary can actually run on-device Parakeet.
 *
 * Wrapped in try/catch on purpose: a module that is present but broken must
 * read as "unavailable" and send the caller down the fallback path, not throw
 * on the way into a recording.
 */
export function isNemesisAsrAvailable(): boolean {
  if (!NemesisAsr) return false;
  try {
    return NemesisAsr.isSupported();
  } catch {
    return false;
  }
}
