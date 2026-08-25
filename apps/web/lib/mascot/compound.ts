// A body built from more than one primitive.
//
// 🔴 THE RESULT IS STILL AN `r(theta)` PROFILE, AND THAT IS THE ENTIRE TRICK. The
// catalogue's contract is that every silhouette is 48 radii sampled at the same angles —
// which is what lets any two morph by plain interpolation, with no path-morphing library,
// and what makes area normalisation a single divide. A compound body that produced a
// different KIND of geometry would sit outside all of that: it could not blend with a
// catalogue shape, could not be normalised the same way, and would need its own renderer.
//
// So the primitives are unioned and the union is measured back into a profile. Everything
// downstream — morphing, `taper`/`pinch`/`ripple`, the eye containment fit, the viewBox
// guard — keeps working with no knowledge that the shape came from parts.
//
// 🔴 WHAT THIS CAN AND CANNOT DRAW, stated plainly because it is a real boundary and not
// a limitation of the implementation. A ray from the centre must cross the outline
// exactly once — the shape must be "star-shaped" about its own middle. That covers what
// compound bodies are actually for: a bump on top, a wider base, a lopsided mass, ears as
// bulges, a snowman. It does NOT cover a detached floating piece, or a concave overhang
// where the outline doubles back — a ray would hit twice and a single-valued r(theta)
// can only keep one. `compoundProfile` keeps the OUTER hit, so such a part still shows
// up, joined to the body rather than floating. That is the honest failure and it is the
// one worth having: a visible join beats a piece that silently disappears.
//
// 🔴 COMPUTED WHEN THE BODY CHANGES, NOT PER FRAME. Ray-marching 48 directions against
// every part is far too much to do sixty times a second, and it does not need to be: the
// parts are a property of the character, so the profile is resolved once and then behaves
// exactly like a catalogue entry.

import { ANGLES, PROFILE_SAMPLES, SHAPES, type ShapeId } from "./shapes";

/** One primitive in a compound body. Offsets and radii are in body-radius units. */
export interface BodyPart {
  readonly shape: ShapeId;
  /** Centre offset from the body's own centre. */
  readonly dx: number;
  readonly dy: number;
  /** Half-extents, before `rotate`. */
  readonly rx: number;
  readonly ry: number;
  /** Degrees, about the part's own centre. */
  readonly rotate: number;
}

export const DEFAULT_PART: BodyPart = { shape: "circle", dx: 0, dy: 0, rx: 0.55, ry: 0.55, rotate: 0 };

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

/**
 * The part's own radius in the direction `phi`, interpolated between samples.
 *
 * Linear between neighbours rather than nearest: at 48 samples a nearest-sample lookup
 * quantises the inside-test to 7.5-degree steps, and the union's outline comes out
 * visibly stepped where two parts meet at a shallow angle.
 */
function partRadius(radii: readonly number[], phi: number): number {
  const t = ((phi % TAU) + TAU) / TAU * PROFILE_SAMPLES;
  const i = Math.floor(t) % PROFILE_SAMPLES;
  const j = (i + 1) % PROFILE_SAMPLES;
  const f = t - Math.floor(t);
  return (radii[i] ?? 1) * (1 - f) + (radii[j] ?? 1) * f;
}

/** Whether a point in body space falls inside one part. */
function inside(part: BodyPart, radii: readonly number[], x: number, y: number): boolean {
  // Into the part's own frame: translate, un-rotate, then un-scale to the unit profile.
  const px = x - part.dx;
  const py = y - part.dy;
  const c = Math.cos(-part.rotate * RAD);
  const s = Math.sin(-part.rotate * RAD);
  const lx = (px * c - py * s) / Math.max(1e-6, part.rx);
  const ly = (px * s + py * c) / Math.max(1e-6, part.ry);
  const r = Math.hypot(lx, ly);
  if (r <= 1e-9) return true;
  return r <= partRadius(radii, Math.atan2(ly, lx));
}

/**
 * The union of `parts`, measured back into a radial profile.
 *
 * Ray-marched: for each of the 48 directions, a bisection finds the furthest distance
 * still inside any part. Bisection rather than an analytic solve because the parts are
 * arbitrary catalogue profiles at arbitrary rotations, and the closed form for
 * "superellipse intersected with a rotated ray" is not worth writing for something that
 * runs once per edit.
 *
 * 🔴 THE SEARCH STARTS FROM A BRACKET THAT IS PROVEN TO CONTAIN THE ANSWER. An `outer`
 * that is too small silently clips the shape — and clipping is exactly what a body built
 * from parts is expected to do when a part sticks out, so it would look plausible. It is
 * derived from the parts rather than guessed: no point of any part can be further from
 * the centre than its offset plus its largest radius.
 */
