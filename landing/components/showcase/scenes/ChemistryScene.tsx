"use client";

import { ease, window01 } from "../progress";

/**
 * Scene 5 — a reaction's energy profile.
 *
 * The first half of the chemistry pair. A catalyst is one of the ideas students
 * most reliably get half right: almost everyone knows it makes a reaction go
 * faster, and a large fraction believe that means it produces more product. The
 * picture is what settles it, because the two curves visibly START at the same
 * height and END at the same height while only the hill between them moves.
 *
 * The scene that follows says the same thing in symbols, which is the pattern the
 * other pairs already use: one idea, two representations.
 *
 * ── WHY THE TWO CURVES SHARE THEIR ENDPOINTS EXACTLY ──────────────────────────
 *
 * Both paths begin `M130 250 L225 250` and end `L850 295`. That is not tidiness,
 * it is the entire lesson: a drawing where the catalysed route finished anywhere
 * else would teach the misconception the next scene exists to correct. If these
 * coordinates are ever edited, the two endpoints move together or not at all.
 *
 * ── A CUBIC'S "PLATEAU" IS NOT FLAT ───────────────────────────────────────────
 *
 * `C 635 105 645 295 745 295` looks like it holds y=105 well past x=635. It does
 * not: control points are not on the curve, only NODES are, and anything placed
 * by reading a path as though its controls were waypoints lands tens of pixels
 * off. Both peaks here are nodes at x=490, which is the only reason the labels
 * above them can be positioned by arithmetic at all. Everything else in this
 * scene was checked by sampling the rendered geometry in the browser.
 */

const START_Y = 250;
const END_Y = 295;

/** Both share `M130 250 L225 250 … L850 295`. See the note above. */
const UNCATALYSED = "M130 250 L225 250 C 330 250 345 105 490 105 C 635 105 645 295 745 295 L850 295";
const CATALYSED = "M130 250 L225 250 C 320 250 355 185 490 185 C 625 185 650 295 745 295 L850 295";

export function ChemistryScene({ t }: { readonly t: number }) {
  const axes = ease(window01(t, 0, 0.1));
  const slow = ease(window01(t, 0.08, 0.4));
  const slowLabel = ease(window01(t, 0.36, 0.46));
  const fast = ease(window01(t, 0.46, 0.72));
  const fastLabel = ease(window01(t, 0.66, 0.76));
  const ends = ease(window01(t, 0.8, 0.94));

  return (
    <svg
      className="shw-svg"
      viewBox="0 0 960 420"
      role="img"
      aria-label="Reaction energy profile: a catalyst lowers the activation barrier while the starting and finishing energies stay the same"
    >
      <g className="shw-axis" style={{ opacity: axes }}>
        <line x1="130" y1="350" x2="850" y2="350" />
        <line x1="130" y1="350" x2="130" y2="60" />
      </g>

      {/* pathLength=1 so both curves draw at the same visual speed regardless of
          their real arc lengths, exactly as the diagram scene's edges do. */}
      <path
        className="shw-curve shw-curve-soft"
        d={UNCATALYSED}
        pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: 1 - slow, opacity: slow < 0.02 ? 0 : 1 }}
      />
      <path
        className="shw-curve"
        d={CATALYSED}
        pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: 1 - fast, opacity: fast < 0.02 ? 0 : 1 }}
      />

      {/* 🔴 NO DASHED BARRIER MARKERS, AND THEY WERE BUILT BEFORE BEING CUT.
          Two verticals from the start level to each peak measured the activation
          energies precisely, and they ran from y=250 up to y=105 and y=185 at
          x=490 and x=530 — straight through the only region where either curve
          label can honestly sit. Every alternative placement either put a label
          on a curve or attached it to the wrong one. The two peaks already show
          which barrier is lower, so the markers were removed rather than the
          labels displaced. A first collision check missed this because it sampled
          <path> and not <line>; the dashes are lines. */}

      {/* Stacked on the peaks: the upper label clears its own peak by 17px and
          sits 49px above the lower curve. */}
      <text className="shw-tick" x="490" y="88" textAnchor="middle" style={{ opacity: slowLabel }}>
        without a catalyst
      </text>
      <text className="shw-tick" x="490" y="168" textAnchor="middle" style={{ opacity: fastLabel }}>
        with a catalyst
      </text>

      {/* No "the hill is lower" caption here, though it was written: centred at
          x=490 just above the start level, it ran straight through the barrier
          marker rising from that same point. The two dashed heights already say
          it, and the line under the frame says it in words. */}
      <g style={{ opacity: ends }}>
        <text className="shw-tick" x="150" y={START_Y - 12}>
          same start
        </text>
        <text className="shw-tick" x="790" y={END_Y + 30} textAnchor="middle">
          same finish
        </text>
      </g>

      <text className="shw-tick" x="140" y="52">
        energy
      </text>
      <text className="shw-tick" x="770" y="378">
        reaction path
      </text>
    </svg>
  );
}
