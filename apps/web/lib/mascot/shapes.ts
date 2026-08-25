// The silhouette catalogue.
//
// 🔴 EVERY SHAPE IS SAMPLED AT THE SAME ANGLES, which is the whole reason there is no
// path-morphing library in this project. Two profiles sampled at identical angles have
// points that correspond one to one, so a morph between ANY two shapes is a plain
// interpolation of radii — and because it is plain interpolation, it composes with the
// transition system, the frozen-pose blending and `sample(t)`'s purity for free.
//
// A new shape has to be expressible as r(theta). That is a real constraint and it is
// worth keeping: it rules out anything with a concave overhang or a detached piece,
// which are exactly the silhouettes that stop reading as one creature.
//
// 🔴 AND EVERY SHAPE IS NORMALISED TO THE SAME AREA. Without it a morph from a fat form
// to a thin one reads as the character SHRINKING rather than changing shape, and states
// that differ only in silhouette also appear to differ in importance. Normalising by
// RMS radius makes the enclosed area equal to the unit circle's, so `scale` stays the
// only thing that changes how big the mascot looks.

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
   * Rest. Round-cornered with real sides — neither a ball nor an oval, which is the
   * whole identity. See pose.ts on why 2.45 and not 2 or 3.
   */
  blob: (t) => superellipse(t, 2.45),

  /**
   * A true circle.
   *
   * 🔴 NOT THE CHARACTER'S OWN FORM, AND DELIBERATELY AVAILABLE ANYWAY. `blob` exists
   * precisely so Nemesis is not a ball with eyes, so nothing the product ships should
   * reach for this. It is here because the character studio holds a transcription of
   * jeremy-prt/bloub, whose resting body IS `circle(1)` — and a reference set drawn on a
   * superellipse is not a reference, it is our character wearing someone else's timings.
   * Owner, 2026-08-25: *"why isn't it circular like bloub?"*
   *
   * Costs nothing: `r(theta) = 1` normalises to exactly 1 at every sample.
   */
  circle: () => 1,

  /**
   * A softened triangle, point up.
   *
   * The reference's `play` state is a spinning triangle, and the catalogue's nearest form
   * was `crystal` — a six-sided figure, which reads as resolved rather than as playful.
   *
   * 🔴 `0.42`, AND THE FIRST ATTEMPT WAS `0.28`, WHICH THE SPIKE GUARD REFUSED. Three
   * sides is the fewest a polygon can have, so its corners are the sharpest turn anything
   * in this catalogue makes — at 48 samples that put 0.174 between two neighbouring
   * radii, past the 0.16 the guard allows, and a jump that size is a visible facet rather
   * than a corner. The guard was right and it is the shape that moved: 0.42 leaves the
   * corners 43% further out than the flats, which still reads unmistakably as a triangle,
   * with real margin under the limit.
   */
  triangle: (t) => polygon(t, 3, 0.42, -Math.PI / 2),

  /**
   * Organic and very slightly irregular. Two low-frequency bumps at fixed phases, so it
   * is asymmetric in a way that reads as a made thing rather than as a generated one.
   * The resting alternative to `blob` for states that should feel unguarded.
   */
  pebble: (t) => superellipse(t, 2.2) * (1 + 0.055 * Math.cos(2 * t + 0.9) + 0.035 * Math.cos(3 * t - 2.1)),

  /**
   * Resolved. A softened hexagon: the most decided the character ever looks, and the
   * only shape with anything like a facet. `insight`, `success` and `complete` are the
   * states allowed to reach it, which is what makes arriving there mean something.
   */
  crystal: (t) => polygon(t, 6, 0.32, Math.PI / 6),

  /**
   * Flattened with pointed ends — a lens, an eye, a thing for looking THROUGH. Reading
   * and close inspection.
   */
  lens: (t) => superellipse(t, 1.62, 0.6),

  /**
   * An egg: fuller at the bottom, narrower at the top. Reads as leaning in and as a
   * held question. Not a teardrop — a cusp cannot be expressed as r(theta) without a
   * notch, and a notch at 48 samples looks like a defect.
   */
  drop: (t) => superellipse(t, 2.35) * (1 + 0.2 * Math.sin(t)) * (1 - 0.17 * Math.max(0, up(t)) * Math.abs(Math.cos(t))),

  /** Tall and narrow. Sitting up, alert, taking notice. */
  column: (t) => superellipse(t, 2.7, 1.55),

  /** Wide and low. Settled onto its own weight — waiting, resting, asleep. */
  slab: (t) => superellipse(t, 2.9, 0.66),

  /**
   * Five soft lobes. Active and organic without being busy: this is the form the
   * character takes while something is happening inside it, and rotating the pose's
   * `ripplePhase` on top of it is what makes that activity visibly travel.
   */
  bloom: (t) => superellipse(t, 2.3) * (1 + 0.1 * Math.cos(5 * t)),
  // `satisfies`, not an annotation: annotating this `Record<string, Profile>` widens
  // `ShapeId` to `string`, and then every lookup is possibly-undefined and every state
  // can name a shape that does not exist.
} satisfies Record<string, Profile>;

export type ShapeId = keyof typeof RAW;

/**
 * Scales a profile so the area it encloses equals the unit circle's.
 *
 * Area of a radial profile is the integral of r^2/2, so dividing by the RMS radius does
 * it exactly. This is what stops a morph from `slab` to `column` reading as the mascot
 * getting smaller and then bigger again.
 */
function normalise(f: Profile): number[] {
  const raw = ANGLES.map(f);
  const rms = Math.sqrt(raw.reduce((sum, r) => sum + r * r, 0) / raw.length);
  return raw.map((r) => r / rms);
}

export const SHAPES = Object.freeze(
  Object.fromEntries((Object.keys(RAW) as ShapeId[]).map((k) => [k, Object.freeze(normalise(RAW[k]))])),
) as Readonly<Record<ShapeId, readonly number[]>>;

export const SHAPE_ORDER = Object.keys(SHAPES) as ShapeId[];

/** Human labels, for the lab. Ids stay the contract; these are only ever displayed. */
export const SHAPE_LABEL: Record<ShapeId, string> = {
  blob: "Blob",
  circle: "Circle",
  triangle: "Triangle",
  pebble: "Pebble",
  crystal: "Crystal",
  lens: "Lens",
  drop: "Drop",
  column: "Column",
  slab: "Slab",
  bloom: "Bloom",
};

/** Interpolates two profiles. Allocates once per call; called at most twice a frame. */
export function blendRadii(a: readonly number[], b: readonly number[], t: number): readonly number[] {
  if (a === b) return a;
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = new Array<number>(PROFILE_SAMPLES);
  for (let i = 0; i < PROFILE_SAMPLES; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}
