"use client";

import { ease, window01 } from "../progress";
import {
  PARABOLA,
  drawCurve,
  drawSecant,
  movePoint,
  placePoint,
  plotFrame,
  ticks,
} from "../plot-primitives";

/**
 * Scene 3 — a quantity, behaving.
 *
 * The graph is built rather than displayed. Axes, then the curve drawing left
 * to right, then a fixed point, then a second one, then the chord between them,
 * and then the second point slides down the curve into the first while the
 * chord follows it all the way to the tangent.
 *
 * ── THE SECANT IS NOT REPLACED BY THE TANGENT ─────────────────────────────────
 *
 * There is no cross-fade between two lines anywhere in this scene, because the
 * idea being taught is that they are the same line. drawSecant keeps returning
 * the correct chord as the gap closes, and the tangent is what it returns when
 * the gap is gone. Fading one shape into another would draw the picture of the
 * concept while quietly contradicting it.
 *
 * The slope readout counts 5.5 down to 4 as this happens. That number
 * converging IS the limit, so it does more teaching than any sentence would,
 * and it costs two lines of text.
 */

/** Matches the frame's aspect ratio, so the plot fills it instead of letterboxing. */
const VB_W = 960;
const VB_H = 420;

/* The domain ends where the curve still fits the range: f(3.65) = 13.3, inside
   14. At 3.9 the curve reached 15.2 and was sliced off by the top of the frame,
   which reads as a clipping fault rather than as a choice of window. */
const DOMAIN: readonly [number, number] = [-0.4, 3.65];
const RANGE: readonly [number, number] = [-1.4, 14];

/** The point the tangent is taken at, and where the second point starts. */
const X0 = 2;
const X_FAR = 3.5;

const FRAME = plotFrame(VB_W, VB_H, DOMAIN, RANGE, { top: 22, right: 150, bottom: 46, left: 58 });

export function MathPlotScene({ t }: { readonly t: number }) {
  const axesIn = ease(window01(t, 0, 0.12));
  const curveT = window01(t, 0.08, 0.4);
  const pIn = window01(t, 0.4, 0.5);
  const qIn = window01(t, 0.48, 0.57);
  const secantIn = ease(window01(t, 0.54, 0.63));
  const closing = window01(t, 0.62, 0.9);
  const readoutIn = ease(window01(t, 0.58, 0.7));

  const curve = drawCurve(FRAME, PARABOLA, DOMAIN, curveT);
  const p = placePoint(FRAME, PARABOLA, X0, pIn);
  const q = movePoint(FRAME, PARABOLA, X_FAR, X0, closing, 5);
  const secant = drawSecant(FRAME, PARABOLA, X0, q.x);

  const dx = Math.abs(q.x - X0);
  const baseline = FRAME.y(0);

  return (
    <svg className="shw-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="The graph of f of x equals x squared, with a secant line collapsing onto the tangent at x equals 2">
      <g className="shw-axis" style={{ opacity: axesIn }}>
        <line x1={FRAME.pad.left} y1={baseline} x2={VB_W - FRAME.pad.right} y2={baseline} />
        <line x1={FRAME.x(0)} y1={FRAME.pad.top} x2={FRAME.x(0)} y2={VB_H - FRAME.pad.bottom} />
        {ticks(FRAME, "x", 4).map((tick) => (
          <g key={`x${tick.value}`}>
            <line x1={tick.pos} y1={baseline} x2={tick.pos} y2={baseline + 5} />
            <text className="shw-tick" x={tick.pos} y={baseline + 19} textAnchor="middle">
              {tick.value}
            </text>
          </g>
        ))}
        {ticks(FRAME, "y", 3).map((tick) =>
          tick.value === 0 ? null : (
            <g key={`y${tick.value}`}>
              <line x1={FRAME.x(0) - 5} y1={tick.pos} x2={FRAME.x(0)} y2={tick.pos} />
              <text className="shw-tick" x={FRAME.x(0) - 11} y={tick.pos + 4} textAnchor="end">
                {tick.value}
              </text>
            </g>
          ),
        )}
      </g>

      <path className="shw-curve" d={curve} />

      {/* The chord, and then the tangent, and then nothing else. */}
      <line
        className="shw-secant"
        x1={secant.x1}
        y1={secant.y1}
        x2={secant.x2}
        y2={secant.y2}
        style={{ opacity: secantIn }}
      />

      {/* Dropped guide from the moving point, so the shrinking gap on the x axis
          is visible as a distance and not only as a number. */}
      <line
        className="shw-guide"
        x1={q.cx}
        y1={q.cy}
        x2={q.cx}
        y2={baseline}
        style={{ opacity: qIn * (1 - ease(window01(t, 0.86, 0.96))) }}
      />

      <circle className="shw-point" cx={p.cx} cy={p.cy} r={p.r} style={{ opacity: p.opacity }} />
      <circle className="shw-point shw-point-2" cx={q.cx} cy={q.cy} r={q.r * ease(qIn)} style={{ opacity: ease(qIn) }} />

      <text className="shw-fn" x={FRAME.x(0) + 14} y={FRAME.pad.top + 16}>
        f(x) = x
        <tspan dy="-6" fontSize="13">
          2
        </tspan>
      </text>

      {/* The readout is the lesson: one number converging on another. */}
      <g className="shw-readout" style={{ opacity: readoutIn }} transform={`translate(${VB_W - 132}, ${FRAME.pad.top + 54})`}>
        <text className="shw-readout-k" y={0}>
          Δx
        </text>
        <text className="shw-readout-v" y={30}>
          {dx < 0.005 ? "0" : dx.toFixed(2)}
        </text>
        <text className="shw-readout-k" y={78}>
          slope
        </text>
        <text className="shw-readout-v" y={108} data-settled={dx < 0.02 ? "" : undefined}>
          {secant.slope.toFixed(2)}
        </text>
      </g>
    </svg>
  );
}
