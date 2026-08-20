// Movement profiles.
//
// DIFFERENT ACTIONS GET DIFFERENT CURVES, and that is most of what makes the
// character read as deliberate rather than as a spring library. A gaze that lands
// with the same curve as a slow shape morph looks sleepy; a shape morph that lands
// with the gaze's curve looks twitchy. So the curve is a property of the TRANSITION,
// named in each state's definition, and there is no global default anyone can quietly
// change for everything at once.
//
// THERE IS NO SPRING ENGINE HERE, ON PURPOSE. Nothing in the brief wants overshoot —
// the character is calm and precise, and a body that bounces reads as a toy. `snap`
// is the single curve with any overshoot in it, and it overshoots by 4%, which is a
// crispness, not a bounce.

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Shortest-path interpolation of an angle in degrees. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * t;
}

export const EASINGS = {
  linear: (t: number) => t,

  /** Gaze. Leaves immediately, arrives softly — the profile of a saccade settling. */
  gazeOut: (t: number) => 1 - Math.pow(1 - t, 3),

  /**
   * The workhorse. Almost all of the travel happens in the first third, so a state
   * change is legible the instant it starts even when the morph is long.
   */
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),

  /** Calm arrivals — returning to idle, settling into `waiting`. */
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),

  /**
   * Slow, meaningful transformations: `insight`, `complete`. Eases at BOTH ends, so
   * the motion has to be watched rather than glanced at.
   */
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),

  /**
   * `correct`, `success`. Reaches its target fast and settles 4% past it before
   * coming back — the "clean snap" the brief asks for instead of confetti.
   */
  snap: (t: number) => {
    const c = 1.7;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },

  /** `incorrect`, `confusion`. Deliberate and unhurried; refuses to feel punitive. */
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
} as const;

export type EaseName = keyof typeof EASINGS;

/**
 * Framerate-independent exponential approach.
 *
 * Only the pointer smoothing uses this, because the pointer is the one input that is
 * not a function of time — it arrives from the browser whenever it arrives. Everything
 * inside the engine is sampled from `t` instead, so it cannot drift with framerate.
 * A fixed `lerp(a, b, 0.1)` per frame would settle twice as fast on a 120Hz display.
 */
export function approach(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));
}

/**
 * A pulse that starts and ends at 0, peaking at `peak`.
 *
 * Used for the one-shot brightenings (`correct`, `success`, `insight`) so the glow
 * cannot get stuck on: it is a function of local time and is 0 outside `0..1`.
 */
export function pulse(t: number, peak = 0.28): number {
  if (t <= 0 || t >= 1) return 0;
  return t < peak
    ? EASINGS.outQuint(t / peak)
    : 1 - EASINGS.inOutSine((t - peak) / (1 - peak));
}

/** Triangle wave on 0..1 → 0..1..0. For scans and sweeps that must return. */
export function triangle(phase: number): number {
  const p = phase - Math.floor(phase);
  return p < 0.5 ? p * 2 : 2 - p * 2;
}
