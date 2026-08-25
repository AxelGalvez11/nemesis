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
  isPlain,
  project,
  quatFromTurn,
  rotate,
  skinPoint,
  type Quat,
  type Vec3,
} from "./space";
import type { AvatarFrame, BodyPose, EyeSpec, Face, Surface } from "./types";

/** Where the body sits when a routine has not moved it. */
export const REST_BODY: BodyPose = {
  scale: 1,
  x: 0,
  y: 0,
  stretchX: 1,
  stretchY: 1,
  taper: 0,
  straight: 0,
  facets: 0,
  facetAmount: 0,
};

/** The avatar's own body, with a routine's knobs turned on it. */
export function posedSurface(base: Surface, pose: BodyPose = REST_BODY): Surface {
  return {
    ...base,
    width: base.width * pose.scale * pose.stretchX,
    // Depth follows the width: a body squeezed narrow is squeezed all the way round, and
    // holding the depth would turn it into a plate that reads as flat the moment it turns.
    depth: base.depth * pose.scale * pose.stretchX,
    height: base.height * pose.scale * pose.stretchY,
    taper: pose.taper,
    straight: pose.straight,
    facets: pose.facets,
    facetAmount: pose.facetAmount,
  };
}

/** Two decimals is under a device pixel at every size this is drawn at. */
const n = (v: number): string => (Math.round(v * 100) / 100).toString();

const NO_DRIFT = { x: 0, y: 0 };

/**
 * Moves a drawn point.
 *
 * 🔴 AFTER THE LENS, NOT BEFORE IT, SO THE DECOR TRAVELS WITH THE BODY. A routine that
 * moves the character moves its decor too — the two outer dots of a pause for thought sit
 * a fixed distance from the one the body has become. Sliding the body in space and the
 * dots in the picture would drift them apart by however much the perspective divide
 * differed, which is small, visible, and impossible to author around.
 */
const shift = ([x, y, z]: Vec3, by: { readonly x: number; readonly y: number }): Vec3 => [
  x + by.x,
  y + by.y,
  z,
];

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
  /**
   * How far the body has shrunk, and where it has moved to.
   *
   * 🔴 THE FACE SHRINKS WITH THE BODY, BUT ONLY UNIFORMLY. A routine that stretches the
   * body tall and narrow authors its own eye sizes and spacing — the reference does exactly
   * that for its egg and its hexagon — so squeezing the face by the stretch as well would
   * apply that narrowing twice. The uniform part is different: nothing about a body at a
   * sixth of its size makes sense with a full-size face painted on it.
   */
  scale = 1,
  offset: { readonly x: number; readonly y: number } = NO_DRIFT,
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
    const skin = frontOfSkin(surface, on.x * scale, on.y * scale);
    points.push(shift(project(rotate(orientation, skin.point)), offset));
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
export function bodyPath(
  surface: Surface,
  orientation: Quat,
  offset: { readonly x: number; readonly y: number } = NO_DRIFT,
): string {
  if (
    surface.type === "sphere" &&
    // 🔴 AND NO KNOB TURNED. A ball's outline is a circle at every angle, which is why this
    // shortcut exists; a ball pulled into an egg or pushed toward a hexagon is not a ball,
    // and taking the shortcut anyway draws a perfect circle for every routine that changes
    // the body — silently, because a circle is exactly what an untouched body looks like.
    isPlain(surface) &&
    closeEnough(surface.width, surface.height) &&
    closeEnough(surface.height, surface.depth)
  ) {
    const r = surface.width / 2;
    // The tangent-cone radius: where a ray from the eye grazes the ball. Bigger than the
    // ball's own radius, because the near side is closer to the lens than the centre is.
    const projected = (r * FOCAL) / Math.sqrt(Math.max(1e-6, FOCAL * FOCAL - r * r));
    return circlePath(projected, offset);
  }

  const flat: Vec3[] = [];
  for (let i = 0; i < LAT_STEPS; i++) {
    const lat = -Math.PI / 2 + (i / (LAT_STEPS - 1)) * Math.PI;
    for (let j = 0; j < LON_STEPS; j++) {
      const lon = -Math.PI + (j / (LON_STEPS - 1)) * Math.PI * 2;
      flat.push(shift(project(rotate(orientation, skinPoint(surface, lon, lat))), offset));
    }
  }
  return smoothClosed(densify(convexHull(flat)));
}

