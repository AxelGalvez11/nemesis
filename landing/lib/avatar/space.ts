// 🔴 COPIED FROM apps/web — DO NOT EDIT HERE. Run `pnpm --filter @pharmaorb/web character:sync`.
// The space the avatar lives in: rotation, the lens, and the solid's own skin.
//
// Everything here is pure arithmetic on numbers. No DOM, no React, no time.

import type { HeadTurn, Surface, SurfaceType } from "./types";

/** The face's radius. Every authored number — eye widths, spacings — is in these units. */
export const RADIUS = 120;

/**
 * The lens.
 *
 * 🔴 A REAL PERSPECTIVE DIVIDE, NOT AN ORTHOGRAPHIC ONE, AND THE NUMBER MATTERS. At this
 * focal length a face turned 30 degrees has its near eye noticeably larger than its far
 * one, which is most of what makes the turn read as a turn rather than as two eyes
 * sliding sideways. Push it toward infinity and the character goes flat; pull it in and
 * the nose-end of the ball balloons.
 */
export const FOCAL = 620;

export const RAD = Math.PI / 180;

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export const QUAT_REST: Quat = [1, 0, 0, 0];

export function normaliseQuat([w, x, y, z]: Quat): Quat {
  const n = Math.hypot(w, x, y, z) || 1;
  return [w / n, x / n, y / n, z / n];
}

export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return normaliseQuat([
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ]);
}

/**
 * A turn built from three angles.
 *
 * 🔴 THE ORDER IS Z · X · Y, AND IT IS NOT A FREE CHOICE. Every authored head in the set
 * was measured against this composition; any other order draws the same three numbers as
 * a different orientation. Z · Y · X — the obvious guess, and what this shipped as first —
 * put every eye several units too high and a couple too wide, which looked close enough
 * to be believable and was wrong on all 27 faces. Caught by measuring one face against
 * the reference's own rendered path rather than by looking at it.
 *
 * Quaternions rather than three `rotate()` transforms, because of the morph rather than
 * the maths: interpolating three independent screen rotations passes through orientations
 * that are not on the path between the two ends, and the head visibly wobbles on the way.
 */
export function quatFromTurn(turn: HeadTurn): Quat {
  const hx = turn.x * RAD * 0.5;
  const hy = turn.y * RAD * 0.5;
  const hz = turn.z * RAD * 0.5;
  const qx: Quat = [Math.cos(hx), Math.sin(hx), 0, 0];
  const qy: Quat = [Math.cos(hy), 0, Math.sin(hy), 0];
  const qz: Quat = [Math.cos(hz), 0, 0, Math.sin(hz)];
  return multiplyQuat(multiplyQuat(qz, qx), qy);
}

/** Turns a point by a quaternion. The standard two-cross-product form. */
export function rotate([w, x, y, z]: Quat, [px, py, pz]: Vec3): Vec3 {
  const tx = 2 * (y * pz - z * py);
  const ty = 2 * (z * px - x * pz);
  const tz = 2 * (x * py - y * px);
  return [
    px + w * tx + (y * tz - z * ty),
    py + w * ty + (z * tx - x * tz),
    pz + w * tz + (x * ty - y * tx),
  ];
}

/** Perspective divide. `z` is carried through untouched, for depth tests upstream. */
export function project([x, y, z]: Vec3): Vec3 {
  const denominator = FOCAL - z;
  // Guarded rather than allowed to blow up: a point exactly at the focal plane is not
  // reachable by any legal body, but a NaN here would empty the whole path string.
  const scale = Math.abs(denominator) < 1e-4 ? FOCAL * 1e4 : FOCAL / denominator;
  return [x * scale, y * scale, z];
}

// ── The solid ───────────────────────────────────────────────────────────────────

const half = (s: Surface): Vec3 => [s.width / 2 || 1, s.height / 2 || 1, s.depth / 2 || 1];

/** Signed power, so a superellipsoid keeps its sign through a fractional exponent. */
const spow = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * How square the solid is, as a superellipsoid exponent.
 *
 * 2 is an ellipsoid. Above 2 the sides flatten toward a box; below 2 they hollow toward
 * an octahedron, which is what makes the diamond a diamond.
 */