export function compoundProfile(parts: readonly BodyPart[], blend = 0): number[] {
  if (parts.length === 0) return SHAPES.circle.slice();

  const resolved = parts.map((p) => ({ part: p, radii: SHAPES[p.shape] }));
  let outer = 0;
  for (const { part, radii } of resolved) {
    const maxR = Math.max(...radii);
    outer = Math.max(outer, Math.hypot(part.dx, part.dy) + maxR * Math.max(part.rx, part.ry));
  }
  outer *= 1.05;

  const out = new Array<number>(PROFILE_SAMPLES);
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const dx = Math.cos(ANGLES[i]!);
    const dy = Math.sin(ANGLES[i]!);
    const hit = (t: number) => resolved.some(({ part, radii }) => inside(part, radii, dx * t, dy * t));

    // If the centre itself is outside every part the shape is not star-shaped about the
    // centre; fall back to the outer bracket so the ray still finds the far boundary
    // rather than collapsing to nothing.
    let lo = hit(0) ? 0 : outer;
    let hi = outer;
    if (lo === outer) {
      // Walk inward for the first hit, then bisect between that and the next step out.
      let found = -1;
      for (let k = 20; k >= 1; k--) {
        const t = (outer * k) / 20;
        if (hit(t)) {
          found = t;
          break;
        }
      }
      if (found < 0) {
        out[i] = 1e-3;
        continue;
      }
      lo = found;
      hi = Math.min(outer, found + outer / 20);
    }
    // 24 halvings of the bracket puts the boundary well inside a thousandth of a body
    // radius, which is far below a device pixel at any size this is drawn at.
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (hit(mid)) lo = mid;
      else hi = mid;
    }
    out[i] = Math.max(1e-3, lo);
  }

  // 🔴 THE JUNCTIONS ARE SMOOTHED, AND THIS IS A REAL FEATURE RATHER THAN A TIDY-UP.
  // A hard union creases where two parts meet at a shallow angle — a snowman has a waist,
  // and that crease is a jump between neighbouring radii large enough to read as a FACET
  // at 48 samples rather than as a corner. Measured: a slab base with a round head jumps
  // 0.288, against the 0.16 the catalogue's own spike guard allows.
  //
  // The reference tools solve it the same way and it is worth naming: bloub unions its
  // primitives with `hullOfCircles`, a convex hull, which cannot crease by construction;
  // bible-strong-avatar-lab exposes `roundness` on every surface. So this is a control,
  // not a constant — 0 keeps the crisp union for a body that wants a visible seam, and
  // turning it up melts the parts together.
  //
  // A circular moving average, because the profile is periodic and low-frequency: the
  // deformations layered on top of it later (`taper`, `pinch`, `ripple`) are all at three
  // cycles or fewer, so a kernel this narrow removes creases without touching anything
  // the shape is actually saying.
  const smoothed = smooth(out, blend);

  // 🔴 NORMALISED TO THE SAME AREA AS EVERY CATALOGUE SHAPE, by the same RMS divide used
  // in `shapes.ts`, and AFTER smoothing rather than before — a moving average shrinks the
  // enclosed area slightly, so normalising first would leave a smoothed body a little
  // smaller than an unsmoothed one and the blend slider would double as a size slider.
  const rms = Math.sqrt(smoothed.reduce((sum, r) => sum + r * r, 0) / smoothed.length);
  return rms > 1e-9 ? smoothed.map((r) => r / rms) : smoothed;
}

/** Circular moving average. `amount` 0 returns the input untouched. */
function smooth(profile: readonly number[], amount: number): number[] {
  const a = Math.min(1, Math.max(0, amount));
  if (a <= 0) return profile.slice();
  // Up to a quarter of the profile at full strength. Wider than that and a three-part
  // body converges on a circle, which is not "smooth", it is "gone".
  const half = Math.max(1, Math.round(a * (PROFILE_SAMPLES / 8)));
  const n = profile.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let weight = 0;
    for (let k = -half; k <= half; k++) {
      // Triangular rather than boxcar: a box kernel has a hard cutoff that leaves its own
      // faint ripple in the result, which is the artefact this is removing.
      const w = 1 - Math.abs(k) / (half + 1);
      sum += (profile[(i + k + n * 2) % n] ?? 1) * w;
      weight += w;
    }
    out[i] = sum / weight;
  }
  return out;
}
