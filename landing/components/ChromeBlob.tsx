"use client";

import { useId } from "react";

/**
 * The chrome organism. Nemesis's second visual character, alongside the beads.
 *
 * The brand sheet keeps these apart and so does this codebase: the three beads are
 * the MARK (identity, and the cognition states in the loop rail), and these liquid
 * forms are the sheet's "background / hero elements" — atmosphere and transition.
 * They are not interchangeable, and a blob does not go next to every paragraph;
 * that is the fastest way to turn a character into wallpaper.
 *
 * ── WHY THIS IS DRAWN AND NOT THE SUPPLIED RENDERS ────────────────────────────
 *
 * The reference images are beautiful and completely static. The whole point of the
 * direction is that the form CHANGES with what the system is doing — stretching
 * around material as it absorbs it, tightening when it tests you, going asymmetric
 * when it finds a weakness. A PNG cannot be a transition between product states.
 * So the blob is a path that morphs, and the states below are real destinations.
 *
 * ── THE TWO THINGS THAT MAKE OR BREAK IT ──────────────────────────────────────
 *
 * 1. EVERY STATE HAS THE SAME NODE COUNT. All six `d` strings below are six cubic
 *    segments, in the same order, around the same centre. SVG path interpolation is
 *    per-command, so a state with a different number or type of segments does not
 *    morph — it snaps. Move the control points; never redraw the shape.
 *
 * 2. IT IS A GLOSSY SOLID, NOT A MIRROR — AND THAT IS A DELIBERATE RETREAT.
 *    The first attempt chased the reference renders literally, with tight alternating
 *    light/dark stops to imitate a mirror's compressed reflections. It looked like
 *    barcode stripes: a linear gradient runs straight across a shape, and real chrome
 *    reflects along the form's CURVATURE, which no single gradient can follow.
 *    So this uses the same material the beads use — a dark body lit from the upper
 *    left, one specular, one bounce off the ground. Less photoreal than the reference,
 *    and coherent with the mark instead of fighting it. If a photoreal organism is
 *    wanted, it has to be a render; this is what is honestly achievable in vector.
 */
export type BlobState =
  /** At rest. */
  | "idle"
  /** Material going in: the form stretches and opens around it. */
  | "absorbing"
  /** Sense being made: everything pulls toward one centre. */
  | "understanding"
  /** Retrieval: tighter, sharper, less generous. */
  | "testing"
  /** Something broke: the form goes visibly asymmetric. */
  | "weakness"
  /** Resolved: one smooth, even, unbroken shape. */
  | "mastery";

/**
 * Seven cubic segments per state, on a 0–200 box centred at (100, 100).
 *
 * GENERATED, NOT TYPED. These come from a closed Catmull-Rom through seven points on
 * a varied-radius ring, converted to cubics — which is what makes the curvature
 * continuous all the way round. Hand-placed control points were tried first and every
 * shape came out lumpy, with visible corners where two segments met at different
 * tangents. The generator lives in the commit message for this file; the numbers are
 * baked in here so nothing has to run at build time.
 *
 * Each state varies the radii, never the node count: `testing` is uniformly tighter,
 * `weakness` swings two opposite radii far apart so the form goes visibly lopsided,
 * and `mastery` is every radius equal — one smooth, even, resolved shape.
 */
const PATHS: Record<BlobState, string> = {
  idle:
    "M100.0 26.0C118.4 26.5 140.5 42.3 153.2 57.6C166.0 72.8 180.3 99.8 176.5 117.5C172.7 135.1 148.8 154.7 130.5 163.3C112.2 172.0 82.5 177.4 66.6 169.3C50.7 161.3 39.1 134.0 35.1 114.8C31.1 95.7 31.9 69.1 42.7 54.3C53.5 39.5 81.6 25.5 100.0 26.0Z",
  absorbing:
    "M100.0 10.3C119.2 13.0 132.5 43.7 147.5 62.1C162.6 80.5 193.6 104.5 190.4 120.6C187.2 136.8 149.5 149.8 128.4 158.9C107.2 168.0 78.1 182.9 63.7 175.3C49.4 167.7 47.5 134.7 42.2 113.2C37.0 91.6 22.6 63.1 32.3 46.0C41.9 28.8 80.8 7.6 100.0 10.3Z",
  understanding:
    "M100.0 32.8C117.7 32.5 143.5 43.2 154.2 56.8C164.9 70.4 168.1 96.8 164.2 114.6C160.2 132.5 146.3 155.9 130.7 163.7C115.1 171.5 87.0 169.2 70.5 161.2C54.1 153.2 35.5 132.7 31.8 115.6C28.0 98.5 36.6 72.3 48.0 58.5C59.4 44.7 82.3 33.1 100.0 32.8Z",
  testing:
    "M100.0 42.4C114.6 42.6 133.5 53.9 143.0 65.7C152.6 77.5 160.6 99.2 157.4 113.1C154.2 127.0 137.4 142.5 123.6 149.0C109.8 155.6 87.4 158.6 74.7 152.5C62.1 146.3 50.8 126.6 47.6 112.0C44.4 97.3 46.7 76.1 55.5 64.5C64.2 52.9 85.4 42.2 100.0 42.4Z",
  weakness:
    "M100.0 8.2C115.4 9.5 130.4 48.9 141.7 66.8C153.0 84.7 168.6 97.1 167.8 115.5C167.1 133.9 152.3 172.1 137.2 177.3C122.2 182.5 96.7 156.6 77.5 146.7C58.3 136.7 26.8 132.3 22.1 117.8C17.3 103.2 36.1 77.7 49.1 59.4C62.1 41.1 84.6 7.0 100.0 8.2Z",
  mastery:
    "M100.0 28.0C118.8 28.0 144.6 40.4 156.3 55.1C168.0 69.8 174.4 97.7 170.2 116.0C166.0 134.3 148.1 156.7 131.2 164.9C114.3 173.0 85.7 173.0 68.8 164.9C51.9 156.7 34.0 134.3 29.8 116.0C25.6 97.7 32.0 69.8 43.7 55.1C55.4 40.4 81.2 28.0 100.0 28.0Z",
};

