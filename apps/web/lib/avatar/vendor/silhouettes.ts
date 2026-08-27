// Silhouettes traced off the reference video, and the two builders that make the rest.
//
// 🔴 VENDORED, NOT DERIVED — AND THAT IS THE WHOLE POINT OF THIS FILE. The first pass at the
// body-changing routines approximated these shapes with parameters of my own: a "taper" for
// the egg, a rounded-polygon generator for the hexagon. They were close and they were not
// right, and the owner said so on sight (2026-08-25: *"they dont perfectly match, did you
// even check the bloub github? its MIT license"*). He is correct twice over. The shapes were
// never a modelling problem — somebody had already measured them, at the pixel, frame by
// frame — and the licence that lets us take the measurements is MIT, which permits exactly
// this with a notice.
//
// So the numbers below are jeremy-prt/bloub's own, copied unchanged, and the notice travels
// with them: see ./LICENSE.bloub, © 2026 Jérémy Perret. Nothing here is edited. If a shape
// looks wrong, the fix is upstream or in how we USE it, never in these tables.
//
// r(theta), 64 samples. theta = 0 points right and increases clockwise, screen y downward.
// One unit is the resting ball's radius.

export const PROFILE_SAMPLES = 64;

export const TRACED = {
  // oeuf : meme hauteur que la boule, retreci en largeur
  // image 164, empreinte mesuree 1.647 x 2.000
  egg: [0.8369,0.8424,0.8497,0.8585,0.8674,0.8775,0.8878,0.8983,0.9089,0.9185,0.9288,0.9374,0.9445,0.9504,0.9543,0.9559,0.9555,0.9519,0.9466,0.9389,0.9302,0.9193,0.9085,0.8969,0.8852,0.8734,0.8625,0.8513,0.8411,0.8325,0.8243,0.8179,0.8137,0.8112,0.8102,0.8128,0.8178,0.8262,0.8374,0.8518,0.8702,0.8922,0.9169,0.9446,0.9741,1.0023,1.0267,1.0433,1.0481,1.0393,1.0216,0.9970,0.9697,0.9418,0.9169,0.8949,0.8760,0.8604,0.8490,0.8394,0.8337,0.8314,0.8305,0.8326],
  // hexagone pointe en haut, coins tres arrondis
  // image 174, empreinte mesuree 1.826 x 2.011
  hexagon: [0.9210,0.9282,0.9441,0.9706,0.9984,1.0059,0.9896,0.9562,0.9290,0.9124,0.9047,0.9058,0.9157,0.9349,0.9642,0.9873,0.9882,0.9665,0.9336,0.9105,0.8968,0.8918,0.8955,0.9080,0.9293,0.9611,0.9820,0.9812,0.9590,0.9282,0.9089,0.8978,0.8964,0.9026,0.9189,0.9439,0.9778,0.9990,0.9964,0.9713,0.9439,0.9274,0.9196,0.9206,0.9308,0.9502,0.9799,1.0121,1.0226,1.0071,0.9752,0.9510,0.9366,0.9316,0.9351,0.9485,0.9711,1.0026,1.0213,1.0155,0.9863,0.9547,0.9347,0.9232],
  // triangle pointe en haut, coins tres arrondis
  // image 190, empreinte mesuree 1.995 x 1.884
  triangle: [0.7819,0.8211,0.8747,0.9440,1.0223,1.0960,1.1401,1.1340,1.0808,1.0047,0.9265,0.8603,0.8104,0.7730,0.7450,0.7273,0.7151,0.7118,0.7148,0.7245,0.7427,0.7680,0.8037,0.8518,0.9148,0.9876,1.0583,1.1073,1.1109,1.0667,0.9940,0.9164,0.8482,0.7948,0.7555,0.7261,0.7056,0.6925,0.6859,0.6869,0.6938,0.7084,0.7305,0.7615,0.8040,0.8595,0.9311,1.0092,1.0791,1.1171,1.1054,1.0501,0.9779,0.9050,0.8450,0.7990,0.7656,0.7413,0.7258,0.7160,0.7146,0.7204,0.7330,0.7528],
} as const;

export type TracedName = keyof typeof TRACED;

// ── The builders, also theirs ────────────────────────────────────────────────
//
// The exclamation mark's bar is not traced: upstream BUILDS it, as the convex hull of two
// circles turned into the same kind of radial profile. Copied for the same reason the tables
// are — it is the definition of the shape, not an approximation of it.

