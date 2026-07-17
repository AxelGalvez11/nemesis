"use client";

import type { MetaAnalysisResult } from "@nemesis/shared";
import { buildForestPlot } from "@nemesis/shared";

// The forest-plot FIGURE for a poolable meta-analysis. Geometry comes from the shared, pure
// buildForestPlot (computed from the real pool — never an LLM-drawn figure); this only paints the
// model. Colors are theme CSS variables (not the fixed print colors the export SVG uses), so the
// figure reads correctly in both light and dark. The pooled diamonds use the accent to make the
// headline result pop; study boxes are sized by their weight (area ∝ weight).
export function ForestPlot({ meta }: { meta: MetaAnalysisResult }) {
  const m = buildForestPlot(meta);
  if (!m) return null;
  const f2 = (n: number) => n.toFixed(2);
  return (
    <figure className="forest-plot">
      <svg
        viewBox={`0 0 ${m.width} ${m.height}`}
        width="100%"
        style={{ maxWidth: m.width }}
        role="img"
        aria-label="Forest plot of the pooled risk ratio"
        fontSize={11}
      >
        {/* RR = 1 line of no effect */}
        <line x1={m.refX} y1={6} x2={m.refX} y2={m.axisY} stroke="var(--text-3)" strokeWidth={1} />
        {/* value axis + ticks */}
        <line x1={m.plotLeft} y1={m.axisY} x2={m.plotRight} y2={m.axisY} stroke="var(--text-2)" strokeWidth={1} />
        {m.ticks.map((t) => (
          <g key={t.value}>
            <line x1={t.x} y1={m.axisY} x2={t.x} y2={m.axisY + 4} stroke="var(--text-2)" strokeWidth={1} />
            <text x={t.x} y={m.axisY + 16} textAnchor="middle" fill="var(--text-3)">{t.value}</text>
          </g>
        ))}
        <text x={(m.plotLeft + m.plotRight) / 2} y={m.axisY + 28} textAnchor="middle" fill="var(--text-3)">
          Risk ratio (log scale)
        </text>

        {m.rows.map((r, i) => {
          const pooled = r.kind !== "study";
          return (
            <g key={i}>
              <line x1={r.whiskerLowX} y1={r.y} x2={r.whiskerHighX} y2={r.y} stroke="var(--text)" strokeWidth={1} />
              {pooled ? (
                <polygon
                  points={`${f2(r.whiskerLowX)},${f2(r.y)} ${f2(r.markX)},${f2(r.y - 7)} ${f2(r.whiskerHighX)},${f2(r.y)} ${f2(r.markX)},${f2(r.y + 7)}`}
                  fill="var(--acid)"
                />
              ) : (
                <rect
                  x={f2(r.markX - r.boxSize / 2)}
                  y={f2(r.y - r.boxSize / 2)}
                  width={f2(r.boxSize)}
                  height={f2(r.boxSize)}
                  fill="var(--text)"
                />
              )}
              <text x={m.labelColX} y={r.y + 3.5} fill="var(--text)" fontWeight={pooled ? 600 : 400}>
                {r.label}
              </text>
              <text x={m.valueColX} y={r.y + 3.5} fill="var(--text-2)" fontWeight={pooled ? 600 : 400}>
                {f2(r.effect)} ({f2(r.ci_low)}–{f2(r.ci_high)})
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
