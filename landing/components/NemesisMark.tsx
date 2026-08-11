"use client";

import { useId } from "react";

/**
 * The Nemesis mark: three glossy beads, stacked.
 *
 * WHY THIS IS DRAWN AND NOT AN IMAGE FILE. The old mark was `logo.png`, a dark glyph
 * on transparency, which vanished on the black page — so the CSS inverted it with a
 * `filter`. That works exactly as long as the mark has no colour and no material, and
 * it stops working the moment either exists. These beads have a body, a terminator
 * and a specular that have to invert INDEPENDENTLY (the black bead becomes pearl; the
 * specular stays white), which no filter can do. Drawn in SVG off the same tokens as
 * the rest of the page, both modes are the same code and neither is a special case.
 *
 * THE MOTION IS STATE, NOT DECORATION. Each `state` below is a thing the system is
 * actually doing, and the movement is chosen to look like that thing: `reading`
 * traverses downward, `diagnosing` pulls one bead out of alignment and puts it back,
 * `retrieving` compresses the stack and releases it. Nothing bounces and nothing
 * squashes — the brief rules out playful physics, and a mark that springs reads as a
 * toy rather than an instrument.
 *
 * `prefers-reduced-motion` stops all of it in globals.css. The mark still renders;
 * it simply holds still, which is the correct resting state of every animation here.
 */
export type MarkState =
  /** Identity. No animation at all — nav, footer, favicon-adjacent uses. */
  | "static"
  | "idle"
  | "thinking"
  | "reading"
  | "diagnosing"
  | "retrieving"
  | "adapting"
  | "listening"
  | "success";

/**
 * Three beads, tilted and stacked.
 *
 * THE TILT IS THE MARK. The first version of this had them nearly horizontal, a few
 * degrees apart — that was the earlier brand sheet, and at any real size it reads as
 * three dashes. The 2026-08-10 sheet and the app-icon render both show the long axis
 * running lower-left to upper-right at roughly 25 degrees, stacked close enough to
 * almost touch. That diagonal is what makes the silhouette recognisable at 16px.
 *
 * Still deliberately unequal. Identical ellipses on a shared axis read as a diagram
 * of three ellipses; a fraction of variation in size, offset and angle is what makes
 * them read as objects. Small enough that nobody notices it, large enough that the
 * mark stops looking generated.
 */
const BEADS = [
  { cx: 49.6, cy: 26, rx: 30, ry: 14.2, tilt: -25 },
  { cx: 50.5, cy: 66, rx: 32, ry: 15, tilt: -23 },
  { cx: 49.8, cy: 106, rx: 30.5, ry: 14.4, tilt: -26 },
] as const;

/**
 * The viewBox HUGS THE INK, and it has to be recomputed whenever BEADS changes.
 *
 * A rotated ellipse occupies far less width than its rx suggests — at 25 degrees
 * these span about 60 units of the 100 the coordinates are written in. Left at
 * "0 0 100 132" the element reserved 40 units of empty width, so `size` bought a
 * box rather than a mark and every instance rendered visibly smaller than asked.
 *
 * Bounds of a rotated ellipse: half-width = √((rx·cosθ)² + (ry·sinθ)²), half-height
 * = √((rx·sinθ)² + (ry·cosθ)²). Computed once at module load rather than typed in,
 * so a future tweak to a bead cannot silently reintroduce the padding.
 */
const VIEW = (() => {
  const PAD = 1.5;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of BEADS) {
    const t = (b.tilt * Math.PI) / 180;
    const hw = Math.hypot(b.rx * Math.cos(t), b.ry * Math.sin(t));
    const hh = Math.hypot(b.rx * Math.sin(t), b.ry * Math.cos(t));
    x0 = Math.min(x0, b.cx - hw); x1 = Math.max(x1, b.cx + hw);
    y0 = Math.min(y0, b.cy - hh); y1 = Math.max(y1, b.cy + hh);
  }
  const w = x1 - x0 + PAD * 2;
  const h = y1 - y0 + PAD * 2;
  return { box: `${x0 - PAD} ${y0 - PAD} ${w} ${h}`, ratio: w / h };
})();

interface NemesisMarkProps {
  state?: MarkState;
  /** Rendered height in px. Width follows the ink's own aspect ratio. */
  size?: number;
  /** Give this only when the mark carries meaning on its own (the nav logo does not —
   *  it sits next to the word "nemesis", so it stays decorative and silent). */
  label?: string;
  className?: string;
}

