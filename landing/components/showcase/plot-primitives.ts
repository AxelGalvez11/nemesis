/**
 * A small, deterministic vocabulary for drawing mathematics.
 *
 * Every function here is pure: given a plot frame, a curve and a progress
 * value, it returns geometry. Nothing mutates, nothing animates itself, nothing
 * reads a clock. The scene decides *when* each primitive is part-way through;
 * these decide *what it looks like* at that moment.
 *
 * The names match the instruction vocabulary a teaching system would eventually
 * request — draw_curve, place_point, move_point, draw_secant, draw_tangent,
 * shade_area, highlight_interval, morph_curve, change_parameter. The split that
 * matters is that the teacher asks for a named primitive and the renderer
 * performs it. A model emitting raw SVG or plotting code at runtime would put
 * arbitrary generated markup on the page and make every frame unreviewable.
 *
 * No interpreter yet, deliberately. The landing page authors its sequence by
 * hand; building the orchestration layer before there is a second caller would
 * be inventing an abstraction from one example.
 */

import { scaleLinear, type ScaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import { clamp01, ease, lerp } from "./progress";

/** A real function of one variable, plus its derivative where we need a tangent. */
export type Curve = {
  readonly f: (x: number) => number;
  readonly df: (x: number) => number;
};

/** y = x². The showcase's worked example: the derivative is the thing being taught. */
export const PARABOLA: Curve = { f: (x) => x * x, df: (x) => 2 * x };

export type PlotFrame = {
  readonly x: ScaleLinear<number, number>;
  readonly y: ScaleLinear<number, number>;
  readonly width: number;
  readonly height: number;
  readonly pad: { top: number; right: number; bottom: number; left: number };
};

export function plotFrame(
  width: number,
  height: number,
  xDomain: readonly [number, number],
  yDomain: readonly [number, number],
  pad = { top: 16, right: 24, bottom: 34, left: 40 },
): PlotFrame {
  return {
    width,
    height,
    pad,
    x: scaleLinear().domain([...xDomain]).range([pad.left, width - pad.right]),
    y: scaleLinear().domain([...yDomain]).range([height - pad.bottom, pad.top]),
  };
}

const SAMPLES = 160;

const path = d3line<[number, number]>()
  .x((p) => p[0])
  .y((p) => p[1]);

/**
 * draw_curve — the graph drawing itself left to right.
 *
 * Done by shortening the sampled domain rather than by animating a dash offset.
 * A dash offset draws along arc length, which on a steep parabola crawls
 * through the flat middle and then races up the sides; and it needs
 * getTotalLength(), which means measuring live DOM. Truncating the domain draws
 * at a constant rate in x, which is what "left to right" actually means for a
 * function, and stays a pure calculation.
 */
export function drawCurve(
  frame: PlotFrame,
  curve: Curve,
  domain: readonly [number, number],
  t: number,
): string {
  const [x0, x1] = domain;
  const upTo = lerp(x0, x1, ease(t));
  if (upTo <= x0) return "";
  const pts: [number, number][] = [];
  const n = Math.max(2, Math.round(SAMPLES * ((upTo - x0) / (x1 - x0))));
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, upTo, i / n);
    pts.push([frame.x(x), frame.y(curve.f(x))]);
  }
  return path(pts) ?? "";
}

export type PointGeom = { readonly cx: number; readonly cy: number; readonly r: number; readonly opacity: number };

/** place_point — a dot arriving on the curve, scaling up as it appears. */
export function placePoint(frame: PlotFrame, curve: Curve, x: number, t: number, radius = 5): PointGeom {
  const e = ease(clamp01(t));
  return { cx: frame.x(x), cy: frame.y(curve.f(x)), r: radius * e, opacity: e };
}

/** move_point — the same dot travelling along the curve from one x to another. */
export function movePoint(
  frame: PlotFrame,
  curve: Curve,
  fromX: number,
  toX: number,
  t: number,
  radius = 5,
): PointGeom & { readonly x: number } {
  const x = lerp(fromX, toX, ease(clamp01(t)));
  return { x, cx: frame.x(x), cy: frame.y(curve.f(x)), r: radius, opacity: 1 };
}