/**
 * The morph itself. `values` walks the states in a loop; because every path has
 * identical structure the browser interpolates continuously instead of snapping.
 *
 * 18 seconds is deliberate. This is atmosphere, and a form moving fast enough to
 * notice while reading is a distraction rather than a character. SMIL is used rather
 * than CSS because `d` is not reliably animatable in CSS across browsers, and this
 * needs to work without shipping an animation library for one shape.
 */
function Morph({ from }: { from: BlobState }) {
  return (
    <animate
      attributeName="d"
      dur="18s"
      repeatCount="indefinite"
      calcMode="spline"
      keyTimes="0;0.2;0.4;0.6;0.8;1"
      keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
      values={[
        PATHS[from],
        PATHS.absorbing,
        PATHS.understanding,
        PATHS.weakness,
        PATHS.mastery,
        PATHS[from],
      ].join(";")}
    />
  );
}

interface ChromeBlobProps {
  state?: BlobState;
  /** Rendered width in px (the form is square). */
  size?: number;
  className?: string;
}

export function ChromeBlob({ state = "idle", size = 320, className }: ChromeBlobProps) {
  const uid = useId().replace(/:/g, "");
  const chrome = `${uid}-chrome`;
  const sheen = `${uid}-sheen`;
  const bounce = `${uid}-bounce`;

  return (
    <svg
      className={["blob", className].filter(Boolean).join(" ")}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The chrome ramp. Read the stop offsets, not the colours: the pairs sit
            1–2% apart, which is what produces the hard reflection edges. Spreading
            them evenly turns this into grey plastic immediately. */}
        <radialGradient id={chrome} cx="30%" cy="22%" r="88%">
          <stop offset="0%" stopColor="var(--chrome-mid, #8a8a8a)" />
          <stop offset="46%" stopColor="var(--chrome-lo, #0a0a0a)" />
          <stop offset="100%" stopColor="var(--chrome-deep, #000000)" />
        </radialGradient>
        {/* Bounce off the surface below, along the lower-right edge — the detail
            that stops the form reading as a flat silhouette. */}
        <linearGradient id={bounce} x1="6%" y1="0%" x2="58%" y2="100%">
          <stop offset="56%" stopColor="var(--chrome-mid, #8a8a8a)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--chrome-mid, #8a8a8a)" stopOpacity="0.55" />
        </linearGradient>

        {/* One broad soft highlight over the top-left mass, so the banding reads as
            a lit solid rather than as stripes. */}
        <radialGradient id={sheen} cx="30%" cy="20%" r="42%">
          <stop offset="0%" stopColor="var(--chrome-hi, #f2f2f2)" stopOpacity="0.95" />
          <stop offset="40%" stopColor="var(--chrome-hi, #f2f2f2)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--chrome-hi, #f2f2f2)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* BOTH paths carry the same animation. The sheen is clipped to the form, so
          leaving it static while the body morphs slides the highlight off the shape
          within a second — the one bug that makes the whole thing look broken. */}
      <path className="blob-body" d={PATHS[state]} fill={`url(#${chrome})`}>
        <Morph from={state} />
      </path>
      <path className="blob-bounce" d={PATHS[state]} fill={`url(#${bounce})`}>
        <Morph from={state} />
      </path>
      <path className="blob-sheen" d={PATHS[state]} fill={`url(#${sheen})`}>
        <Morph from={state} />
      </path>
    </svg>
  );
}
