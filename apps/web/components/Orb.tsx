// The PharmaOrb mark: a living ring of dots that spin + pulse (and spin faster when `busy`).
// Pure presentational — the animations live in app/styles/shell.css. Dot positions are computed
// from the size so the orb scales cleanly (28px in the rail/avatar, 30px while thinking).

export function Orb({ size = 28, busy = false, className }: { size?: number; busy?: boolean; className?: string }) {
  const dots = 12;
  const s = Math.max(2, Math.round(size * 0.11)); // dot diameter
  const r = (size - s - 4) / 2; // ring radius
  return (
    <span
      className={`orb${busy ? " busy" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {Array.from({ length: dots }).map((_, i) => (
        <span
          key={i}
          className="slot"
          style={{ transform: `translate(-50%,-50%) rotate(${(i * 360) / dots}deg) translateY(${-r}px)` }}
        >
          <span className="d" style={{ width: s, height: s, animationDelay: `${(i * (1.5 / dots)).toFixed(2)}s` }} />
        </span>
      ))}
    </span>
  );
}
