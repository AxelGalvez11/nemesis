// Shimmer placeholders shown while a list loads — calmer + faster-feeling than a bare "Loading…" label.
// Presentation-only; styling lives in shell.css (.skeleton / .skel-row, reduced-motion aware).

interface SkeletonRowsProps {
  /** How many placeholder rows to show (roughly match the list's typical length). */
  count?: number;
  /** Row height in px (default mirrors a watch/report card). */
  height?: number;
  /** Accessible label announced to screen readers while loading. */
  label?: string;
}

export function SkeletonRows({ count = 3, height = 62, label = "Loading…" }: SkeletonRowsProps) {
  return (
    <div className="skel-list" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skel-row" style={{ height }} />
      ))}
    </div>
  );
}
