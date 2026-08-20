// The body: one blob, flat, drawn from a radial profile.
//
// 🔴 ONE SILHOUETTE, NOT AN ASSEMBLY. The character is a single closed form. Every
// state is that same form deformed — never parts added, swapped or cross-faded — which
// is what makes a change of state read as the creature reorganising rather than as two
// different pictures.
//
// 🔴 AND IT IS NOT A BALL, AND NOT AN OVAL. A circle is the one silhouette with no
// identity of its own, and an ellipse is the one every mascot already is. The resting
// profile is a SUPERELLIPSE — round-cornered but with real sides — so the form is
// recognisably geometric at 18px and still soft enough to deform without looking like a
// diagram.
//
// THE CHARACTER CHANGES SHAPE. `shapes.ts` holds the catalogue and every state names
// one; this file turns whichever profile is current into points and a path. Morphing is
// a plain interpolation of radii, which is what the shared angular sampling buys.

import { hashSigned } from "./noise";
import { ANGLES, PROFILE_SAMPLES, SHAPES } from "./shapes";
import type { BeadRender, BodyPose } from "./types";

export { ANGLES, PROFILE_SAMPLES };

/** The body's resting placement and size, in mark units. */
export const BODY = { cx: 50, cy: 60, rx: 41, ry: 36 } as const;

/**
 * The sampling lives in shapes.ts, because it is the catalogue's contract: every shape
 * must be sampled at the same angles or none of them can morph into any other.
 *
 * 48 is enough that the Catmull-Rom smoothing below has nothing left to do at 400px and
 * cheap enough to rebuild every frame. Raising it costs a string allocation per frame;
 * lowering it shows facets on the flatter sides first, not on the corners.
 */
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);

/** Two fragments, which is deliberately not three — see states.ts on `thinking`. */
export const SATELLITES = 2;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The profile at sample `i`, in fractions of the body's rx / ry.
 *
 * The base is whichever silhouette the state is wearing; the three terms on top are what
 * the character can do to any of them, and they multiply so they compose without
 * fighting:
 *
 *   taper   moves mass toward one side. A blob with no taper is a logo, not a creature.
 *   pinch   a waist across the middle — the form gathering itself in.
 *   ripple  a three-lobe wave that can travel round the outline. This is the one that
 *           reads as INTERNAL activity rather than as the whole body moving.
 */
export function profileAt(i: number, p: BodyPose): number {
  const theta = ANGLES[i]!;
  let r = p.radii[i] ?? 1;
  r *= 1 + p.taper * 0.16 * COS[i]!;
  r *= 1 + p.pinch * 0.24 * Math.cos(2 * theta);
  r *= 1 + p.ripple * Math.cos(3 * theta + rad(p.ripplePhase));
  return r;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The silhouette in the body's own frame — untilted, centred on the origin.
 *
 * `rx` / `ry` are passed in rather than derived, because the engine applies factors the
 * pose knows nothing about — presence, and the breath — and a silhouette computed from
 * the pose alone would disagree with the eyes and the fragments placed against it.
 */
export function silhouette(
  p: BodyPose,
  out: Point[] = [],
  rx = BODY.rx * p.scale * p.stretch,
  ry = BODY.ry * p.scale * p.squash,
): Point[] {
  out.length = PROFILE_SAMPLES;
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const r = profileAt(i, p);
    out[i] = { x: rx * r * COS[i]!, y: ry * r * SIN[i]! };
  }
  return out;
}

/**
 * A closed cubic path through the sampled points.
 *
 * Catmull-Rom rather than a polygon: 48 straight segments show as facets on the
 * superellipse's flatter sides well before they do on its corners, and the deformations
 * are all low-frequency, so a spline through them is both smoother and no more
 * expensive to write.
 */
