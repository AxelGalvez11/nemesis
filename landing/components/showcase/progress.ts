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
 * How much of a band is spent handing over to the next one, as a fraction of
 * total progress.
 *
 * At four scenes over roughly 2000px of travel this is about 70px of scroll on
 * each side of a boundary. Scrolling normally that reads as a few hundred
 * milliseconds — long enough to register as a deliberate pause, short enough
 * that nobody scrolling quickly is held up by it.
 */
const EDGE = 0.035;

/**
 * Split overall progress into `count` bands and report each one's local
 * progress and presence.
 *
 * ── THE SCENES NO LONGER OVERLAP ──────────────────────────────────────────────
 *
 * They used to cross-fade through each other: at a boundary both were at half
 * opacity and the frame showed a diagram superimposed on a heart. It was never
 * empty, which was the property being protected, but two representations
 * dissolving through one another is a slideshow transition — it says these are
 * two pictures, when the whole claim is that it is one surface changing.
 *
 * Now a scene fades fully out before the next begins to arrive, and the gap is
 * carried by the Nemesis mark in its processing state. The frame is still never
 * empty; it just holds something that means "deciding what to show you next"
 * rather than a blend of two answers. See handoff() for the other half.
 */
export function bands(progress: number, count: number, edge = EDGE): readonly Band[] {
  const span = 1 / count;
  const out: Band[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * span;
    const end = start + span;
    const local = window01(progress, start, end);
    // Fade in over the first `edge` of this band, out over its last `edge`, so
    // both neighbours are at zero exactly on the boundary. First and last bands
    // hold their outer edge: the section should be fully present the moment it
    // is entered, and still present as it is left.
    const rising = i === 0 ? 1 : ease(window01(progress, start, start + edge));
    const falling = i === count - 1 ? 1 : 1 - ease(window01(progress, end - edge, end));
    out.push({ index: i, local, presence: clamp01(Math.min(rising, falling)) });
  }
  return out;
}

/**
 * Opacity of the three-oval processing mark, 0..1.
 *
 * Peaks exactly on each internal boundary — where bands() has both neighbouring
 * scenes at zero — and is nothing anywhere else. This is the other half of the
 * handover: between two representations the Canvas shows the mark thinking, and
 * that is what connects the flat identity in the header to the product's
 * behaviour without putting a logo on top of the content.
 *
 * A triangular ramp rather than a smooth window, because the mark should be
 * fully present for an instant rather than lingering at half strength on both
 * sides of the boundary — half a logo over half a diagram is the superimposition
 * this change exists to remove.
 */
export function handoff(progress: number, count: number, edge = EDGE): number {
  const span = 1 / count;
  let peak = 0;
  for (let i = 1; i < count; i++) {
    const boundary = i * span;
    peak = Math.max(peak, 1 - Math.min(1, Math.abs(progress - boundary) / edge));
  }
  return ease(peak);
}
