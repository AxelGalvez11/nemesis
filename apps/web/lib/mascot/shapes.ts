// The silhouette catalogue.
//
// Nemesis has one canonical body: a circle. The catalogue remains because the mascot lab
// and a few historical tests import the named profiles, but production semantic states
// must keep `blob` and communicate through squash/stretch, gaze, timing and restrained
// satellites instead of changing the character into an icon.
//
// Every profile is sampled at the same angles so interpolation stays deterministic and
// the engine can keep Bloub's useful radial-profile architecture without inheriting its
// shape-changing visual language.

export const PROFILE_SAMPLES = 48;
const TAU = Math.PI * 2;
export const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);

/** Screen frame: x is right, y is DOWN. So "up" is -sin(theta). */
const up = (theta: number) => -Math.sin(theta);

/** Superellipse of exponent `n`, with an optional flattening of the vertical axis. */
function superellipse(theta: number, n: number, minor = 1): number {
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta)) / minor;
  return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
}

/** Regular polygon of `sides`, softened toward a circle by `soft` (0..1). */
function polygon(theta: number, sides: number, soft: number, phase = 0): number {
  const step = TAU / sides;
  const a = ((theta + phase) % step + step) % step;
  const r = Math.cos(step / 2) / Math.cos(a - step / 2);
  return r * (1 - soft) + soft;
}

type Profile = (theta: number) => number;

const RAW = {
  /**
   * The Nemesis identity. Exact unit circle.
   *
   * Do not change this back to a superellipse. The body may squash and stretch in a
   * state, but when it settles the user should always recognise the same round creature.
   */
  blob: (_t: number) => 1,

  // Historical/dev-only profiles. Semantic states are guarded from selecting these by
  // round-identity.test.ts. Keeping them avoids turning an animation change into a
  // destructive rewrite of the mascot lab and makes old snapshots still inspectable.
  pebble: (t: number) => superellipse(t, 2.2) * (1 + 0.055 * Math.cos(2 * t + 0.9) + 0.035 * Math.cos(3 * t - 2.1)),
  crystal: (t: number) => polygon(t, 6, 0.32, Math.PI / 6),
  lens: (t: number) => superellipse(t, 1.62, 0.6),
  drop: (t: number) => superellipse(t, 2.35) * (1 + 0.2 * Math.sin(t)) * (1 - 0.17 * Math.max(0, up(t)) * Math.abs(Math.cos(t))),
  column: (t: number) => superellipse(t, 2.7, 1.55),
  slab: (t: number) => superellipse(t, 2.9, 0.66),
  bloom: (t: number) => superellipse(t, 2.3) * (1 + 0.1 * Math.cos(5 * t)),
} satisfies Record<string, Profile>;

export type ShapeId = keyof typeof RAW;

/** Scales a profile so its sampled RMS radius is one. */
function normalise(f: Profile): number[] {
  const raw = ANGLES.map(f);
  const rms = Math.sqrt(raw.reduce((sum, r) => sum + r * r, 0) / raw.length);
  return raw.map((r) => r / rms);
}

export const SHAPES = Object.freeze(
  Object.fromEntries((Object.keys(RAW) as ShapeId[]).map((k) => [k, Object.freeze(normalise(RAW[k]))])),
) as Readonly<Record<ShapeId, readonly number[]>>;

export const SHAPE_ORDER = Object.keys(SHAPES) as ShapeId[];

/** Human labels, for the lab. Ids stay the contract; these are display-only. */
export const SHAPE_LABEL: Record<ShapeId, string> = {
  blob: "Circle",
  pebble: "Pebble (legacy)",
  crystal: "Crystal (legacy)",
  lens: "Lens (legacy)",
  drop: "Drop (legacy)",
  column: "Column (legacy)",
  slab: "Slab (legacy)",
  bloom: "Bloom (legacy)",
};

/** Interpolates two profiles. */
export function blendRadii(a: readonly number[], b: readonly number[], t: number): readonly number[] {
  if (a === b) return a;
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = new Array<number>(PROFILE_SAMPLES);
  for (let i = 0; i < PROFILE_SAMPLES; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}
