// The allowance every second of synthesised or scored speech is charged against.
//
// 🔴🔴🔴 THIS EXISTS BECAUSE THE LANGUAGE LANE WAS UNMETERED, AND NOBODY COULD SEE IT. Audited
// 2026-08-31 while pricing the $19.99 plan: `/api/speech/tts` and `/api/speech/pronunciation` both
// reached Azure with the server's key and counted NOTHING — no counter, no entitlement, no refusal.
// The only gate on either was "is this request signed in", which a free account satisfies. At the
// rates read off Azure's price page that is $0.82 an hour of speech and $1.30 an hour of scoring:
// about $51 a day, per account, with nothing in the system able to stop it.
//
// 🔴 THE OWNER CHOSE THE EXACT VERSION — 2026-08-31: *"proxy the audio and count it exactly."* The
// proxy already existed (the product has never sent audio straight from the browser; `/api/speech/
// token` was a bypass nothing used, and it is deleted in the same change). What was missing was the
// counting, which is this file.
//
// 🔴 IT REUSES THE VOICE ALLOWANCE RATHER THAN INVENTING A SECOND ONE. `voice_seconds_month_limit`
// already exists on every plan, `consume_voice_seconds` already enforces it under an advisory lock,
// and `nemesis-speak` already charges the xAI lane against it. A student's question is "how much
// speech do I get", not "how much of each vendor" — and one budget cannot drift out of step with
// itself the way two would. The plans carry 900 seconds free and 18,000 on Nemesis.
//
// 🔴 CHARGED BEFORE THE PROVIDER IS CALLED, NEVER AFTER. `nemesis-speak` states the reason and it
// is worth repeating rather than referencing: *"a meter that runs afterwards can only ever report
// an overrun it already paid for."* A refusal has to happen while the money is still ours.

import { adminClient } from "@/lib/server";

/**
 * Characters of text per second of audio.
 *
 * 🔴 MIRRORS `CHARS_PER_SECOND` IN `supabase/functions/nemesis-speak/index.ts`, which mirrors
 * `SPEECH_CHARS_PER_MINUTE` in the cost model. Three copies is two too many, but they live in three
 * deployment units that cannot import each other; the guard in `speech-meter.test.ts` fails if they
 * ever disagree, which is the part that actually matters.
 */
export const VOICE_CHARS_PER_SECOND = 850 / 60;

/**
 * Bytes of attempt audio per second.
 *
 * 🔴 THE ROUTE'S OWN ASSUMPTION, NOT A NEW ONE — `/api/speech/pronunciation` already sizes its
 * upload ceiling as `MAX_ATTEMPT_SECONDS * 64_000 / 8`. Charging on a different rate than the one
 * the ceiling is built from would let a file that passes the size check exceed its own charge.
 */
export const ATTEMPT_BYTES_PER_SECOND = 64_000 / 8;

export type VoiceKind = "tts" | "stt";

export type Charge =
  | { readonly allowed: true; readonly seconds: number }
  | { readonly allowed: false; readonly reason: string; readonly seconds: 0 };

/** Seconds to charge for synthesising `characters` of text. At least one: a request that reaches a
 *  paid provider is never free, and a zero would make the meter skippable by sending one word. */
export function secondsForCharacters(characters: number): number {
  return Math.max(1, Math.ceil(Math.max(0, characters) / VOICE_CHARS_PER_SECOND));
}

/** Seconds to charge for an attempt of `bytes`. Rounded UP, for the same reason. */
export function secondsForAttemptBytes(bytes: number): number {
  return Math.max(1, Math.ceil(Math.max(0, bytes) / ATTEMPT_BYTES_PER_SECOND));
}

/**
 * Charge the learner's monthly voice allowance, and say whether to proceed.
 *
 * 🔴 A DATABASE THAT CANNOT BE REACHED LETS THE SPEECH THROUGH, AND THAT IS DELIBERATE — the same
 * call `nemesis-speak` makes, for the same reason: one unmetered phrase costs a fraction of a cent,
 * and taking the language lane down for everyone the first time the database blips is the worse
 * failure. It is logged loudly so a persistent outage is visible rather than free.
 */
export async function chargeVoice(userId: string, seconds: number, kind: VoiceKind): Promise<Charge> {
  const charge = Math.max(1, Math.round(seconds));
  try {
    const { data, error } = await adminClient().rpc("consume_voice_seconds", {
      p_kind: kind,
      p_seconds: charge,
      p_user_id: userId,
    });
    if (error) {
      console.error(JSON.stringify({ event: "voice_meter_unreachable", kind, message: error.message }));
      return { allowed: true, seconds: charge };
    }
    const verdict = (data ?? null) as { allowed?: unknown; reason?: unknown } | null;
    if (verdict?.allowed === true) return { allowed: true, seconds: charge };
    return { allowed: false, reason: typeof verdict?.reason === "string" ? verdict.reason : "quota_exceeded", seconds: 0 };
  } catch (cause) {
    console.error(JSON.stringify({ event: "voice_meter_failed", kind, message: String(cause) }));
    return { allowed: true, seconds: charge };
  }
}

/** The one refusal both routes give, so a learner meets the same sentence whichever ran out. */
export function quotaResponse(reason: string): { error: string; reason: string } {
  return {
    error: reason === "missing_entitlement"
      ? "Speech is not available on this plan."
      : "You have used this month's speech. It resets on the 1st.",
    reason,
  };
}