interface Point {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function hullOfCircles(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2v: number,
  steps = 96
): Point[] {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy) || 1e-6
  // angle des tangentes externes communes
  const base = Math.atan2(dy, dx)
  const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2v) / dist)))
  const pts: Point[] = []
  // arc du grand cercle
  for (let i = 0; i <= steps / 2; i++) {
    const a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2)
    pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 })
  }
  // arc du petit cercle
  for (let i = 0; i <= steps / 2; i++) {
    const a = base - spread + ((2 * spread) * i) / (steps / 2)
    pts.push({ x: x2 + Math.cos(a) * r2v, y: y2 + Math.sin(a) * r2v })
  }
  return pts
}

export function profileFromPolygon(poly: Point[], cx: number, cy: number): number[] {
  const radii = new Array<number>(PROFILE_SAMPLES).fill(0)
  const n = poly.length
  for (let k = 0; k < PROFILE_SAMPLES; k++) {
    const dx = COS[k] ?? 0
    const dy = SIN[k] ?? 0
    let best = 0
    for (let i = 0; i < n; i++) {
      const a = poly[i]!
      const b = poly[(i + 1) % n]!
      const ex = b.x - a.x
      const ey = b.y - a.y
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-9) continue
      const px = a.x - cx
      const py = a.y - cy
      const t = (px * ey - py * ex) / den // distance le long du rayon
      const u = (px * dy - py * dx) / den // position sur le segment
      if (t > best && u >= 0 && u <= 1) best = t
    }
    radii[k] = best
  }
  return radii
}

export function radiusAtAngle(radii: number[], angle: number): number {
  const n = radii.length
  const t = ((((angle / TAU) % 1) + 1) % 1) * n
  const i = Math.floor(t)
  return lerp(radii[i % n] ?? 1, radii[(i + 1) % n] ?? 1, t - i)
}

// ── The customiser's shapes ──────────────────────────────────────────────────
//
// 🔴 A SECOND SET, FROM THE SAME REPO, AND UPSTREAM KEEPS THEM APART ON PURPOSE. Everything
// above is TRACED off the reference video, frame by frame, and belongs to an animation: the
// egg is what `egg` looks like. What follows is upstream's `skins.ts` — the shapes its bot
// CUSTOMISER offers, built analytically rather than measured, because a resting shape is a
// choice somebody makes rather than a moment somebody filmed.
//
// The distinction is the whole reason this compiles as one file without confusing the two:
// an animation's silhouette says what the body is DOING, a customiser shape says what the
// body IS. Ours is now one of theirs (owner, 2026-08-26: *"use squircle like in the github
// repo for bloub"*), and `lib/character/body.ts` is where that choice is recorded.
//
// Copied unedited, same licence, same notice: © 2026 Jérémy Perret, MIT. See ./LICENSE.bloub.

/**
 * Superellipse: |x/sx|^n + |y/sy|^n = 1.
 *
 * n = 2 is an ellipse; n ≈ 4 is the customiser's squircle. Upstream's wording, kept because
 * it is the sentence that tells you what changing the exponent does.
 */
export function superellipseProfile(n: number, sx = 1, sy = 1): number[] {
  return ANGLES.map((_unused, i) => {
    const c = Math.abs((COS[i] ?? 0) / sx) ** n;
    const s = Math.abs((SIN[i] ?? 0) / sy) ** n;
    return (c + s) ** (-1 / n);
  });
}

/** Brings the largest radius back to `max`, so every shape weighs the same to the eye. */
export function normaliseProfile(radii: readonly number[], max = 1): number[] {
  const peak = Math.max(...radii);
  if (peak <= 0) return [...radii];
  const k = max / peak;
  return radii.map((r) => r * k);
}

/**
 * The squircle, exactly as the customiser builds it.
 *
 * 🔴 1.15 AND NOT 1.02, AND UPSTREAM LEAVES A NOTE SAYING WHY: on a superellipse the largest
 * radius is the DIAGONAL, so normalising on it shrinks the flat sides and the shape reads as
 * smaller than the circle it replaced. Both numbers are theirs. Ours would have been the
 * wrong one.
 *
 * What it comes out as: flat sides at 0.959 of the ball's radius, corners at 1.15.
 */
export const SQUIRCLE: readonly number[] = normaliseProfile(superellipseProfile(4.2), 1.15);
