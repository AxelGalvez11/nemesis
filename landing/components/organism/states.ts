/**
 * The organism's states.
 *
 * The blob is ONE continuous visual metaphor, not a set of animations. So there
 * is one object with one shader, and a "state" is nothing more than a set of
 * target values the shader eases toward. Nothing is ever swapped, rebuilt or
 * cross-faded — which is what makes a scroll from one section to the next read as
 * the same creature reorganising rather than as two different graphics.
 *
 * Every state MUST define every field. A partial state that inherits the rest
 * would let one section silently keep the previous section's flow while looking
 * deliberate, and that class of bug is invisible until someone scrolls in an
 * order nobody tested.
 */

export type OrganismState = {
  /** Fraction of the radius the flow field carries each point. */
  readonly flow: number;
  /** Flow frequency. Low = long filaments, high = turbulence. */
  readonly freq: number;
  /** 1 keeps transport on the surface; lower lets filaments lift off it. */
  readonly shell: number;
  /** Radial relief, the bulges the surface carries. */
  readonly relief: number;
  /** Time multiplier. */
  readonly speed: number;
  /** Dot size in CSS pixels at the object's centre plane. */
  readonly size: number;
};

/**
 * `rest` is the hero's state and the one people see longest, so it is tuned to be
 * calm: enough flow to be alive, not enough to be busy. Everything else is a
 * departure from it.
 */
export const STATES = {
  /** At rest. Slow, coherent, unhurried. */
  rest: { flow: 0.42, freq: 0.7, shell: 0.92, relief: 0.12, speed: 1, size: 1.9 },

  /**
   * The cursor is near. The form reorganises — faster transport, finer field, and
   * the shell loosens slightly so the surface visibly rearranges rather than just
   * speeding up. This is blended in by PROXIMITY, never toggled, because a state
   * that snaps on at a threshold reads as a hover effect instead of as attention.
   */
  attend: { flow: 0.66, freq: 1.05, shell: 0.84, relief: 0.16, speed: 1.7, size: 2 },

  /** Structure. Calmer and tighter — the object holds still to be read. */
  structure: { flow: 0.26, freq: 0.46, shell: 0.98, relief: 0.07, speed: 0.7, size: 1.8 },

  /** Dimension. The shell opens, filaments lift into the space around the body. */
  dimension: { flow: 0.58, freq: 0.58, shell: 0.62, relief: 0.24, speed: 1.1, size: 2.1 },

  /** Working it out. Fine, quick turbulence over a held shape. */
  solve: { flow: 0.5, freq: 1.45, shell: 0.95, relief: 0.09, speed: 1.5, size: 1.7 },

  /** Material going in. The form opens wide and draws inward. */
  intake: { flow: 0.74, freq: 0.52, shell: 0.5, relief: 0.2, speed: 1.3, size: 2.2 },
} as const satisfies Record<string, OrganismState>;

export type StateName = keyof typeof STATES;

/**
 * Eases current toward target with a per-second time constant, framerate
 * independent.
 *
 * The `1 - exp(-dt / tau)` form rather than a fixed `lerp(a, b, 0.05)`: a fixed
 * factor moves 5% PER FRAME, so the same transition takes twice as long on a
 * 120Hz display as on a 60Hz one. The organism has to settle at the same speed
 * on every machine or the tuning means nothing.
 */
export function ease(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));
}

/** Linear blend between two states, for proximity-weighted mixing. */
export function mixStates(a: OrganismState, b: OrganismState, t: number): OrganismState {
  const k = Math.min(1, Math.max(0, t));
  return {
    flow: a.flow + (b.flow - a.flow) * k,
    freq: a.freq + (b.freq - a.freq) * k,
    shell: a.shell + (b.shell - a.shell) * k,
    relief: a.relief + (b.relief - a.relief) * k,
    speed: a.speed + (b.speed - a.speed) * k,
    size: a.size + (b.size - a.size) * k,
  };
}