/** A dot: the one decor primitive, and the same circle the body shortcut draws. */
export function dotPath(x: number, y: number, r: number): string {
  return circlePath(r, { x, y });
}

const closeEnough = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

/** A circle as two arcs. Written out rather than using `<circle>` so the body is one path. */
function circlePath(r: number, at: { readonly x: number; readonly y: number } = NO_DRIFT): string {
  const { x, y } = at;
  return `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)}Z`;
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
  /**
   * Degrees added to the face's own head turn, before the rotation is built.
   *
   * 🔴 ADDED TO THE ANGLES, NOT COMPOSED AFTER THE ROTATION. Turning the finished
   * orientation by a second quaternion looks equivalent and is not: the animation's own
   * turn would then be applied in the pointer's frame rather than the body's, so tracking
   * the cursor would tilt every authored face by a different amount depending on where it
   * was already looking. Adding the angles first means the character looks where the face
   * says PLUS where the pointer is, which is the thing being asked for.
   */
  readonly turn?: { readonly x: number; readonly y: number };
}

export function drawFace(surface: Surface, face: Face, opts: DrawOptions = {}): AvatarFrame {
  const head = opts.turn
    ? { x: face.head.x + opts.turn.x, y: face.head.y + opts.turn.y, z: face.head.z }
    : face.head;
  const orientation = quatFromTurn(head);
  const blink = Math.min(1, Math.max(0, opts.blink ?? 1));
  const drift = opts.eyeDrift ?? NO_DRIFT;
  const pose = face.body ?? REST_BODY;
  const body = posedSurface(surface, pose);
  const eyeAlpha = Math.min(1, Math.max(0, face.eyeAlpha ?? 1));

  const left = drawEye(body, orientation, face.left, -1, face.spacing, blink, drift, pose.scale, pose);
  const right = drawEye(body, orientation, face.right, 1, face.spacing, blink, drift, pose.scale, pose);

  // All the front decor in ONE path string, and all the behind decor in another. The
  // component writes `d` onto elements it made once; handing it a list whose length changes
  // would mean creating and destroying nodes sixty times a second instead.
  const dots = face.dots ?? EMPTY_DOTS;
  const inFront: string[] = [];
  const behind: string[] = [];
  for (const dot of dots) {
    if (dot.opacity <= 0.01 || dot.r <= 0.05) continue;
    (dot.behind ? behind : inFront).push(dotPath(dot.x + pose.x, dot.y + pose.y, dot.r));
  }

  return {
    body: bodyPath(body, orientation, pose),
    left: eyeAlpha > 0.01 ? left.d : "",
    right: eyeAlpha > 0.01 ? right.d : "",
    leftVisible: eyeAlpha > 0.01 && left.visible,
    rightVisible: eyeAlpha > 0.01 && right.visible,
    eyeAlpha,
    dots: inFront.join(""),
    dotsBehind: behind.join(""),
    notch: face.notch ? { x: face.notch.x + pose.x, y: face.notch.y + pose.y, r: face.notch.r } : null,
  };
}

const EMPTY_DOTS: readonly never[] = [];

/**
 * The box every avatar is drawn into.
 *
 * 🔴 WIDER THAN THE REFERENCE'S OWN FRAME, AND THE LAYOUT IS WHY. Theirs is
 * `-150 -150 300 300`, which puts the body at about 82% of the box. The character that
 * came before this one sat at 63% of its box — its viewBox carried a wide empty margin for
 * decor to spray into — and every piece of layout that places the character is tuned
 * against THAT ratio: the hero deliberately crops it, positioning it by a negative `top`
 * measured against the body rather than the box (see landing/app/art.css, which spells the
 * trap out). Keeping the reference's frame would have made the character 30% bigger inside
 * every one of those clamps and pushed its face out of the crop.
 *
 * So the geometry is unchanged and the frame around it is widened to 63%, which is what
 * lets the tuned CSS keep meaning what it meant. Nothing here affects what is drawn.
 */
const BODY_SHARE_OF_BOX = 100 / 158;
export const VIEW_SIZE = Math.round((2 * ((RADIUS * FOCAL) / Math.sqrt(FOCAL * FOCAL - RADIUS * RADIUS))) / BODY_SHARE_OF_BOX);
export const VIEW_BOX = `${-VIEW_SIZE / 2} ${-VIEW_SIZE / 2} ${VIEW_SIZE} ${VIEW_SIZE}`;
export { RADIUS };