function exponentOf(type: SurfaceType, roundness: number): number {
  if (type === "cube") return 2 + (1 - Math.min(1, Math.max(0, roundness))) * 8;
  if (type === "diamond") return 1 + Math.min(1, Math.max(0, roundness));
  return 2;
}

// ── Bodies that are a stack of rings ────────────────────────────────────────────
//
// A cylinder and a cone are not superellipsoids: they are a radius that changes with
// height. Describing them as a PROFILE — how wide, and how far up, at each step from
// bottom to top — covers both, and covers the rounding at their ends too.

interface Ring {
  /** 0..1 of the body's half-width. */
  readonly radius: number;
  /** 0..1 from the bottom of the body to the top. */
  readonly up: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const clampRound = (v: number | undefined): number => Math.min(2, Math.max(0, v ?? 0));

/** One cubic bezier value. Used to round a cone's point and base without a corner. */
const bezier = (a: number, b: number, c: number, d: number, p: number): number => {
  const q = 1 - p;
  return q * q * q * a + 3 * q * q * p * b + 3 * q * p * p * c + p * p * p * d;
};

const CONE_TIP = 0.24;
const CONE_BASE = 0.2;
const CYLINDER_EDGE = 0.22;

function profileAt(s: Surface, at: number): Ring {
  const p = clamp01(at);
  let ring: Ring;

  if (s.type === "cone") {
    const tip = clampRound(s.tipRoundness) * CONE_TIP;
    const base = clampRound(s.baseRoundness) * CONE_BASE;
    if (base > 0 && p < base) {
      const q = p / base;
      ring = {
        radius: bezier(1 - base, 1, 1 - base / 2, 1 - base, q),
        up: bezier(0, 0, base / 2, base, q),
      };
    } else if (tip > 0 && p > 1 - tip) {
      const q = (p - (1 - tip)) / tip;
      ring = { radius: bezier(tip, tip / 2, tip / 4, 0, q), up: bezier(1 - tip, 1 - tip / 2, 1, 1, q) };
    } else {
      ring = { radius: 1 - p, up: p };
    }
  } else {
    const edge = s.roundness * CYLINDER_EDGE;
    if (edge <= 0) {
      ring = { radius: 1, up: (Math.sin((p - 0.5) * Math.PI) + 1) / 2 };
    } else if (p < edge) {
      const a = -Math.PI / 2 + (p / edge) * (Math.PI / 2);
      ring = { radius: 1 - edge + edge * Math.cos(a), up: (edge + edge * Math.sin(a)) / 2 };
    } else if (p > 1 - edge) {
      const a = ((p - (1 - edge)) / edge) * (Math.PI / 2);
      ring = { radius: 1 - edge + edge * Math.cos(a), up: 1 - edge / 2 + (edge * Math.sin(a)) / 2 };
    } else {
      ring = { radius: 1, up: edge / 2 + ((p - edge) / (1 - edge * 2)) * (1 - edge) };
    }
  }

  // And then pulled toward an egg. See `Surface.morphRoundness`.
  const amount = clampRound(s.morphRoundness) / 2;
  if (amount <= 0) return ring;
  const eggRadius = Math.sin(p * Math.PI);
  const eggUp = (1 - Math.cos(p * Math.PI)) / 2;
  return {
    radius: ring.radius + (eggRadius - ring.radius) * amount,
    up: ring.up + (eggUp - ring.up) * amount,
  };
}

/**
 * How wide the body is at a given height, rather than at a given step along the profile.
 *
 * The profile is parameterised by its own arc, not by height — a rounded base spends
 * several steps barely rising — so going from a `y` back to a radius needs a search. Fixed
 * iterations rather than a tolerance, because this runs per eye point per frame and a
 * loop that sometimes takes longer is a frame that sometimes drops.
 */
function radiusAtHeight(s: Surface, up: number): number {
  const target = clamp01(up);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    if (profileAt(s, mid).up < target) low = mid;
    else high = mid;
  }
  return profileAt(s, (low + high) / 2).radius;
}

// ── The four knobs ──────────────────────────────────────────────────────────────
//
// See `Surface.taper`. Each is a pure multiplier on an already-built point, which is what
// lets `frontOfSkin` undo them exactly and keeps the face on a body however far it is bent.

