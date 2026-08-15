// The one decision the handwriting pad makes: given what vision reported, does something land in
// the composer as text, or does the learner see a message instead?
//
// PURE, and separate from handwriting-pad.tsx for the same reason canvas-progression.ts is
// separate from canvas-composer.tsx — this app has no DOM test harness, so a decision worth
// asserting has to live somewhere a test can call it directly.
//
// 🔴 THIS NEVER SUBMITS AN ANSWER. It only ever produces text to place in the composer (mirroring
// dictation's acceptDictation — "It lands in the composer as editable text; it does NOT submit")
// or a message to show instead. Vision OCR mishears exactly like speech recognition mishears, and
// auto-submitting would make a transcription error indistinguishable from a wrong answer in the
// evidence — the same reason dictation never auto-submits either.
//
// 🔴 AN ABSTAINED OR EMPTY READING NEVER BECOMES TEXT. This is where "abstention must be cheap and
// common" is actually enforced for the learner: nothing the model was not confident about, and
// nothing it read as blank, is ever placed in the composer as if it were a real answer.

import type { HandwritingObservation } from "@/lib/handwriting/types";

export type CaptureOutcome =
  | { kind: "text"; text: string }
  | { kind: "message"; message: string };

const READ_FAILURE_MESSAGE = "Nemesis couldn't read that image right now. You can type instead.";
const NOTHING_FOUND_MESSAGE = "Nemesis didn't find anything to read there. You can type instead.";

/** Capitalise and drop a trailing full stop so a model's short reason ("the photo is too dark to
 *  read") composes cleanly into one sentence rather than risking a doubled "..". PURE. */
function toSentence(raw: string): string {
  const trimmed = raw.trim().replace(/[.!?]+$/, "");
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * What the pad should do with one analysis result.
 *
 * 🔴 `null` MEANS THE REQUEST ITSELF FAILED — no response came back at all (network error, a
 * non-200 from the API route). This is a DIFFERENT case from `observation.abstained`, which means
 * a response came back and the model tried and could not read the image — but both land on the
 * same message shape here, because from the learner's side of the composer they call for the
 * identical next step: try again, or type it instead.
 *
 * @param serverError The API route's own error string, when the failure was a real HTTP response
 *   rather than a network-level one — "That image is too large to read" is a different, more
 *   useful thing to tell a learner than the generic fallback below, and the route already writes
 *   it in the same plain, no-em-dash voice this file uses. Ignored when `observation` is present:
 *   a successful read has nothing to do with whatever error string might be left over.
 */
export function captureOutcome(observation: HandwritingObservation | null, serverError?: string | null): CaptureOutcome {
  if (!observation) return { kind: "message", message: serverError?.trim() || READ_FAILURE_MESSAGE };

  if (observation.abstained) {
    const reason = toSentence(observation.abstentionReason ?? "");
    return { kind: "message", message: reason ? `${reason}. You can type instead.` : READ_FAILURE_MESSAGE };
  }

  const text = observation.transcription.trim();
  if (!text) return { kind: "message", message: NOTHING_FOUND_MESSAGE };

  return { kind: "text", text };
}
