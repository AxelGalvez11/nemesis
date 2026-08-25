// One pose to one picture.
//
// The whole pipeline is: build the eye flat → lay it on the skin → turn the body → push it
// through the lens → write a path. Nothing here knows about time.

import {
  FOCAL,
  RADIUS,
  RAD,
  faceToSkin,
  frontOfSkin,
  project,
  quatFromTurn,
  rotate,
  skinPoint,
  type Quat,
  type Vec3,
} from "./space";
import type { AvatarFrame, EyeSpec, Face, Surface } from "./types";

/** Two decimals is under a device pixel at every size this is drawn at. */
const n = (v: number): string => (Math.round(v * 100) / 100).toString();

const polygon = (pts: readonly Vec3[]): string =>
  pts.length === 0 ? "" : `M${n(pts[0]![0])} ${n(pts[0]![1])}${pts.slice(1).map((p) => `L${n(p[0])} ${n(p[1])}`).join("")}Z`;

// ── The eye ─────────────────────────────────────────────────────────────────────

/** Samples per quarter turn of a corner. Enough that a 300px eye has no visible facet. */
const CORNER_STEPS = 12;

/**
 * The lowest an eye's height is allowed to go, in mark units.
 *
 * 🔴 A BLINK CLOSES TO A LINE, NOT TO NOTHING. Taking the height to zero collapses the
 * rounded rectangle to a degenerate outline that projects to a dot and then vanishes, and
 * the character reads as having lost its eyes for a frame rather than having shut them. A
 * few units left over is a drawn slit, which is what a shut eye looks like.
 */
export const SHUT_HEIGHT = 5;

/**
 * The eye's outline, flat, before it goes anywhere.
 *
 * A rounded rectangle whose corner radius is half its SHORT side — so a tall eye is a
 * standing capsule, a wide short eye is a lozenge, and a shut one is a line with round
 * ends. One shape covers every face in the set; there is no separate "closed eye" form.
 */