export type LineGeom = {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly slope: number;
};

/**
 * draw_secant — the chord through two points on the curve, extended across the
 * frame so it reads as a line rather than a segment.
 *
 * draw_tangent is the same call with the two points coincident, which is the
 * whole idea being taught: the tangent is not a different object that replaces
 * the secant, it is what the secant becomes. So there is no cross-fade between
 * two shapes anywhere in the scene — the second point slides toward the first
 * and this function keeps returning the correct line the entire way.
 *
 * The only special case is the singularity at the end. Once the points are
 * closer than `epsilon` the difference quotient is numerically useless, so it
 * hands over to the analytic derivative. The visible slope does not jump,
 * because that limit is exactly what the quotient is converging to.
 */
export function drawSecant(
  frame: PlotFrame,
  curve: Curve,
  xa: number,
  xb: number,
  extend = 1.15,
): LineGeom {
  const epsilon = 1e-3;
  const slope = Math.abs(xb - xa) < epsilon ? curve.df(xa) : (curve.f(xb) - curve.f(xa)) / (xb - xa);

  const [dx0, dx1] = frame.x.domain() as [number, number];
  const mid = (dx0 + dx1) / 2;
  const half = ((dx1 - dx0) / 2) * extend;
  const lx = mid - half;
  const rx = mid + half;
  const at = (x: number) => curve.f(xa) + slope * (x - xa);
  return { x1: frame.x(lx), y1: frame.y(at(lx)), x2: frame.x(rx), y2: frame.y(at(rx)), slope };
}

/** draw_tangent — the limiting case, for when a scene wants it directly. */
export function drawTangent(frame: PlotFrame, curve: Curve, x0: number, extend = 1.15): LineGeom {
  return drawSecant(frame, curve, x0, x0, extend);
}

/** shade_area — the region under the curve between two x values. */
export function shadeArea(
  frame: PlotFrame,
  curve: Curve,
  a: number,
  b: number,
  t: number,
): string {
  const upTo = lerp(a, b, ease(clamp01(t)));
  if (upTo <= a) return "";
  const baseline = frame.y(0);
  const pts: [number, number][] = [[frame.x(a), baseline]];
  const n = Math.max(2, Math.round(SAMPLES * 0.5));
  for (let i = 0; i <= n; i++) {
    const x = lerp(a, upTo, i / n);
    pts.push([frame.x(x), frame.y(curve.f(x))]);
  }
  pts.push([frame.x(upTo), baseline]);
  return (path(pts) ?? "") + "Z";
}

export type RectGeom = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** highlight_interval — a band down the plot marking a stretch of the x axis. */
export function highlightInterval(frame: PlotFrame, a: number, b: number, t: number): RectGeom {
  const grow = ease(clamp01(t));
  const left = frame.x(a);
  const full = frame.x(b) - left;
  return {
    x: left,
    y: frame.pad.top,
    width: full * grow,
    height: frame.height - frame.pad.top - frame.pad.bottom,
  };
}

/** morph_curve — one curve continuously becoming another. */
export function morphCurve(
  frame: PlotFrame,
  from: Curve,
  to: Curve,
  domain: readonly [number, number],
  t: number,
): string {
  const e = ease(clamp01(t));
  const [x0, x1] = domain;
  const pts: [number, number][] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = lerp(x0, x1, i / SAMPLES);
    pts.push([frame.x(x), frame.y(lerp(from.f(x), to.f(x), e))]);
  }
  return path(pts) ?? "";
}

/** change_parameter — a scalar easing from one value to another. */
export function changeParameter(from: number, to: number, t: number): number {
  return lerp(from, to, ease(clamp01(t)));
}

/** Axis tick positions, for drawing the frame the curve lives in. */
export function ticks(frame: PlotFrame, axis: "x" | "y", count = 4): readonly { value: number; pos: number }[] {
  const scale = axis === "x" ? frame.x : frame.y;
  return scale.ticks(count).map((value) => ({ value, pos: scale(value) }));
}
