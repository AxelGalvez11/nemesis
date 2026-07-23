// The on-device speech model's lifecycle (pure logic, Deno-testable).
//
// The model is a few hundred megabytes and downloads once. Two rules follow
// from that, and both are enforced here rather than at the call site:
//
//   1. It never downloads on a connection we cannot confirm is unmetered.
//   2. A failure does not silently retry. A large download that re-fires every
//      time a student taps record is how a phone plan disappears; retrying is
//      an explicit action.
//
// The native engine cooperates: start() throws rather than downloading, so
// prepare() is the only door and this gate cannot be bypassed by accident.

import type { AsrModelState } from "./asr-engine.ts";

export type { AsrModelState };

/** What the recorder should do about the model before a recording begins. */
export type AsrModelAction = "use" | "download" | "wait" | "fallback";

export interface AsrModelSituation {
  state: AsrModelState;
  supported: boolean;
  /** True only when the connection is known-unmetered. */
  unmetered: boolean;
  /** Set when the student explicitly asked to retry a failed download. */
  retryRequested?: boolean;
}

/**
 * One decision per recording. `fallback` means record with the platform
 * engine — never "refuse to record".
 */
export function planAsrModel(situation: AsrModelSituation): AsrModelAction {
  if (!situation.supported) return "fallback";
  switch (situation.state) {
    case "ready":
      return "use";
    case "downloading":
      return "wait";
    case "failed":
      return situation.retryRequested && situation.unmetered ? "download" : "fallback";
    case "absent":
      return situation.unmetered ? "download" : "fallback";
  }
}

/** State after a transition. Kept pure so the ordering is testable. */
export function nextModelState(current: AsrModelState, event: "start" | "success" | "failure"): AsrModelState {
  switch (event) {
    case "start":
      // Idempotent on purpose: planAsrModel already refuses to start a second
      // download while one is in flight, so this only has to be harmless.
      return "downloading";
    case "success":
      return "ready";
    case "failure":
      return "failed";
  }
}

/** Persisted marker. Anything else (including a missing value) reads as absent
 *  so a corrupt entry re-downloads rather than pretending the model is there. */
const READY_MARKER = "ready";

export function readStoredModelState(raw: string | null | undefined): AsrModelState {
  return raw === READY_MARKER ? "ready" : "absent";
}

export function storedValueFor(state: AsrModelState): string | null {
  return state === "ready" ? READY_MARKER : null;
}
