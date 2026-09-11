"use client";

/**
 * The Nemesis mark: three dots, two up and one down.
 *
 * ── THE OWNER'S PICK, AND WHY THE DOTS ARE THIS SIZE ──────────────────────────
 *
 * Owner, 2026-09-11, choosing from nine directions: three dots, "take out the ... dotted ring", "invert
 * vertically ... so two dots up and one dot down", and "make sure it doesn't resemble any other famous logo".
 * Every candidate was scored against the 3,459 brand logos in Simple Icons: both shapes scaled to one size,
 * turned or flipped to their best match, then measured on how much of the shape overlaps. Asana against Julia,
 * two marks people genuinely confuse, overlap 87%. Three equal dots at the first sketch's size overlap Asana
 * 55%, and dots that nearly touch are Asana's logo (94%). At a radius of 0.36 of the spacing circle every logo
 * in the set is under 50%: Asana 42%, Julia 37%, the closest of all 46%. Turning the mark over changes none of
 * those numbers; only the dot size does, so the size is the part that must not drift.
 *
 * ── FLAT, AND COLOUR IS INHERITED ─────────────────────────────────────────────
 *
 * Solid fill, no gradient, no lighting, no outline: a logo has to survive being 16 pixels wide in a browser tab
 * and one colour on a sticker. `currentColor`, so dark mode is not a second drawing.
 *
 * ── THE MOTION IS STATE, NOT DECORATION ───────────────────────────────────────
 *
 * Each `state` is a thing the system is actually doing, and the movement is chosen to look like that thing. See
 * app/mark.css; the three dots keep the `bead` classes it animates. `prefers-reduced-motion` stops all of it.
 *
 * Geometry is identical to app/icon.svg, app/apple-icon.tsx and the app's components/nemesis-mark.tsx;
 * lib/mark.test.ts holds every copy to MARK_DOTS.
 */

export type MarkState =
  /** Identity. No animation at all — nav, footer, favicon-adjacent uses. */
  | "static"
  | "idle"
  | "thinking"
  /** Between representations: drift, compress, respace, settle. Short. */
  | "processing"
  | "reading"
  | "diagnosing"
  | "retrieving"
  | "adapting"
  | "listening"
  | "success";

/** Three circles in a 100-unit box: centres on a circle of radius 30 at 210°, 330° and 90°, radius 10.8. */
export const MARK_DOTS = [
  { cx: 24.02, cy: 35, r: 10.8 },
  { cx: 75.98, cy: 35, r: 10.8 },
  { cx: 50, cy: 80, r: 10.8 },
] as const;

/**
 * The viewBox HUGS THE INK, so `size` buys a mark rather than a box around one. Computed from MARK_DOTS rather
 * than typed in, so a future change cannot silently leave padding behind.
 */
export const MARK_VIEW = (() => {
  const PAD = 1.5;
  const round = (n: number) => Math.round(n * 100) / 100;
  const x0 = round(Math.min(...MARK_DOTS.map((d) => d.cx - d.r)) - PAD);
  const x1 = round(Math.max(...MARK_DOTS.map((d) => d.cx + d.r)) + PAD);
  const y0 = round(Math.min(...MARK_DOTS.map((d) => d.cy - d.r)) - PAD);
  const y1 = round(Math.max(...MARK_DOTS.map((d) => d.cy + d.r)) + PAD);
  return { box: `${x0} ${y0} ${round(x1 - x0)} ${round(y1 - y0)}`, ratio: (x1 - x0) / (y1 - y0) };
})();

interface NemesisMarkProps {
  state?: MarkState;
  /** Rendered height in px. Width follows the ink's own aspect ratio. */
  size?: number;
  /** Give this only when the mark carries meaning on its own (the nav logo does not —
   *  it sits next to the word "Nemesis", so it stays decorative and silent). */
  label?: string;
  className?: string;
}

export function NemesisMark({
  state = "static",
  size = 44,
  label,
  className,
}: NemesisMarkProps) {
  return (
    <svg
      className={[`mark mark-${state}`, className].filter(Boolean).join(" ")}
      viewBox={MARK_VIEW.box}
      height={size}
      width={size * MARK_VIEW.ratio}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {MARK_DOTS.map((dot, i) => (
        <g key={`${dot.cx},${dot.cy}`} className={`bead bead-${i + 1}`}>
          <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Mark plus wordmark, horizontal. The nav and footer lockup.
 *
 * 🔴 CAPITAL N SINCE 2026-08-25, at the owner's instruction ("the 'nemesis' has 'n' in
 * lowercase, it should be uppercase"). This comment used to insist the lowercase was
 * the identity and was not to be sentence-cased back; that instruction is retired, and
 * older comments in this repo still carrying it are stale. The wide tracking stays.
 */
export function NemesisLockup({ size = 26 }: { size?: number }) {
  return (
    <span className="lockup">
      <NemesisMark state="static" size={size} />
      <span className="lockup-word">Nemesis</span>
    </span>
  );
}
