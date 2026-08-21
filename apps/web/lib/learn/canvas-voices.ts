// The voices a learner can choose between, and the one they get if they never choose.
//
// 🔴🔴 THIS LIST IS A MEASUREMENT, NOT A GUESS, AND THAT DISTINCTION IS THE WHOLE FILE. xAI answers
// `GET /v1/voices` with a **404** on our key, and no public documentation this repository could find
// names the ids. An unrecognised `voice_id` is not a cosmetic error — the provider returns 502, and
// to the learner that is indistinguishable from voice mode being broken.
//
// So the six below were established by sending two characters in each candidate voice through the
// deployed function and recording which returned audio (`scripts/xai-voices-probe.sh`, 2026-08-20):
//
//     eve 200 · ara 200 · rex 200 · gork 200 · sal 200 · leo 200
//     ani 502 · thomas 502 · zzzznotavoice 502
//
// The three refusals are the calibration: a probe where everything passes proves nothing. Re-run
// the script before adding an id here.
//
// 🔴 THE DESCRIPTIONS ARE DELIBERATELY THIN, AND THAT IS HONESTY RATHER THAN LAZINESS. Nobody at
// this repository has sat and listened to all six; writing "warm and reassuring" next to a voice on
// that basis would be inventing a claim the learner can immediately check and find false. They are
// named, they are orderable, and the learner presses one to hear it.
//
// PURE. No React, no I/O.

/** What the function falls back to, and what every canvas has spoken in until now. */
export const DEFAULT_VOICE = "eve";

export interface CanvasVoice {
  id: string;
  /** What the picker shows. The provider's own name, capitalised. */
  label: string;
}

export const CANVAS_VOICES: readonly CanvasVoice[] = [
  { id: "eve", label: "Eve" },
  { id: "ara", label: "Ara" },
  { id: "rex", label: "Rex" },
  { id: "gork", label: "Gork" },
  { id: "sal", label: "Sal" },
  { id: "leo", label: "Leo" },
];

/** Where the choice is kept. Versioned, like every other key this app stores. */
export const VOICE_STORAGE_KEY = "nemesis.canvas.voice.v1";

/**
 * The stored choice, or the default.
 *
 * 🔴 AN UNKNOWN STORED ID RESOLVES TO THE DEFAULT RATHER THAN BEING SENT. If xAI retires a voice,
 * whoever had it selected would otherwise get a 502 on every utterance with no way to tell that
 * from voice mode being broken — and the setting that caused it is three menus away. The function
 * falls back too, for the same reason; this is the near side of the same guard, and having both is
 * deliberate: one of them is reachable without a network round trip.
 */
export function readVoice(stored: string | null): string {
  const id = (stored ?? "").trim();
  return CANVAS_VOICES.some((voice) => voice.id === id) ? id : DEFAULT_VOICE;
}

/** What the picker shows as the current selection. */
export function voiceLabel(id: string): string {
  return CANVAS_VOICES.find((voice) => voice.id === id)?.label ?? "Eve";
}
