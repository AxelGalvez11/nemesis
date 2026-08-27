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

/**
 * A point on the skin, in the body's own frame, from a longitude and latitude.
 *
 * The capsule is the one type that is not a single superellipsoid: it is an ellipsoid cut
 * in half with a straight barrel dropped in between, so its ends stay circular however
 * tall it gets. The cone tapers its radius with height instead.
 */
export function skinPoint(s: Surface, lon: number, lat: number): Vec3 {
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

/**
 * Two colours, blended.
 *
 * 🔴 HERE RATHER THAN IN A UI HELPER BECAUSE THE ENGINE'S OWN GEOMETRY ASKS FOR IT. A spark's
 * `depth` is a position that has to become a colour, and the reference does exactly this mix
 * (`mixHex(paper, ink, depth)`). Same arithmetic as `landing/lib/bloub/skins.ts`, which is where
 * it is vendored for the site.
 */
export function mixHex(from: string, to: string, t: number): string {
  const parse = (h: string): readonly number[] => {
    const v = Number.parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const a = parse(from);
  const b = parse(to);
  const k = Math.min(1, Math.max(0, t));
  const c = a.map((x, i) => Math.round(x + ((b[i] ?? x) - x) * k));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
