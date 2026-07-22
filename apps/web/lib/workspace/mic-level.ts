// Live microphone level, published by the one place that already owns the mic
// (sessions/use-live-audio.ts) to whatever is drawing a waveform.
//
// Deliberately NOT React state, and deliberately NOT a second getUserMedia.
// The recorder's AudioContext is the only stream we open, and it already
// computes an RMS level ~11 times a second. Lifting that into the chat
// screen's state would re-render the whole message list at the same rate, and
// opening a second stream just to draw bars would double the permission
// prompt and meter audio that isn't the audio being recorded.
//
// Mirrors apps/mobile/src/lib/mic-level.ts, where the transcription hook feeds
// the channel the same way, so the two apps stay one design.

type Listener = (level: number) => void;

const listeners = new Set<Listener>();
let current = 0;

/** Clamp a reading onto 0..1. use-live-audio's audioLevel() already returns
 *  that range, but this rides a live audio callback — a non-finite or
 *  out-of-range value must never reach the view layer. */
export function normalizeMicLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function publishMicLevel(level: number): void {
  current = normalizeMicLevel(level);
  for (const listener of listeners) listener(current);
}

export function subscribeMicLevel(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentMicLevel(): number {
  return current;
}

/** Silence the meter when the mic closes, so a stale bar pattern doesn't stay
 *  frozen on screen looking like live audio. */
export function resetMicLevel(): void {
  publishMicLevel(0);
}
