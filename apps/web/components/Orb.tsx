// The Nemesis mark: a halftone dot lattice — a square grid of dots clipped to a circle, each
// dot largest at the center and shrinking toward the edge (classic halftone, like the reference).
// A pulse ripples outward from the center (delay ∝ radius) and speeds up when `busy`. The lattice
// is generated once at module load; all motion is CSS (app/styles/shell.css), so React does no
// per-frame work and the SVG scales crisply at any size (28px in the rail, 54px on the welcome).

const GRID = 7; // lattice points span -GRID..GRID on each axis (denser → cleanly round silhouette)
const STEP = 100 / (2 * GRID + 2); // spacing in viewBox units (with a margin)
const CENTER = 50;
const EDGE = GRID + 0.2; // circular mask radius, in lattice units (trims the corners to a disc)
const MAX_R = STEP * 0.46; // center dot radius (so center dots nearly touch)
const FALLOFF = 0.8; // edge dots shrink to (1 - FALLOFF) of the center radius

type Dot = { x: number; y: number; r: number; delay: number };

const DOTS: Dot[] = (() => {
  const out: Dot[] = [];
  for (let gy = -GRID; gy <= GRID; gy++) {
    for (let gx = -GRID; gx <= GRID; gx++) {
      const dist = Math.sqrt(gx * gx + gy * gy);
      if (dist > EDGE) continue; // circular mask
      const d = dist / EDGE; // 0 at center … 1 at the rim
      out.push({
        x: CENTER + gx * STEP,
        y: CENTER + gy * STEP,
        r: MAX_R * (1 - FALLOFF * d),
        delay: -d * 1.9, // negative → the brightness wave is already rippling outward from the center
      });
    }
  }
  return out;
})();

export function Orb({ size = 28, busy = false, bloom = false, className }: { size?: number; busy?: boolean; bloom?: boolean; className?: string }) {
  return (
    <span
      className={`orb${busy ? " busy" : ""}${bloom ? " bloom" : ""}${className ? ` ${className}` : ""}`}
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
