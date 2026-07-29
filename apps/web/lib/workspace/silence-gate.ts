// Voice-activated capture (owner 2026-07-27: "we should also drop silence from
// the recording so only the real audio gets processed").
//
// The recorder is PAUSED while the room is quiet rather than trimmed
// afterwards. Pausing costs nothing: MediaRecorder.pause() simply stops adding
// bytes, so the quiet never enters the file, never uploads, and is never billed
// — transcription is priced per second of audio. Trimming after the fact would
// mean decoding and re-encoding a lecture in the browser, which needs an
// encoder we do not ship and would burn the student's battery to reach the
// same place.
//
// Everything here is pure so the thresholds can be tested without a microphone.
// The decision this makes is destructive — audio it drops is gone — so it errs
// heavily toward keeping sound: a long hold before pausing, an instant resume,
// and a floor that learns quiet fast but loudness slowly.

/**
 * The absolute bottom of the bar. Only a guard: a digital-silence input reads 0,
 * so without this the adaptive floor would collapse to 0 and nothing would ever
 * count as quiet. It is NOT meant to decide what speech sounds like.
 *
 * 🔴 THIS WAS 0.035, AND IT THREW LECTURES AWAY (owner 2026-07-29: "lecturers
 * might be farther away and if users record with macbooks then wouldn't the
 * audio be quieter"). `level` is RMS × 4, so 0.035 meant roughly -41 dBFS — a
 * close-mic number. A laptop's built-in microphone picking up someone across a
 * room commonly lands at -45 to -55 dBFS, UNDER that bar. And because the
 * adaptive term is `max(floor × 3, this)`, the bar could only ever move UP: a
 * quiet speaker had no way to lower it. The gate paused about 4.5 seconds in
 * (warm-up + hold) and never resumed, so a lecture came back as the handful of
 * syllables loud enough to poke over the line. That is exactly the shape of the
 * one real recording we have: 72 seconds of audio, 41 characters of transcript,
 * and an empty answer from a second provider on the same file.
 *
 * 0.004 is about -60 dBFS — quiet enough to mean "essentially nothing arrived",
 * which is the only thing this constant should ever assert. Telling a voice from
 * room hiss is the adaptive floor's job (see gateThreshold), and it does it by
 * watching the gaps BETWEEN syllables, which is the one signal that actually
 * separates the two.
 */
export const MIN_THRESHOLD = 0.004;

/** Speech has to clear the learned room tone by this much to count. */
export const THRESHOLD_MULTIPLE = 3;

/** A learned floor above this is not room tone any more — it is someone
 *  talking, and letting it rise further would start swallowing speech. */
export const MAX_NOISE_FLOOR = 0.1;

/** How fast the floor drops toward a newly quiet room (per sample). */
const FLOOR_FALL = 0.2;

/** How fast it creeps back up when the room gets louder (per sample).
 *  Deliberately glacial: speech must not drag the floor up behind it. */
const FLOOR_RISE = 1.0002;

/** Continuous quiet required before we stop capturing. Long on purpose — a
 *  lecturer pausing for breath, writing on a board, or waiting for a question
 *  is not the end of the lecture, and clipping the word after the pause is
 *  worse than keeping a second of silence. */
export const SILENCE_HOLD_MS = 1_500;

/** No pausing during the opening seconds, so the floor has samples to learn
 *  from before it is allowed to act on them. */
export const WARMUP_MS = 3_000;

/**
 * A gap longer than this means the browser throttled the sampler — a hidden tab
 * can drop it to once a second, or in a fully backgrounded one, once a MINUTE.
 *
 * One sample cannot speak for a minute of audio. Acting on it would let a single
 * unlucky quiet reading pause the recorder mid-sentence, with no second sample
 * to resume it until the next tick — losing the very thing we are recording. So
 * an untrusted gap can RESUME capture but can never stop it: the same direction
 * every other default here leans.
 */
export const MAX_TRUSTED_STEP_MS = 1_000;

