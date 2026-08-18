/**
 * Is the transcript the device already made good enough to use instead of paying for one?
 *
 * 🔴🔴 THE TOP RUNG OF THE AUDIO CASCADE, AND IT WAS MISSING. The owner's order is *"existing
 * transcript available → on-device/native transcript available and trustworthy → use it → otherwise
 * cheap batch STT."* Every rung Nemesis had was a paid provider. Audio is the most expensive lane
 * in this product by a wide margin — roughly fifteen times the entire AI lane, per
 * `workload-cost.ts` — so the cheapest possible transcription is the one nobody is billed for, and
 * a phone that has already produced one for free should not be ignored.
 *
 * 🔴 A MIRROR, AND THE DENO SIDE IS CANONICAL. The rule runs inside
 * `supabase/functions/nemesis-transcribe`, which is a Deno process this app cannot import from.
 * The same pattern `workload-cost.ts` uses applies here: the constants are duplicated deliberately,
 * and `device-transcript.test.ts` reads the function off disk and fails when the two drift. A rule
 * that lives only in a process with no test runner in this repository is a rule nobody checks.
 *
 * 🔴 AND "TRUSTWORTHY" IS A MEASUREMENT RATHER THAN A CLAIM. A client can send anything. The
 * failure this prevents is silent and permanent: the audio object is deleted the moment a
 * transcript is accepted, so a three-word transcript for a forty-minute lecture becomes the
 * lecture, with no second chance to transcribe it properly. Falling through to a paid provider
 * costs cents; accepting a bad transcript costs the recording.
 *
 * PURE.
 */

/**
 * Characters of transcript per second of audio, below which a device transcript is not one.
 *
 * 🔴 MEASURED FROM SPEECH ITSELF, NOT CHOSEN. Ordinary lecture delivery is roughly 130-160 words a
 * minute and an English word averages about five characters with its space, so a real transcript
 * runs 11-13 characters per second. Four is a third of the slowest end: it accepts a quiet seminar,
 * a recording with long pauses and a language whose words are shorter, and it refuses the cases
 * that actually happen — a transcript that stopped after the first minute, one the device never had
 * permission to make, and one that is a placeholder.
 *
 * 🔴 IT IS A FLOOR, NEVER A CEILING. Too much text is not a reason to distrust a transcript.
 */
export const MIN_DEVICE_CHARS_PER_SECOND = 4;

/** Below this many characters nothing is a lecture, however short the clip. */
export const MIN_DEVICE_CHARS = 40;

export function deviceTranscriptUsable(transcript: string, seconds: number): boolean {
  const text = transcript.trim();
  if (text.length < MIN_DEVICE_CHARS) return false;
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  return text.length >= seconds * MIN_DEVICE_CHARS_PER_SECOND;
}