export function NemesisMark({
  state = "static",
  size = 44,
  label,
  className,
}: NemesisMarkProps) {
  // Gradient ids have to be unique per instance: two marks on one page sharing an id
  // means the second silently paints with the first one's gradient, and if the first
  // ever unmounts, both go flat.
  const uid = useId().replace(/:/g, "");

  const body = `${uid}-body`;
  const spec = `${uid}-spec`;
  const bounce = `${uid}-bounce`;

  return (
    <svg
      className={[`mark mark-${state}`, className].filter(Boolean).join(" ")}
      viewBox={VIEW.box}
      height={size}
      width={size * VIEW.ratio}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        {/* Every stop carries a fallback. An SVG `stop-color` set to an undefined
            custom property is INVALID, and an invalid stop-color computes to black —
            so a token that has not loaded yet, or gets renamed without this file
            being updated, turns the whole mark into three black blobs on a black
            page rather than failing loudly. The fallbacks are the light-mode
            material, which is wrong-but-visible instead of invisible. */}
        {/* The body. Light falls from the upper left, so the focal point of the
            radial sits there and the far edge falls to the darkest stop. */}
        <radialGradient id={body} cx="32%" cy="24%" r="86%">
          <stop offset="0%" stopColor="var(--bead-lit, #6f6f6f)" />
          <stop offset="46%" stopColor="var(--bead-far, #050505)" />
          <stop offset="100%" stopColor="var(--bead-far, #050505)" />
        </radialGradient>

        {/* The specular. The reference is a bright, fairly hard streak running along
            the top of the bead, so the white holds a plateau before it falls away —
            a single soft dot reads as matte plastic instead of glass. */}
        <radialGradient id={spec} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--bead-highlight, #ffffff)" stopOpacity="1" />
          <stop offset="45%" stopColor="var(--bead-highlight, #ffffff)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--bead-highlight, #ffffff)" stopOpacity="0" />
        </radialGradient>

        {/* Reflected light along the lower edge. This is the single detail that stops
            the beads reading as flat ovals: a real solid picks up bounce from whatever
            it is sitting on, and without it the underside dies into the background. */}
        <linearGradient id={bounce} x1="0%" y1="0%" x2="18%" y2="100%">
          <stop offset="55%" stopColor="var(--bead-edge, #d1d1d1)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--bead-edge, #d1d1d1)" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* TWO NESTED GROUPS, and the nesting is load-bearing. A CSS `transform` on an
          SVG element REPLACES its `transform` attribute rather than composing with it,
          so animating the outer group would silently delete each bead's tilt the
          instant an animation ran. The tilt lives on the inner group, which CSS never
          touches; the outer group is the animator's, exclusively. */}
      {BEADS.map((bead, i) => (
        <g key={bead.cy} className={`bead bead-${i + 1}`}>
          <g transform={`rotate(${bead.tilt} ${bead.cx} ${bead.cy})`}>
            <ellipse cx={bead.cx} cy={bead.cy} rx={bead.rx} ry={bead.ry} fill={`url(#${body})`} />
            <ellipse cx={bead.cx} cy={bead.cy} rx={bead.rx} ry={bead.ry} fill={`url(#${bounce})`} />
            {/* No rotation of its own. The streak runs ALONG the bead's long axis,
                and this sits inside the group that already carries the tilt — an
                extra angle here would cross the highlight over the form. */}
            <ellipse
              cx={bead.cx - bead.rx * 0.35}
              cy={bead.cy - bead.ry * 0.33}
              rx={bead.rx * 0.46}
              ry={bead.ry * 0.34}
              fill={`url(#${spec})`}
            />
          </g>
        </g>
      ))}
    </svg>
  );
}

/**
 * Mark plus lowercase wordmark, horizontal. The nav and footer lockup.
 *
 * "nemesis" is lowercase and tracked wide, which is the identity — not a style choice
 * a future edit gets to sentence-case back.
 */
export function NemesisLockup({ size = 26 }: { size?: number }) {
  return (
    <span className="lockup">
      <NemesisMark state="static" size={size} />
      <span className="lockup-word">nemesis</span>
    </span>
  );
}
