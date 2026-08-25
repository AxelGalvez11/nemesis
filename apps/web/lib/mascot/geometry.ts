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

/**
 * A stadium — straight sides, exactly semicircular ends — at half-extents `rx`, `ry`.
 *
 * 🔴 THE OTHER EYE SHAPE, AND IT IS NOT A STYLISTIC ALTERNATIVE TO `UNIT_BLOB`. This
 * mascot's eye is the body's own silhouette at a small scale, stood upright, and that
 * self-similarity is the character — nothing the product ships should use this. It exists
 * because the character studio holds a transcription of jeremy-prt/bloub, whose eyes are
 * capsules (`capsulePath` in that engine: a rectangle with radius = half the short side).
 * A superellipse is fuller in the corners than a capsule at the same width and height, so
 * a reference drawn with `UNIT_BLOB` is visibly not the reference. Owner, 2026-08-25:
 * *"why aren't the eye shapes correct?"*
 *
 * 🔴 A FUNCTION, NOT A UNIT-BOX CONSTANT, AND THE FIRST ATTEMPT WAS THE CONSTANT. Every
 * other shape here is drawn once at radius 1 and scaled by `(rx, ry)` in the transform,
 * which costs nothing — so that is what this was. It is wrong: scaling a stadium
 * non-uniformly turns its semicircular ends into ELLIPTICAL ends, which is precisely the
 * fuller corner that distinguishes the shape we already had. A capsule's corner radius is
 * defined in final coordinates (`min(rx, ry)`), so the path has to know the proportions.
 * bloub builds it per frame for the same reason.
 *
 * The cost is two short strings per frame, which is the same order as the transform
 * strings the paint loop already writes.
 */
export function capsuleEyePath(rx: number, ry: number): string {
  const x = Math.max(Math.abs(rx), 1e-3);
  const y = Math.max(Math.abs(ry), 1e-3);
  const r = Math.min(x, y);
  const f = (n: number) => Math.round(n * 1000) / 1000;
  // Tall: straight left and right sides, caps top and bottom. When y <= x the straight
  // run has zero length and the two arcs meet, which is the correct degenerate case — a
  // capsule as wide as it is tall is a circle.
  return (
    `M${f(-x)} ${f(-y + r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(-x + r)} ${f(-y)}` +
    `L${f(x - r)} ${f(-y)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(-y + r)}` +
    `L${f(x)} ${f(y - r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x - r)} ${f(y)}` +
    `L${f(-x + r)} ${f(y)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(-x)} ${f(y - r)}` +
    "Z"
  );
}

// ── The head, as a sphere ────────────────────────────────────────────────────────
//
// 🔴 THE FLAT FACE IS STILL THE CHARACTER; THIS IS AN OPTION ON TOP OF IT. Everything
// above places the eyes with plain 2D offsets on the silhouette, and at zero rotation
// this produces exactly that — same numbers, same pixels. It is off unless a caller asks.
//
// 🔴 WHY IT EXISTS. Both references this engine is measured against put their eyes on a
// SPHERE: bloub positions each capsule through a tangent frame from a head yaw/pitch/roll,
// and bible-strong-avatar-lab stores a head `{x, y, z}` with a perspective term. It is
// the single biggest reason those characters read as alive and a flat one does not — the
// eyes do not merely slide, they FORESHORTEN and turn as the head goes round, which is
// the cue that says "solid object" rather than "sticker". Owner, 2026-08-25: *"we need
// 3d rotation."*
//
// 🔴 ORTHOGRAPHIC, NOT PERSPECTIVE, AND THAT IS A CHOICE RATHER THAN A SHORTCUT. A
// perspective divide needs a camera distance, which is a number nobody can judge and
// which makes the eye's size depend on where the head is rather than on which way it
// faces. Orthographic keeps the silhouette exactly as drawn — the body is still the flat
// r(theta) outline — and moves only the face across it, which is what both references
// look like in practice at these sizes.

/** A head orientation, in degrees. All zero is the flat face. */
export interface Head {
  /** Turn left and right. Positive looks to the character's own right. */
  readonly yaw: number;
  /** Nod up and down. Positive looks down. */
  readonly pitch: number;
  /** Tip the head sideways. Positive rolls clockwise on screen. */
  readonly roll: number;
}