/**
 * A regular polygon's outline as a radius per angle, with its corners rounded off.
 *
 * 🔴 AN ACTUAL ROUNDED POLYGON, WHICH TOOK TWO WRONG ANSWERS TO GET TO. First was a single
 * cosine, `1 + d·cos(6θ)`: it has the right widest and narrowest radii and still draws a
 * six-lobed blob, because a cosine bulges everywhere a polygon has a straight edge. Second
 * was averaging the sharp polygon over a window of angle, which rounds the corners
 * correctly but also bends the sides, and landed nearer the cosine than the polygon. What
 * is wanted is the set of points within `CORNER` of the polygon — sides exactly straight,
 * corners exactly circular — and its radius in a direction is found by asking how far out
 * you can go before you are further than that from the polygon. Bisection, 256 angles, once
 * per side count, at load.
 */
const FACET_SAMPLES = 256;

/**
 * The corner radius, as a fraction of the figure's own radius.
 *
 * Derived, not chosen: rounding a regular hexagon of unit radius by `c` leaves the narrowest
 * radius over the widest at `cos(30°) + (1 - cos(30°))·c`, and the reference's own measured
 * hexagon runs 0.892 to 1.023. That is a crisper corner than it sounds — the reference's
 * customiser rounds its hexagon four times as hard, but the one the ANIMATION uses is the
 * one traced off the video, and this is what the video says.
 */
const CORNER = (0.892 / 1.023 - Math.cos(Math.PI / 6)) / (1 - Math.cos(Math.PI / 6));

const facetTables = new Map<number, readonly number[]>();

/**
 * How far a point is from a convex polygon — NEGATIVE inside it.
 *
 * 🔴 SIGNED, AND THE FIRST VERSION WAS NOT. Unsigned, the middle of the figure reports the
 * distance to the nearest side, which is most of the radius, so the search concluded that
 * even the centre was too far away and every direction came back at zero. The whole table
 * then normalised to a flat 1 — a perfect circle, silently, with the hexagon gone.
 */
function distanceToPolygon(px: number, py: number, corners: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  let inside = true;
  for (let i = 0; i < corners.length; i++) {
    const [ax, ay] = corners[i]!;
    const [bx, by] = corners[(i + 1) % corners.length]!;
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.min(1, Math.max(0, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1)));
    best = Math.min(best, Math.hypot(px - (ax + ex * t), py - (ay + ey * t)));
    // The corners run anticlockwise in maths terms, so a point inside is left of every edge.
    if (ex * (py - ay) - ey * (px - ax) < 0) inside = false;
  }
  return inside ? -best : best;
}

function facetTable(sides: number): readonly number[] {
  const cached = facetTables.get(sides);
  if (cached) return cached;
  // A vertex at the left and right, and a flat edge top and bottom — the way the
  // reference's own hexagon stands. The corners are pulled in by what the rounding adds
  // back, so the finished figure still reaches its full radius at a vertex.
  const inner = 1 - CORNER;
  const corners = Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [Math.cos(a) * inner, Math.sin(a) * inner] as const;
  });
  const raw = Array.from({ length: FACET_SAMPLES }, (_, i) => {
    const a = (i / FACET_SAMPLES) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    let low = 0;
    let high = 1.5;
    for (let k = 0; k < 24; k++) {
      const mid = (low + high) / 2;
      if (distanceToPolygon(ux * mid, uy * mid, corners) < CORNER) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  });
  // Normalised so the widest point is still the body's own radius, which keeps `stretchX`
  // meaning the same thing whether the body is faceted or not.
  const peak = Math.max(...raw);
  const table = raw.map((v) => v / peak);
  facetTables.set(sides, table);
  return table;
}

/**
 * The radius multiplier in the picture plane.
 *
 * A vertex sits at the left and right, and a flat edge at the top and bottom — the way the
 * reference's own hexagon stands.
 */
export function facetScale(s: Surface, x: number, y: number): number {
  const sides = Math.round(s.facets ?? 0);
  const amount = s.facetAmount ?? 0;
  if (sides < 3 || amount <= 0) return 1;
  const table = facetTable(sides);
  const at = ((Math.atan2(y, x) / (Math.PI * 2)) % 1 + 1) % 1 * FACET_SAMPLES;
  const i = Math.floor(at);
  const a = table[i % FACET_SAMPLES]!;
  const b = table[(i + 1) % FACET_SAMPLES]!;
  return 1 + amount * (a + (b - a) * (at - i) - 1);
}