export interface SilenceGate {
  /** Rolling estimate of room tone, 0..1. */
  noiseFloor: number;
  /** False while paused on silence. */
  capturing: boolean;
  /** Continuous quiet so far, in ms. */
  quietMs: number;
  /** Total audio observed, in ms — drives the warm-up. */
  totalMs: number;
}

export function createSilenceGate(): SilenceGate {
  // Starts at the maximum so the first quiet stretch pulls it down rather than
  // the first loud one pushing it up.
  return { capturing: true, noiseFloor: MAX_NOISE_FLOOR, quietMs: 0, totalMs: 0 };
}

/**
 * The level a sample must reach to count as sound, given what the room sounds
 * like right now. Exported so a test can pin the arithmetic directly.
 *
 * WHY THIS CAN TELL A QUIET VOICE FROM ROOM HISS, when a fixed number cannot.
 * Loudness alone genuinely cannot separate them — a quiet monotone and a hiss at
 * the same level are the same reading. What separates them is that a voice
 * MOVES: syllables against near-silent gaps. The floor falls fast and rises
 * glacially (see FLOOR_FALL / FLOOR_RISE), so it settles into those gaps, and
 * the bar lands a little above the gaps and well under the syllables. A steady
 * hiss has no gaps, so the floor settles at the hiss itself and the bar ends up
 * above it — which is why room tone still gates while a quiet lecturer does not.
 *
 * The one case this cannot decide is a genuinely constant quiet drone, which no
 * level-based rule can; separating that from speech needs real voice-activity
 * detection, which is the provider's job (see the transcribe function's own
 * vad_threshold) rather than this meter's.
 */
export function gateThreshold(noiseFloor: number): number {
  return Math.max(MIN_THRESHOLD, noiseFloor * THRESHOLD_MULTIPLE);
}

/**
 * Advance the gate by one sample. Pure — returns a new gate.
 *
 * `level` is the 0..1 reading the meter already computes; `elapsedMs` is the
 * time since the previous sample, so the hold is wall-clock rather than a
 * sample count and does not change meaning if the tick rate does.
 */
export function stepSilenceGate(gate: SilenceGate, level: number, elapsedMs: number): SilenceGate {
  const clean = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  const step = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const totalMs = gate.totalMs + step;

  const noiseFloor = clean < gate.noiseFloor
    ? gate.noiseFloor + (clean - gate.noiseFloor) * FLOOR_FALL
    : Math.min(MAX_NOISE_FLOOR, gate.noiseFloor * FLOOR_RISE);

  const isSound = clean >= gateThreshold(noiseFloor);

  // Resume the instant anything is heard. No hold on the way back in: the cost
  // of a false resume is a second of room tone, the cost of a slow one is a
  // clipped word.
  if (!gate.capturing) {
    return isSound
      ? { capturing: true, noiseFloor, quietMs: 0, totalMs }
      : { capturing: false, noiseFloor, quietMs: gate.quietMs + step, totalMs };
  }

  if (isSound) return { capturing: true, noiseFloor, quietMs: 0, totalMs };

  const quietMs = gate.quietMs + step;
  // A throttled gap cannot be trusted to have been quiet just because the one
  // sample at the end of it was — keep capturing and wait for a real reading.
  const trusted = step <= MAX_TRUSTED_STEP_MS;
  const mayPause = trusted && totalMs >= WARMUP_MS;
  return { capturing: !(mayPause && quietMs >= SILENCE_HOLD_MS), noiseFloor, quietMs, totalMs };
}

/**
 * How much quiet was skipped, for the student to read.
 *
 * Returns null below a minute — "8 seconds skipped" is noise, and a number
 * that small reads as the feature not working rather than as an honest report.
 */
export function describeSilenceSkipped(wallClockMs: number, capturedMs: number): string | null {
  const skipped = Math.round((wallClockMs - capturedMs) / 1_000);
  if (!Number.isFinite(skipped) || skipped < 60) return null;
  const minutes = Math.round(skipped / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} of quiet skipped`;
}
