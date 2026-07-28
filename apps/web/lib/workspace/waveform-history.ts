// The rolling waveform the recorder draws (owner 2026-07-27: "why not just have
// an audio waveform to show students that the audio is being picked up?").
//
// This replaces the idea of a free live transcript. A browser speech engine is
// free but wrong often enough that a student would read a garbled line and stop
// trusting the recording — and in Chrome it would ship the lecture to Google to
// produce that wrong line. A waveform makes a narrower promise and keeps it:
// it says WE CAN HEAR YOU, which is the thing a person actually wants to know
// while a lecture they cannot repeat is going past.
//
// Each bar also records whether it was CAPTURED, so the quiet the silence gate
// skipped is drawn differently rather than hidden. Someone watching should be
// able to see the recorder stop and start and understand why.

export interface WaveBar {
  /** 0..1 loudness for this slice. */
  level: number;
  /** False when the silence gate had the recorder paused for this slice. */
  captured: boolean;
}

/** How many slices are on screen at once. At the sampling rate below this is
 *  roughly the last ten seconds — long enough to see a sentence, short enough
 *  that the bars still move visibly. */
export const WAVEFORM_BARS = 96;

/** How often a bar is pushed. Faster than the eye needs, because the same tick
 *  drives silence detection, where lag costs the front of a word. */
export const WAVEFORM_SAMPLE_MS = 100;

/**
 * Append a slice, dropping the oldest once full.
 *
 * Returns a new array — the drawing code holds this in a ref and reads it from
 * an animation frame, so mutating in place would let it paint a half-updated
 * history.
 */
export function pushWaveBar(bars: readonly WaveBar[], bar: WaveBar, max = WAVEFORM_BARS): WaveBar[] {
  const clean: WaveBar = {
    captured: bar.captured,
    level: Number.isFinite(bar.level) ? Math.min(1, Math.max(0, bar.level)) : 0,
  };
  const next = bars.length >= max ? bars.slice(bars.length - max + 1) : bars.slice();
  next.push(clean);
  return next;
}

/** A full-width history of silence, so the canvas has something to draw before
 *  the first sample arrives instead of flashing empty. */
export function emptyWaveform(max = WAVEFORM_BARS): WaveBar[] {
  return Array.from({ length: max }, () => ({ captured: false, level: 0 }));
}

/**
 * Bar height in pixels for one slice.
 *
 * A floor of 2px is deliberate: a bar of zero height reads as "broken", and the
 * one thing this component exists to prove is that something is still running.
 * Quiet should look like a quiet line, not like nothing at all.
 */
export function barHeight(level: number, maxHeight: number, minHeight = 2): number {
  const clean = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  // Square root, because loudness is perceptual: a linear map leaves ordinary
  // speech hugging the bottom of the box with all the range spent on shouting.
  return Math.max(minHeight, Math.round(Math.sqrt(clean) * maxHeight));
}
