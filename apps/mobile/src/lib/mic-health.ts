// Is the microphone actually hearing the lecturer?
//
// Owner 2026-07-29: "can we have dynamic text to tell users that audio is not
// being picked up". The recorder draws a waveform now, which shows level — but a
// waveform sitting flat is only informative to someone who already knows what it
// should look like. This turns the same level stream into one of three states a
// sentence can be written about.
//
// PURE ON PURPose, and separate from the hook that drives it: the hook talks to a
// native event stream and cannot run under the mobile test runner, while the
// decision of what counts as "we can't hear you" is exactly the part worth
// testing. Everything here is a function of (previous state, level, clock).
//
// 🔴 HYSTERESIS IS THE WHOLE DESIGN, not a refinement.
// A lecturer pauses between sentences, drinks water, waits for a slide. If the
// warning appeared during those, it would fire several times a minute in a
// perfectly good recording — and a warning that cries wolf is worse than no
// warning at all, because it teaches the student to ignore the one that matters.
// So the two directions are deliberately asymmetric:
//
//   quiet -> warning : SLOW. Several seconds of sustained quiet, never one dip.
//   warning -> fine  : INSTANT. One real sample clears it, because the moment we
//                      can hear again the warning is simply false.
//
// The distinction between "silent" and "faint" is worth keeping separate because
// the advice differs: silence usually means the microphone is blocked or the app
// lost the mic, while faint means it is working and simply too far away — and
// only the second one is fixed by moving the phone.

/** What the microphone is picking up right now. */
export type MicHealth = "hearing" | "faint" | "silent";

/** Above this (0..1 normalised — see lib/mic-level.ts) we treat the input as
 *  real speech and say nothing at all. Deliberately low: a lecturer across a
 *  room is quiet, and this must not nag through an entirely usable recording.
 *  That is the same reality that made xAI's own 0.5 gate throw whole lectures
 *  away — see supabase/functions/nemesis-transcribe/index.ts. */
const SPEECH_FLOOR = 0.18;

/** Below this, across a whole quiet spell, means nothing is arriving at all —
 *  as opposed to arriving faintly. */
const SILENCE_CEILING = 0.05;

/** How long a quiet spell must last before we say anything. Long enough to sit
 *  through a natural pause, short enough that a student who muted their phone
 *  finds out inside the first sentence rather than at the end of the hour. */
export const SILENT_AFTER_MS = 4_000;

/** Faint audio is still being transcribed, so it earns a longer rope than
 *  silence before we interrupt with advice. */
export const FAINT_AFTER_MS = 7_000;

export interface MicHealthState {
  health: MicHealth;
  /** When the level last dropped below SPEECH_FLOOR, or null while we can hear. */
  belowSince: number | null;
  /** Loudest sample seen since dropping below — what separates faint from silent. */
  peakWhileBelow: number;
}

/** Assume the best before any audio has arrived. A recorder that accused the
 *  student of silence in its first frame, before the engine had published a
 *  single sample, would be wrong every single time. */
export function initialMicHealth(): MicHealthState {
  return { belowSince: null, health: "hearing", peakWhileBelow: 0 };
}

/**
 * Fold one level reading into the state.
 *
 * `now` is passed in rather than read from the clock so this stays pure and the
 * timing rules above are testable without waiting real seconds.
 */
export function stepMicHealth(state: MicHealthState, level: number, now: number): MicHealthState {
  const safe = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;

  // Recovery is immediate and unconditional — see the asymmetry note above.
  if (safe >= SPEECH_FLOOR) return { belowSince: null, health: "hearing", peakWhileBelow: 0 };

  const belowSince = state.belowSince ?? now;
  const peakWhileBelow = Math.max(state.peakWhileBelow, safe);
  const quietFor = Math.max(0, now - belowSince);

  // Nothing at all, for long enough to mean it.
  if (peakWhileBelow < SILENCE_CEILING && quietFor >= SILENT_AFTER_MS) {
    return { belowSince, health: "silent", peakWhileBelow };
  }
  // Something, but too little.
  if (quietFor >= FAINT_AFTER_MS) return { belowSince, health: "faint", peakWhileBelow };

  // Inside the grace window: hold whatever we last said. This is the branch that
  // makes an ordinary pause invisible.
  return { belowSince, health: state.health, peakWhileBelow };
}

/**
 * The line shown under the waveform.
 *
 * Written as advice rather than diagnosis, because the student cannot act on
 * "input level below threshold" and can act on "move the phone closer". The
 * hearing case says the plainest true thing and gets out of the way.
 *
 * 🔴 WHAT THIS CAN AND CANNOT KNOW. Levels come from the SPEECH RECOGNISER's
 * volume events, so this reports what the recogniser hears — not proof that the
 * audio file is being written. If recognition stops mid-lecture the levels stop
 * with it, and this will say "silent" even though the recording may still be
 * capturing. So it never claims recording has failed, only that we cannot hear
 * anything — which is true either way, and is the part the student can act on.
 */
export function micHealthMessage(health: MicHealth): string {
  if (health === "silent") return "We can't hear anything — check the phone isn't covered or muted.";
  if (health === "faint") return "That's very faint — move the phone closer to whoever is speaking.";
  return "Listening";
}
