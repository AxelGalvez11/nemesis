// How a listener moves through audio that already exists.
//
// 🔴🔴 THE WHOLE FILE IS THE SEPARATION THE OWNER ASKED FOR: *"Changing playback speed should not
// regenerate the audio."* Until now "speed" was a number posted to the synthesiser, so every press
// of the speed control threw away a paid MP3 and bought another one — a round trip, a wait, and a
// restart from the beginning of the sentence. Speed is a property of LISTENING. It belongs to the
// audio element, where it is instant and free, and nothing here ever reaches a provider.
//
// 🔴 THE STEPS GO BELOW 1 NOW, AND THAT REVERSES AN EARLIER RULE ON PURPOSE. `voice-preferences.ts` (since deleted with the autoplay mode, 2026-08-30)
// refused anything under natural pace because a SYNTHESIS rate below 1 teaches a rhythm nobody
// speaks — connected speech and stress timing are what disappear when a synthesiser is slowed. That
// argument is about generating audio, and it does not apply to a listener slowing down a paragraph
// they are trying to follow: the recording is unchanged, only the rate at which they hear it moves.
// Same numbers ChatGPT offers, which is the reference the owner named.
//
// PURE. No React, no audio element, no I/O.

/** The playback rates offered, in the order the control cycles them. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

/**
 * Where the choice is kept.
 *
 * 🔴 THE KEY THE OLD READING SPEED USED, KEPT ON PURPOSE. Its stored values were 1, 1.5 and 2 —
 * every one of which is still a rate on this list — so a learner who set 1.5× last week keeps 1.5×,
 * and it now means "play it at 1.5×" instead of "synthesise it 1.5× faster". A new key would have
 * silently reset everybody to 1 in exchange for nothing.
 */
export const PLAYBACK_RATE_KEY = "nemesis.canvas.voice-speed.v1";

/**
 * How far a rewind or a fast-forward jumps.
 *
 * 🔴 TEN SECONDS, MEASURED RATHER THAN PREFERRED. The owner asked for "approximately 10 seconds
 * unless there is a better interaction based on what you observe in ChatGPT", and ChatGPT's own
 * read-aloud player uses 10 — not the 15 that podcast apps default to.
 */
export const SEEK_STEP_SECONDS = 10;

/** The next rate, wrapping. What the speed control does on press. */
export function nextPlaybackRate(current: PlaybackRate): PlaybackRate {
  const at = PLAYBACK_RATES.indexOf(current);
  return PLAYBACK_RATES[(at + 1) % PLAYBACK_RATES.length]!;
}

/**
 * 🔴 AN UNRECOGNISED STORED VALUE FALLS BACK RATHER THAN BEING TRUSTED — the same rule every other
 * stored preference in this app follows. A hand-edited `4` would otherwise play every answer at
 * quadruple speed with nothing on screen to say why.
 */
export function readPlaybackRate(storage: Pick<Storage, "getItem"> | null): PlaybackRate {
  if (!storage) return DEFAULT_PLAYBACK_RATE;
  try {
    const raw = Number(storage.getItem(PLAYBACK_RATE_KEY));
    return (PLAYBACK_RATES as readonly number[]).includes(raw) ? (raw as PlaybackRate) : DEFAULT_PLAYBACK_RATE;
  } catch {
    return DEFAULT_PLAYBACK_RATE;
  }
}

export function writePlaybackRate(storage: Pick<Storage, "setItem"> | null, value: PlaybackRate): void {
  try {
    storage?.setItem(PLAYBACK_RATE_KEY, String(value));
  } catch {
    // A full or blocked store loses a UI preference. It must not break playback.
  }
}

/**
 * Where a rewind or fast-forward lands.
 *
 * 🔴 CLAMPED AT BOTH ENDS, AND THE FAR END IS `reach` RATHER THAN THE DURATION. While audio is still
 * arriving, the only part that can be played is the part that has arrived; seeking past it in a
 * streaming element does not wait, it stalls. `reach` is however much is currently playable, which
 * equals the duration once the download finishes.
 */
export function seekTarget(current: number, deltaSeconds: number, reach: number): number {
  if (!Number.isFinite(current)) return 0;
  const limit = Number.isFinite(reach) && reach > 0 ? reach : 0;
  return Math.min(limit, Math.max(0, current + deltaSeconds));
}

/** How far through, as 0–1. Zero when nothing is known yet, so a bar never renders as full. */
export function progressFraction(current: number, total: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, current / total));
}

/** Where a click at fraction `f` of the bar lands. */
export function scrubTarget(fraction: number, reach: number): number {
  if (!Number.isFinite(reach) || reach <= 0) return 0;
  return Math.min(reach, Math.max(0, fraction * reach));
}

/**
 * `m:ss`, the way every player writes it.
 *
 * 🔴 A DASH RATHER THAN `0:00` WHILE THE LENGTH IS UNKNOWN. Audio that is still streaming has no
 * duration yet, and printing `0:00` there says "this clip is empty", which is the one thing it is
 * not.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "–:––";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? "0" : ""}${rest}`;
}
