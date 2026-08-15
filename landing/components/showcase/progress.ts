/**
 * Progress arithmetic for the Canvas showcase.
 *
 * The whole showcase is a pure function of one number: how far the reader has
 * scrolled through the section, 0 to 1. Nothing here reads a clock.
 *
 * That is a deliberate constraint rather than a stylistic one. An animation
 * driven by a timer only plays forwards — scroll back up and it either sits at
 * its end state or restarts from the beginning, and both read as broken. Driven
 * by position instead, every frame is derived from where the page actually is,
 * so scrubbing up runs the secant back out to the second point and un-draws the
 * curve. The reader can move at whatever speed they like, in either direction,
 * and the Canvas stays truthful about where it is.
 */

/** Clamp to the unit interval. */
export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Remap `t` from the window [start, end] onto 0..1, clamped outside it.
 *
 * This is the workhorse. A scene's whole choreography is written as a series of
 * overlapping windows against its local progress: axes on [0, .12], the curve
 * drawing on [.08, .38], the secant appearing on [.42, .52]. Overlapping the
 * windows is what makes one step hand over to the next instead of the scene
 * moving in discrete jumps.
 */
export function window01(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp01((t - start) / (end - start));
}

/** Smoothstep. Softens the ends of a window so motion starts and stops gently. */
export function ease(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Ease only the entry, leaving the exit linear. For things that arrive and stay. */
export function easeOut(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

/**
 * A window that rises, holds, then falls — for anything that appears, stays for
 * a while and leaves. Returns 0 outside, 1 across the middle.
 */
export function pulse(t: number, start: number, end: number, edge = 0.15): number {
  const local = window01(t, start, end);
  if (local <= 0 || local >= 1) return 0;
  return ease(Math.min(local / edge, (1 - local) / edge, 1));
}

/** One scene's slice of the whole showcase, plus how far into it we are. */
export type Band = {
  readonly index: number;
  /** 0..1 within this scene. */
  readonly local: number;
  /** 0..1 opacity for cross-fading, peaking while the band is active. */
  readonly presence: number;
};

/**
 * Split overall progress into `count` bands and report each one's local
 * progress and presence.
 *
 * Bands overlap by `blend` so one scene fades out while the next fades in, and
 * the outer Canvas never shows an empty frame between representations. The
 * point of the section is that a single surface changes what it renders — a gap
 * would read as two different surfaces.
 */
export function bands(progress: number, count: number, blend = 0.06): readonly Band[] {
  const span = 1 / count;
  const out: Band[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * span;
    const end = start + span;
    const local = window01(progress, start, end);
    // Fade in over the overlap before `start`, out over the overlap after `end`.
    // First and last bands hold their outer edge so the scene is fully present
    // when the section is entered and when it is left.
    const rising = i === 0 ? 1 : ease(window01(progress, start - blend, start + blend));
    const falling = i === count - 1 ? 1 : 1 - ease(window01(progress, end - blend, end + blend));
    out.push({ index: i, local, presence: clamp01(Math.min(rising, falling)) });
  }
  return out;
}