export function closedPath(pts: readonly Point[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = `M${f(pts[0]!.x)} ${f(pts[0]!.y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return `${d}Z`;
}

/** Half-width and half-height of a tilted axis-aligned box, in screen axes. */
export function tiltedExtents(rx: number, ry: number, tiltDeg: number): { hw: number; hh: number } {
  const t = rad(tiltDeg);
  return { hw: Math.hypot(rx * Math.cos(t), ry * Math.sin(t)), hh: Math.hypot(rx * Math.sin(t), ry * Math.cos(t)) };
}

export function beadBounds(b: BeadRender): { x0: number; y0: number; x1: number; y1: number } {
  const { hw, hh } = tiltedExtents(b.rx, b.ry, b.tilt);
  return { x0: b.cx - hw, y0: b.cy - hh, x1: b.cx + hw, y1: b.cy + hh };
}

/** Bounds of the resting body — the ink a still mascot occupies. */
export const REST_INK = {
  x0: BODY.cx - BODY.rx,
  y0: BODY.cy - BODY.ry,
  x1: BODY.cx + BODY.rx,
  y1: BODY.cy + BODY.ry,
  w: BODY.rx * 2,
  h: BODY.ry * 2,
};

/**
 * How much room beyond the resting body every state is allowed.
 *
 * 🔴 THE VIEWBOX IS A CONSTANT AND MUST STAY ONE. A box computed per frame would fit
 * the pose exactly and resize the element sixty times a second — which is a layout
 * shift, and "no mascot animation causes layout shift" is a requirement, not a
 * preference. So it is sized ONCE, here, for the widest excursion in the catalogue, and
 * `geometry.test.ts` sweeps every state across time and asserts nothing ever leaves it.
 * If a new state needs more room, this number goes up and the test says by how much.
 */
export const EXCURSION = 21;

export const VIEW = (() => {
  const x = REST_INK.x0 - EXCURSION;
  const y = REST_INK.y0 - EXCURSION;
  const w = REST_INK.w + EXCURSION * 2;
  const h = REST_INK.h + EXCURSION * 2;
  return { x, y, w, h, box: `${x} ${y} ${w} ${h}`, ratio: w / h };
})();

/**
 * How much taller the box is than the resting body.
 *
 * The component's `size` prop is the height of the RESTING BODY, not of the element, so
 * `size={44}` is a 44px-tall creature and the surrounding box is inert padding it
 * gestures into. Getting this backwards makes every mascot render visibly smaller than
 * the number asked for.
 */
export const MARK_SCALE = VIEW.h / REST_INK.h;

// ── The face ────────────────────────────────────────────────────────────────────

/**
 * The eyes are the body's own shape at a much smaller scale, stood upright.
 *
 * Not circles, not pupils in sclera, not capsules: two narrow superellipse slots,
 * carrying the same round-cornered geometry as the body. The creature is ONE shape
 * repeated at two scales, which is the whole identity — and an upright slot reads as
 * attentive and precise where a round eye reads as cute.
 *
 * Expressed as fractions of the body's rx / ry so they deform with it.
 */
export const EYE_W = 0.125;
export const EYE_H = 0.235;
/** Half-separation across the body, and the height the pair sits at. */
export const EYE_SPLIT = 0.325;
export const EYE_RISE = -0.05;
/** How far gaze can carry the eyes before the containment fit trims it. */
export const EYE_TRAVEL_U = 0.32;
export const EYE_TRAVEL_V = 0.34;

/**
 * The fraction of the body's radius the eye's far corner may reach.
 *
 * Below 1 by design: at exactly 1 the eye is tangent to the silhouette, which shows as
 * a flat spot even though nothing is clipped.
 */
const FIT_LIMIT = 0.8;

/**
 * How much of a gaze offset actually fits, 0..1.
 *
 * 🔴 ONE FACTOR FOR BOTH EYES, AND IT SCALES THE OFFSET ONLY. Two lessons, both
 * expensive elsewhere: fitting each eye independently spreads the pair (they do not aim
 * in the same direction, so they do not retreat by the same amount, and a distorted
 * face reads far worse than the clipping it fixes); and scaling the eye's ANCHOR rather
 * than its offset shrinks the separation, so the eyes converge as the character looks
 * away. What must give when the gaze runs out of face is the TRAVEL.
 *
 * Closed form, not a search: the eye's far corner must stay inside the unit circle the
 * body becomes when normalised by its own rx / ry, which is one quadratic in the scale
 * factor. A solver would be smooth in its answer but not in its derivative, and
 * anything discontinuous applied to the eyes every frame is a tremble.
 */
export function fitGaze(
  anchorU: number,
  anchorV: number,
  offU: number,
  offV: number,
  halfW: number,
  halfH: number,
  limit = FIT_LIMIT,
): number {
  // The bound is |anchor + off·k| <= |anchor| + |off|·k, so working in absolute values
  // is always safe and — because both eyes have the same |anchor| — gives both the same
  // answer, which is exactly the shared factor wanted.
  //
  // 🔴 THE SIGNED VERSION OF THIS WAS WRONG, and quietly. Tracking each eye's own
  // direction looks tighter and breaks the moment a gaze offset carries an eye PAST the
  // centre and out the other side: the signed distance shrinks through zero and then
  // grows again, so the solver read a corner that was leaving the body as one coming
  // home and allowed the full travel. Absolute values have no such branch.
  const pu = Math.abs(anchorU) + halfW;
  const pv = Math.abs(anchorV) + halfH;
  const du = Math.abs(offU);
  const dv = Math.abs(offV);

  const A = du * du + dv * dv;
  const C = pu * pu + pv * pv - limit * limit;
  if (C >= 0) return 0; // The anchor alone already fills the face; no travel at all.
  if (A < 1e-9) return 1;
  const B = 2 * (pu * du + pv * dv);
  const root = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  return root < 0 ? 0 : root > 1 ? 1 : root;
}

// ── The fragments ───────────────────────────────────────────────────────────────

/**
 * Where fragment `i` sits, relative to the body's centre, in the body's own frame.
 *
 * They travel on an ellipse OUTSIDE the body's own outline rather than on a circle, so
 * a fragment never disappears into the silhouette on the wide sides and then pops out
 * again on the narrow ones. `spread` is therefore a clearance, not a radius.
 *
 * `sweep` collapses the pair toward one direction, so the same primitive reads as a
 * reach (`searching`) rather than as an orbit (`generating-visual`).
 */
export function satellitePlacement(
  i: number,
  spin: number,
  spread: number,
  scatter: number,
  sweep: number,
  rx: number,
  ry: number,
): { x: number; y: number; angle: number } {
  const ring = spin + (i / SATELLITES) * 360;
  const fan = spin + (i - (SATELLITES - 1) / 2) * 26;
  const angle = ring + (fan - ring) * sweep;
  const a = rad(angle);
  const gap = spread * (1 + scatter * hashSigned(i * 37 + 11) * 0.4);
  return { x: (rx + gap) * Math.cos(a), y: (ry + gap) * Math.sin(a), angle };
}

/**
 * The fragment's shape: the body's own silhouette, at radius 1, with nothing done to
 * it. Built once at import — a fragment only ever changes size, place and angle, so
 * rebuilding its path per frame would be pure waste.
 */
/**
 * A plain circle at radius 1.
 *
 * Used for the shape that bites into an eye to bow it, and ONLY for that. A circle's top
 * is the most curved outline there is, and the curvature across the eye's width is
 * exactly what turns the leftover sliver into an arch. Cutting with the body's own
 * superellipse instead — which is what this was first — leaves an almost straight edge
 * and the "pleased" face reads as a shorter eye rather than a smiling one.
 */
export const UNIT_ROUND = closedPath(
  ANGLES.map((theta) => ({ x: Math.cos(theta), y: Math.sin(theta) })),
);

export const UNIT_BLOB = closedPath(
  ANGLES.map((theta, i) => {
    const r = SHAPES.blob[i] ?? 1;
    return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
  }),
);