/**
 * The horizontal multiplier at a height, from `straight` and `taper`.
 *
 * `straight` is written as the ratio between a stadium's width and an ellipse's, so that
 * it composes with whatever the body already was instead of replacing it. At 0 the ratio is
 * exactly 1 everywhere and the body is untouched.
 */
export function bendScale(s: Surface, at: number): number {
  const p = clamp01(at);
  let k = 1;
  // Capped below 1: at exactly 1 the caps have no height and the ratio has no limit.
  const straight = Math.min(0.98, Math.max(0, s.straight ?? 0));
  if (straight > 0) {
    const cap = (1 - straight) / 2;
    // 🔴 THE ELLIPSE'S OWN WIDTH AT THIS HEIGHT, WHICH IS NOT `sin(p·pi)`. Both are zero at
    // the poles and one at the equator, and they are different curves in between — off by
    // three quarters a fifth of the way up. Using the wrong one made the ratio too big
    // exactly where the barrel begins, so an exclamation mark's bar bulged out to twice its
    // width at the shoulders instead of running straight. This is the half-width of a
    // circle at height 2p-1, which is what the body actually is there.
    const ellipse = Math.max(1e-4, 2 * Math.sqrt(Math.max(0, p * (1 - p))));
    const stadium =
      p < cap
        ? Math.sin((p / cap) * (Math.PI / 2))
        : p > 1 - cap
          ? Math.sin(((1 - p) / cap) * (Math.PI / 2))
          : 1;
    k *= stadium / ellipse;
  }
  const taper = Math.min(1, Math.max(-1, s.taper ?? 0));
  if (taper !== 0) k *= 1 + taper * Math.cos(p * Math.PI);
  return k;
}

/** Whether any knob is turned. The sphere shortcut in `bodyPath` is only valid when none is. */
export function isPlain(s: Surface): boolean {
  return !s.taper && !s.straight && !((s.facets ?? 0) >= 3 && (s.facetAmount ?? 0) > 0);
}

/** Bend, then facet. The order matters, and `frontOfSkin` reverses it. */
function shaped(s: Surface, [x, y, z]: Vec3, ry: number): Vec3 {
  const bend = bendScale(s, (y + ry) / (2 * ry || 1));
  const bx = x * bend;
  const bz = z * bend;
  const f = facetScale(s, bx, y);
  return [bx * f, y * f, bz * f];
}

/**
 * A point on the skin, in the body's own frame, from a longitude and latitude.
 *
 * The capsule is the one type that is not a single superellipsoid: it is an ellipsoid cut
 * in half with a straight barrel dropped in between, so its ends stay circular however
 * tall it gets. The cone tapers its radius with height instead.
 */
export function skinPoint(s: Surface, lon: number, lat: number): Vec3 {
  return shaped(s, basePoint(s, lon, lat), half(s)[1]);
}

function basePoint(s: Surface, lon: number, lat: number): Vec3 {
  const [rx, ry, rz] = half(s);

  if (s.type === "capsule") {
    const capR = Math.min(rx, ry);
    const straight = Math.max(0, ry - capR);
    const y = Math.sin(lat) * capR + Math.sign(Math.sin(lat)) * straight * Math.abs(Math.sin(lat));
    const c = Math.cos(lat);
    return [rx * c * Math.sin(lon), y, rz * c * Math.cos(lon)];
  }

  if (s.type === "cylinder" || s.type === "cone") {
    // Latitude read as height, so the profile is a function of how far up the body we are.
    const p = profileAt(s, (lat + Math.PI / 2) / Math.PI);
    return [rx * p.radius * Math.sin(lon), -ry + 2 * ry * p.up, rz * p.radius * Math.cos(lon)];
  }

  const e = exponentOf(s.type, s.roundness);
  const c = Math.cos(lat);
  return [
    rx * spow(c, 2 / e) * spow(Math.sin(lon), 2 / e),
    ry * spow(Math.sin(lat), 2 / e),
    rz * spow(c, 2 / e) * spow(Math.cos(lon), 2 / e),
  ];
}

/**
 * Where the skin is at `(x, y)` on the FRONT of the body, and which way it faces there.
 *
 * 🔴 THIS IS WHAT PUTS THE FACE ON THE OBJECT. An eye is a flat outline; every point of
 * that outline is passed through here, so the eye ends up lying on the skin rather than
 * floating in front of it. It is also where the eye's own foreshortening comes from —
 * nothing scales the eye down as the head turns, the skin simply carries it round.
 *
 * The normal is returned with it because that, and only that, decides whether the eye is
 * on the near side.
 */
