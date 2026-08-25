"use client";

/**
 * The Nemesis mark: three flat ovals, stacked on a diagonal.
 *
 * ── IT IS FLAT, AND THAT IS THE SPECIFICATION ─────────────────────────────────
 *
 * This used to be three glossy beads — a radial-gradient body, a specular streak,
 * and a bounce-light pass along the underside. It was drawn well and it was the
 * wrong object. A logo has to survive being 16 pixels wide in a browser tab, one
 * colour on a sticker, and embroidered on something; a mark whose legibility
 * depends on three overlapping gradients survives none of that. At favicon size
 * the specular and the bounce merge into a grey smear and the silhouette — the
 * only thing that actually identifies a mark — gets weaker, not stronger.
 *
 * So: solid fill, no gradient, no lighting, no shadow, no bevel, no outline.
 * What identifies Nemesis is three elongated ovals on a diagonal, and that reads
 * at any size in any medium.
 *
 * The 3D organism in the hero is a different object doing a different job. Three
 * levels of one system: flat ovals are the identity, flat ovals in motion are the
 * interface telling you it is working, and the organism is the expressive form.
 * They are relatives, not the same asset at three sizes.
 *
 * ── COLOUR IS INHERITED, NOT DECLARED ─────────────────────────────────────────
 *
 * `currentColor`, so dark mode is not a second drawing. The old version needed
 * body, specular and bounce to inverse-map INDEPENDENTLY, which is why it carried
 * its own token set. With one solid fill the mark simply takes the ink colour of
 * wherever it is placed — black on the light page, white on the dark one, correct
 * inside a dark button without anybody special-casing it. The geometry is
 * identical in every mode. Only the fill changes.
 *
 * ── THE MOTION IS STATE, NOT DECORATION ───────────────────────────────────────
 *
 * Each `state` is a thing the system is actually doing, and the movement is
 * chosen to look like that thing. See app/mark.css. `prefers-reduced-motion`
 * stops all of it; the mark still renders, it just holds still, which is the
 * resting state of every animation there.
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

/**
 * Three ovals, tilted and stacked. MEASURED OFF THE SUPPLIED MARK, not eyeballed.
 *
 * From the 1242px reference: each oval occupies a 308 × 240 bounding box, which
 * for a rotated ellipse solves to semi-axes of roughly 185 × 60 at 36 degrees —
 * an elongation of about 3.1 to 1. Centres sit 197.5 apart on an even vertical
 * pitch with no horizontal stagger (the three centres agree to within 6px of
 * 1242, which is alignment, not offset). Because each oval's box is 240 tall and
 * the pitch is 197.5, consecutive ovals overlap by about 42 — they just touch,
 * and that near-contact is part of the silhouette.
 *
 * Scaled here by 0.335 into a 100-unit space: rx 62, ry 20, pitch 66.
 *
 * THE PREVIOUS GEOMETRY WAS WRONG IN BOTH RESPECTS. It carried 2.1:1 ovals at 25
 * degrees — visibly fatter and shallower than the real mark. Bounds check for
 * anyone changing these: half-width = √((rx·cosθ)² + (ry·sinθ)²) = 51.6,
 * half-height = √((rx·sinθ)² + (ry·cosθ)²) = 39.8, giving a 103 × 80 box per
 * oval and 1.30 aspect against the reference's 1.28.
 *
 * IDENTICAL TO EACH OTHER, deliberately. The old geometry varied each oval's
 * radius and angle by a percent or two, reasoning that slight irregularity stops
 * three ellipses reading as a diagram of three ellipses. That belonged to the
 * glossy version, where the variation read as three solids catching light
 * differently. Flat, there is no light to catch, and the same variation just
 * reads as imprecision — the one thing a geometric mark cannot afford. The
 * reference is uniform; so is this.
 *
 * Exported because the showcase's handoff draws these same three ovals. One
 * definition, so the identity and the interface motion cannot drift apart.
 */
export const MARK_OVALS = [
  { cx: 50, cy: 40, rx: 62, ry: 20, tilt: -36 },
  { cx: 50, cy: 106, rx: 62, ry: 20, tilt: -36 },
  { cx: 50, cy: 172, rx: 62, ry: 20, tilt: -36 },
] as const;

/**
 * The viewBox HUGS THE INK, and it is recomputed whenever MARK_OVALS changes.
 *
 * A rotated ellipse occupies far less width than its rx suggests — at 25 degrees
 * these span about 60 units of the 100 the coordinates are written in. Hard-coded
 * as "0 0 100 132" the element reserved 40 units of empty width, so `size` bought
 * a box rather than a mark and every instance rendered visibly smaller than asked.
 *
 * Bounds of a rotated ellipse: half-width = √((rx·cosθ)² + (ry·sinθ)²),
 * half-height = √((rx·sinθ)² + (ry·cosθ)²). Computed at module load rather than
 * typed in, so a future tweak cannot silently reintroduce the padding.
 */
export const MARK_VIEW = (() => {
  const PAD = 1.5;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of MARK_OVALS) {
    const t = (o.tilt * Math.PI) / 180;
    const hw = Math.hypot(o.rx * Math.cos(t), o.ry * Math.sin(t));
    const hh = Math.hypot(o.rx * Math.sin(t), o.ry * Math.cos(t));
    x0 = Math.min(x0, o.cx - hw); x1 = Math.max(x1, o.cx + hw);
    y0 = Math.min(y0, o.cy - hh); y1 = Math.max(y1, o.cy + hh);
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
      {/* TWO NESTED GROUPS, and the nesting is load-bearing. A CSS `transform` on
          an SVG element REPLACES its `transform` attribute rather than composing
          with it, so animating the outer group would silently delete each oval's
          tilt the instant an animation ran. The tilt lives on the inner group,
          which CSS never touches; the outer group belongs to the animator. */}
      {MARK_OVALS.map((oval, i) => (
        <g key={oval.cy} className={`bead bead-${i + 1}`}>
          <g transform={`rotate(${oval.tilt} ${oval.cx} ${oval.cy})`}>
            <ellipse cx={oval.cx} cy={oval.cy} rx={oval.rx} ry={oval.ry} fill="currentColor" />
          </g>
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
