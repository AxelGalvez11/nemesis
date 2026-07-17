"use client";
// SVG scatter of the answer's evidence: newer → right, stronger → up, bigger dot =
// stronger claim support, filled = cited (hollow = reviewed-only). Click a dot to jump
// to its source card. Pure render over buildEvidenceMap() — no chart libraries.
import type { Citation } from "@nemesis/shared";
import { buildEvidenceMap } from "@nemesis/shared";
import { normTag } from "@/lib/cite";

const W = 320, H = 240;

export function EvidenceMapView({ citations, reviewed, onSelect }: {
  citations: Citation[]; reviewed: Citation[]; onSelect: (tag: string) => void;
}) {
  const map = buildEvidenceMap(citations, reviewed, W, H);
  if (!map) return <div className="ev-empty">Not enough dated sources to draw a map.</div>;
  return (
    <div className="ev-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evidence map: publication year vs evidence strength">
        <line x1="30" y1={H - 28} x2={W - 10} y2={H - 28} className="ev-map-axis" />
        <line x1="30" y1="12" x2="30" y2={H - 28} className="ev-map-axis" />
        <text x={34} y={H - 12} className="ev-map-label">{map.years[0]}</text>
        <text x={W - 44} y={H - 12} className="ev-map-label">{map.years[1]}</text>
        <text x={6} y={18} className="ev-map-label">strong</text>
        <text x={6} y={H - 34} className="ev-map-label">weak</text>
        {map.points.map((p) => (
          <circle
            key={p.tag} cx={p.x} cy={p.y} r={p.r}
            className={`ev-map-dot${p.cited ? " cited" : ""}`}
            role="button" tabIndex={0}
            onClick={() => onSelect(normTag(p.tag))}
            onKeyDown={(e) => { if (e.key === "Enter") onSelect(normTag(p.tag)); }}
          >
            <title>{`${p.title} (${p.year}) — evidence weight ${p.weight}`}</title>
          </circle>
        ))}
      </svg>
      <p className="ev-map-hint">Newer → right · stronger → up · filled = cited in this answer. Click a dot to open its source.</p>
    </div>
  );
}