export const HEAD_REST: Head = { yaw: 0, pitch: 0, roll: 0 };

export const headIsRest = (h: Head | undefined): boolean =>
  h === undefined || (h.yaw === 0 && h.pitch === 0 && h.roll === 0);

/** Where one eye lands once the head has turned, and how it is squashed by the turn. */
export interface EyeOnSphere {
  /** Position in body-radius units: -1..1 across, -1..1 down. */
  readonly x: number;
  readonly y: number;
  /** Foreshortening of the eye's own width and height, 0..1. */
  readonly sx: number;
  readonly sy: number;
  /** Extra rotation the turn gives the eye, degrees. */
  readonly tilt: number;
  /**
   * How much the eye faces the viewer: 1 head-on, 0 at the edge of the silhouette,
   * negative once it has gone round the back.
   */
  readonly facing: number;
}

const RAD = Math.PI / 180;

/**
 * Places one eye on the head's sphere and projects it.
 *
 * `lon` and `lat` are where the eye sits on the head at rest, in degrees — longitude
 * positive to the character's right, latitude positive upward. The tangent frame is what
 * does the real work: the eye's own width shrinks with the projected length of the
 * longitude tangent and its height with the latitude tangent, so an eye near the limb
 * narrows rather than merely sliding. Taking only the position and leaving the size alone
 * is the version that still reads as a sticker.
 */
export function eyeOnSphere(lon: number, lat: number, head: Head): EyeOnSphere {
  const a = lon * RAD;
  const b = lat * RAD;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);

  // The eye's direction, and the two tangents of the sphere at that point. Screen frame:
  // x right, y DOWN, z toward the viewer.
  const p: [number, number, number] = [sa * cb, -sb, ca * cb];
  const tanLon: [number, number, number] = [ca, 0, -sa];
  const tanLat: [number, number, number] = [-sa * sb, -cb, -ca * sb];

  const cy = Math.cos(head.yaw * RAD);
  const sy = Math.sin(head.yaw * RAD);
  const cp = Math.cos(head.pitch * RAD);
  // 🔴 NEGATED, SO THE FIELD MEANS WHAT IT SAYS. `pitch` is documented as "positive looks
  // down", which is the convention anyone dragging a control labelled Nod expects. The
  // rotation about X in this frame does the opposite — a positive angle carries the face
  // upward — so the sign is corrected once, here, rather than leaving every caller to
  // remember it. Caught on screen: the reference's transcribed head turned the wrong way.
  const sp = -Math.sin(head.pitch * RAD);
  const cr = Math.cos(head.roll * RAD);
  const sr = Math.sin(head.roll * RAD);

  // Yaw about Y, then pitch about X, then roll about Z. The order is the one a neck
  // actually does and it is why a rolled head still nods along its own axis.
  const turn = (v: [number, number, number]): [number, number, number] => {
    const x1 = v[0] * cy + v[2] * sy;
    const z1 = -v[0] * sy + v[2] * cy;
    const y2 = v[1] * cp - z1 * sp;
    const z2 = v[1] * sp + z1 * cp;
    return [x1 * cr - y2 * sr, x1 * sr + y2 * cr, z2];
  };

  const pr = turn(p);
  const lonR = turn(tanLon);
  const latR = turn(tanLat);

  // Projected tangent lengths ARE the foreshortening: a tangent pointing at the viewer
  // has no screen length, and an eye aligned with it has no width.
  const sxRaw = Math.hypot(lonR[0], lonR[1]);
  const syRaw = Math.hypot(latR[0], latR[1]);

  return {
    x: pr[0],
    y: pr[1],
    // A floor, because an eye of exactly zero width vanishes rather than turning away,
    // and because a path scaled to 0 is a degenerate shape some renderers refuse.
    sx: Math.max(0.04, sxRaw),
    sy: Math.max(0.04, syRaw),
    tilt: Math.atan2(lonR[1], lonR[0]) / RAD,
    facing: pr[2],
  };
}