export function frontOfSkin(s: Surface, x: number, y: number): { point: Vec3; normal: Vec3 } {
  if (isPlain(s)) return frontOfBase(s, x, y);

  // 🔴 THE KNOBS ARE UNDONE, THE BASE IS ASKED, AND THE ANSWER IS BENT BACK. Skipping this
  // and asking the plain body where its skin is puts every eye of a bent body at the wrong
  // depth — which is invisible on a ball and very visible on the bar of an exclamation
  // mark, where the eye ends up floating in front of a body a third of its width.
  //
  // Both knobs are invertible in closed form, which is the reason they were chosen in this
  // shape: a facet scales along the radius, so the picture-plane ANGLE it is a function of
  // survives it untouched; a bend scales horizontally by height, and height survives it.
  const f = facetScale(s, x, y);
  const bx = x / f;
  const by = y / f;
  const ry = half(s)[1];
  const bend = bendScale(s, (by + ry) / (2 * ry || 1));
  const base = frontOfBase(s, bx / (bend || 1e-4), by);
  return {
    point: [x, y, base.point[2] * bend * f],
    // 🔴 THE BASE'S NORMAL, NOT A RE-DERIVED ONE. The only thing a normal is asked here is
    // which side of the body a point is on, and no deformation this shallow moves a point
    // across the horizon. Deriving the true normal of a faceted, tapered solid would cost a
    // gradient per eye point per frame to answer a question that is already answered.
    normal: base.normal,
  };
}

function frontOfBase(s: Surface, x: number, y: number): { point: Vec3; normal: Vec3 } {
  const [rx, ry, rz] = half(s);

  if (s.type === "capsule") {
    const capR = Math.min(rx, ry);
    const straight = Math.max(0, ry - capR);
    const localY = y < -straight ? y + straight : y > straight ? y - straight : 0;
    const left = Math.max(0, 1 - (x / rx) ** 2 - (localY / capR) ** 2);
    const z = rz * Math.sqrt(left);
    return { point: [x, y, z], normal: unit([x / (rx * rx), localY / (capR * capR), z / (rz * rz)]) };
  }

  if (s.type === "cylinder" || s.type === "cone") {
    const taper = radiusAtHeight(s, (y + ry) / (2 * ry || 1));
    const wide = Math.max(1e-3, rx * taper);
    const deep = Math.max(1e-3, rz * taper);
    const left = Math.max(0, 1 - (x / wide) ** 2);
    const z = deep * Math.sqrt(left);
    return { point: [x, y, z], normal: unit([x / (wide * wide), 0, z / (deep * deep)]) };
  }

  const e = exponentOf(s.type, s.roundness);
  const left = Math.max(0, 1 - Math.pow(Math.abs(x / rx), e) - Math.pow(Math.abs(y / ry), e));
  const z = rz * Math.pow(left, 1 / e);
  // The gradient of |x/rx|^e + |y/ry|^e + |z/rz|^e, which is the outward normal.
  const g = (v: number, r: number) => (Math.sign(v) * e * Math.pow(Math.abs(v / r), e - 1)) / r;
  return { point: [x, y, z], normal: unit([g(x, rx), g(y, ry), g(z, rz)]) };
}

function unit([x, y, z]: Vec3): Vec3 {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

/**
 * A flat face coordinate, wrapped onto a sphere of `RADIUS` before it meets the body.
 *
 * 🔴 THE FACE IS LAID ON A GLOBE, NOT PRESSED ON FLAT. Treating `x` as a straight offset
 * puts an eye authored near the edge of the face outside the body once the head turns,
 * because a flat sheet is wider than the curve it is meant to lie along. Reading `x` as an
 * ANGLE around the body — an arc length in radians, which is what dividing by the radius
 * gives — keeps every authored position on the object at every angle.
 */
export function faceToSkin(x: number, y: number): { x: number; y: number } {
  const lon = x / RADIUS;
  const lat = y / RADIUS;
  return { x: RADIUS * Math.cos(lat) * Math.sin(lon), y: RADIUS * Math.sin(lat) };
}
