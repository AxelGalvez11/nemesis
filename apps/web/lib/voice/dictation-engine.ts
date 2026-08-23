// WHICH engine listens, and what it is allowed to send.
//
// 🔴🔴 THE BROWSER FIRST, xAI ONLY WHERE THE BROWSER CANNOT (owner, 2026-08-22). The Web Speech API
// is free, on-device, and writes words on screen while you are still saying them; nothing bought
// with a network round trip beats that, and no audio leaves the machine. What it is not is
// universal — Firefox ships no recogniser at all, and until now the microphone simply DISAPPEARED
// there. "Not supported" was rendered as "this control does not exist", which is indistinguishable
// from a product that has no dictation.
//
// 🔴 SO THE FALLBACK IS ABOUT REACH, NOT QUALITY, AND THE ORDER MATTERS BOTH WAYS. Putting xAI
// first everywhere would trade instant on-device text for an upload and a wait on the majority of
// browsers, which is the opposite of what this session spent its time fixing. Putting it nowhere
// leaves a whole browser unable to talk to Nemesis.
//
// 🔴 AND IT IS NOT LANGUAGE-LOCKED, EVEN THOUGH ENGLISH IS THE DEFAULT. Nemesis is field- AND
// language-agnostic: a learner working in Portuguese who dictates an answer must get Portuguese
// back. The browser's own language is the best signal available at the microphone, and `en` is what
// it falls back to.
//
// PURE. No React, no MediaRecorder, no fetch — `use-canvas-dictation.ts` owns the I/O.

/** Which engine will actually listen. */
export type DictationEngine =
  /** The Web Speech API: on-device, free, live interim words. */
  | "browser"
  /** Record, then transcribe through `nemesis-dictate`. No interim text; one wait at the end. */
  | "xai"
  /** Neither. The caller must still offer typing. */
  | "none";

export interface EngineSupport {
  /** `window.SpeechRecognition` or the webkit spelling exists. */
  readonly speechRecognition: boolean;
  /** `MediaRecorder` and `getUserMedia` both exist. */
  readonly mediaRecorder: boolean;
}

/**
 * 🔴 A FUNCTION OF WHAT THE BROWSER HAS, NEVER OF WHICH BROWSER IT IS. A user-agent test would be
 * wrong the first time a vendor ships or removes a recogniser, and this repo has no way to notice
 * that happening. Feature presence is checkable and self-correcting.
 */
export function engineFor(support: EngineSupport): DictationEngine {
  if (support.speechRecognition) return "browser";
  if (support.mediaRecorder) return "xai";
  return "none";
}

/**
 * How long one dictated answer may run.
 *
 * 🔴 A BOUND ON THE BILL AS WELL AS ON THE WAIT. This lane is metered against the same monthly
 * conversational-voice allowance as reading aloud, and a microphone left open in a pocket is the
 * classic way that allowance disappears overnight. Two minutes is far longer than any answer
 * anybody composes out loud, and short enough that a forgotten recorder costs pennies.
 */
export const MAX_DICTATION_SECONDS = 120;

/**
 * The container the clip is recorded in.
 *
 * 🔴 ASKED OF THE BROWSER RATHER THAN ASSUMED, AND ORDERED BY WHAT THE PROVIDER READS. Opus in WebM
 * is what Firefox — the browser this lane exists for — produces natively, and xAI has read it in
 * production on this account. MP4/AAC is Safari's, for the day it drops Web Speech. An empty string
 * means "let the browser choose", which is a legitimate answer and not a failure: every engine has
 * a default, and one it picked itself is one it can definitely write.
 */
export const DICTATION_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export function pickDictationMime(isSupported: (type: string) => boolean): string {
  for (const type of DICTATION_MIMES) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // A browser that throws on the question has answered it.
    }
  }
  return "";
}

/**
 * The language tag sent with the clip.
 *
 * 🔴 THE PRIMARY SUBTAG ONLY, AND `en` WHEN THERE IS NOTHING TO GO ON. The provider takes a
 * language, not a variety — `pt-BR` and `pt-PT` are one value to it — and sending the full tag
 * where a language is expected is the kind of field that gets silently ignored rather than
 * rejected. Anything that is not a language subtag at all falls back rather than being forwarded.
 */
export function dictationLanguage(navigatorLanguage: string | undefined | null): string {
  const primary = (navigatorLanguage ?? "").trim().split("-")[0]?.toLowerCase() ?? "";
  return /^[a-z]{2,3}$/.test(primary) ? primary : "en";
}
