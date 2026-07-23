// Which engine the Record screen transcribes with (pure logic, Deno-testable).
//
// WHY THIS EXISTS: live notes are only as good as the text they read. The phone
// has always used Apple's on-device recognizer, so during a lecture the notes
// were summarizing the roughest transcript we ever hold. FluidAudio's streaming
// Parakeet runs on the Apple Neural Engine at a materially lower error rate, on
// device, at no per-minute cost — see docs and the owner decision of
// 2026-07-23. This module decides, per recording, which of the two to use.
//
// THE RULE THAT MATTERS: falling back is always allowed, forcing is not. Every
// path that cannot run Parakeet resolves to the platform engine rather than
// failing, because a student tapping record must always get a recording. An
// unavailable engine is a worse transcript; a broken selector is a lost lecture.

/** The transcription engine used for one recording session. */
export type AsrEngine = "parakeet" | "apple";

/** Whether the on-device Parakeet model is present and usable on this phone. */
export type AsrModelState = "absent" | "downloading" | "ready" | "failed";

export interface AsrCapability {
  /** `Platform.OS`. FluidAudio is Apple-only. */
  platform: string;
  /**
   * Is the native module linked into THIS BINARY? Not a settings flag — a
   * check that the native side actually exists. Every build shipped before the
   * module did runs this same JS (an over-the-air update cannot add native
   * code), so trusting anything else here would call into a module that isn't
   * there and take the recorder down with it.
   */
  nativeAvailable: boolean;
  modelState: AsrModelState;
  /**
   * Unmetered connection (wifi). `undefined` means unknown, which is treated
   * as metered — a few hundred megabytes must never leave on a guess.
   */
  unmetered?: boolean;
  /** Debug/settings override. Can force `apple`, can never force `parakeet`. */
  override?: AsrEngine;
}

function parakeetUsable(cap: AsrCapability): boolean {
  return cap.platform === "ios" && cap.nativeAvailable && cap.modelState === "ready";
}

/** The engine to record with. Never throws, always returns a usable engine. */
export function selectAsrEngine(cap: AsrCapability): AsrEngine {
  if (cap.override === "apple") return "apple";
  return parakeetUsable(cap) ? "parakeet" : "apple";
}

/**
 * Whether to kick off the one-time model download.
 *
 * `failed` deliberately does NOT retry: a large download that re-fires every
 * time the student taps record is how a phone plan disappears. Retry is an
 * explicit action, not an automatic one.
 */
export function shouldDownloadAsrModel(cap: AsrCapability): boolean {
  if (cap.platform !== "ios" || !cap.nativeAvailable) return false;
  if (cap.modelState !== "absent") return false;
  return cap.unmetered === true;
}

/** One plain line for a settings row — names the actual blocker, not a code. */
export function asrEngineReason(cap: AsrCapability): string {
  if (cap.platform !== "ios") return "Android uses the built-in speech recognizer.";
  if (!cap.nativeAvailable) return "Update the app to use on-device high-accuracy transcription.";
  if (cap.modelState === "downloading") return "Downloading the high-accuracy speech model…";
  if (cap.modelState === "failed") return "The speech model download failed. Tap to try again.";
  if (cap.modelState === "absent") return "Connect to wifi to download the high-accuracy speech model.";
  if (cap.override === "apple") return "Using the built-in speech recognizer (set in Settings).";
  return "Using on-device high-accuracy transcription.";
}