function eyeOutline(width: number, height: number): readonly (readonly [number, number])[] {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(hw, hh);
  const pts: [number, number][] = [];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5));
    for (let i = 0; i < steps; i++) {
      const p = i / steps;
      pts.push([ax + (bx - ax) * p, ay + (by - ay) * p]);
    }
  };
  const arc = (cx: number, cy: number, from: number) => {
    for (let i = 0; i < CORNER_STEPS; i++) {
      const a = from + (i / CORNER_STEPS) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  line(-hw + r, -hh, hw - r, -hh);
  arc(hw - r, -hh + r, -Math.PI / 2);
  line(hw, -hh + r, hw, hh - r);
  arc(hw - r, hh - r, 0);
  line(hw - r, hh, -hw + r, hh);
  arc(-hw + r, hh - r, Math.PI / 2);
  line(-hw, hh - r, -hw, -hh + r);
  arc(-hw + r, -hh + r, Math.PI);
  return pts;
}

export interface EyeDrawing {
  readonly d: string;
  readonly visible: boolean;
}

/**
 * One eye, laid on the body and projected.
 *
 * `blink` is 1 open and 0 shut. `drift` is the ambient wander, in the same flat face
 * units, applied before the wrap so a saccade travels along the skin rather than across
 * the screen.
 */
export function drawEye(
  surface: Surface,
  orientation: Quat,
  spec: EyeSpec,
  side: -1 | 1,
  spacing: number,
  blink: number,
  drift: { readonly x: number; readonly y: number },
): EyeDrawing {
  const height = SHUT_HEIGHT + (spec.height - SHUT_HEIGHT) * blink;
  const cx = (side * spacing) / 2 + spec.x + drift.x;
  const cy = spec.y + drift.y;
  const a = spec.angle * RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  const points: Vec3[] = [];
  let facing = 0;
  for (const [lx, ly] of eyeOutline(spec.width, height)) {
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    const on = faceToSkin(cx + rx, cy + ry);
    const skin = frontOfSkin(surface, on.x, on.y);
    points.push(project(rotate(orientation, skin.point)));
    facing += rotate(orientation, skin.normal)[2];
  }
  // Summed over the whole outline rather than tested at the centre: an eye straddling the
  // limb has points on both sides, and the sum is what says which side most of it is on.
  return { d: polygon(points), visible: facing > 0 };
}

// ── The body ────────────────────────────────────────────────────────────────────

const LAT_STEPS = 25;
const LON_STEPS = 73;

/**
 * The silhouette of the solid.
 *
 * A sphere is exact and cheap: its outline is a circle at every angle, of a radius the
 * lens decides. Everything else is sampled, hulled and smoothed — which is correct for
 * these bodies because every one of them is convex, and a convex hull of the projected
 * skin IS the silhouette.
 */
export function bodyPath(surface: Surface, orientation: Quat): string {
  if (surface.type === "sphere" && closeEnough(surface.width, surface.height) && closeEnough(surface.height, surface.depth)) {
    const r = surface.width / 2;
    // The tangent-cone radius: where a ray from the eye grazes the ball. Bigger than the
    // ball's own radius, because the near side is closer to the lens than the centre is.
    const projected = (r * FOCAL) / Math.sqrt(Math.max(1e-6, FOCAL * FOCAL - r * r));
    return circlePath(projected);
  }

  const flat: Vec3[] = [];
  for (let i = 0; i < LAT_STEPS; i++) {
    const lat = -Math.PI / 2 + (i / (LAT_STEPS - 1)) * Math.PI;
    for (let j = 0; j < LON_STEPS; j++) {
      const lon = -Math.PI + (j / (LON_STEPS - 1)) * Math.PI * 2;
      flat.push(project(rotate(orientation, skinPoint(surface, lon, lat))));
    }
  }
  return smoothClosed(densify(convexHull(flat)));
}

const closeEnough = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

/** A circle as four arcs. Written out rather than using `<circle>` so the body is one path. */
function circlePath(r: number): string {
  return `M${n(-r)} 0A${n(r)} ${n(r)} 0 1 0 ${n(r)} 0A${n(r)} ${n(r)} 0 1 0 ${n(-r)} 0Z`;
}

/** Andrew's monotone chain. The points are already flat, so z is only carried along. */
function convexHull(points: readonly Vec3[]): Vec3[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec3, a: Vec3, b: Vec3) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (source: readonly Vec3[]): Vec3[] => {
    const out: Vec3[] = [];
    for (const p of source) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = chain(sorted);
  const upper = chain([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Splits long hull edges.
 *
 * 🔴 THE SMOOTHING NEEDS EVENLY SPACED POINTS OR IT BULGES. A hull leaves one very long
 * edge along a flat side and a cluster of short ones around a corner; a Catmull-Rom
 * through that pulls the long edge outward into a curve the solid does not have, and a
 * cube comes out looking inflated.
 */
function densify(points: readonly Vec3[], most = 7): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / most));
    for (let s = 0; s < steps; s++) {
      const p = s / steps;
      out.push([a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p]);
    }
  }
  return out;
}

/** A closed Catmull-Rom spline written as cubic beziers. */
function smoothClosed(points: readonly Vec3[]): string {
  if (points.length < 3) return polygon(points);
  const at = (i: number) => points[(i + points.length) % points.length]!;
  let d = `M${n(at(0)[0])} ${n(at(0)[1])}`;
  for (let i = 0; i < points.length; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d}Z`;
}

// ── The whole thing ─────────────────────────────────────────────────────────────

export interface DrawOptions {
  readonly blink?: number;
  readonly eyeDrift?: { readonly x: number; readonly y: number };
}

const NO_DRIFT = { x: 0, y: 0 };

export function drawFace(surface: Surface, face: Face, opts: DrawOptions = {}): AvatarFrame {
  const orientation = quatFromTurn(face.head);
  const blink = Math.min(1, Math.max(0, opts.blink ?? 1));
  const drift = opts.eyeDrift ?? NO_DRIFT;
  const left = drawEye(surface, orientation, face.left, -1, face.spacing, blink, drift);
  const right = drawEye(surface, orientation, face.right, 1, face.spacing, blink, drift);
  return {
    body: bodyPath(surface, orientation),
    left: left.d,
    right: right.d,
    leftVisible: left.visible,
    rightVisible: right.visible,
  };
}

/** The box every avatar is drawn into. Matches the reference's own frame. */
export const VIEW_BOX = "-150 -150 300 300";
export const VIEW_SIZE = 300;
export { RADIUS };
