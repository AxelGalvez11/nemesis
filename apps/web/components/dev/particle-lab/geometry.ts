/**
 * Point distributions the candidates are built on.
 *
 * Everything here is seeded and deterministic: reloading the lab must produce
 * pixel-identical objects, otherwise "B has a better point structure than D" is
 * a statement about a dice roll rather than about the technique.
 */

/** mulberry32 — 4 lines, deterministic, good enough for point placement. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Even-ish points on the unit sphere via the golden-angle spiral. Better than
 * random for a "membrane" because it has no clumps, and better than a lat/long
 * grid because it has no pole pinch.
 */
export function fibonacciSphere(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    out[i * 3] = Math.cos(th) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(th) * r;
  }
  return out;
}

export type RingSphere = {
  readonly positions: Float32Array;
  /** 0..1 up the object — which band this point belongs to. */
  readonly band: Float32Array;
  /** 0..1 around the band — where along the row this point sits. */
  readonly along: Float32Array;
  readonly count: number;
};

/**
 * Latitude rings, with each ring's point count proportional to its
 * circumference so spacing ALONG a row is constant in world space while the
 * gap BETWEEN rows stays wide. That ratio is the whole reference look: dense
 * rows, sparse between them, so the eye reads flowing bands rather than a fog
 * of dots. An even sphere distribution cannot produce it at any density.
 */
export function ringSphere(bands: number, alongDensity: number): RingSphere {
  const px: number[] = [];
  const bandOut: number[] = [];
  const alongOut: number[] = [];

  for (let b = 0; b < bands; b++) {
    // Half-offset keeps rings off the exact poles, where circumference -> 0.
    const v = (b + 0.5) / bands;
    const phi = v * Math.PI;
    const y = Math.cos(phi);
    const r = Math.sin(phi);
    const n = Math.max(3, Math.round(alongDensity * r));
    // Stagger each ring's phase so the rows do not line up into vertical seams.
    const phase = (b % 2) * 0.5 + b * 0.017;
    for (let i = 0; i < n; i++) {
      const u = (i + phase) / n;
      const th = u * Math.PI * 2;
      px.push(Math.cos(th) * r, y, Math.sin(th) * r);
      bandOut.push(v);
      alongOut.push(u);
    }
  }

  return {
    positions: new Float32Array(px),
    band: new Float32Array(bandOut),
    along: new Float32Array(alongOut),
    count: bandOut.length,
  };
}

/**
 * Uniform points inside the unit ball. The cube root is what makes it uniform by
 * VOLUME — sampling the radius linearly piles two thirds of the points into the
 * middle and reads as a fuzzy core, which is the "generic AI orb" look.
 */
export function ballVolume(n: number, seed = 7): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rand();
    const r = Math.cbrt(u);
    const z = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - z * z));
    out[i * 3] = Math.cos(th) * s * r;
    out[i * 3 + 1] = z * r;
    out[i * 3 + 2] = Math.sin(th) * s * r;
  }
  return out;
}

/**
 * A shuffled 0..1 key per point, used by the density knob to cull in the shader.
 *
 * It has to be random rather than sequential: culling `key > density` on a
 * sequential key lops the last-built region off the object (one pole, one side),
 * where a random key thins the whole surface evenly — which is what "fewer
 * points" is supposed to mean.
 */
export function cullKeys(n: number, seed = 11): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand();
  return out;
}

/** Per-point random in [0,1), for stagger and jitter. Deterministic. */
export function randomAttr(n: number, seed: number): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand();
  return out;
}
