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

// An AVAudioEngine tap (the on-device Parakeet path) yields a raw RMS
// amplitude instead of the speech library's 0..10 scale, so it needs its own
// mapping. Running RMS through normalizeMicLevel would draw a flat line:
// conversational speech sits around 0.01..0.2 linear, which that scale reads
// as silence.
const RMS_FLOOR_DB = -50;
const RMS_CEILING_DB = -6;

/** Map a raw RMS amplitude (0..1) onto 0..1, by loudness rather than by
 *  amplitude — decibels are how the ear (and a waveform) actually read it. */
export function normalizeRmsLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  if (db <= RMS_FLOOR_DB) return 0;
  if (db >= RMS_CEILING_DB) return 1;
  return (db - RMS_FLOOR_DB) / (RMS_CEILING_DB - RMS_FLOOR_DB);
}
