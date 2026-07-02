// Evidence map (Litmaps-pattern): x = publication year, y = deterministic evidence
// weight (0-100, already computed per source), dot size = support score, filled = cited
// in the answer. Pure geometry — the component just draws these points.

import type { Citation } from "./answer.ts";

export interface EvidenceMapPoint {
  tag: string; title: string; year: number; weight: number; cited: boolean; role: string | null;
  x: number; y: number; r: number;
}

const PAD = 34; // axis gutter

function yearOf(c: Citation): number | null {
  const y = c.year ? parseInt(c.year, 10) : c.published_date ? parseInt(c.published_date.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) && y > 1900 && y < 2100 ? y : null;
}

export function buildEvidenceMap(
  citations: Citation[], reviewed: Citation[], width: number, height: number,
): { points: EvidenceMapPoint[]; years: [number, number] } | null {
  const all = [
    ...citations.map((c) => ({ c, cited: true })),
    ...reviewed.map((c) => ({ c, cited: false })),
  ].map(({ c, cited }) => ({ c, cited, year: yearOf(c) }))
    .filter((e): e is { c: Citation; cited: boolean; year: number } => e.year !== null);
  if (all.length < 3) return null;

  const years = all.map((e) => e.year);
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const span = Math.max(1, y1 - y0);

  const points = all.map(({ c, cited, year }) => {
    const weight = typeof c.evidence_weight === "number" ? c.evidence_weight : 40;
    const support = typeof c.support_score === "number" ? c.support_score : 40;
    return {
      tag: c.chunk_tag, title: c.title ?? c.source_type, year, weight, cited,
      role: c.evidence_role ?? null,
      x: PAD + ((year - y0) / span) * (width - PAD * 2),
      y: PAD + (1 - weight / 100) * (height - PAD * 2),
      r: 4 + (support / 100) * 6,
    };
  });
  return { points, years: [y0, y1] };
}
