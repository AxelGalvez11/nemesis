// The PharmaOrb mark — ported verbatim from apps/web (the logged-in app) so the landing
// logo matches exactly: a halftone dot lattice (a square grid of dots clipped to a circle,
// largest at the center, shrinking toward the edge). A brightness wave ripples outward from
// the center (per-dot negative delay ∝ radius). All motion is CSS (see globals.css `.orb`),
// so React does no per-frame work and the SVG scales crisply at any size.

const GRID = 7;
const STEP = 100 / (2 * GRID + 2);
const CENTER = 50;
const EDGE = GRID + 0.2;
const MAX_R = STEP * 0.46;
const FALLOFF = 0.8;

type Dot = { x: number; y: number; r: number; delay: number };

const DOTS: Dot[] = (() => {
  const out: Dot[] = [];
  for (let gy = -GRID; gy <= GRID; gy++) {
    for (let gx = -GRID; gx <= GRID; gx++) {
      const dist = Math.sqrt(gx * gx + gy * gy);
      if (dist > EDGE) continue;
      const d = dist / EDGE;
      out.push({
        x: CENTER + gx * STEP,
        y: CENTER + gy * STEP,
        r: MAX_R * (1 - FALLOFF * d),
        delay: -d * 1.9,
      });
    }
  }
  return out;
})();

export function Orb({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`orb${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {DOTS.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} className="hd" style={{ animationDelay: `${dot.delay}s` }} />
        ))}
      </svg>
    </span>
  );
}
