// Live microphone level, published straight from the speech-recognition
// events to whatever is drawing a waveform.
//
// Deliberately NOT React state: the level updates ~12 times a second, and
// routing that through the chat screen's state would re-render the whole
// message list at the same rate. Subscribers here drive Animated values
// imperatively instead, so a moving waveform costs no re-renders at all.

/** The library reports roughly -2..10, and documents anything below 0 as
 *  inaudible — this is its own scale, NOT dBFS, so it needs its own mapping. */
const RAW_FLOOR = 0;
const RAW_CEILING = 10;

type Listener = (level: number) => void;

const listeners = new Set<Listener>();
let current = 0;

/** Map a raw `volumechange` value onto 0..1. Out-of-range and non-finite
 *  values clamp rather than throw — this rides a native event stream. */
export function normalizeMicLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= RAW_FLOOR) return 0;
  if (value >= RAW_CEILING) return 1;
  return (value - RAW_FLOOR) / (RAW_CEILING - RAW_FLOOR);
}

export function publishMicLevel(level: number): void {
  current = level;
  for (const listener of listeners) listener(level);
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

/** Silence the meter when recording stops, so a stale bar pattern doesn't
 *  stay frozen on screen looking like live audio. */
export function resetMicLevel(): void {
  publishMicLevel(0);
}
